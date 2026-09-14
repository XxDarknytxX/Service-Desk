/**
 * Workspaces — the Service Desk is two apps in one frontend:
 *
 *   internal   /dashboard, /tickets, /approvals, /assets …   (Vodafone internal desk)
 *   corporate  /corporate/dashboard, /corporate/tickets …    (corporate customer flow)
 *
 * The active app is derived from the URL rather than stored in state, so it can
 * never disagree with what's on screen, deep links always open in the right app,
 * and switching is just navigation. Which apps a user may use comes from the
 * server (user.workspaces) and is enforced there too — this is presentation.
 */
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

export const CORPORATE_BASE = "/corporate";
const LAST_WORKSPACE_KEY = "sd-last-workspace";

export function workspaceFromPath(pathname = "") {
  return pathname === CORPORATE_BASE || pathname.startsWith(`${CORPORATE_BASE}/`) ? "corporate" : "internal";
}

/** Strips any workspace prefix from an app path. */
export function stripWorkspace(path = "/") {
  if (path === CORPORATE_BASE) return "/";
  return path.startsWith(`${CORPORATE_BASE}/`) ? path.slice(CORPORATE_BASE.length) : path;
}

/** The same app-relative path, inside the given workspace. */
export function toWorkspacePath(path, workspace) {
  const bare = stripWorkspace(path);
  return workspace === "corporate" ? `${CORPORATE_BASE}${bare === "/" ? "" : bare}` : bare;
}

export function rememberWorkspace(workspace) {
  try { localStorage.setItem(LAST_WORKSPACE_KEY, workspace); } catch { /* storage unavailable */ }
}

/** Where a user lands after sign-in or on an unknown URL. */
export function homePathFor(user) {
  const workspaces = user?.workspaces || ["internal"];
  let ws = user?.homeWorkspace || workspaces[0];
  if (workspaces.length > 1) {
    try {
      const last = localStorage.getItem(LAST_WORKSPACE_KEY);
      if (workspaces.includes(last)) ws = last;
    } catch { /* storage unavailable */ }
  }
  return toWorkspacePath("/dashboard", ws);
}

export function useWorkspace() {
  const { user } = useAuth();
  const location = useLocation();
  const workspace = workspaceFromPath(location.pathname);
  const workspaces = user?.workspaces || ["internal"];
  const roles = user?.roles || [];

  return {
    workspace,
    workspaces,
    isCorporate: workspace === "corporate",
    canSwitch: workspaces.length > 1,
    isCustomer: roles.includes("corporate_customer"),
    /** App-relative path → path inside the CURRENT workspace. */
    path: (p) => toWorkspacePath(p, workspace),
  };
}

/**
 * Drop-in replacement for useNavigate() in pages shared by both apps:
 * `navigate("/tickets/5")` stays inside whichever app is on screen. Pass
 * `{ workspace }` in the options to target a specific app (e.g. a notification
 * about a ticket in the other app).
 */
export function useWsNavigate() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (to, options = {}) => {
      if (typeof to !== "string" || !to.startsWith("/")) return navigate(to, options);
      const { workspace, ...rest } = options;
      const ws = workspace || workspaceFromPath(location.pathname);
      // Auth pages live outside both apps.
      if (/^\/(login|forgot-password|reset-password|f\/)/.test(to)) return navigate(to, rest);
      return navigate(toWorkspacePath(to, ws), rest);
    },
    [navigate, location.pathname]
  );
}
