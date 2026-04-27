import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, session } from "../lib/api.js";
import { Loading } from "./primitives.jsx";

export default function RequireAdmin({ children }) {
  const loc = useLocation();
  const [state, setState] = useState({ loading: true, ok: false });

  useEffect(() => {
    if (!session.isAuthed()) { setState({ loading: false, ok: false }); return; }
    let alive = true;
    api("/api/console/me")
      .then((u) => { if (alive) setState({ loading: false, ok: u.role === "admin" }); })
      .catch(() => { if (alive) setState({ loading: false, ok: false }); });
    return () => { alive = false; };
  }, []);

  if (!session.isAuthed()) {
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }
  if (state.loading) return <Loading>验证管理员权限…</Loading>;
  if (!state.ok) {
    return (
      <div style={{
        padding: 48, maxWidth: 560, margin: "80px auto",
        background: "var(--surface-2)", border: "1px solid var(--border)",
        borderRadius: 12,
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 12px" }}>需要管理员权限</h2>
        <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, margin: "0 0 20px" }}>
          当前账户不具备后台管理权限。请使用 admin 账户登录后再访问该区域。
        </p>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
          <div>演示账户: admin@tongyuan.ai / admin1234</div>
        </div>
      </div>
    );
  }
  return children;
}
