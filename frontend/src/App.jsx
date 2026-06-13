import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/auth";
import { MetaProvider } from "./contexts/meta";
import { ThemeProvider } from "./contexts/theme";
import { ToastProvider } from "./contexts/toast";
import { BootProvider } from "./contexts/boot";
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
import Reports from "./pages/reports";
import Approvals from "./pages/approvals";
import ApprovalRules from "./pages/approvalRules";
import TemplateBuilder from "./pages/templateBuilder";
import Organizations from "./pages/organizations";
import Departments from "./pages/departments";
import Profile from "./pages/profile";
import Forms from "./pages/forms";
import FormPreview from "./pages/formPreview";
import PublicForm from "./pages/publicForm";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? children : <Navigate to="/login" replace />;
}

function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  const allowed = roles.some((role) => user?.roles?.includes(role));
  return allowed ? children : <Navigate to="/dashboard" replace />;
}

function ModuleRoute({ moduleKey, children }) {
  const { user } = useAuth();
  // Admins always bypass team module restrictions
  if (user?.roles?.includes("admin")) return children;
  // No team restrictions (null = unrestricted)
  if (!user?.teamModules) return children;
  // Check if module is in the team's allowed list
  return user.teamModules.includes(moduleKey) ? children : <Navigate to="/dashboard" replace />;
}

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
              {/* Public customer form — the token in the URL is the credential */}
              <Route path="/f/:token" element={<PublicForm />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Dashboard />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tickets"
                element={
                  <ProtectedRoute>
                    <ModuleRoute moduleKey="tickets">
                      <AppLayout>
                        <Tickets />
                      </AppLayout>
                    </ModuleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tickets/new"
                element={<Navigate to="/tickets?create=1" replace />}
              />
              <Route
                path="/tickets/:id"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <TicketDetail />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute>
                    <RoleRoute roles={["admin", "agent"]}>
                      <ModuleRoute moduleKey="users">
                        <AppLayout>
                          <Users />
                        </AppLayout>
                      </ModuleRoute>
                    </RoleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teams"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Teams />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hierarchy"
                element={
                  <ProtectedRoute>
                    <RoleRoute roles={["admin", "agent"]}>
                      <ModuleRoute moduleKey="hierarchy">
                        <AppLayout>
                          <Hierarchy />
                        </AppLayout>
                      </ModuleRoute>
                    </RoleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/approvals"
                element={
                  <ProtectedRoute>
                    <ModuleRoute moduleKey="approvals">
                      <AppLayout>
                        <Approvals />
                      </AppLayout>
                    </ModuleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/approval-rules"
                element={
                  <ProtectedRoute>
                    <RoleRoute roles={["admin"]}>
                      <ModuleRoute moduleKey="approval-rules">
                        <AppLayout>
                          <ApprovalRules />
                        </AppLayout>
                      </ModuleRoute>
                    </RoleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/knowledge-base"
                element={
                  <ProtectedRoute>
                    <ModuleRoute moduleKey="knowledge-base">
                      <AppLayout>
                        <KnowledgeBase />
                      </AppLayout>
                    </ModuleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/assets"
                element={
                  <ProtectedRoute>
                    <RoleRoute roles={["admin", "agent"]}>
                      <ModuleRoute moduleKey="assets">
                        <AppLayout>
                          <Assets />
                        </AppLayout>
                      </ModuleRoute>
                    </RoleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sla"
                element={
                  <ProtectedRoute>
                    <RoleRoute roles={["admin"]}>
                      <ModuleRoute moduleKey="sla">
                        <AppLayout>
                          <SlaManagement />
                        </AppLayout>
                      </ModuleRoute>
                    </RoleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <RoleRoute roles={["admin", "agent"]}>
                      <ModuleRoute moduleKey="reports">
                        <AppLayout>
                          <Reports />
                        </AppLayout>
                      </ModuleRoute>
                    </RoleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/templates"
                element={
                  <ProtectedRoute>
                    <RoleRoute roles={["admin"]}>
                      <ModuleRoute moduleKey="templates">
                        <AppLayout>
                          <TemplateBuilder />
                        </AppLayout>
                      </ModuleRoute>
                    </RoleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organizations"
                element={
                  <ProtectedRoute>
                    <RoleRoute roles={["admin"]}>
                      <AppLayout>
                        <Organizations />
                      </AppLayout>
                    </RoleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/departments"
                element={
                  <ProtectedRoute>
                    <RoleRoute roles={["admin"]}>
                      <AppLayout>
                        <Departments />
                      </AppLayout>
                    </RoleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/forms"
                element={
                  <ProtectedRoute>
                    <RoleRoute roles={["admin", "agent"]}>
                      <ModuleRoute moduleKey="forms">
                        <AppLayout>
                          <Forms />
                        </AppLayout>
                      </ModuleRoute>
                    </RoleRoute>
                  </ProtectedRoute>
                }
              />
              {/* Full-tab form preview — customer view, no app chrome */}
              <Route
                path="/forms/preview/:id"
                element={
                  <ProtectedRoute>
                    <RoleRoute roles={["admin", "agent"]}>
                      <ModuleRoute moduleKey="forms">
                        <FormPreview />
                      </ModuleRoute>
                    </RoleRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Profile />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            </BootProvider>
          </MetaProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
