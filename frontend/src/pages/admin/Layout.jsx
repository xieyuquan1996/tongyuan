import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import {
  LayoutDashboard, Users, KeyRound, List, CreditCard, Cpu, Globe2,
  Megaphone, History, ShieldCheck, ChevronDown, LogOut, User, Sun, Moon,
  Command, Key,
} from "lucide-react";
import { LogoMark } from "../../components/primitives.jsx";
import { api, session, logout } from "../../lib/api.js";
import { useTheme } from "../../lib/theme.jsx";

export default function AdminLayout() {
  const nav = useNavigate();
  const [user, setUser] = useState(session.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    api("/api/console/me")
      .then((u) => { setUser(u); session.save(u, JSON.parse(localStorage.getItem("ty.session") || "{}")); })
      .catch((err) => { if (err.status === 401) { session.clear(); nav("/login", { replace: true }); } });
  }, [nav]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const esc = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", esc); };
  }, [menuOpen]);

  async function onLogout() { await logout(); nav("/login", { replace: true }); }

  if (!user) return null;

  return (
    <div>
      <header style={topNav}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <LogoMark size={26}/>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 600 }}>同源</span>
          <span style={{ color: "var(--text-4)", margin: "0 4px" }}>/</span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-clay)",
            background: "var(--clay)", padding: "3px 8px", borderRadius: 4,
            letterSpacing: "0.08em",
          }}>ADMIN</span>
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          <Link to="/dashboard/overview" style={{
            display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
            border: "1px solid var(--border)", borderRadius: 6,
            fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)",
            textDecoration: "none",
          }}>
            <LayoutDashboard size={12}/> 我的控制台
          </Link>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("ty:open-palette"))}
            title="命令面板" style={kBtn}>
            <Command size={12}/> K
          </button>
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} title="切换主题" style={iconOnlyBtn}>
            {theme === "light" ? <Moon size={14}/> : <Sun size={14}/>}
          </button>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }} style={userBtn}>
            <div style={avatar}>{(user.name || user.email || "?")[0].toUpperCase()}</div>
            <span style={{ fontSize: 13 }}>{user.name || user.email}</span>
            <ChevronDown size={14} color="var(--text-3)"/>
          </button>
          {menuOpen && (
            <div style={menu}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--divider)", marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{user.name || "—"}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{user.email}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--clay)", marginTop: 4, letterSpacing: "0.08em" }}>ROLE · {user.role || "user"}</div>
              </div>
              <NavMenuItem to="/dashboard/settings" icon={User} onClick={() => setMenuOpen(false)}>账户设置</NavMenuItem>
              <div style={{ height: 1, background: "var(--divider)", margin: "4px 0" }}/>
              <MenuItem icon={LogOut} onClick={onLogout} danger>退出登录</MenuItem>
            </div>
          )}
        </div>
      </header>

      <div style={{ display: "flex" }}>
        <aside style={sidebar}>
          <Group>运营总览</Group>
          <SideItem to="/admin/overview" icon={LayoutDashboard}>平台概览</SideItem>
          <SideItem to="/admin/audit" icon={History}>审计日志</SideItem>
          <Group style={{ marginTop: 16 }}>账户管理</Group>
          <SideItem to="/admin/users" icon={Users}>用户</SideItem>
          <SideItem to="/admin/keys" icon={KeyRound}>全部密钥</SideItem>
          <SideItem to="/admin/logs" icon={List}>全部请求</SideItem>
          <SideItem to="/admin/billing" icon={CreditCard}>账单 / 收入</SideItem>
          <Group style={{ marginTop: 16 }}>平台配置</Group>
          <SideItem to="/admin/upstream-keys" icon={Key}>上游密钥</SideItem>
          <SideItem to="/admin/models" icon={Cpu}>模型</SideItem>
          <SideItem to="/admin/regions" icon={Globe2}>区域 / 状态</SideItem>
          <SideItem to="/admin/announcements" icon={Megaphone}>公告</SideItem>
          <div style={{ flex: 1 }}/>
          <div style={{ padding: 12, border: "1px solid var(--clay)", background: "var(--clay-soft)", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--clay-press)", marginBottom: 4 }}>
              <ShieldCheck size={14}/>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>后台管理</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
              所有改动都会写入审计日志。请谨慎操作。
            </div>
          </div>
        </aside>
        <main style={{ flex: 1, padding: "32px 32px 64px", maxWidth: 1280, minWidth: 0 }}>
          <Outlet context={{ user }}/>
        </main>
      </div>
    </div>
  );
}

function Group({ children, style }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 10,
      letterSpacing: "0.16em", textTransform: "uppercase",
      color: "var(--text-3)", padding: "8px 12px", marginBottom: 4, ...style,
    }}>{children}</div>
  );
}

function SideItem({ to, icon: Icon, children }) {
  const base = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 12px", borderRadius: 6,
    fontSize: 14, fontWeight: 400,
    color: "var(--text-2)", textDecoration: "none",
    textAlign: "left", border: "none", background: "transparent",
    cursor: "pointer",
  };
  return (
    <NavLink to={to} style={({ isActive }) => ({
      ...base,
      background: isActive ? "var(--surface-3)" : "transparent",
      color: isActive ? "var(--text)" : "var(--text-2)",
      fontWeight: isActive ? 500 : 400,
    })}>
      {({ isActive }) => (
        <>
          <Icon size={16} color={isActive ? "var(--clay)" : "currentColor"}/>
          {children}
        </>
      )}
    </NavLink>
  );
}

function MenuItem({ icon: Icon, onClick, children, danger }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "8px 12px", borderRadius: 6, border: "none",
        background: hover ? "var(--surface-3)" : "transparent",
        cursor: "pointer", fontSize: 13,
        color: danger ? "var(--err)" : "var(--text)",
        textAlign: "left",
      }}>
      <Icon size={14}/>
      {children}
    </button>
  );
}
function NavMenuItem({ to, icon: Icon, onClick, children }) {
  const [hover, setHover] = useState(false);
  return (
    <NavLink to={to} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 6,
        background: hover ? "var(--surface-3)" : "transparent",
        fontSize: 13, color: "var(--text)",
        textDecoration: "none",
      }}>
      <Icon size={14}/>
      {children}
    </NavLink>
  );
}

const topNav = {
  position: "sticky", top: 0, zIndex: 10,
  height: 64, display: "flex", alignItems: "center",
  padding: "0 24px", gap: 16,
  background: "var(--surface-2)",
  borderBottom: "1px solid var(--border)",
};
const userBtn = {
  display: "flex", alignItems: "center", gap: 8, padding: "4px 8px 4px 4px",
  borderRadius: 999, border: "1px solid var(--border)",
  background: "transparent", cursor: "pointer", color: "var(--text)",
};
const kBtn = {
  display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
  border: "1px solid var(--border)", borderRadius: 6,
  fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)",
  background: "transparent", cursor: "pointer",
};
const iconOnlyBtn = {
  width: 32, height: 32, border: "1px solid var(--border)",
  background: "transparent", borderRadius: 6, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "var(--text-2)",
};
const avatar = {
  width: 24, height: 24, borderRadius: "50%", background: "var(--clay)", color: "var(--on-clay)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: "var(--font-mono)", fontSize: 11,
};
const menu = {
  position: "absolute", top: "100%", right: 0, marginTop: 8, minWidth: 220,
  background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
  boxShadow: "var(--shadow-pop)", padding: 6, zIndex: 11,
};
const sidebar = {
  width: 240, padding: 16,
  borderRight: "1px solid var(--border)",
  display: "flex", flexDirection: "column",
  background: "var(--surface-2)",
  position: "sticky", top: 64,
  height: "calc(100vh - 64px)",
  overflowY: "auto",
  flexShrink: 0,
};
