import { History, Clock } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync, fmtRelative } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

const ACTION_TONE = {
  "admin.user.update":                  "default",
  "admin.user.suspend":                 "err",
  "admin.user.adjust":                  "warn",
  "admin.key.revoke":                   "err",
  "admin.model.create":                 "ok",
  "admin.model.update":                 "default",
  "admin.model.delete":                 "err",
  "admin.region.update":                "warn",
  "admin.component.update":             "warn",
  "admin.announcement.create":          "ok",
  "admin.announcement.update":          "default",
  "admin.announcement.delete":          "err",
  "admin.settings.update":              "warn",
  "admin.upstream_key.create":          "ok",
  "admin.upstream_key.update":          "default",
  "admin.upstream_key.delete":          "err",
  "admin.upstream_key.quota_override":  "default",
  "admin.upstream_key.quota_defaults":  "warn",
};

export default function AdminAudit() {
  const { loading, data, error } = useAsync(() => api("/api/admin/audit"), []);
  if (loading) return <Loading/>;
  if (error) return <ErrorBox error={error}/>;
  const events = data.events || [];

  return (
    <div>
      <PageHeader title="审计日志" sub={`${events.length} 条操作记录 · 保留 30 天`}/>

      {events.length === 0 && (
        <div style={{ ...card, padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <History size={28} style={{ marginBottom: 12, opacity: 0.5 }}/>
          <div style={{ fontSize: 14 }}>还没有审计事件。</div>
        </div>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-3)" }}>
              <th style={th}>时间</th>
              <th style={th}>操作者</th>
              <th style={th}>动作</th>
              <th style={th}>目标</th>
              <th style={th}>备注</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} style={{ borderTop: "1px solid var(--divider)" }}>
                <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock size={11}/> {fmtRelative(e.at)}
                  </div>
                </td>
                <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{e.actor}</td>
                <td style={td}>
                  <Pill tone={ACTION_TONE[e.action] || "default"} dot>{e.action}</Pill>
                </td>
                <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12 }}>{e.target}</td>
                <td style={{ ...td, color: "var(--text-2)" }}>{e.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const card = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" };
const th = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", padding: "10px 16px", fontWeight: 400 };
const td = { padding: "12px 16px", color: "var(--text)" };
