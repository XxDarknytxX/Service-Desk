// src/utils/corporateRoles.js
//
// teams.corporate_role values and what they mean for access and the hierarchy.
//
//   queue             delivery queue (Cloud, Transmission, …): Engineers + a Manager
//   triage            NOC: Triage Engineers + a Triage Manager
//   service_delivery  Service Delivery: Executives + a Manager
//   business          a commercial team under the CCO (Corporate ICT Team,
//                     Corporate Sales Central): a head + members, no position
//                     tags — their cards show their job title
//   executive         the executive layer (CTO, CCO, CEO) at the top of the chain
//
// Business and executive teams are HIERARCHY teams, not work queues: they never
// receive tickets, and their people also run the internal side of the business,
// so they keep the internal desk.

export const CORPORATE_ROLES = ["triage", "queue", "service_delivery", "business", "executive"];

export const LAYER_ROLES = ["business", "executive"];

export const isLayerRole = (role) => LAYER_ROLES.includes(role);

/** The executive layer has no head / manager position. */
export const hasLeadPosition = (role) => role !== "executive";

const LIST = LAYER_ROLES.map((r) => `'${r}'`).join(", ");

/** SQL: the teams row aliased by `alias` is a hierarchy team (business / executive). */
export const layerTeamSql = (alias) => `${alias}.corporate_role IN (${LIST})`;

/** SQL: the teams row aliased by `alias` is a corporate team that is NOT a hierarchy team. */
export const corporateOnlyTeamSql = (alias) =>
  `(${alias}.workspace = 'corporate' AND COALESCE(${alias}.corporate_role, '') NOT IN (${LIST}))`;

/** Enum definition for teams.corporate_role, used by the migration. */
export const CORPORATE_ROLE_ENUM = `ENUM(${CORPORATE_ROLES.map((r) => `'${r}'`).join(",")})`;
