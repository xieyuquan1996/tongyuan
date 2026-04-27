import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import {
  LayoutDashboard, KeyRound, List, Receipt, BookOpen, Activity,
  ChevronDown, LogOut, User, CreditCard, BarChart3, FlaskConical,
  Bell, Settings as SettingsIcon, Sun, Moon, Command, ShieldCheck,
} from "lucide-react";
import { LogoMark } from "../../components/primitives.jsx";
import { api, session, logout } from "../../lib/api.js";
import { useTheme } from "../../lib/theme.jsx";

export default function DashboardLayout() {
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
  const spent = parseFloat(user.spent_this_month || "0");
  const limit = parseFloat(user.limit_this_month || "200");
  const pct = Math.min(100, Math.round((spent / limit) * 100));

  return (
    <div>
      <header style={topNav}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <LogoMark size={26}/>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 600 }}>同源</span>
          <span style={{ color: "var(--text-4)", margin: "0 4px" }}>/</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-2)" }}>console</span>
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          <KShortcutHint/>
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} title="切换主题"
            style={iconOnlyBtn}>
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
              </div>
              <NavMenuItem to="/dashboard/settings" icon={User} onClick={() => setMenuOpen(false)}>账户设置</NavMenuItem>
              <NavMenuItem to="/dashboard/billing" icon={CreditCard} onClick={() => setMenuOpen(false)}>账单</NavMenuItem>
              <div style={{ height: 1, background: "var(--divider)", margin: "4px 0" }}/>
              <MenuItem icon={LogOut} onClick={onLogout} danger>退出登录</MenuItem>
            </div>
          )}
        </div>
      </header>

      <div style={{ display: "flex" }}>
        <aside style={sidebar}>
          <Group>主菜单</Group>
          <SideItem to="/dashboard/overview" icon={LayoutDashboard}>概览</SideItem>
          <SideItem to="/dashboard/analytics" icon={BarChart3}>使用分析</SideItem>
          <SideItem to="/dashboard/playground" icon={FlaskConical}>Playground</SideItem>
          <SideItem to="/dashboard/keys" icon={KeyRound}>API 密钥</SideItem>
          <SideItem to="/dashboard/logs" icon={List}>请求日志</SideItem>
          <Group style={{ marginTop: 16 }}>账户</Group>
          <SideItem to="/dashboard/billing" icon={Receipt}>账单</SideItem>
          <SideItem to="/dashboard/recharge" icon={CreditCard}>充值</SideItem>
          <SideItem to="/dashboard/alerts" icon={Bell}>告警</SideItem>
          <SideItem to="/dashboard/settings" icon={SettingsIcon}>设置</SideItem>
          {user.role === "admin" && (
            <>
              <Group style={{ marginTop: 16 }}>管理</Group>
              <SideItem to="/admin/overview" icon={ShieldCheck}>后台管理</SideItem>
            </>
          )}
          <Group style={{ marginTop: 16 }}>资源</Group>
          <SideItem href="/docs" icon={BookOpen}>文档</SideItem>
          <SideItem href="/status" icon={Activity}>状态页</SideItem>
          <div style={{ flex: 1 }}/>
          <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 8 }}>
            <div style={miniLabel}>本月用量</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>¥{user.spent_this_month}</div>
            <div style={{ width: "100%", height: 4, background: "var(--surface-3)", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
              <div style={{ width: pct + "%", height: "100%", background: "var(--clay)" }}/>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", marginTop: 6 }}>
              {pct}% · 上限 ¥{user.limit_this_month}
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

function KShortcutHint() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("ty:open-palette"))}
      title="打开命令面板"
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 8px", border: "1px solid var(--border)",
        borderRadius: 6, fontFamily: "var(--font-mono)",
        fontSize: 11, color: "var(--text-3)",
        background: "transparent", cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Command size={12}/> K
    </button>
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

function SideItem({ to, href, icon: Icon, children }) {
  const base = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 12px", borderRadius: 6,
    fontSize: 14, fontWeight: 400,
    color: "var(--text-2)", textDecoration: "none",
    textAlign: "left", border: "none", background: "transparent",
    cursor: "pointer",
  };
  if (href) {
    return (
      <a href={href} style={base}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
        <Icon size={16}/>{children}
      </a>
    );
  }
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
const iconOnlyBtn = {
  width: 32, height: 32, border: "1px solid var(--border)",
  background: "transparent", borderRadius: 6, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "var(--text-2)",
};
const avatar = {
  width: 24, height: 24, borderRadius: "50%", background: "var(--surface-inverse)", color: "var(--text-on-inverse)",
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
const miniLabel = {
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em",
  textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6,
};
