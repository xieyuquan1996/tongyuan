import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Forgot from "./pages/Forgot.jsx";
import MarketingLanding from "./pages/marketing/Landing.jsx";
import StatusPage from "./pages/Status.jsx";
import Changelog from "./pages/Changelog.jsx";
import DocsLayout from "./pages/docs/Layout.jsx";
import QuickstartArticle from "./pages/docs/Quickstart.jsx";
import MessagesArticle from "./pages/docs/Messages.jsx";
import AuditArticle from "./pages/docs/Audit.jsx";
import AuthArticle from "./pages/docs/Auth.jsx";
import RegionsArticle from "./pages/docs/Regions.jsx";
import StreamingArticle from "./pages/docs/Streaming.jsx";
import ToolsArticle from "./pages/docs/Tools.jsx";
import ModelsArticle from "./pages/docs/Models.jsx";
import SlaArticle from "./pages/docs/Sla.jsx";
import DashboardLayout from "./pages/dashboard/Layout.jsx";
import Overview from "./pages/dashboard/Overview.jsx";
import Keys from "./pages/dashboard/Keys.jsx";
import Logs from "./pages/dashboard/Logs.jsx";
import Billing from "./pages/dashboard/Billing.jsx";
import Analytics from "./pages/dashboard/Analytics.jsx";
import Playground from "./pages/dashboard/Playground.jsx";
import Alerts from "./pages/dashboard/Alerts.jsx";
import Settings from "./pages/dashboard/Settings.jsx";
import Recharge from "./pages/dashboard/Recharge.jsx";
import AdminLayout from "./pages/admin/Layout.jsx";
import AdminOverview from "./pages/admin/Overview.jsx";
import AdminUsers from "./pages/admin/Users.jsx";
import AdminKeys from "./pages/admin/Keys.jsx";
import AdminLogs from "./pages/admin/Logs.jsx";
import AdminBilling from "./pages/admin/Billing.jsx";
import AdminModels from "./pages/admin/Models.jsx";
import AdminRegions from "./pages/admin/Regions.jsx";
import AdminAnnouncements from "./pages/admin/Announcements.jsx";
import AdminAudit from "./pages/admin/Audit.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import RequireAdmin from "./components/RequireAdmin.jsx";
import { ThemeProvider } from "./lib/theme.jsx";
import CommandPalette from "./components/CommandPalette.jsx";

export default function App() {
  return (
    <ThemeProvider>
      <CommandPalette />
      <Routes>
        <Route path="/" element={<MarketingLanding />} />
        <Route path="/marketing" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/changelog" element={<Changelog />} />

        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<Navigate to="quickstart" replace />} />
          <Route path="quickstart" element={<QuickstartArticle />} />
          <Route path="auth" element={<AuthArticle />} />
          <Route path="regions" element={<RegionsArticle />} />
          <Route path="messages" element={<MessagesArticle />} />
          <Route path="streaming" element={<StreamingArticle />} />
          <Route path="tools" element={<ToolsArticle />} />
          <Route path="audit" element={<AuditArticle />} />
          <Route path="models" element={<ModelsArticle />} />
          <Route path="sla" element={<SlaArticle />} />
        </Route>

        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="playground" element={<Playground />} />
          <Route path="keys" element={<Keys />} />
          <Route path="logs" element={<Logs />} />
          <Route path="billing" element={<Billing />} />
          <Route path="recharge" element={<Recharge />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<AdminOverview />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="keys" element={<AdminKeys />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="billing" element={<AdminBilling />} />
          <Route path="models" element={<AdminModels />} />
          <Route path="regions" element={<AdminRegions />} />
          <Route path="announcements" element={<AdminAnnouncements />} />
          <Route path="audit" element={<AdminAudit />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}
