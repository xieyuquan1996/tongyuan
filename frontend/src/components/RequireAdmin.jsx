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
    return <Navigate to="/" replace />;
  }
  return children;
}
