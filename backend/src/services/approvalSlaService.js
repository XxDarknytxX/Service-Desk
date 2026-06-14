/**
 * Approval SLA Service
 * Manages SLA tracking for individual approval stages.
 * Each approval record (ticket_approvals) can have its own SLA
 * based on matching approval_sla_policies.
 */

/**
 * Calculate due date respecting business hours (8am-5pm Mon-Fri in configured timezone).
 */
async function calculateBusinessHoursDueDate(pool, startTime, minutes) {
  try {
    const [schedules] = await pool.query(
      `SELECT bhs.day_of_week, bhs.start_time, bhs.end_time, bh.timezone
       FROM business_hours bh
       JOIN business_hours_schedules bhs ON bh.id = bhs.business_hours_id
       WHERE bh.is_default = 1
       ORDER BY bhs.day_of_week, bhs.start_time`
    );
    if (schedules.length === 0) return new Date(startTime.getTime() + minutes * 60000);

    const tz = schedules[0].timezone || "Pacific/Fiji";
    const scheduleMap = {};
    for (const s of schedules) {
      const dow = s.day_of_week % 7;
      if (!scheduleMap[dow]) scheduleMap[dow] = [];
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      scheduleMap[dow].push({ sh, sm, eh, em });
    }

    function getLocalParts(date) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short"
      }).formatToParts(date);
      const get = (type) => parts.find(p => p.type === type)?.value;
      const wm = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return { dow: wm[get("weekday")] ?? date.getDay(), hour: parseInt(get("hour")), minute: parseInt(get("minute")) };
    }

    let remaining = minutes;
    let cursor = new Date(startTime);
    cursor.setSeconds(0, 0); // Zero out seconds for exact minute calculations
    let maxIter = 400;

    while (remaining > 0 && maxIter-- > 0) {
      const local = getLocalParts(cursor);
      const slots = scheduleMap[local.dow];
      if (slots) {
        for (const slot of slots) {
          const curMin = local.hour * 60 + local.minute;
          const startMin = slot.sh * 60 + slot.sm;
          const endMin = slot.eh * 60 + slot.em;
          if (curMin < startMin) {
            cursor = new Date(cursor.getTime() + (startMin - curMin) * 60000);
            const available = endMin - startMin;
            if (available >= remaining) return new Date(cursor.getTime() + remaining * 60000);
            remaining -= available;
            cursor = new Date(cursor.getTime() + available * 60000);
          } else if (curMin >= startMin && curMin < endMin) {
            const available = endMin - curMin;
            if (available >= remaining) return new Date(cursor.getTime() + remaining * 60000);
            remaining -= available;
            cursor = new Date(cursor.getTime() + available * 60000);
          }
        }
      }
      cursor = new Date(cursor.getTime() + 24 * 60 * 60000);
      const nl = getLocalParts(cursor);
      cursor = new Date(cursor.getTime() - (nl.hour * 60 + nl.minute) * 60000);
    }
    return new Date(startTime.getTime() + minutes * 60000);
  } catch (err) {
    console.error("Approval BH calc error:", err);
    return new Date(startTime.getTime() + minutes * 60000);
  }
}

export function makeApprovalSlaService(pool) {
  /**
   * Calculate an approver's organizational level.
   * Org level = how high they are in the org chart.
   *   Level 1 = CEO (no one reports through them to someone higher; they have no manager)
   *   Level 2 = Direct reports of CEO (Excos)
   *   Level 3 = Managers (report to Excos), etc.
   *
   * We compute this by finding the longest chain above the approver to the top.
   * If approver has max hierarchy level = 2 (they have 2 managers above them), their org level = 3.
   * If approver has no manager in hierarchy, org level = 1 (top).
   */
  async function getApproverOrgLevel(approverId) {
    const [rows] = await pool.query(
      `SELECT MAX(level) as max_level FROM user_hierarchy
       WHERE user_id = ? AND is_active = 1`,
      [approverId]
    );
    const maxLevel = rows[0]?.max_level;
    if (maxLevel === null || maxLevel === undefined) return 1; // no manager = top of org
    return maxLevel + 1; // org level = distance-to-top + 1
  }

  /**
   * Find the best-matching approval SLA stage policy for a given approval record.
   * Supports two modes:
   *   - 'stage' mode: match by approval_level, approver_type, approval_rule
   *   - 'hierarchy' mode: match by approver's org hierarchy level
   */
  async function findMatchingStagePolicy(slaPolicy, approval, approverType) {
    const mode = slaPolicy.approval_sla_mode || "stage";

    const [stages] = await pool.query(
      `SELECT * FROM approval_sla_policies
       WHERE sla_policy_id = ? AND is_active = 1 AND mode = ?
       ORDER BY sort_order ASC`,
      [slaPolicy.id, mode]
    );

    if (stages.length === 0) return null;

    if (mode === "hierarchy") {
      return findMatchingHierarchyPolicy(stages, approval.approver_id);
    }

    return findMatchingStagePolicyByScore(stages, approval, approverType);
  }

  /**
   * Stage-based matching (original logic).
   * Most specific match wins (scored).
   */
  function findMatchingStagePolicyByScore(stages, approval, approverType) {
    let bestMatch = null;
    let bestScore = -1;

    for (const stage of stages) {
      let score = 0;
      let matches = true;

      if (stage.applies_to_approval_level !== null) {
        if (stage.applies_to_approval_level === approval.approval_level) {
          score += 4;
        } else {
          matches = false;
        }
      }

      if (stage.applies_to_approver_type !== null) {
        if (stage.applies_to_approver_type === approverType) {
          score += 2;
        } else {
          matches = false;
        }
      }

      if (stage.applies_to_approval_rule_id !== null) {
        if (stage.applies_to_approval_rule_id === approval.approval_rule_id) {
          score += 1;
        } else {
          matches = false;
        }
      }

      if (matches && score > bestScore) {
        bestScore = score;
        bestMatch = stage;
      }
    }

    return bestMatch;
  }

  /**
   * Hierarchy-based matching.
   * Match by the approver's org level. More specific (exact level) wins over "and below".
   */
  async function findMatchingHierarchyPolicy(stages, approverId) {
    const orgLevel = await getApproverOrgLevel(approverId);

    let bestMatch = null;
    let bestScore = -1;

    for (const stage of stages) {
      if (stage.applies_to_org_level === null) {
        // Catch-all: matches any org level (lowest priority)
        if (bestScore < 0) {
          bestScore = 0;
          bestMatch = stage;
        }
        continue;
      }

      const targetLevel = stage.applies_to_org_level;
      const andBelow = stage.applies_to_org_level_and_below === 1;

      if (targetLevel === orgLevel) {
        // Exact match (highest priority = 10)
        if (bestScore < 10) {
          bestScore = 10;
          bestMatch = stage;
        }
      } else if (andBelow && orgLevel >= targetLevel) {
        // "Level X and below" match — score based on how close the match is
        const closeness = 5 - Math.abs(orgLevel - targetLevel);
        if (closeness > bestScore) {
          bestScore = closeness;
          bestMatch = stage;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Assign approval SLAs to all pending approvals for a ticket.
   * Called after approval records are created (from ticket creation or manual send-for-approval).
   */
  async function assignApprovalSlas(ticketId) {
    // 1. Get the ticket to find its team/priority for policy matching
    const [tickets] = await pool.query(
      `SELECT t.id, t.team_id, t.priority_id, tp.key as priority_key
       FROM tickets t
       LEFT JOIN ticket_priorities tp ON tp.id = t.priority_id
       WHERE t.id = ?`,
      [ticketId]
    );
    if (tickets.length === 0) return { assigned: 0 };

    const ticket = tickets[0];

    // 2. Find applicable approval SLA policy (policy_type = 'approval')
    //    Matching: priority + team > priority > team > default
    const [policies] = await pool.query(
      `SELECT * FROM sla_policies
       WHERE policy_type = 'approval' AND (
         (applies_to_priority_id = ? AND applies_to_team_id = ?)
         OR (applies_to_priority_id = ? AND applies_to_team_id IS NULL)
         OR (applies_to_priority_id IS NULL AND applies_to_team_id = ?)
         OR (applies_to_priority_id IS NULL AND applies_to_team_id IS NULL AND is_default = 1)
       )
       ORDER BY
         CASE
           WHEN applies_to_priority_id IS NOT NULL AND applies_to_team_id IS NOT NULL THEN 1
           WHEN applies_to_priority_id IS NOT NULL THEN 2
           WHEN applies_to_team_id IS NOT NULL THEN 3
           ELSE 4
         END
       LIMIT 1`,
      [ticket.priority_id, ticket.team_id, ticket.priority_id, ticket.team_id]
    );

    if (policies.length === 0) return { assigned: 0 };

    const policy = policies[0];

    // 3. Get pending approvals for this ticket
    //    For sequential flows, only assign SLA to the FIRST level (Level 1).
    //    Later levels get their SLA when the previous level approves.
    //    If targetLevel is specified, only assign to that level (used when advancing levels).
    const targetLevel = arguments[1] || null; // optional: specific level to assign
    const levelFilter = targetLevel
      ? `AND ta.approval_level = ${Number(targetLevel)}`
      : `AND ta.approval_level = (SELECT MIN(approval_level) FROM ticket_approvals WHERE ticket_id = ${Number(ticketId)} AND status = 'pending')`;

    const [approvals] = await pool.query(
      `SELECT ta.*, ar.name as rule_name
       FROM ticket_approvals ta
       LEFT JOIN approval_rules ar ON ar.id = ta.approval_rule_id
       WHERE ta.ticket_id = ? AND ta.status = 'pending' ${levelFilter}`,
      [ticketId]
    );

    if (approvals.length === 0) return { assigned: 0, policy: policy.name };

    // 4. Try to determine approver type for each approval
    //    Check if it came from a template step (has approver_type info) or global rule (manager_chain)
    let assigned = 0;
    const now = new Date();

    for (const approval of approvals) {
      // Check if SLA already assigned
      const [existing] = await pool.query(
        `SELECT id FROM ticket_approval_slas WHERE ticket_approval_id = ?`,
        [approval.id]
      );
      if (existing.length > 0) continue;

      // Determine approver type: check template steps first, fall back to 'manager_chain' for global rules
      let approverType = "manager_chain"; // default for rule-based approvals
      const [templateSteps] = await pool.query(
        `SELECT tas.approver_type
         FROM template_approval_steps tas
         JOIN template_approval_flows taf ON taf.id = tas.flow_id
         JOIN tickets t ON t.template_id = taf.template_id
         WHERE t.id = ? AND tas.step_order = ?
         LIMIT 1`,
        [ticketId, approval.approval_level]
      );
      if (templateSteps.length > 0) {
        approverType = templateSteps[0].approver_type;
      }

      // Find matching stage policy
      const stagePolicy = await findMatchingStagePolicy(policy, approval, approverType);
      if (!stagePolicy) continue;

      // Calculate due date using business hours
      const dueAt = await calculateBusinessHoursDueDate(pool, now, stagePolicy.target_minutes);

      // Insert the approval SLA record
      await pool.query(
        `INSERT INTO ticket_approval_slas
         (ticket_id, ticket_approval_id, approval_sla_policy_id, due_at, started_at)
         VALUES (?, ?, ?, ?, ?)`,
        [ticketId, approval.id, stagePolicy.id, dueAt, now]
      );

      assigned++;

      // Log event
      await pool.query(
        `INSERT INTO ticket_events (ticket_id, event_type, payload_json)
         VALUES (?, 'approval_sla.assigned', ?)`,
        [ticketId, JSON.stringify({
          approval_id: approval.id,
          approval_level: approval.approval_level,
          approver_type: approverType,
          stage_policy_id: stagePolicy.id,
          target_minutes: stagePolicy.target_minutes,
          due_at: dueAt.toISOString(),
        })]
      );
    }

    return { assigned, policy: policy.name };
  }

  /**
   * Mark an approval SLA as met when the approval is completed (approved/rejected).
   */
  async function completeApprovalSla(approvalId) {
    const now = new Date();
    const [result] = await pool.query(
      `UPDATE ticket_approval_slas
       SET met = 1, completed_at = ?, paused_at = NULL, remaining_ms = NULL, updated_at = ?
       WHERE ticket_approval_id = ? AND met = 0 AND breached = 0`,
      [now, now, approvalId]
    );

    if (result.affectedRows > 0) {
      // Get ticket_id for event logging
      const [slas] = await pool.query(
        `SELECT ticket_id, due_at FROM ticket_approval_slas WHERE ticket_approval_id = ?`,
        [approvalId]
      );
      if (slas.length > 0) {
        const wasOnTime = now <= new Date(slas[0].due_at);
        await pool.query(
          `INSERT INTO ticket_events (ticket_id, event_type, payload_json)
           VALUES (?, 'approval_sla.met', ?)`,
          [slas[0].ticket_id, JSON.stringify({
            approval_id: approvalId,
            completed_at: now.toISOString(),
            on_time: wasOnTime,
          })]
        );
      }
    }

    return result.affectedRows > 0;
  }

  /**
   * Check all active approval SLAs for breaches and handle escalation.
   */
  async function checkApprovalSlaBreaches() {
    const now = new Date();

    // 1. Mark breached SLAs
    const [breached] = await pool.query(
      `UPDATE ticket_approval_slas tas
       SET tas.breached = 1, tas.updated_at = NOW()
       WHERE tas.due_at < NOW()
         AND tas.breached = 0
         AND tas.met = 0
         AND tas.completed_at IS NULL
         AND tas.paused_at IS NULL`
    );

    // 2. Send warnings for at-risk approval SLAs
    const [atRisk] = await pool.query(
      `SELECT tas.*, asp.warning_minutes, asp.target_minutes,
              ta.approver_id, ta.ticket_id, ta.approval_level,
              t.ticket_number, t.subject
       FROM ticket_approval_slas tas
       JOIN approval_sla_policies asp ON asp.id = tas.approval_sla_policy_id
       JOIN ticket_approvals ta ON ta.id = tas.ticket_approval_id
       JOIN tickets t ON t.id = tas.ticket_id
       WHERE tas.met = 0
         AND tas.breached = 0
         AND tas.warning_sent = 0
         AND tas.paused_at IS NULL
         AND tas.completed_at IS NULL
         AND TIMESTAMPDIFF(MINUTE, NOW(), tas.due_at) <= asp.warning_minutes`
    );

    for (const sla of atRisk) {
      await pool.query(
        `UPDATE ticket_approval_slas SET warning_sent = 1, updated_at = NOW() WHERE id = ?`,
        [sla.id]
      );

      // Create notification for the approver
      try {
        await pool.query(
          `INSERT INTO notifications (user_id, ticket_id, title, message, type)
           VALUES (?, ?, ?, ?, 'approval_sla_warning')`,
          [
            sla.approver_id,
            sla.ticket_id,
            `Approval SLA At Risk - ${sla.ticket_number}`,
            `Your approval for "${sla.subject}" (Level ${sla.approval_level}) is due soon. Please review.`,
          ]
        );
      } catch (notifErr) {
        console.error("Notification error:", notifErr.message);
      }
    }

    // 3. Handle escalation for newly breached SLAs
    const [newlyBreached] = await pool.query(
      `SELECT tas.*, asp.escalation_action, asp.escalation_to_user_id,
              ta.approver_id, ta.ticket_id, ta.approval_level, ta.total_levels,
              t.ticket_number, t.subject
       FROM ticket_approval_slas tas
       JOIN approval_sla_policies asp ON asp.id = tas.approval_sla_policy_id
       JOIN ticket_approvals ta ON ta.id = tas.ticket_approval_id
       JOIN tickets t ON t.id = tas.ticket_id
       WHERE tas.breached = 1
         AND tas.escalated = 0
         AND tas.completed_at IS NULL
         AND asp.escalation_action != 'notify_only'`
    );

    let escalated = 0;
    for (const sla of newlyBreached) {
      try {
        await handleEscalation(sla);
        escalated++;
      } catch (escErr) {
        console.error("Escalation error for approval SLA", sla.id, ":", escErr.message);
      }
    }

    return {
      breaches_marked: breached.affectedRows,
      warnings_sent: atRisk.length,
      escalations: escalated,
    };
  }

  /**
   * Handle escalation for a breached approval SLA.
   */
  async function handleEscalation(sla) {
    const action = sla.escalation_action;

    if (action === "auto_approve") {
      // Auto-approve the stalled approval
      await pool.query(
        `UPDATE ticket_approvals SET status = 'auto_approved', approved_at = NOW(), updated_at = NOW()
         WHERE id = ? AND status = 'pending'`,
        [sla.ticket_approval_id]
      );

      // Check if all levels done
      const [remaining] = await pool.query(
        `SELECT COUNT(*) as cnt FROM ticket_approvals
         WHERE ticket_id = ? AND status = 'pending'`,
        [sla.ticket_id]
      );
      if (remaining[0].cnt === 0) {
        await pool.query(
          `UPDATE tickets SET approval_status = 'approved' WHERE id = ?`,
          [sla.ticket_id]
        );
      }
    } else if (action === "escalate_to_next") {
      // Skip current level and move to next approver in hierarchy
      await pool.query(
        `UPDATE ticket_approvals SET status = 'skipped', updated_at = NOW()
         WHERE id = ? AND status = 'pending'`,
        [sla.ticket_approval_id]
      );

      // Find next manager in hierarchy
      const [nextManagers] = await pool.query(
        `SELECT manager_id FROM user_hierarchy
         WHERE user_id = ? AND level = ? AND is_active = 1`,
        [sla.approver_id, sla.approval_level + 1]
      );

      if (nextManagers.length > 0) {
        await pool.query(
          `INSERT INTO ticket_approvals
           (ticket_id, approval_rule_id, approval_level, total_levels, approver_id, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`,
          [sla.ticket_id, null, sla.approval_level, sla.total_levels, nextManagers[0].manager_id]
        );
      }
    } else if (action === "reassign" && sla.escalation_to_user_id) {
      // Reassign to specific user
      await pool.query(
        `UPDATE ticket_approvals SET status = 'skipped', updated_at = NOW()
         WHERE id = ? AND status = 'pending'`,
        [sla.ticket_approval_id]
      );

      await pool.query(
        `INSERT INTO ticket_approvals
         (ticket_id, approval_rule_id, approval_level, total_levels, approver_id, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [sla.ticket_id, null, sla.approval_level, sla.total_levels, sla.escalation_to_user_id]
      );
    }

    // Mark as escalated
    await pool.query(
      `UPDATE ticket_approval_slas
       SET escalated = 1, escalated_at = NOW(), escalation_action_taken = ?, updated_at = NOW()
       WHERE id = ?`,
      [action, sla.id]
    );

    // Log event
    await pool.query(
      `INSERT INTO ticket_events (ticket_id, event_type, payload_json)
       VALUES (?, 'approval_sla.escalated', ?)`,
      [sla.ticket_id, JSON.stringify({
        approval_id: sla.ticket_approval_id,
        action,
        escalation_to_user_id: sla.escalation_to_user_id,
      })]
    );

    // Notify admins
    try {
      const [admins] = await pool.query(
        `SELECT DISTINCT u.id FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE r.name = 'admin' AND u.is_active = 1`
      );
      for (const admin of admins) {
        await pool.query(
          `INSERT INTO notifications (user_id, ticket_id, title, message, type)
           VALUES (?, ?, ?, ?, 'approval_sla_breached')`,
          [
            admin.id,
            sla.ticket_id,
            `Approval SLA Breached - ${sla.ticket_number}`,
            `Approval for "${sla.subject}" (Level ${sla.approval_level}) has breached SLA. Action: ${action}`,
          ]
        );
      }
    } catch (err) {
      console.error("Admin notification error:", err.message);
    }
  }

  /**
   * Get approval SLA status for a ticket's approvals.
   */
  async function getApprovalSlasForTicket(ticketId) {
    const [rows] = await pool.query(
      `SELECT tas.*,
              asp.target_minutes, asp.warning_minutes, asp.escalation_action,
              ta.approver_id, ta.approval_level, ta.total_levels, ta.status as approval_status,
              u.full_name as approver_name
       FROM ticket_approval_slas tas
       JOIN approval_sla_policies asp ON asp.id = tas.approval_sla_policy_id
       JOIN ticket_approvals ta ON ta.id = tas.ticket_approval_id
       JOIN users u ON u.id = ta.approver_id
       WHERE tas.ticket_id = ?
       ORDER BY ta.approval_level ASC, tas.id ASC`,
      [ticketId]
    );

    return rows.map((r) => {
      const now = new Date();
      let remainingMs = null;
      let status = "active";

      if (r.met) {
        status = "met";
      } else if (r.breached) {
        status = "breached";
      } else if (r.paused_at) {
        status = "paused";
        remainingMs = r.remaining_ms ? Number(r.remaining_ms) : null;
      } else if (r.due_at) {
        remainingMs = new Date(r.due_at) - now;
        if (remainingMs <= 0) {
          status = "breached";
        } else if (remainingMs <= r.warning_minutes * 60 * 1000) {
          status = "at_risk";
        }
      }

      return {
        ...r,
        remaining_ms: remainingMs,
        sla_status: status,
      };
    });
  }

  /**
   * Get overall approval SLA stats for reporting.
   */
  async function getApprovalSlaStats(dateFrom, dateTo) {
    const params = [];
    let dateFilter = "";
    if (dateFrom) {
      dateFilter += " AND tas.created_at >= ?";
      params.push(dateFrom);
    }
    if (dateTo) {
      dateFilter += " AND tas.created_at <= ?";
      params.push(dateTo);
    }

    const [rows] = await pool.query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN met = 1 THEN 1 ELSE 0 END) as met_count,
         SUM(CASE WHEN breached = 1 THEN 1 ELSE 0 END) as breached_count,
         SUM(CASE WHEN met = 0 AND breached = 0 AND completed_at IS NULL THEN 1 ELSE 0 END) as pending_count,
         SUM(CASE WHEN escalated = 1 THEN 1 ELSE 0 END) as escalated_count,
         AVG(CASE WHEN completed_at IS NOT NULL
           THEN TIMESTAMPDIFF(MINUTE, started_at, completed_at) ELSE NULL END) as avg_completion_minutes
       FROM ticket_approval_slas tas
       WHERE 1=1 ${dateFilter}`,
      params
    );

    const stats = rows[0];
    const total = stats.total || 0;
    return {
      total,
      met: stats.met_count || 0,
      breached: stats.breached_count || 0,
      pending: stats.pending_count || 0,
      escalated: stats.escalated_count || 0,
      avg_completion_minutes: stats.avg_completion_minutes
        ? Math.round(stats.avg_completion_minutes)
        : null,
      compliance_pct: total > 0
        ? Math.round(((stats.met_count || 0) / total) * 100)
        : 100,
    };
  }

  /**
   * Get approval SLA tracking list with filtering
   */
  async function getApprovalSlaList(filters = {}) {
    const { status, ticketId, limit = 50 } = filters;
    const params = [];
    let where = "WHERE 1=1";

    if (ticketId) {
      where += " AND tas.ticket_id = ?";
      params.push(ticketId);
    }

    if (status === "breached") {
      where += " AND tas.breached = 1";
    } else if (status === "at_risk") {
      where += " AND tas.met = 0 AND tas.breached = 0 AND tas.paused_at IS NULL AND tas.completed_at IS NULL AND TIMESTAMPDIFF(MINUTE, NOW(), tas.due_at) <= asp.warning_minutes";
    } else if (status === "active") {
      where += " AND tas.met = 0 AND tas.breached = 0 AND tas.completed_at IS NULL AND tas.paused_at IS NULL";
    } else if (status === "met") {
      where += " AND tas.met = 1";
    } else if (status === "paused") {
      where += " AND tas.paused_at IS NOT NULL";
    }

    params.push(limit);

    const [rows] = await pool.query(
      `SELECT tas.*,
              asp.target_minutes, asp.warning_minutes, asp.escalation_action,
              asp.applies_to_approval_level, asp.applies_to_approver_type,
              ta.approver_id, ta.approval_level, ta.total_levels, ta.status as approval_status,
              u.full_name as approver_name,
              t.ticket_number, t.subject,
              sp.name as policy_name
       FROM ticket_approval_slas tas
       JOIN approval_sla_policies asp ON asp.id = tas.approval_sla_policy_id
       JOIN sla_policies sp ON sp.id = asp.sla_policy_id
       JOIN ticket_approvals ta ON ta.id = tas.ticket_approval_id
       JOIN users u ON u.id = ta.approver_id
       JOIN tickets t ON t.id = tas.ticket_id
       ${where}
       ORDER BY tas.due_at ASC
       LIMIT ?`,
      params
    );

    return rows;
  }

  return {
    assignApprovalSlas,
    completeApprovalSla,
    checkApprovalSlaBreaches,
    getApprovalSlasForTicket,
    getApprovalSlaStats,
    getApprovalSlaList,
    findMatchingStagePolicy,
  };
}
