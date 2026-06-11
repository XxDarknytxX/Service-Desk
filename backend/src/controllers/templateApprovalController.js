// src/controllers/templateApprovalController.js
// Template Approval Flow management: CRUD + simulation for per-template approval workflows.

const send = {
  ok: (res, data) => res.json(data),
  created: (res, data) => res.status(201).json(data),
  bad: (res, msg) => res.status(400).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, err) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  },
};

const VALID_APPROVER_TYPES = [
  "specific_user",
  "manager_chain",
  "team_lead",
  "department_head",
  "role",
  "dynamic_field",
];

const VALID_FLOW_TYPES = ["sequential", "parallel", "conditional"];
const VALID_REJECTION_ACTIONS = ["stop", "restart", "skip_to_end"];
const VALID_ESCALATION_TARGETS = ["skip", "manager", "specific_user"];
const VALID_EXECUTION_MODES = ["sequential", "parallel"];

function validateSteps(steps) {
  if (!Array.isArray(steps)) return "steps must be an array";
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.name || s.name.trim().length < 2) return `Step ${i + 1}: name is required (min 2 chars)`;
    if (!s.approver_type || !VALID_APPROVER_TYPES.includes(s.approver_type)) {
      return `Step ${i + 1}: invalid approver_type "${s.approver_type}"`;
    }
    if (s.approver_type === "specific_user") {
      const ids = s.approver_user_ids || [];
      if (!Array.isArray(ids) || ids.length === 0) {
        return `Step ${i + 1}: at least one approver required for specific_user type`;
      }
    }
    if (s.approver_type === "role" && !s.approver_role) {
      return `Step ${i + 1}: approver_role required for role type`;
    }
    if (s.approver_type === "dynamic_field" && !s.dynamic_field_id) {
      return `Step ${i + 1}: dynamic_field_id required for dynamic_field type`;
    }
    if (s.conditions && !Array.isArray(s.conditions)) {
      return `Step ${i + 1}: conditions must be an array`;
    }
    if (s.execution_mode && !VALID_EXECUTION_MODES.includes(s.execution_mode)) {
      return `Step ${i + 1}: invalid execution_mode "${s.execution_mode}"`;
    }
  }
  return null;
}

/** Parse approver_user_ids from DB (could be string or array or null) */
function parseUserIds(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

export function makeTemplateApprovalController(pool) {
  return {
    // ── GET /templates/:id/approval-flow ──
    getFlow: async (req, res) => {
      try {
        const templateId = Number(req.params.id);

        // Verify template exists
        const [templates] = await pool.query(
          "SELECT id, name FROM ticket_templates WHERE id = ?",
          [templateId]
        );
        if (templates.length === 0) return send.notFound(res, "Template not found");

        // Get flow
        const [flows] = await pool.query(
          "SELECT * FROM template_approval_flows WHERE template_id = ?",
          [templateId]
        );

        if (flows.length === 0) {
          return send.ok(res, { flow: null, steps: [] });
        }

        const flow = flows[0];

        // Get steps ordered by step_order
        const [steps] = await pool.query(
          `SELECT tas.*
           FROM template_approval_steps tas
           WHERE tas.flow_id = ?
           ORDER BY tas.step_order ASC`,
          [flow.id]
        );

        // Parse JSON fields + resolve approver names
        const parsedSteps = [];
        for (const s of steps) {
          const userIds = parseUserIds(s.approver_user_ids);
          let approver_names = [];
          if (userIds.length > 0) {
            const [users] = await pool.query(
              `SELECT id, full_name, email FROM users WHERE id IN (${userIds.map(() => "?").join(",")})`,
              userIds
            );
            approver_names = users.map((u) => ({ id: u.id, full_name: u.full_name, email: u.email }));
          }

          parsedSteps.push({
            ...s,
            approver_user_ids: userIds,
            approver_names,
            conditions: typeof s.conditions === "string" ? JSON.parse(s.conditions) : s.conditions || [],
          });
        }

        return send.ok(res, { flow, steps: parsedSteps });
      } catch (err) {
        return send.serverErr(res, err);
      }
    },

    // ── PUT /templates/:id/approval-flow ──
    saveFlow: async (req, res) => {
      const conn = await pool.getConnection();
      try {
        const templateId = Number(req.params.id);

        // Verify template exists
        const [templates] = await conn.query(
          "SELECT id FROM ticket_templates WHERE id = ?",
          [templateId]
        );
        if (templates.length === 0) {
          conn.release();
          return send.notFound(res, "Template not found");
        }

        const {
          is_enabled = true,
          approval_type = "sequential",
          require_all_approvers = false,
          auto_approve_hours = null,
          rejection_action = "stop",
          notify_requester = true,
          notify_on_each_step = false,
          escalation_hours = null,
          escalation_to = null,
          escalation_user_id = null,
          steps = [],
        } = req.body;

        // Validate flow type
        if (!VALID_FLOW_TYPES.includes(approval_type)) {
          conn.release();
          return send.bad(res, `Invalid approval_type: ${approval_type}`);
        }
        if (!VALID_REJECTION_ACTIONS.includes(rejection_action)) {
          conn.release();
          return send.bad(res, `Invalid rejection_action: ${rejection_action}`);
        }
        if (escalation_to && !VALID_ESCALATION_TARGETS.includes(escalation_to)) {
          conn.release();
          return send.bad(res, `Invalid escalation_to: ${escalation_to}`);
        }

        // Validate steps
        const stepErr = validateSteps(steps);
        if (stepErr) {
          conn.release();
          return send.bad(res, stepErr);
        }

        await conn.beginTransaction();

        // Upsert flow
        const [existingFlow] = await conn.query(
          "SELECT id FROM template_approval_flows WHERE template_id = ?",
          [templateId]
        );

        let flowId;
        if (existingFlow.length > 0) {
          flowId = existingFlow[0].id;
          await conn.query(
            `UPDATE template_approval_flows SET
              is_enabled = ?, approval_type = ?, require_all_approvers = ?,
              auto_approve_hours = ?, rejection_action = ?,
              notify_requester = ?, notify_on_each_step = ?,
              escalation_hours = ?, escalation_to = ?, escalation_user_id = ?
             WHERE id = ?`,
            [
              is_enabled ? 1 : 0, approval_type, require_all_approvers ? 1 : 0,
              auto_approve_hours || null, rejection_action,
              notify_requester ? 1 : 0, notify_on_each_step ? 1 : 0,
              escalation_hours || null, escalation_to || null, escalation_user_id || null,
              flowId,
            ]
          );
          await conn.query("DELETE FROM template_approval_steps WHERE flow_id = ?", [flowId]);
        } else {
          const [insertResult] = await conn.query(
            `INSERT INTO template_approval_flows
              (template_id, is_enabled, approval_type, require_all_approvers,
               auto_approve_hours, rejection_action, notify_requester, notify_on_each_step,
               escalation_hours, escalation_to, escalation_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              templateId, is_enabled ? 1 : 0, approval_type, require_all_approvers ? 1 : 0,
              auto_approve_hours || null, rejection_action,
              notify_requester ? 1 : 0, notify_on_each_step ? 1 : 0,
              escalation_hours || null, escalation_to || null, escalation_user_id || null,
            ]
          );
          flowId = insertResult.insertId;
        }

        // Insert new steps
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          const userIds = Array.isArray(s.approver_user_ids) && s.approver_user_ids.length > 0
            ? JSON.stringify(s.approver_user_ids) : null;

          await conn.query(
            `INSERT INTO template_approval_steps
              (flow_id, step_order, name, description, approver_type,
               approver_user_ids, approver_role, manager_level, dynamic_field_id,
               require_all, can_delegate, execution_mode, auto_approve_hours, conditions, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              flowId, i + 1, s.name.trim(), s.description || null, s.approver_type,
              userIds, s.approver_role || null,
              s.manager_level || 1, s.dynamic_field_id || null,
              s.require_all ? 1 : 0, s.can_delegate ? 1 : 0,
              s.execution_mode || "sequential",
              s.auto_approve_hours || null,
              s.conditions && s.conditions.length > 0 ? JSON.stringify(s.conditions) : null,
              s.is_active !== false ? 1 : 0,
            ]
          );
        }

        await conn.commit();

        // Re-fetch saved data
        const [savedFlow] = await conn.query(
          "SELECT * FROM template_approval_flows WHERE id = ?",
          [flowId]
        );
        const [savedSteps] = await conn.query(
          "SELECT * FROM template_approval_steps WHERE flow_id = ? ORDER BY step_order",
          [flowId]
        );

        const parsedSteps = [];
        for (const s of savedSteps) {
          const uids = parseUserIds(s.approver_user_ids);
          let approver_names = [];
          if (uids.length > 0) {
            const [users] = await conn.query(
              `SELECT id, full_name, email FROM users WHERE id IN (${uids.map(() => "?").join(",")})`,
              uids
            );
            approver_names = users.map((u) => ({ id: u.id, full_name: u.full_name, email: u.email }));
          }
          parsedSteps.push({
            ...s,
            approver_user_ids: uids,
            approver_names,
            conditions: typeof s.conditions === "string" ? JSON.parse(s.conditions) : s.conditions || [],
          });
        }

        conn.release();
        return send.ok(res, { flow: savedFlow[0], steps: parsedSteps });
      } catch (err) {
        await conn.rollback();
        conn.release();
        return send.serverErr(res, err);
      }
    },

    // ── DELETE /templates/:id/approval-flow ──
    deleteFlow: async (req, res) => {
      try {
        const templateId = Number(req.params.id);
        const [result] = await pool.query(
          "DELETE FROM template_approval_flows WHERE template_id = ?",
          [templateId]
        );
        if (result.affectedRows === 0) return send.notFound(res, "No approval flow found for this template");
        return send.ok(res, { success: true });
      } catch (err) {
        return send.serverErr(res, err);
      }
    },

    // ── POST /templates/:id/approval-flow/test ──
    testFlow: async (req, res) => {
      try {
        const templateId = Number(req.params.id);
        const mockData = req.body || {};

        // Load flow + steps
        const [flows] = await pool.query(
          "SELECT * FROM template_approval_flows WHERE template_id = ? AND is_enabled = 1",
          [templateId]
        );
        if (flows.length === 0) {
          return send.ok(res, { simulation: [], message: "No active approval flow for this template" });
        }

        const flow = flows[0];
        const [steps] = await pool.query(
          `SELECT * FROM template_approval_steps
           WHERE flow_id = ? AND is_active = 1
           ORDER BY step_order`,
          [flow.id]
        );

        const simulation = [];

        for (const step of steps) {
          const conditions = typeof step.conditions === "string" ? JSON.parse(step.conditions) : step.conditions || [];

          let conditionsMet = true;
          const conditionResults = [];

          for (const cond of conditions) {
            const actualValue = getFieldValue(cond.field, mockData);
            const result = evaluateCondition(actualValue, cond.operator, cond.value);
            conditionResults.push({
              field: cond.field,
              operator: cond.operator,
              expected: cond.value,
              actual: actualValue,
              passed: result,
            });
            if (!result) conditionsMet = false;
          }

          let resolvedApprovers = null;
          if (conditionsMet) {
            resolvedApprovers = await resolveApprover(pool, step, mockData);
          }

          simulation.push({
            step_order: step.step_order,
            name: step.name,
            approver_type: step.approver_type,
            execution_mode: step.execution_mode || "sequential",
            will_execute: conditionsMet,
            conditions_evaluated: conditionResults,
            resolved_approvers: resolvedApprovers,
            require_all: !!step.require_all,
          });
        }

        return send.ok(res, {
          flow_type: flow.approval_type,
          simulation,
        });
      } catch (err) {
        return send.serverErr(res, err);
      }
    },
  };
}

// ── Helpers ──

function getFieldValue(fieldKey, mockData) {
  if (["priority", "type", "channel", "team_id", "department_id"].includes(fieldKey)) {
    return mockData[fieldKey] ?? null;
  }
  if (mockData.form_data && fieldKey in mockData.form_data) {
    return mockData.form_data[fieldKey];
  }
  return null;
}

function evaluateCondition(actual, operator, expected) {
  if (actual === null || actual === undefined) {
    if (operator === "empty") return true;
    if (operator === "not_empty") return false;
    return false;
  }
  const actualStr = String(actual).toLowerCase();
  const expectedStr = String(expected || "").toLowerCase();
  switch (operator) {
    case "equals": return actualStr === expectedStr;
    case "not_equals": return actualStr !== expectedStr;
    case "contains": return actualStr.includes(expectedStr);
    case "greater_than": return Number(actual) > Number(expected);
    case "less_than": return Number(actual) < Number(expected);
    case "in": {
      const list = Array.isArray(expected) ? expected.map((v) => String(v).toLowerCase()) : expectedStr.split(",").map((v) => v.trim());
      return list.includes(actualStr);
    }
    case "not_empty": return actual !== "" && actual !== null && actual !== undefined;
    case "empty": return actual === "" || actual === null || actual === undefined;
    default: return true;
  }
}

async function resolveApprover(pool, step, mockData) {
  switch (step.approver_type) {
    case "specific_user": {
      const userIds = parseUserIds(step.approver_user_ids);
      if (userIds.length === 0) return { error: "No users specified" };
      const [users] = await pool.query(
        `SELECT id, full_name, email FROM users WHERE id IN (${userIds.map(() => "?").join(",")}) AND is_active = 1`,
        userIds
      );
      return users.length > 0
        ? { users: users.map((u) => ({ user_id: u.id, full_name: u.full_name, email: u.email })) }
        : { error: "No active users found" };
    }

    case "manager_chain": {
      const requesterId = mockData.requester_id;
      if (!requesterId) return { error: "No requester_id provided for simulation" };
      const level = step.manager_level || 1;
      const [hierarchy] = await pool.query(
        `SELECT uh.manager_id, u.full_name, u.email
         FROM user_hierarchy uh
         INNER JOIN users u ON u.id = uh.manager_id
         WHERE uh.user_id = ? AND uh.level = ? AND uh.is_active = 1`,
        [requesterId, level]
      );
      return hierarchy.length > 0
        ? { users: [{ user_id: hierarchy[0].manager_id, full_name: hierarchy[0].full_name, email: hierarchy[0].email }] }
        : { error: `No manager found at level ${level} for requester ${requesterId}` };
    }

    case "team_lead": {
      const teamId = mockData.team_id;
      if (!teamId) return { error: "No team_id provided" };
      const [leads] = await pool.query(
        `SELECT tm.user_id, u.full_name, u.email
         FROM team_members tm
         INNER JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = ? AND tm.is_lead = 1 AND u.is_active = 1
         LIMIT 1`,
        [teamId]
      );
      if (leads.length > 0) {
        return { users: [{ user_id: leads[0].user_id, full_name: leads[0].full_name, email: leads[0].email }] };
      }
      // Fallback to approver_user_ids if no team lead found
      const fallbackIds = parseUserIds(step.approver_user_ids);
      if (fallbackIds.length > 0) {
        const [users] = await pool.query(
          `SELECT id, full_name, email FROM users WHERE id IN (${fallbackIds.map(() => "?").join(",")}) AND is_active = 1`,
          fallbackIds
        );
        return users.length > 0
          ? { users: users.map(u => ({ user_id: u.id, full_name: u.full_name, email: u.email })) }
          : { error: `No team lead found for team ${teamId}` };
      }
      return { error: `No team lead found for team ${teamId}` };
    }

    case "department_head": {
      const requesterId = mockData.requester_id;
      if (!requesterId) return { error: "No requester_id provided" };
      const [depts] = await pool.query(
        `SELECT d.head_id, u.full_name, u.email
         FROM users req
         INNER JOIN departments d ON d.id = req.department_id
         INNER JOIN users u ON u.id = d.head_id
         WHERE req.id = ? AND u.is_active = 1`,
        [requesterId]
      );
      return depts.length > 0
        ? { users: [{ user_id: depts[0].head_id, full_name: depts[0].full_name, email: depts[0].email }] }
        : { error: "No department head found for requester's department" };
    }

    case "role": {
      const role = step.approver_role;
      if (!role) return { error: "No role specified" };
      const [users] = await pool.query(
        `SELECT u.id, u.full_name, u.email
         FROM users u
         INNER JOIN user_roles ur ON ur.user_id = u.id
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE r.name = ? AND u.is_active = 1
         ORDER BY u.full_name
         LIMIT 10`,
        [role]
      );
      return users.length > 0
        ? { users: users.map((u) => ({ user_id: u.id, full_name: u.full_name, email: u.email })) }
        : { error: `No active users found with role "${role}"` };
    }

    case "dynamic_field": {
      const fieldId = step.dynamic_field_id;
      if (!fieldId) return { error: "No dynamic_field_id specified" };
      const userId = mockData.form_data?.[fieldId];
      if (!userId) return { error: `No value provided for form field "${fieldId}"` };
      const [users] = await pool.query(
        "SELECT id, full_name, email FROM users WHERE id = ? AND is_active = 1",
        [userId]
      );
      return users.length > 0
        ? { users: [{ user_id: users[0].id, full_name: users[0].full_name, email: users[0].email, from_field: fieldId }] }
        : { error: `User ${userId} not found or inactive (from field "${fieldId}")` };
    }

    default:
      return { error: `Unknown approver type: ${step.approver_type}` };
  }
}
