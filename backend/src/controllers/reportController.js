// src/controllers/reportController.js
import * as XLSX from "xlsx";

/**
 * Comprehensive Reporting Controller
 * Covers: Ticket metrics, Agent performance, SLA compliance,
 *         CSAT, Trends, Departments, Teams, Approvals, Assets, Time entries
 */
export function makeReportController(pool) {
  // ── helpers ────────────────────────────────────────────────────────
  function dateFilter(alias, query, params, field = "created_at") {
    if (query.start_date) {
      params.push(query.start_date);
      return ` AND ${alias}.${field} >= ?`;
    }
    return "";
  }
  function dateFilterEnd(alias, query, params, field = "created_at") {
    if (query.end_date) {
      params.push(query.end_date);
      return ` AND ${alias}.${field} <= ?`;
    }
    return "";
  }
  function buildDateWhere(alias, query, params, field = "created_at") {
    let w = "";
    if (query.start_date) { w += ` AND ${alias}.${field} >= ?`; params.push(query.start_date); }
    if (query.end_date)   { w += ` AND ${alias}.${field} <= ?`; params.push(query.end_date + " 23:59:59"); }
    return w;
  }

  return {
    // ═══════════════════════════════════════════════════════════════
    // 1. TICKET METRICS  (existing — enhanced)
    // ═══════════════════════════════════════════════════════════════
    async getTicketMetrics(req, res) {
      try {
        const { start_date, end_date, team_id, assignee_id, priority_id, type_id, channel_id } = req.query;
        // Drafts are unsubmitted — never count them in analytics. Filter via status_id
        // so it works in queries that don't join ticket_statuses (byPriority/type/channel).
        let where = "WHERE t.status_id NOT IN (SELECT id FROM ticket_statuses WHERE `key` = 'draft')";
        const p = [];

        if (start_date) { where += " AND t.created_at >= ?"; p.push(start_date); }
        if (end_date) { where += " AND t.created_at <= ?"; p.push(end_date + " 23:59:59"); }
        if (team_id) { where += " AND t.team_id = ?"; p.push(team_id); }
        if (assignee_id) { where += " AND t.assignee_id = ?"; p.push(assignee_id); }
        if (priority_id) { where += " AND t.priority_id = ?"; p.push(priority_id); }
        if (type_id) { where += " AND t.type_id = ?"; p.push(type_id); }
        if (channel_id) { where += " AND t.channel_id = ?"; p.push(channel_id); }

        const [metrics] = await pool.query(
          `SELECT
            COUNT(*) as total_tickets,
            COUNT(CASE WHEN s.is_closed = 1 THEN 1 END) as closed_tickets,
            COUNT(CASE WHEN s.is_closed = 0 THEN 1 END) as open_tickets,
            AVG(CASE WHEN t.closed_at IS NOT NULL
              THEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) END) as avg_resolution_hours,
            AVG(CASE WHEN t.first_responded_at IS NOT NULL
              THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.first_responded_at) END) as avg_first_response_minutes,
            COUNT(CASE WHEN t.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as created_last_24h,
            COUNT(CASE WHEN t.closed_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as closed_last_24h
          FROM tickets t
          LEFT JOIN ticket_statuses s ON t.status_id = s.id
          ${where}`, p);

        const [byStatus] = await pool.query(
          `SELECT s.label, COUNT(*) as count FROM tickets t
           JOIN ticket_statuses s ON t.status_id = s.id ${where}
           GROUP BY s.id, s.label ORDER BY s.sort_order`, p);

        const [byPriority] = await pool.query(
          `SELECT p.label, p.\`key\` as key_name, COUNT(*) as count FROM tickets t
           JOIN ticket_priorities p ON t.priority_id = p.id ${where}
           GROUP BY p.id, p.label, p.\`key\` ORDER BY p.sort_order`, p);

        const [byType] = await pool.query(
          `SELECT tp.label, COUNT(*) as count FROM tickets t
           JOIN ticket_types tp ON t.type_id = tp.id ${where}
           GROUP BY tp.id, tp.label`, p);

        const [byChannel] = await pool.query(
          `SELECT tc.label, COUNT(*) as count FROM tickets t
           JOIN ticket_channels tc ON t.channel_id = tc.id ${where}
           GROUP BY tc.id, tc.label`, p);

        res.json({ summary: metrics[0], byStatus, byPriority, byType, byChannel });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch ticket metrics" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 2. AGENT PERFORMANCE  (existing — enhanced)
    // ═══════════════════════════════════════════════════════════════
    async getAgentPerformance(req, res) {
      try {
        const { start_date, end_date } = req.query;
        let where = "WHERE t.assignee_id IS NOT NULL";
        const p = [];
        if (start_date) { where += " AND t.created_at >= ?"; p.push(start_date); }
        if (end_date) { where += " AND t.created_at <= ?"; p.push(end_date + " 23:59:59"); }

        const [rows] = await pool.query(
          `SELECT
            u.id, u.full_name, u.email,
            COUNT(*) as assigned_tickets,
            COUNT(CASE WHEN s.is_closed = 1 THEN 1 END) as closed_tickets,
            COUNT(CASE WHEN s.is_closed = 0 THEN 1 END) as open_tickets,
            ROUND(COUNT(CASE WHEN s.is_closed = 1 THEN 1 END) * 100.0 / COUNT(*), 1) as close_rate,
            AVG(CASE WHEN t.closed_at IS NOT NULL
              THEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) END) as avg_resolution_hours,
            AVG(CASE WHEN t.first_responded_at IS NOT NULL
              THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.first_responded_at) END) as avg_first_response_min,
            COALESCE(AVG(sr.rating), 0) as avg_satisfaction_rating,
            COUNT(DISTINCT sr.id) as total_ratings,
            COUNT(CASE WHEN ts.response_breached = 1 THEN 1 END) as sla_breaches
          FROM tickets t
          JOIN users u ON t.assignee_id = u.id
          LEFT JOIN ticket_statuses s ON t.status_id = s.id
          LEFT JOIN satisfaction_ratings sr ON t.id = sr.ticket_id
          LEFT JOIN ticket_slas ts ON t.id = ts.ticket_id
          ${where}
          GROUP BY u.id, u.full_name, u.email
          ORDER BY closed_tickets DESC`, p);

        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch agent performance" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 3. SLA COMPLIANCE  (existing — enhanced)
    // ═══════════════════════════════════════════════════════════════
    async getSlaCompliance(req, res) {
      try {
        const { start_date, end_date } = req.query;
        let where = "WHERE 1=1";
        const p = [];
        if (start_date) { where += " AND t.created_at >= ?"; p.push(start_date); }
        if (end_date) { where += " AND t.created_at <= ?"; p.push(end_date + " 23:59:59"); }

        const [metrics] = await pool.query(
          `SELECT
            COUNT(*) as total_tickets_with_sla,
            COUNT(CASE WHEN ts.response_breached = 0 THEN 1 END) as response_met,
            COUNT(CASE WHEN ts.response_breached = 1 THEN 1 END) as response_breached,
            COUNT(CASE WHEN ts.resolve_breached = 0 THEN 1 END) as resolve_met,
            COUNT(CASE WHEN ts.resolve_breached = 1 THEN 1 END) as resolve_breached,
            ROUND(COUNT(CASE WHEN ts.response_breached = 0 THEN 1 END)*100.0/NULLIF(COUNT(*),0), 2) as response_compliance_pct,
            ROUND(COUNT(CASE WHEN ts.resolve_breached = 0 THEN 1 END)*100.0/NULLIF(COUNT(*),0), 2) as resolve_compliance_pct
          FROM tickets t
          JOIN ticket_slas ts ON t.id = ts.ticket_id ${where}`, p);

        const [byPolicy] = await pool.query(
          `SELECT sp.name as policy_name, COUNT(*) as total_tickets,
            COUNT(CASE WHEN ts.response_breached = 0 THEN 1 END) as response_met,
            COUNT(CASE WHEN ts.response_breached = 1 THEN 1 END) as response_breached,
            COUNT(CASE WHEN ts.resolve_breached = 0 THEN 1 END) as resolve_met,
            COUNT(CASE WHEN ts.resolve_breached = 1 THEN 1 END) as resolve_breached,
            ROUND(COUNT(CASE WHEN ts.response_breached = 0 THEN 1 END)*100.0/NULLIF(COUNT(*),0), 1) as response_pct,
            ROUND(COUNT(CASE WHEN ts.resolve_breached = 0 THEN 1 END)*100.0/NULLIF(COUNT(*),0), 1) as resolve_pct
          FROM tickets t
          JOIN ticket_slas ts ON t.id = ts.ticket_id
          JOIN sla_policies sp ON ts.policy_id = sp.id ${where}
          GROUP BY sp.id, sp.name ORDER BY total_tickets DESC`, p);

        // SLA trend (weekly compliance over time)
        const [slaTrend] = await pool.query(
          `SELECT DATE_FORMAT(t.created_at, '%Y-%u') as week,
            ROUND(COUNT(CASE WHEN ts.response_breached = 0 THEN 1 END)*100.0/NULLIF(COUNT(*),0), 1) as response_pct,
            ROUND(COUNT(CASE WHEN ts.resolve_breached = 0 THEN 1 END)*100.0/NULLIF(COUNT(*),0), 1) as resolve_pct,
            COUNT(*) as total
          FROM tickets t
          JOIN ticket_slas ts ON t.id = ts.ticket_id ${where}
          GROUP BY week ORDER BY week`, p);

        res.json({ summary: metrics[0], byPolicy, slaTrend });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch SLA compliance" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 4. CUSTOMER SATISFACTION  (existing — enhanced)
    // ═══════════════════════════════════════════════════════════════
    async getCustomerSatisfaction(req, res) {
      try {
        const { start_date, end_date } = req.query;
        let where = "WHERE 1=1";
        const p = [];
        if (start_date) { where += " AND sr.created_at >= ?"; p.push(start_date); }
        if (end_date) { where += " AND sr.created_at <= ?"; p.push(end_date + " 23:59:59"); }

        const [metrics] = await pool.query(
          `SELECT COUNT(*) as total_ratings, AVG(rating) as avg_rating,
            COUNT(CASE WHEN rating >= 4 THEN 1 END) as positive_ratings,
            COUNT(CASE WHEN rating = 3 THEN 1 END) as neutral_ratings,
            COUNT(CASE WHEN rating <= 2 THEN 1 END) as negative_ratings,
            ROUND(COUNT(CASE WHEN rating >= 4 THEN 1 END)*100.0/NULLIF(COUNT(*),0), 1) as positive_pct
          FROM satisfaction_ratings sr ${where}`, p);

        const [distribution] = await pool.query(
          `SELECT rating, COUNT(*) as count FROM satisfaction_ratings sr ${where}
           GROUP BY rating ORDER BY rating DESC`, p);

        // CSAT trend over time
        const [trend] = await pool.query(
          `SELECT DATE_FORMAT(sr.created_at, '%Y-%m-%d') as date,
            AVG(rating) as avg_rating, COUNT(*) as count
          FROM satisfaction_ratings sr ${where}
          GROUP BY date ORDER BY date`, p);

        res.json({ summary: metrics[0], distribution, trend });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch satisfaction ratings" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 5. TICKET TRENDS  (existing — enhanced with created vs closed)
    // ═══════════════════════════════════════════════════════════════
    async getTicketTrends(req, res) {
      try {
        const { period = "day", days = 30 } = req.query;
        const fmt = period === "week" ? "%Y-%u" : period === "month" ? "%Y-%m" : "%Y-%m-%d";

        const [created] = await pool.query(
          `SELECT DATE_FORMAT(created_at, ?) as period, COUNT(*) as created
           FROM tickets WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           GROUP BY period ORDER BY period`, [fmt, Number(days)]);

        const [closed] = await pool.query(
          `SELECT DATE_FORMAT(closed_at, ?) as period, COUNT(*) as closed
           FROM tickets WHERE closed_at IS NOT NULL AND closed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           GROUP BY period ORDER BY period`, [fmt, Number(days)]);

        // Merge created + closed into single array
        const map = new Map();
        created.forEach(r => map.set(r.period, { period: r.period, created: r.created, closed: 0 }));
        closed.forEach(r => {
          if (map.has(r.period)) map.get(r.period).closed = r.closed;
          else map.set(r.period, { period: r.period, created: 0, closed: r.closed });
        });
        const merged = Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period));

        res.json(merged);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch ticket trends" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 6. TEAM PERFORMANCE  (NEW)
    // ═══════════════════════════════════════════════════════════════
    async getTeamPerformance(req, res) {
      try {
        const { start_date, end_date } = req.query;
        let where = "WHERE 1=1";
        const p = [];
        if (start_date) { where += " AND t.created_at >= ?"; p.push(start_date); }
        if (end_date) { where += " AND t.created_at <= ?"; p.push(end_date + " 23:59:59"); }

        const [rows] = await pool.query(
          `SELECT
            tm.id as team_id, tm.name as team_name,
            COUNT(t.id) as total_tickets,
            COUNT(CASE WHEN s.is_closed = 1 THEN 1 END) as closed_tickets,
            COUNT(CASE WHEN s.is_closed = 0 THEN 1 END) as open_tickets,
            ROUND(COUNT(CASE WHEN s.is_closed = 1 THEN 1 END)*100.0/NULLIF(COUNT(t.id),0), 1) as close_rate,
            AVG(CASE WHEN t.closed_at IS NOT NULL
              THEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) END) as avg_resolution_hours,
            COUNT(CASE WHEN ts.response_breached = 1 OR ts.resolve_breached = 1 THEN 1 END) as sla_breaches
          FROM teams tm
          LEFT JOIN tickets t ON t.team_id = tm.id ${where.replace("WHERE 1=1", "")}
          LEFT JOIN ticket_statuses s ON t.status_id = s.id
          LEFT JOIN ticket_slas ts ON t.id = ts.ticket_id
          GROUP BY tm.id, tm.name
          ORDER BY total_tickets DESC`, p);

        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch team performance" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 7. DEPARTMENT BREAKDOWN  (NEW)
    // ═══════════════════════════════════════════════════════════════
    async getDepartmentBreakdown(req, res) {
      try {
        const { start_date, end_date } = req.query;
        let where = "WHERE 1=1";
        const p = [];
        if (start_date) { where += " AND t.created_at >= ?"; p.push(start_date); }
        if (end_date) { where += " AND t.created_at <= ?"; p.push(end_date + " 23:59:59"); }

        const [rows] = await pool.query(
          `SELECT
            d.id as department_id, d.name as department_name,
            COUNT(t.id) as total_tickets,
            COUNT(CASE WHEN s.is_closed = 1 THEN 1 END) as closed_tickets,
            COUNT(CASE WHEN s.is_closed = 0 THEN 1 END) as open_tickets,
            AVG(CASE WHEN t.closed_at IS NOT NULL
              THEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) END) as avg_resolution_hours
          FROM departments d
          LEFT JOIN teams tm ON tm.department_id = d.id
          LEFT JOIN tickets t ON t.team_id = tm.id ${where.replace("WHERE 1=1", "")}
          LEFT JOIN ticket_statuses s ON t.status_id = s.id
          GROUP BY d.id, d.name
          ORDER BY total_tickets DESC`, p);

        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch department breakdown" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 8. APPROVAL METRICS  (NEW)
    // ═══════════════════════════════════════════════════════════════
    async getApprovalMetrics(req, res) {
      try {
        const { start_date, end_date } = req.query;
        let where = "WHERE 1=1";
        const p = [];
        if (start_date) { where += " AND ta.created_at >= ?"; p.push(start_date); }
        if (end_date) { where += " AND ta.created_at <= ?"; p.push(end_date + " 23:59:59"); }

        const [summary] = await pool.query(
          `SELECT
            COUNT(*) as total_approvals,
            COUNT(CASE WHEN ta.status = 'approved' THEN 1 END) as approved,
            COUNT(CASE WHEN ta.status = 'rejected' THEN 1 END) as rejected,
            COUNT(CASE WHEN ta.status = 'pending' THEN 1 END) as pending,
            AVG(CASE WHEN ta.approved_at IS NOT NULL
              THEN TIMESTAMPDIFF(HOUR, ta.created_at, ta.approved_at) END) as avg_decision_hours
          FROM ticket_approvals ta ${where}`, p);

        // By approver
        const [byApprover] = await pool.query(
          `SELECT u.id, u.full_name, u.email,
            COUNT(*) as total,
            COUNT(CASE WHEN ta.status = 'approved' THEN 1 END) as approved,
            COUNT(CASE WHEN ta.status = 'rejected' THEN 1 END) as rejected,
            AVG(CASE WHEN ta.approved_at IS NOT NULL
              THEN TIMESTAMPDIFF(HOUR, ta.created_at, ta.approved_at) END) as avg_decision_hours
          FROM ticket_approvals ta
          JOIN users u ON ta.approver_id = u.id ${where}
          GROUP BY u.id, u.full_name, u.email
          ORDER BY total DESC`, p);

        res.json({ summary: summary[0], byApprover });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch approval metrics" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 9. ASSET SUMMARY  (NEW)
    // ═══════════════════════════════════════════════════════════════
    async getAssetSummary(req, res) {
      try {
        const [byType] = await pool.query(
          `SELECT at2.name as type_name, COUNT(a.id) as count
           FROM asset_types at2
           LEFT JOIN assets a ON a.asset_type_id = at2.id
           GROUP BY at2.id, at2.name ORDER BY count DESC`);

        const [byStatus] = await pool.query(
          `SELECT status, COUNT(*) as count FROM assets GROUP BY status ORDER BY count DESC`);

        const [total] = await pool.query(`SELECT COUNT(*) as total FROM assets`);

        const [linkedToTickets] = await pool.query(
          `SELECT COUNT(DISTINCT asset_id) as count FROM asset_ticket_links`);

        res.json({
          total: total[0].total,
          linked_to_tickets: linkedToTickets[0].count,
          byType,
          byStatus,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch asset summary" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 10. RESOLUTION TIME DISTRIBUTION  (NEW)
    // ═══════════════════════════════════════════════════════════════
    async getResolutionDistribution(req, res) {
      try {
        const { start_date, end_date } = req.query;
        let where = "WHERE t.closed_at IS NOT NULL";
        const p = [];
        if (start_date) { where += " AND t.created_at >= ?"; p.push(start_date); }
        if (end_date) { where += " AND t.created_at <= ?"; p.push(end_date + " 23:59:59"); }

        const [buckets] = await pool.query(
          `SELECT
            CASE
              WHEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) < 1 THEN '< 1 hour'
              WHEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) < 4 THEN '1-4 hours'
              WHEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) < 8 THEN '4-8 hours'
              WHEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) < 24 THEN '8-24 hours'
              WHEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) < 72 THEN '1-3 days'
              WHEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) < 168 THEN '3-7 days'
              ELSE '7+ days'
            END as bucket,
            COUNT(*) as count
          FROM tickets t ${where}
          GROUP BY bucket
          ORDER BY FIELD(bucket, '< 1 hour','1-4 hours','4-8 hours','8-24 hours','1-3 days','3-7 days','7+ days')`, p);

        // By priority
        const [byPriority] = await pool.query(
          `SELECT p.label as priority,
            AVG(TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at)) as avg_hours,
            MIN(TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at)) as min_hours,
            MAX(TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at)) as max_hours,
            COUNT(*) as count
          FROM tickets t
          JOIN ticket_priorities p ON t.priority_id = p.id ${where}
          GROUP BY p.id, p.label ORDER BY p.sort_order`, p);

        res.json({ buckets, byPriority });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch resolution distribution" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 11. REQUESTER ACTIVITY  (NEW)
    // ═══════════════════════════════════════════════════════════════
    async getRequesterActivity(req, res) {
      try {
        const { start_date, end_date, limit = 20 } = req.query;
        let where = "WHERE 1=1";
        const p = [];
        if (start_date) { where += " AND t.created_at >= ?"; p.push(start_date); }
        if (end_date) { where += " AND t.created_at <= ?"; p.push(end_date + " 23:59:59"); }

        const [rows] = await pool.query(
          `SELECT u.id, u.full_name, u.email,
            COUNT(*) as total_tickets,
            COUNT(CASE WHEN s.is_closed = 1 THEN 1 END) as closed,
            COUNT(CASE WHEN s.is_closed = 0 THEN 1 END) as open,
            AVG(CASE WHEN t.closed_at IS NOT NULL
              THEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) END) as avg_resolution_hours
          FROM tickets t
          JOIN users u ON t.requester_id = u.id
          LEFT JOIN ticket_statuses s ON t.status_id = s.id
          ${where}
          GROUP BY u.id, u.full_name, u.email
          ORDER BY total_tickets DESC
          LIMIT ?`, [...p, Number(limit)]);

        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch requester activity" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 12. HOURLY HEATMAP  (NEW)
    // ═══════════════════════════════════════════════════════════════
    async getHourlyHeatmap(req, res) {
      try {
        const { days = 30 } = req.query;

        const [rows] = await pool.query(
          `SELECT
            DAYOFWEEK(created_at) as day_of_week,
            HOUR(created_at) as hour,
            COUNT(*) as count
          FROM tickets
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          GROUP BY day_of_week, hour
          ORDER BY day_of_week, hour`, [Number(days)]);

        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch heatmap data" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 13. AGENT WORKLOAD  (Requests by Technician — On Hold/Open/Overdue)
    // ═══════════════════════════════════════════════════════════════
    async getAgentWorkload(req, res) {
      try {
        let where = "WHERE t.assignee_id IS NOT NULL";
        const p = [];
        where += buildDateWhere("t", req.query, p);

        const [agents] = await pool.query(
          `SELECT u.id, u.full_name, u.email,
            COUNT(CASE WHEN s.\`key\` = 'on_hold' THEN 1 END) as on_hold,
            COUNT(CASE WHEN s.is_closed = 0 AND s.\`key\` != 'on_hold' THEN 1 END) as open_tickets,
            COUNT(CASE WHEN (ts.resolve_breached = 1 OR ts.response_breached = 1) AND s.is_closed = 0 THEN 1 END) as overdue,
            COUNT(*) as total
          FROM tickets t
          JOIN users u ON t.assignee_id = u.id
          LEFT JOIN ticket_statuses s ON t.status_id = s.id
          LEFT JOIN ticket_slas ts ON t.id = ts.ticket_id
          ${where}
          GROUP BY u.id, u.full_name, u.email
          ORDER BY open_tickets DESC`, p);

        // Also get unassigned open ticket counts (total + by team)
        let uWhere = "WHERE t.assignee_id IS NULL AND s.is_closed = 0";
        const up = [];
        uWhere += buildDateWhere("t", req.query, up);

        const [unassignedTotal] = await pool.query(
          `SELECT COUNT(*) as count FROM tickets t
           LEFT JOIN ticket_statuses s ON t.status_id = s.id
           ${uWhere}`, up);

        const up2 = [];
        let u2Where = "WHERE t.assignee_id IS NULL AND s.is_closed = 0";
        u2Where += buildDateWhere("t", req.query, up2);

        const [unassignedByTeam] = await pool.query(
          `SELECT tm.name as team_name, COUNT(*) as count
           FROM tickets t
           LEFT JOIN ticket_statuses s ON t.status_id = s.id
           LEFT JOIN teams tm ON t.team_id = tm.id
           ${u2Where}
           GROUP BY t.team_id, tm.name
           ORDER BY count DESC`, up2);

        res.json({
          agents,
          unassigned: {
            total: unassignedTotal[0]?.count || 0,
            byTeam: unassignedByTeam,
          },
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch agent workload" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 14. AT-RISK TICKETS  (Approaching SLA Violation)
    // ═══════════════════════════════════════════════════════════════
    async getAtRiskTickets(req, res) {
      try {
        const [tickets] = await pool.query(
          `SELECT t.id, t.ticket_number, t.subject,
            pp.label as priority_label, pp.\`key\` as priority_key,
            ts.response_due_at, ts.resolve_due_at,
            ts.response_breached, ts.resolve_breached,
            ts.response_met_at, ts.resolve_met_at,
            sp.name as policy_name,
            TIMESTAMPDIFF(MINUTE, NOW(), ts.response_due_at) as response_mins_left,
            TIMESTAMPDIFF(MINUTE, NOW(), ts.resolve_due_at) as resolve_mins_left,
            u.full_name as assignee_name
          FROM tickets t
          JOIN ticket_slas ts ON t.id = ts.ticket_id
          JOIN sla_policies sp ON ts.policy_id = sp.id
          JOIN ticket_statuses s ON t.status_id = s.id
          LEFT JOIN ticket_priorities pp ON t.priority_id = pp.id
          LEFT JOIN users u ON t.assignee_id = u.id
          WHERE s.is_closed = 0
            AND ts.paused_at IS NULL
            AND (
              (ts.response_breached = 0 AND ts.response_met_at IS NULL
               AND TIMESTAMPDIFF(MINUTE, NOW(), ts.response_due_at) BETWEEN 0 AND COALESCE(sp.notify_at_risk_minutes, 60))
              OR
              (ts.resolve_breached = 0 AND ts.resolve_met_at IS NULL
               AND TIMESTAMPDIFF(MINUTE, NOW(), ts.resolve_due_at) BETWEEN 0 AND COALESCE(sp.notify_at_risk_minutes, 60))
            )
          ORDER BY LEAST(
            COALESCE(TIMESTAMPDIFF(MINUTE, NOW(), ts.response_due_at), 99999),
            COALESCE(TIMESTAMPDIFF(MINUTE, NOW(), ts.resolve_due_at), 99999)
          ) ASC
          LIMIT 25`);

        res.json({ tickets, count: tickets.length });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch at-risk tickets" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 15. SLA VIOLATION BY PRIORITY
    // ═══════════════════════════════════════════════════════════════
    async getSlaPriorityBreakdown(req, res) {
      try {
        let where = "WHERE 1=1";
        const p = [];
        where += buildDateWhere("t", req.query, p);

        const [rows] = await pool.query(
          `SELECT pp.label as priority, pp.\`key\` as priority_key, pp.sort_order,
            COUNT(*) as total,
            COUNT(CASE WHEN ts.response_breached = 1 THEN 1 END) as response_violations,
            COUNT(CASE WHEN ts.resolve_breached = 1 THEN 1 END) as resolve_violations,
            COUNT(CASE WHEN ts.response_breached = 0 AND ts.resolve_breached = 0 THEN 1 END) as compliant
          FROM tickets t
          JOIN ticket_slas ts ON t.id = ts.ticket_id
          JOIN ticket_priorities pp ON t.priority_id = pp.id
          ${where}
          GROUP BY pp.id, pp.label, pp.\`key\`, pp.sort_order
          ORDER BY pp.sort_order`, p);

        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch SLA priority breakdown" });
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // 16. EXPORT TO EXCEL  (NEW)
    // ═══════════════════════════════════════════════════════════════
    async exportReport(req, res) {
      try {
        const { type = "tickets", start_date, end_date } = req.query;
        let where = "WHERE 1=1";
        const p = [];
        if (start_date) { where += " AND t.created_at >= ?"; p.push(start_date); }
        if (end_date) { where += " AND t.created_at <= ?"; p.push(end_date + " 23:59:59"); }

        const wb = XLSX.utils.book_new();

        if (type === "tickets") {
          const [rows] = await pool.query(
            `SELECT t.ticket_number, t.subject,
              s.label as status, p.label as priority,
              tp.label as type, tc.label as channel,
              u_req.full_name as requester, u_req.email as requester_email,
              u_asg.full_name as assignee, u_asg.email as assignee_email,
              tm.name as team,
              t.created_at, t.closed_at,
              CASE WHEN t.closed_at IS NOT NULL
                THEN ROUND(TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at)/60.0, 1) END as resolution_hours,
              CASE WHEN ts.response_breached = 1 THEN 'Yes' ELSE 'No' END as response_sla_breached,
              CASE WHEN ts.resolve_breached = 1 THEN 'Yes' ELSE 'No' END as resolve_sla_breached,
              sr.rating as csat_rating
            FROM tickets t
            LEFT JOIN ticket_statuses s ON t.status_id = s.id
            LEFT JOIN ticket_priorities p ON t.priority_id = p.id
            LEFT JOIN ticket_types tp ON t.type_id = tp.id
            LEFT JOIN ticket_channels tc ON t.channel_id = tc.id
            LEFT JOIN users u_req ON t.requester_id = u_req.id
            LEFT JOIN users u_asg ON t.assignee_id = u_asg.id
            LEFT JOIN teams tm ON t.team_id = tm.id
            LEFT JOIN ticket_slas ts ON t.id = ts.ticket_id
            LEFT JOIN satisfaction_ratings sr ON t.id = sr.ticket_id
            ${where}
            ORDER BY t.created_at DESC`, p);

          const ws = XLSX.utils.json_to_sheet(rows);
          ws["!cols"] = [
            { wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
            { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 15 },
            { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
          ];
          XLSX.utils.book_append_sheet(wb, ws, "Tickets");

        } else if (type === "agents") {
          const [rows] = await pool.query(
            `SELECT u.full_name as agent, u.email,
              COUNT(*) as assigned_tickets,
              COUNT(CASE WHEN s.is_closed = 1 THEN 1 END) as closed_tickets,
              ROUND(COUNT(CASE WHEN s.is_closed = 1 THEN 1 END)*100.0/NULLIF(COUNT(*),0),1) as close_rate_pct,
              ROUND(AVG(CASE WHEN t.closed_at IS NOT NULL
                THEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) END),1) as avg_resolution_hours,
              ROUND(COALESCE(AVG(sr.rating),0),1) as avg_csat,
              COUNT(CASE WHEN ts.response_breached = 1 OR ts.resolve_breached = 1 THEN 1 END) as sla_breaches
            FROM tickets t
            JOIN users u ON t.assignee_id = u.id
            LEFT JOIN ticket_statuses s ON t.status_id = s.id
            LEFT JOIN satisfaction_ratings sr ON t.id = sr.ticket_id
            LEFT JOIN ticket_slas ts ON t.id = ts.ticket_id
            ${where}
            GROUP BY u.id, u.full_name, u.email
            ORDER BY closed_tickets DESC`, p);

          const ws = XLSX.utils.json_to_sheet(rows);
          ws["!cols"] = [{ wch: 20 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 12 }];
          XLSX.utils.book_append_sheet(wb, ws, "Agent Performance");

        } else if (type === "sla") {
          const [rows] = await pool.query(
            `SELECT t.ticket_number, t.subject, sp.name as sla_policy,
              CASE WHEN ts.response_breached = 1 THEN 'Breached' ELSE 'Met' END as response_sla,
              CASE WHEN ts.resolve_breached = 1 THEN 'Breached' ELSE 'Met' END as resolve_sla,
              ts.response_due_at, ts.response_met_at,
              ts.resolve_due_at, ts.resolve_met_at,
              t.created_at, t.closed_at
            FROM tickets t
            JOIN ticket_slas ts ON t.id = ts.ticket_id
            LEFT JOIN sla_policies sp ON ts.policy_id = sp.id
            ${where}
            ORDER BY t.created_at DESC`, p);

          const ws = XLSX.utils.json_to_sheet(rows);
          ws["!cols"] = [{ wch: 12 }, { wch: 35 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
          XLSX.utils.book_append_sheet(wb, ws, "SLA Compliance");
        }

        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${type}_report.xlsx"`);
        return res.send(Buffer.from(buf));
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to export report" });
      }
    },
  };
}
