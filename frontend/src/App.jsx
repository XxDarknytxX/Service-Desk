import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/auth";
import { MetaProvider } from "./contexts/meta";
import { ThemeProvider } from "./contexts/theme";
import { ToastProvider } from "./contexts/toast";
import { BootProvider } from "./contexts/boot";
import { homePathFor, rememberWorkspace, toWorkspacePath } from "./contexts/workspace";
import AppLayout from "./components/AppLayout";
import LoadingScreen from "./components/ui/LoadingScreen";
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import Tickets from "./pages/tickets";
import TicketDetail from "./pages/ticketDetail";
import Users from "./pages/users";
import Teams from "./pages/teams";
import Hierarchy from "./pages/hierarchy";
import KnowledgeBase from "./pages/knowledgeBase";
import Assets from "./pages/assets";
import SlaManagement from "./pages/sla";
import CorporateSla from "./pages/corporateSla";
import Reports from "./pages/reports";
import Approvals from "./pages/approvals";
import ApprovalRules from "./pages/approvalRules";
import EmailSettings from "./pages/emailSettings";
import TemplateBuilder from "./pages/templateBuilder";
import Organizations from "./pages/organizations";
import Departments from "./pages/departments";
import Profile from "./pages/profile";
import Forms from "./pages/forms";
import FormPreview from "./pages/formPreview";
import PublicForm from "./pages/publicForm";
import { ForgotPassword, ResetPassword } from "./pages/passwordReset";
import CorporatePeople from "./pages/corporatePeople";
import CorporateHierarchy from "./pages/corporateHierarchy";
import { useEffect } from "react";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen minimal />;
  return user ? children : <Navigate to="/login" replace />;
}

function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  const allowed = roles.some((role) => user?.roles?.includes(role));
  return allowed ? children : <Navigate to={homePathFor(user)} replace />;
}

function ModuleRoute({ moduleKey, children }) {
  const { user } = useAuth();
  // Admins always bypass team module restrictions
  if (user?.roles?.includes("admin")) return children;
  // No team restrictions (null = unrestricted)
  if (!user?.teamModules) return children;
  // Check if module is in the team's allowed list
  return user.teamModules.includes(moduleKey) ? children : <Navigate to={homePathFor(user)} replace />;
}

/**
 * Keeps a user inside the apps they're allowed to use: a corporate customer or
 * engineer who opens an internal URL (or an internal user a corporate one) is
 * sent to the same page in their own app, else to their dashboard. The server
 * enforces the same boundary on every API call.
 */
function WorkspaceRoute({ workspace, children }) {
  const { user } = useAuth();
  const location = useLocation();
  const allowed = (user?.workspaces || ["internal"]).includes(workspace);

  useEffect(() => {
    if (allowed) rememberWorkspace(workspace);
  }, [allowed, workspace]);

  if (allowed) return children;
  const other = (user?.workspaces || [])[0];
  if (other) {
    return <Navigate to={toWorkspacePath(location.pathname, other) + location.search} replace />;
  }
  return <Navigate to={homePathFor(user)} replace />;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen minimal />;
  return <Navigate to={user ? homePathFor(user) : "/login"} replace />;
}

/** `/tickets/new` → the list with the create modal open, in the same app. */
function NewTicketRedirect({ base }) {
  return <Navigate to={`${base}/tickets?create=1`} replace />;
}

/**
 * One page, wrapped in the guards it needs. Every app route is authenticated,
 * workspace-checked, and (unless `bare`) rendered inside the app chrome.
 */
function page(element, { workspace, roles, moduleKey, bare } = {}) {
  let content = bare ? element : <AppLayout>{element}</AppLayout>;
  if (moduleKey) content = <ModuleRoute moduleKey={moduleKey}>{content}</ModuleRoute>;
  if (roles) content = <RoleRoute roles={roles}>{content}</RoleRoute>;
  return (
    <ProtectedRoute>
      <WorkspaceRoute workspace={workspace}>{content}</WorkspaceRoute>
    </ProtectedRoute>
  );
}

// Keyed by route so React remounts the page when an admin switches apps —
// otherwise the same component instance would keep the other app's data.
function Keyed({ children }) {
  const { pathname } = useLocation();
  const params = useParams();
  const key = pathname.startsWith("/corporate") ? "corporate" : "internal";
  return <div key={`${key}-${params.id || ""}`} className="contents">{children}</div>;
}

const I = { workspace: "internal" };
const C = { workspace: "corporate" };

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
          <MetaProvider>
            <BootProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              {/* Public password reset — the emailed token is the credential */}
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* Public customer form — the token in the URL is the credential */}
              <Route path="/f/:token" element={<PublicForm />} />

              {/* ═══════════════ INTERNAL SERVICE DESK ═══════════════ */}
              <Route path="/dashboard" element={page(<Keyed><Dashboard /></Keyed>, I)} />
              <Route path="/tickets" element={page(<Keyed><Tickets /></Keyed>, { ...I, moduleKey: "tickets" })} />
              <Route path="/tickets/new" element={<NewTicketRedirect base="" />} />
              <Route path="/tickets/:id" element={page(<Keyed><TicketDetail /></Keyed>, I)} />
              <Route path="/users" element={page(<Keyed><Users /></Keyed>, { ...I, roles: ["admin", "agent"], moduleKey: "users" })} />
              <Route path="/teams" element={page(<Keyed><Teams /></Keyed>, { ...I, roles: ["admin"] })} />
              <Route path="/hierarchy" element={page(<Hierarchy />, { ...I, roles: ["admin", "agent"], moduleKey: "hierarchy" })} />
              <Route path="/approvals" element={page(<Approvals />, { ...I, moduleKey: "approvals" })} />
              <Route path="/approval-rules" element={page(<ApprovalRules />, { ...I, roles: ["admin"], moduleKey: "approval-rules" })} />
              <Route path="/email-settings" element={page(<EmailSettings />, { ...I, roles: ["admin"] })} />
              <Route path="/knowledge-base" element={page(<Keyed><KnowledgeBase /></Keyed>, { ...I, moduleKey: "knowledge-base" })} />
              <Route path="/assets" element={page(<Assets />, { ...I, roles: ["admin", "agent"], moduleKey: "assets" })} />
              <Route path="/sla" element={page(<SlaManagement />, { ...I, roles: ["admin"], moduleKey: "sla" })} />
              <Route path="/reports" element={page(<Keyed><Reports /></Keyed>, { ...I, roles: ["admin", "agent"], moduleKey: "reports" })} />
              <Route path="/templates" element={page(<TemplateBuilder />, { ...I, roles: ["admin"], moduleKey: "templates" })} />
              <Route path="/organizations" element={page(<Organizations />, { ...I, roles: ["admin"] })} />
              <Route path="/departments" element={page(<Departments />, { ...I, roles: ["admin"] })} />
              <Route path="/forms" element={page(<Forms />, { ...I, roles: ["admin", "agent"], moduleKey: "forms" })} />
              {/* Full-tab form preview — customer view, no app chrome */}
              <Route path="/forms/preview/:id" element={page(<FormPreview />, { ...I, roles: ["admin", "agent"], moduleKey: "forms", bare: true })} />
              <Route path="/profile" element={page(<Keyed><Profile /></Keyed>, I)} />

              {/* ═══════════════ CORPORATE SERVICE DESK ═══════════════ */}
              <Route path="/corporate" element={<Navigate to="/corporate/dashboard" replace />} />
              <Route path="/corporate/dashboard" element={page(<Keyed><Dashboard /></Keyed>, C)} />
              <Route path="/corporate/tickets" element={page(<Keyed><Tickets /></Keyed>, C)} />
              <Route path="/corporate/tickets/new" element={<NewTicketRedirect base="/corporate" />} />
              <Route path="/corporate/tickets/:id" element={page(<Keyed><TicketDetail /></Keyed>, C)} />
              {/* Corporate people follow the corporate model (customers + delivery
                  staff, positions from teams, onboarding emails) — not the
                  internal Users page. */}
              <Route path="/corporate/people" element={page(<CorporatePeople />, { ...C, roles: ["admin", "agent"] })} />
              <Route path="/corporate/customers" element={<Navigate to="/corporate/people" replace />} />
              <Route path="/corporate/hierarchy" element={page(<CorporateHierarchy />, { ...C, roles: ["admin", "agent"] })} />
              <Route path="/corporate/teams" element={page(<Keyed><Teams /></Keyed>, { ...C, roles: ["admin"] })} />
              <Route path="/corporate/sla" element={page(<CorporateSla />, { ...C, roles: ["admin"] })} />
              <Route path="/corporate/reports" element={page(<Keyed><Reports /></Keyed>, { ...C, roles: ["admin", "agent"] })} />
              <Route path="/corporate/knowledge-base" element={page(<Keyed><KnowledgeBase /></Keyed>, C)} />
              <Route path="/corporate/profile" element={page(<Keyed><Profile /></Keyed>, C)} />
              <Route path="/corporate/*" element={<Navigate to="/corporate/dashboard" replace />} />

              <Route path="*" element={<HomeRedirect />} />
            </Routes>
            </BootProvider>
          </MetaProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
