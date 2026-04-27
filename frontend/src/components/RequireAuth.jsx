import { Navigate, useLocation } from "react-router-dom";
import { session } from "../lib/api.js";

export default function RequireAuth({ children }) {
  const loc = useLocation();
  if (!session.isAuthed()) {
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }
  return children;
}
