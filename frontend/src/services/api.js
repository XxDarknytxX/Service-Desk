// src/services/api.js
const API_URL = import.meta.env.VITE_API_URL || "/api";

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Request failed" }));
    const err = new Error(errorData.error || "Request failed");
    err.code = errorData.error;
    err.detail = errorData.message || null;
    err.status = response.status;
    throw err;
  }

  return response.json();
}

// Generic API function (compatible with existing code)
export async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(auth ? getHeaders() : {}),
  };

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

export function clearToken() {
  localStorage.removeItem("token");
}

// Knowledge Base API
export const kbApi = {
  getCategories: () => request("/kb/categories"),
  createCategory: (data) => request("/kb/categories", { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/kb/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/kb/categories/${id}`, { method: "DELETE" }),

  getArticles: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/kb/articles${query ? `?${query}` : ""}`);
  },
  getArticle: (id) => request(`/kb/articles/${id}`),
  createArticle: (data) => request("/kb/articles", { method: "POST", body: JSON.stringify(data) }),
  updateArticle: (id, data) => request(`/kb/articles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteArticle: (id) => request(`/kb/articles/${id}`, { method: "DELETE" }),
  searchArticles: (query) => request(`/kb/articles/search?q=${encodeURIComponent(query)}`),
};

// Assets API
export const assetsApi = {
  // Stats
  getStats: () => request("/assets/stats"),

  // Categories
  getCategories: () => request("/assets/categories"),
  createCategory: (data) => request("/assets/categories", { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/assets/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/assets/categories/${id}`, { method: "DELETE" }),

  // Types
  getAssetTypes: () => request("/assets/types"),
  createAssetType: (data) => request("/assets/types", { method: "POST", body: JSON.stringify(data) }),
  updateAssetType: (id, data) => request(`/assets/types/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAssetType: (id) => request(`/assets/types/${id}`, { method: "DELETE" }),

  // Assets
  getAssets: (params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/assets${q ? `?${q}` : ""}`); },
  getAsset: (id) => request(`/assets/${id}`),
  createAsset: (data) => request("/assets", { method: "POST", body: JSON.stringify(data) }),
  updateAsset: (id, data) => request(`/assets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAsset: (id) => request(`/assets/${id}`, { method: "DELETE" }),
  bulkUpdate: (data) => request("/assets/bulk", { method: "POST", body: JSON.stringify(data) }),

  // Checkout / Checkin
  checkout: (id, data) => request(`/assets/${id}/checkout`, { method: "POST", body: JSON.stringify(data) }),
  checkin: (id, data) => request(`/assets/${id}/checkin`, { method: "POST", body: JSON.stringify(data) }),

  // Assignments history
  getAssignments: (params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/assets/assignments${q ? `?${q}` : ""}`); },
  getAssetAssignments: (id) => request(`/assets/${id}/assignments`),

  // Maintenance
  getMaintenance: (params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/assets/maintenance${q ? `?${q}` : ""}`); },
  getAssetMaintenance: (id) => request(`/assets/${id}/maintenance`),
  createMaintenance: (data) => request("/assets/maintenance", { method: "POST", body: JSON.stringify(data) }),
  updateMaintenance: (id, data) => request(`/assets/maintenance/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteMaintenance: (id) => request(`/assets/maintenance/${id}`, { method: "DELETE" }),

  // Ticket links
  linkAssetToTicket: (assetId, ticketId) => request("/assets/link-ticket", { method: "POST", body: JSON.stringify({ assetId, ticketId }) }),
  unlinkAssetFromTicket: (assetId, ticketId) => request("/assets/unlink-ticket", { method: "DELETE", body: JSON.stringify({ assetId, ticketId }) }),
  getAssetTickets: (id) => request(`/assets/${id}/tickets`),
};

// Tickets API
export const ticketsApi = {
  // Reassignment
  reassign: (ticketId, data) => request(`/tickets/${ticketId}/reassign`, {
    method: "POST",
    body: JSON.stringify(data),
  }),

  // Multi-team support
  getTeams: (ticketId) => request(`/tickets/${ticketId}/teams`),
  addTeam: (ticketId, data) => request(`/tickets/${ticketId}/teams`, {
    method: "POST",
    body: JSON.stringify(data),
  }),
  updateTeam: (ticketId, teamId, data) => request(`/tickets/${ticketId}/teams/${teamId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }),
  removeTeam: (ticketId, teamId) => request(`/tickets/${ticketId}/teams/${teamId}`, {
    method: "DELETE",
  }),
  completeTeamWork: (ticketId, teamId, notes) => request(`/tickets/${ticketId}/teams/${teamId}/complete`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  }),
  reopenTeamWork: (ticketId, teamId) => request(`/tickets/${ticketId}/teams/${teamId}/reopen`, {
    method: "POST",
  }),
};

// SLA API
export const slaApi = {
  // Policies (optional type filter: 'team' or 'approval')
  getPolicies: (type) => request(`/sla/policies${type ? `?type=${type}` : ""}`),
  getPolicy: (id) => request(`/sla/policies/${id}`),
  createPolicy: (data) => request("/sla/policies", { method: "POST", body: JSON.stringify(data) }),
  updatePolicy: (id, data) => request(`/sla/policies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePolicy: (id) => request(`/sla/policies/${id}`, { method: "DELETE" }),

  // Ticket SLAs
  getTicketSlas: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sla/ticket-slas${query ? `?${query}` : ""}`);
  },
  getTicketSla: (ticketId) => request(`/sla/tickets/${ticketId}`),
  getTicketSlaHistory: (ticketId) => request(`/sla/tickets/${ticketId}/history`),

  // SLA Actions
  pauseSla: (ticketId) => request(`/sla/tickets/${ticketId}/pause`, { method: "POST" }),
  resumeSla: (ticketId) => request(`/sla/tickets/${ticketId}/resume`, { method: "POST" }),
  extendSla: (ticketId, data) => request(`/sla/tickets/${ticketId}/extend`, { method: "POST", body: JSON.stringify(data) }),
  reassignSla: (ticketId, data) => request(`/sla/tickets/${ticketId}/reassign`, { method: "POST", body: JSON.stringify(data) }),

  // Monitoring
  getAtRiskTickets: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sla/at-risk${query ? `?${query}` : ""}`);
  },
  checkBreaches: () => request("/sla/check-breaches", { method: "POST" }),

  // Statistics
  getStats: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sla/stats${query ? `?${query}` : ""}`);
  },
  getStatsByPolicy: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sla/stats/by-policy${query ? `?${query}` : ""}`);
  },

  // Business Hours
  getBusinessHours: () => request("/sla/business-hours"),
  createBusinessHours: (data) => request("/sla/business-hours", { method: "POST", body: JSON.stringify(data) }),
  updateBusinessHours: (id, data) => request(`/sla/business-hours/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBusinessHours: (id) => request(`/sla/business-hours/${id}`, { method: "DELETE" }),

  // Approval SLAs
  getApprovalSlaList: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sla/approval-slas${query ? `?${query}` : ""}`);
  },
  getApprovalSlaStats: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/sla/approval-slas/stats${query ? `?${query}` : ""}`);
  },
  getTicketApprovalSlas: (ticketId) => request(`/sla/approval-slas/tickets/${ticketId}`),
  checkApprovalSlaBreaches: () => request("/sla/approval-slas/check-breaches", { method: "POST" }),
  getApprovalRulesForSla: () => request("/sla/approval-rules"),
};

// Reports API
export const reportsApi = {
  getTicketMetrics: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/ticket-metrics${query ? `?${query}` : ""}`);
  },
  getAgentPerformance: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/agent-performance${query ? `?${query}` : ""}`);
  },
  getSlaCompliance: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/sla-compliance${query ? `?${query}` : ""}`);
  },
  getCustomerSatisfaction: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/customer-satisfaction${query ? `?${query}` : ""}`);
  },
  getTicketTrends: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/ticket-trends${query ? `?${query}` : ""}`);
  },
  getTeamPerformance: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/team-performance${query ? `?${query}` : ""}`);
  },
  getDepartmentBreakdown: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/department-breakdown${query ? `?${query}` : ""}`);
  },
  getApprovalMetrics: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/approval-metrics${query ? `?${query}` : ""}`);
  },
  getAssetSummary: () => request("/reports/asset-summary"),
  getResolutionDistribution: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/resolution-distribution${query ? `?${query}` : ""}`);
  },
  getRequesterActivity: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/requester-activity${query ? `?${query}` : ""}`);
  },
  getHourlyHeatmap: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/hourly-heatmap${query ? `?${query}` : ""}`);
  },
  getAgentWorkload: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/agent-workload${query ? `?${query}` : ""}`);
  },
  getAtRiskTickets: () => request("/reports/at-risk-tickets"),
  getSlaPriorityBreakdown: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/sla-priority-breakdown${query ? `?${query}` : ""}`);
  },
};

// Satisfaction (CSAT) API
export const csatApi = {
  getRating: (ticketId) => request(`/tickets/${ticketId}/satisfaction`),
  submitRating: (ticketId, data) => request(`/tickets/${ticketId}/satisfaction`, {
    method: "POST",
    body: JSON.stringify(data),
  }),
};

// Tags API
export const tagsApi = {
  listAll: () => request("/tags"),
  getTicketTags: (ticketId) => request(`/tickets/${ticketId}/tags`),
  addTag: (ticketId, name) => request(`/tickets/${ticketId}/tags`, { method: "POST", body: JSON.stringify({ name }) }),
  removeTag: (ticketId, tagId) => request(`/tickets/${ticketId}/tags/${tagId}`, { method: "DELETE" }),
};

// Audit API
export const auditApi = {
  getTicketAudit: (ticketId) => request(`/tickets/${ticketId}/audit`),
};

// Approvals API
export const approvalsApi = {
  // Approval Rules (admin)
  getRules: () => request("/approval-rules"),
  getRule: (id) => request(`/approval-rules/${id}`),
  createRule: (data) => request("/approval-rules", { method: "POST", body: JSON.stringify(data) }),
  updateRule: (id, data) => request(`/approval-rules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteRule: (id) => request(`/approval-rules/${id}`, { method: "DELETE" }),

  // Pending approvals for current user
  getPendingApprovals: () => request("/approvals/pending"),

  // Ticket-specific approvals
  getTicketApprovals: (ticketId) => request(`/tickets/${ticketId}/approvals`),
  getApprovalHistory: (ticketId) => request(`/approvals/history/${ticketId}`),

  // Actions
  approve: (approvalId, comments) => request(`/approvals/${approvalId}/approve`, {
    method: "POST",
    body: JSON.stringify({ comments }),
  }),
  reject: (approvalId, reason, comments) => request(`/approvals/${approvalId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason, comments }),
  }),

  // Send ticket for approval (agent action)
  // options: { approvers, require_all, return_to_agent, return_to_queue, notes, rule_id }
  sendForApproval: (ticketId, options = {}) => request(`/tickets/${ticketId}/send-for-approval`, {
    method: "POST",
    body: JSON.stringify(options),
  }),

  // Get list of potential approvers
  getApprovers: () => request("/approvers"),

  // Delegations
  getDelegations: () => request("/approvals/delegations"),
  createDelegation: (data) => request("/approvals/delegate", { method: "POST", body: JSON.stringify(data) }),
  revokeDelegation: (id) => request(`/approvals/delegations/${id}`, { method: "DELETE" }),
  delegateApproval: (approvalId, data) => request(`/approvals/${approvalId}/delegate`, { method: "POST", body: JSON.stringify(data) }),
};

// Templates API
export const templatesApi = {
  // Categories
  getCategories: () => request("/templates/categories"),
  createCategory: (data) => request("/templates/categories", { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/templates/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/templates/categories/${id}`, { method: "DELETE" }),

  // Gallery (for ticket creation)
  getGallery: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/templates/gallery${query ? `?${query}` : ""}`);
  },

  // Templates CRUD
  getTemplates: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/templates${query ? `?${query}` : ""}`);
  },
  getTemplate: (id) => request(`/templates/${id}`),
  createTemplate: (data) => request("/templates", { method: "POST", body: JSON.stringify(data) }),
  updateTemplate: (id, data) => request(`/templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: "DELETE" }),
  duplicateTemplate: (id) => request(`/templates/${id}/duplicate`, { method: "POST" }),

  // Template response for a ticket
  getTicketResponse: (ticketId) => request(`/tickets/${ticketId}/template-response`),

  // Template approval flows
  getApprovalFlow: (templateId) => request(`/templates/${templateId}/approval-flow`),
  saveApprovalFlow: (templateId, data) => request(`/templates/${templateId}/approval-flow`, { method: "PUT", body: JSON.stringify(data) }),
  deleteApprovalFlow: (templateId) => request(`/templates/${templateId}/approval-flow`, { method: "DELETE" }),
  testApprovalFlow: (templateId, mockData) => request(`/templates/${templateId}/approval-flow/test`, { method: "POST", body: JSON.stringify(mockData) }),
};

export { API_URL };
