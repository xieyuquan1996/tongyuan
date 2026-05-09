# 前端移动端适配 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复前端在手机（≤768px）上的关键体验问题：补全缺失的移动端导航、修复数据网格溢出、优化表格列显示。

**Architecture:** 复用已有的 `useIsMobile` hook（`src/lib/hooks.js`），用与 DocsLayout 完全一致的汉堡菜单 + Drawer 模式给 DashboardLayout 和 AdminLayout 补上移动端导航；通过给关键元素加 className 并在 `responsive.css` 补充 media query 解决网格和表格问题。Docs Layout 已经实现，不需要改。

**Tech Stack:** React 18, inline styles + CSS className, `useIsMobile` hook (已有)

---

## File Map

| 状态 | 文件 | 改动 |
|------|------|------|
| **Modify** | `frontend/src/pages/dashboard/Layout.jsx` | 汉堡菜单 + Drawer，SidebarContent 抽取 |
| **Modify** | `frontend/src/pages/admin/Layout.jsx` | 同上 |
| **Modify** | `frontend/src/pages/dashboard/Overview.jsx` | metrics-grid className |
| **Modify** | `frontend/src/pages/dashboard/Keys.jsx` | key-row / key-row-meta className |
| **Modify** | `frontend/src/pages/dashboard/Logs.jsx` | log-table + 各列 className，降低 minWidth |
| **Modify** | `frontend/src/components/dashboard-widgets.jsx` | RequestsTable 次要列 className |
| **Modify** | `frontend/src/styles/responsive.css` | 新增所有 media query |

---

## Task 1: Dashboard Layout — 汉堡菜单 + Drawer

**Files:**
- Modify: `frontend/src/pages/dashboard/Layout.jsx`

- [ ] **Step 1: 在 worktree 中建立工作分支**

```bash
# 在项目根目录
git worktree add .worktrees/mobile-responsive -b mobile-responsive
cd .worktrees/mobile-responsive/frontend
npm install
```

- [ ] **Step 2: 修改 DashboardLayout**

将 `frontend/src/pages/dashboard/Layout.jsx` 整体替换为以下内容：

```jsx
import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import {
  LayoutDashboard, KeyRound, List, Receipt, BookOpen, Activity,
  ChevronDown, LogOut, User, CreditCard, BarChart3,
  Bell, Settings as SettingsIcon, Sun, Moon, Command, ShieldCheck,
  Menu, X,
} from "lucide-react";
import { LogoMark } from "../../components/primitives.jsx";
import { api, session, logout } from "../../lib/api.js";
import { useTheme } from "../../lib/theme.jsx";
import { useIsMobile, startAlertPoller, stopAlertPoller } from "../../lib/hooks.js";
import { startAlertPoller, stopAlertPoller } from "../../lib/alert-poller.js";

export default function DashboardLayout() {
  const nav = useNavigate();
  const [user, setUser] = useState(session.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [banners, setBanners] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ty.dismissed_banners") || "[]"); } catch { return []; }
  });
  const { theme, setTheme } = useTheme();
  const mobile = useIsMobile(768);

  useEffect(() => {
    api("/api/console/me")
      .then((u) => { setUser(u); session.save(u, JSON.parse(localStorage.getItem("ty.session") || "{}")); })
      .catch((err) => { if (err.status === 401) { session.clear(); nav("/login", { replace: true }); } });
    api("/api/public/announcements").then((r) => setBanners(r.announcements || [])).catch(() => {});
    startAlertPoller();
    return () => stopAlertPoller();
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
  const limitRaw = user.limit_this_month;
  const hasLimit = limitRaw && parseFloat(limitRaw) > 0;
  const limit = hasLimit ? parseFloat(limitRaw) : 0;
  const pct = hasLimit ? Math.min(100, Math.round((spent / limit) * 100)) : 0;

  const sidebarProps = { user, pct, hasLimit };

  return (
    <div>
      {banners.filter(b => !dismissed.includes(b.id)).map(b => (
        <AnnouncementBanner key={b.id} banner={b} onDismiss={() => {
          const next = [...dismissed, b.id];
          setDismissed(next);
          localStorage.setItem("ty.dismissed_banners", JSON.stringify(next));
        }}/>
      ))}
      <header style={topNav}>
        {mobile && (
          <button
            onClick={() => setDrawerOpen(o => !o)}
            aria-label="菜单"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 4, display: "flex", alignItems: "center" }}
          >
            {drawerOpen ? <X size={22}/> : <Menu size={22}/>}
          </button>
        )}
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <LogoMark size={26}/>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 600 }}>枫连</span>
          {!mobile && <>
            <span style={{ color: "var(--text-4)", margin: "0 4px" }}>/</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-2)" }}>console</span>
          </>}
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          {!mobile && <KShortcutHint/>}
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} title="切换主题"
            style={iconOnlyBtn}>
            {theme === "light" ? <Moon size={14}/> : <Sun size={14}/>}
          </button>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }} style={userBtn}>
            <div style={avatar}>{(user.name || user.email || "?")[0].toUpperCase()}</div>
            {!mobile && <span style={{ fontSize: 13 }}>{user.name || user.email}</span>}
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

      {/* Mobile drawer overlay */}
      {mobile && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 19 }}
        />
      )}

      {/* Mobile drawer */}
      {mobile && drawerOpen && (
        <aside className="app-sidebar" style={{
          ...sidebar,
          position: "fixed", top: 64, left: 0,
          width: 280, height: "calc(100vh - 64px)",
          zIndex: 20, boxShadow: "var(--shadow-modal)",
        }}>
          <SidebarContent {...sidebarProps} onNavClick={() => setDrawerOpen(false)}/>
        </aside>
      )}

      <div style={{ display: "flex" }}>
        {!mobile && (
          <aside className="app-sidebar" style={sidebar}>
            <SidebarContent {...sidebarProps}/>
          </aside>
        )}
        <main style={{ flex: 1, padding: mobile ? "16px 16px 64px" : "32px 32px 64px", maxWidth: 1280, minWidth: 0 }}>
          <Outlet context={{ user }}/>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ user, pct, hasLimit, onNavClick }) {
  return (
    <>
      <Group>主菜单</Group>
      <SideItem to="/dashboard/overview" icon={LayoutDashboard} onClick={onNavClick}>概览</SideItem>
      <SideItem to="/dashboard/analytics" icon={BarChart3} onClick={onNavClick}>使用分析</SideItem>
      <SideItem to="/dashboard/keys" icon={KeyRound} onClick={onNavClick}>API 密钥</SideItem>
      <SideItem to="/dashboard/logs" icon={List} onClick={onNavClick}>请求日志</SideItem>
      <Group style={{ marginTop: 16 }}>账户</Group>
      <SideItem to="/dashboard/billing" icon={Receipt} onClick={onNavClick}>账单</SideItem>
      <SideItem to="/dashboard/recharge" icon={CreditCard} onClick={onNavClick}>充值</SideItem>
      <SideItem to="/dashboard/alerts" icon={Bell} onClick={onNavClick}>告警</SideItem>
      <SideItem to="/dashboard/settings" icon={SettingsIcon} onClick={onNavClick}>设置</SideItem>
      {user.role === "admin" && (
        <>
          <Group style={{ marginTop: 16 }}>管理</Group>
          <SideItem to="/admin/overview" icon={ShieldCheck} onClick={onNavClick}>后台管理</SideItem>
        </>
      )}
      <Group style={{ marginTop: 16 }}>资源</Group>
      <SideItem href="/docs" icon={BookOpen} onClick={onNavClick}>文档</SideItem>
      <div style={{ flex: 1 }}/>
      <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 8 }}>
        <div style={miniLabel}>本月用量</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>¥{user.spent_this_month}</div>
        <div style={{ width: "100%", height: 4, background: "var(--surface-3)", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: pct + "%", height: "100%", background: "var(--clay)" }}/>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", marginTop: 6 }}>
          {pct}% · 上限 {hasLimit ? "¥" + user.limit_this_month : "∞"}
        </div>
      </div>
    </>
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

function SideItem({ to, href, icon: Icon, children, onClick }) {
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
      <a href={href} style={base} onClick={onClick}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
        <Icon size={16}/>{children}
      </a>
    );
  }
  return (
    <NavLink to={to} onClick={onClick} style={({ isActive }) => ({
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
  padding: "0 16px", gap: 12,
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

const SEVERITY_COLORS = {
  info: { bg: "var(--info-soft)", border: "var(--info)", text: "var(--info-text)" },
  warn: { bg: "var(--warn-soft)", border: "var(--warn)", text: "var(--warn-text)" },
  err:  { bg: "var(--err-soft)",  border: "var(--err)",  text: "var(--err-text)"  },
};

function AnnouncementBanner({ banner, onDismiss }) {
  const c = SEVERITY_COLORS[banner.severity] || SEVERITY_COLORS.info;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 24px",
      background: c.bg,
      borderBottom: `1px solid ${c.border}`,
      fontSize: 13, color: c.text,
    }}>
      <span style={{ flex: 1 }}>
        <b>{banner.title}</b>
        {banner.body ? <span style={{ marginLeft: 8, opacity: 0.85 }}>{banner.body}</span> : null}
      </span>
      <button onClick={onDismiss} style={{
        background: "transparent", border: "none", cursor: "pointer",
        color: c.text, opacity: 0.6, padding: "2px 6px", fontSize: 16, lineHeight: 1,
      }}>×</button>
    </div>
  );
}
```

**注意：** 上面的 import 有错误（复制了两行 alert-poller），需要修正为：

```jsx
import { useIsMobile } from "../../lib/hooks.js";
import { startAlertPoller, stopAlertPoller } from "../../lib/alert-poller.js";
```

- [ ] **Step 3: 验证前端启动无报错**

```bash
cd frontend && npm run dev
```

访问 `http://localhost:5173/dashboard` 确认：
- 桌面（>768px）：侧边栏正常显示
- 手机模拟（<768px，DevTools 设备模式）：显示汉堡按钮，点击展开 Drawer，点菜单项跳转后 Drawer 关闭

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/dashboard/Layout.jsx
git commit -m "feat(frontend): add mobile hamburger drawer to dashboard layout"
```

---

## Task 2: Admin Layout — 汉堡菜单 + Drawer

**Files:**
- Modify: `frontend/src/pages/admin/Layout.jsx`

- [ ] **Step 1: 修改 AdminLayout**

将 `frontend/src/pages/admin/Layout.jsx` 整体替换为以下内容：

```jsx
import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import {
  LayoutDashboard, Users, KeyRound, List, CreditCard, Cpu, Globe2,
  Megaphone, History, ShieldCheck, ChevronDown, LogOut, User, Sun, Moon,
  Command, Key, Settings, FlaskConical, Menu, X,
} from "lucide-react";
import { LogoMark } from "../../components/primitives.jsx";
import { api, session, logout } from "../../lib/api.js";
import { useTheme } from "../../lib/theme.jsx";
import { useIsMobile } from "../../lib/hooks.js";

export default function AdminLayout() {
  const nav = useNavigate();
  const [user, setUser] = useState(session.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const mobile = useIsMobile(768);

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
        {mobile && (
          <button
            onClick={() => setDrawerOpen(o => !o)}
            aria-label="菜单"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 4, display: "flex", alignItems: "center" }}
          >
            {drawerOpen ? <X size={22}/> : <Menu size={22}/>}
          </button>
        )}
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <LogoMark size={26}/>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 600 }}>枫连</span>
          <span style={{ color: "var(--text-4)", margin: "0 4px" }}>/</span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-clay)",
            background: "var(--clay)", padding: "3px 8px", borderRadius: 4,
            letterSpacing: "0.08em",
          }}>ADMIN</span>
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          {!mobile && (
            <Link to="/dashboard/overview" style={{
              display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
              border: "1px solid var(--border)", borderRadius: 6,
              fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)",
              textDecoration: "none",
            }}>
              <LayoutDashboard size={12}/> 我的控制台
            </Link>
          )}
          {!mobile && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("ty:open-palette"))}
              title="命令面板" style={kBtn}>
              <Command size={12}/> K
            </button>
          )}
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} title="切换主题" style={iconOnlyBtn}>
            {theme === "light" ? <Moon size={14}/> : <Sun size={14}/>}
          </button>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }} style={userBtn}>
            <div style={avatar}>{(user.name || user.email || "?")[0].toUpperCase()}</div>
            {!mobile && <span style={{ fontSize: 13 }}>{user.name || user.email}</span>}
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

      {mobile && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 19 }}
        />
      )}

      {mobile && drawerOpen && (
        <aside className="app-sidebar" style={{
          ...sidebar,
          position: "fixed", top: 64, left: 0,
          width: 280, height: "calc(100vh - 64px)",
          zIndex: 20, boxShadow: "var(--shadow-modal)",
        }}>
          <AdminSidebarContent onNavClick={() => setDrawerOpen(false)}/>
        </aside>
      )}

      <div style={{ display: "flex" }}>
        {!mobile && (
          <aside className="app-sidebar" style={sidebar}>
            <AdminSidebarContent/>
          </aside>
        )}
        <main style={{ flex: 1, padding: mobile ? "16px 16px 64px" : "32px 32px 64px", maxWidth: 1280, minWidth: 0 }}>
          <Outlet context={{ user }}/>
        </main>
      </div>
    </div>
  );
}

function AdminSidebarContent({ onNavClick }) {
  return (
    <>
      <Group>运营总览</Group>
      <SideItem to="/admin/overview" icon={LayoutDashboard} onClick={onNavClick}>平台概览</SideItem>
      <SideItem to="/admin/audit" icon={History} onClick={onNavClick}>审计日志</SideItem>
      <Group style={{ marginTop: 16 }}>账户管理</Group>
      <SideItem to="/admin/users" icon={Users} onClick={onNavClick}>用户</SideItem>
      <SideItem to="/admin/keys" icon={KeyRound} onClick={onNavClick}>全部密钥</SideItem>
      <SideItem to="/admin/logs" icon={List} onClick={onNavClick}>全部请求</SideItem>
      <SideItem to="/admin/billing" icon={CreditCard} onClick={onNavClick}>账单 / 收入</SideItem>
      <Group style={{ marginTop: 16 }}>平台配置</Group>
      <SideItem to="/admin/upstream-keys" icon={Key} onClick={onNavClick}>上游密钥</SideItem>
      <SideItem to="/admin/models" icon={Cpu} onClick={onNavClick}>模型</SideItem>
      <SideItem to="/admin/playground" icon={FlaskConical} onClick={onNavClick}>Playground</SideItem>
      <SideItem to="/admin/announcements" icon={Megaphone} onClick={onNavClick}>公告</SideItem>
      <SideItem to="/admin/settings" icon={Settings} onClick={onNavClick}>平台设置</SideItem>
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
    </>
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

function SideItem({ to, icon: Icon, children, onClick }) {
  const base = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 12px", borderRadius: 6,
    fontSize: 14, fontWeight: 400,
    color: "var(--text-2)", textDecoration: "none",
    textAlign: "left", border: "none", background: "transparent",
    cursor: "pointer",
  };
  return (
    <NavLink to={to} onClick={onClick} style={({ isActive }) => ({
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
  padding: "0 16px", gap: 12,
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
```

- [ ] **Step 2: 验证 Admin Layout**

访问 `/admin/overview`，DevTools 手机模式下确认汉堡菜单和 Drawer 工作正常。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/Layout.jsx
git commit -m "feat(frontend): add mobile hamburger drawer to admin layout"
```

---

## Task 3: Overview 4列网格响应式 + Keys 行卡片化

**Files:**
- Modify: `frontend/src/pages/dashboard/Overview.jsx`
- Modify: `frontend/src/pages/dashboard/Keys.jsx`
- Modify: `frontend/src/styles/responsive.css`

- [ ] **Step 1: Overview.jsx — 给 MetricCard 网格加 className**

在 `frontend/src/pages/dashboard/Overview.jsx` 中，找到这行：

```jsx
<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
```

改为：

```jsx
<div className="metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
```

- [ ] **Step 2: Keys.jsx — 给行和 meta 区域加 className**

在 `frontend/src/pages/dashboard/Keys.jsx` 中，找到 `keys.map` 里的行 div（约第 157 行）：

```jsx
<div
  key={k.id}
  style={{
    display: "flex", alignItems: "center", gap: 24,
    padding: "20px 24px",
    borderTop: i ? "1px solid var(--divider)" : "none",
  }}
>
  <KeyRound size={18} color={k.state === "active" ? "var(--clay)" : "var(--text-4)"} />
  <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{k.name}</div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{k.prefix}…••••</div>
  </div>
  <div style={{ width: 120 }}>
    <div style={cellLabel}>创建于</div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{k.created_at?.slice(0, 10)}</div>
  </div>
  <div style={{ width: 120 }}>
    <div style={cellLabel}>最近使用</div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{fmtRelative(k.last_used_at)}</div>
  </div>
  <div style={{ width: 110 }}>
    <div style={cellLabel}>限额</div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)" }}>
      {k.rpm_limit ? `${k.rpm_limit}/m` : "—"}
      {k.tpm_limit ? ` · ${formatTpm(k.tpm_limit)}t/m` : ""}
    </div>
  </div>
  {k.state === "active" ? <Pill tone="ok" dot>活跃</Pill> : <Pill dot>已撤销</Pill>}
  {k.state === "active" ? (
    <>
      <button onClick={() => setEditKey(k)} style={{ ...iconBtn }} title="编辑限额">
        <Sliders size={16} />
      </button>
      <button onClick={() => setRevokeId(k.id)} style={{ ...iconBtn, color: "var(--err)" }} title="撤销">
        <Ban size={16} />
      </button>
    </>
  ) : <span style={{ width: 56 }} />}
</div>
```

替换为：

```jsx
<div
  key={k.id}
  className="key-row"
  style={{
    display: "flex", alignItems: "center", gap: 24,
    padding: "20px 24px",
    borderTop: i ? "1px solid var(--divider)" : "none",
  }}
>
  <KeyRound size={18} color={k.state === "active" ? "var(--clay)" : "var(--text-4)"} style={{ flexShrink: 0 }} />
  <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{k.name}</div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{k.prefix}…••••</div>
  </div>
  <div className="key-row-meta" style={{ display: "contents" }}>
    <div style={{ width: 120 }}>
      <div style={cellLabel}>创建于</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{k.created_at?.slice(0, 10)}</div>
    </div>
    <div style={{ width: 120 }}>
      <div style={cellLabel}>最近使用</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{fmtRelative(k.last_used_at)}</div>
    </div>
    <div style={{ width: 110 }}>
      <div style={cellLabel}>限额</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)" }}>
        {k.rpm_limit ? `${k.rpm_limit}/m` : "—"}
        {k.tpm_limit ? ` · ${formatTpm(k.tpm_limit)}t/m` : ""}
      </div>
    </div>
  </div>
  <div className="key-row-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
    {k.state === "active" ? <Pill tone="ok" dot>活跃</Pill> : <Pill dot>已撤销</Pill>}
    {k.state === "active" ? (
      <>
        <button onClick={() => setEditKey(k)} style={{ ...iconBtn }} title="编辑限额">
          <Sliders size={16} />
        </button>
        <button onClick={() => setRevokeId(k.id)} style={{ ...iconBtn, color: "var(--err)" }} title="撤销">
          <Ban size={16} />
        </button>
      </>
    ) : <span style={{ width: 56 }} />}
  </div>
</div>
```

- [ ] **Step 3: responsive.css — 新增 metrics-grid 和 key-row 规则**

在 `frontend/src/styles/responsive.css` 末尾追加：

```css
/* Overview metrics grid */
@media (max-width: 768px) {
  .metrics-grid { grid-template-columns: repeat(2, 1fr) !important; }
}

/* API Keys list — mobile card layout */
@media (max-width: 640px) {
  .key-row { flex-wrap: wrap !important; gap: 12px 8px !important; padding: 16px !important; }
  .key-row-meta {
    display: flex !important;
    width: 100%;
    gap: 16px;
    padding-left: 26px;
  }
  .key-row-meta > div { width: auto !important; }
  .key-row-actions { margin-left: auto; }
}
```

- [ ] **Step 4: 验证**

DevTools 手机模式下访问 `/dashboard/overview`：
- MetricCard 显示 2 列
- `/dashboard/keys` 的密钥行在手机上 meta 信息换到下方显示

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/Overview.jsx frontend/src/pages/dashboard/Keys.jsx frontend/src/styles/responsive.css
git commit -m "feat(frontend): responsive metrics grid and keys card layout"
```

---

## Task 4: Logs 表格次要列隐藏 + RequestsTable 精简

**Files:**
- Modify: `frontend/src/pages/dashboard/Logs.jsx`
- Modify: `frontend/src/components/dashboard-widgets.jsx`
- Modify: `frontend/src/styles/responsive.css`

- [ ] **Step 1: Logs.jsx — table 和次要列加 className**

在 `frontend/src/pages/dashboard/Logs.jsx` 的 `LogsTable` 函数中，找到：

```jsx
<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 960 }}>
```

改为：

```jsx
<table className="log-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 960 }}>
```

然后给次要列的 `<th>` 和对应 `<td>` 加 className。找到以下各行并加上对应 className：

**thead 部分：**
```jsx
{/* 原来 */}
<th style={th}>请求 ID</th>
{/* 改为 */}
<th className="log-col-hide" style={th}>请求 ID</th>
```

```jsx
{/* 原来 */}
<th style={th}>类型</th>
{/* 改为 */}
<th className="log-col-hide" style={th}>类型</th>
```

```jsx
{/* 原来 */}
<th style={th}>服务层</th>
{/* 改为 */}
<th className="log-col-hide" style={th}>服务层</th>
```

```jsx
{/* 原来 */}
<th style={th}>请求路径</th>
{/* 改为 */}
<th className="log-col-hide" style={th}>请求路径</th>
```

**tbody 对应 td 部分：**

```jsx
{/* 请求 ID td — 原来 */}
<td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>
  <StatusDot status={r.status} />
  {r.id}
</td>
{/* 改为 */}
<td className="log-col-hide" style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>
  <StatusDot status={r.status} />
  {r.id}
</td>
```

```jsx
{/* 类型 td — 原来 */}
<td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.type || "HTTP"}</td>
{/* 改为 */}
<td className="log-col-hide" style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.type || "HTTP"}</td>
```

```jsx
{/* 服务层 td — 原来 */}
<td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.service_tier === "Standard" ? "标准" : (r.service_tier || "标准")}</td>
{/* 改为 */}
<td className="log-col-hide" style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.service_tier === "Standard" ? "标准" : (r.service_tier || "标准")}</td>
```

```jsx
{/* 请求路径 td — 原来 */}
<td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
  {r.endpoint || "/v1/messages"}
</td>
{/* 改为 */}
<td className="log-col-hide" style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
  {r.endpoint || "/v1/messages"}
</td>
```

- [ ] **Step 2: dashboard-widgets.jsx — RequestsTable 次要列加 className**

在 `frontend/src/components/dashboard-widgets.jsx` 的 `RequestsTable` 函数中，给请求 ID 列和 Tokens 列加 className：

**thead：**
```jsx
{/* 原来 */}
<th style={th}>请求 ID</th>
{/* 改为 */}
<th className="req-col-hide" style={th}>请求 ID</th>
```

```jsx
{/* 原来 */}
<th style={th}>Tokens</th>
{/* 改为 */}
<th className="req-col-hide" style={th}>Tokens</th>
```

**tbody：**
```jsx
{/* 请求 ID td — 原来 */}
<td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.id}</td>
{/* 改为 */}
<td className="req-col-hide" style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.id}</td>
```

```jsx
{/* Tokens td — 原来 */}
<td style={{ ...td, fontFamily: "var(--font-mono)" }}>{(r.tokens || 0).toLocaleString()}</td>
{/* 改为 */}
<td className="req-col-hide" style={{ ...td, fontFamily: "var(--font-mono)" }}>{(r.tokens || 0).toLocaleString()}</td>
```

- [ ] **Step 3: responsive.css — 新增 log/req 表格规则**

在 `responsive.css` 末尾继续追加：

```css
/* Logs table — hide secondary columns on mobile */
@media (max-width: 640px) {
  .log-col-hide { display: none !important; }
  .log-table { min-width: 480px !important; }
}

/* Overview RequestsTable — hide secondary columns on mobile */
@media (max-width: 640px) {
  .req-col-hide { display: none !important; }
}
```

- [ ] **Step 4: 验证**

DevTools 手机模式下访问 `/dashboard/logs`：
- 表格只显示时间、模型、输入 Tokens、输出 Tokens、chevron 列
- 表格可水平滚动（overflow: auto 容器保留）

访问 `/dashboard/overview`：
- 最近请求表格只显示状态、模型、延迟、时间列

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/Logs.jsx frontend/src/components/dashboard-widgets.jsx frontend/src/styles/responsive.css
git commit -m "feat(frontend): hide secondary table columns on mobile for logs and requests"
```

---

## Task 5: Maple Ledger 移动端适配

**Files:**
- Modify: `maple-ledger/src/components/Layout.tsx`
- Modify: `maple-ledger/src/pages/Transactions.tsx`
- Modify: `maple-ledger/src/pages/MonthlyReport.tsx`
- Modify: `maple-ledger/src/pages/ExchangeLoss.tsx`
- Modify: `maple-ledger/src/components/TransactionForm.tsx`

- [ ] **Step 1: Layout.tsx — 导航栏手机换行**

在 `maple-ledger/src/components/Layout.tsx` 中，将 nav 改为支持换行：

```tsx
export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="font-bold text-lg text-gray-900 shrink-0">🍁 Maple Ledger</span>
        <div className="flex items-center gap-4 flex-wrap">
          <NavLink
            to="/transactions"
            className={({ isActive }) =>
              `text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            交易记录
          </NavLink>
          <NavLink
            to="/reports/monthly"
            className={({ isActive }) =>
              `text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            月度报表
          </NavLink>
          <NavLink
            to="/reports/exchange-loss"
            className={({ isActive }) =>
              `text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            汇率损耗
          </NavLink>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Transactions.tsx — 表格加 overflow 容器，顶部操作区响应式**

在 `maple-ledger/src/pages/Transactions.tsx` 中，做两处修改：

**顶部操作区**（约第 25-35 行），将：
```tsx
<div className="flex items-center justify-between mb-4">
  <div className="flex items-center gap-3">
```
改为：
```tsx
<div className="flex flex-wrap items-center gap-3 mb-4">
  <div className="flex items-center gap-2">
```

并将 `justify-between` 的第二个子 div：
```tsx
<div className="flex items-center gap-3">
  <select ...>...</select>
  <button ...>+ 新增交易</button>
</div>
```
改为：
```tsx
<div className="flex items-center gap-2 ml-auto">
  <select ...>...</select>
  <button ...>+ 新增</button>
</div>
```

**表格容器**，将：
```tsx
<div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
  <table className="w-full text-sm">
```
改为：
```tsx
<div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
  <table className="w-full text-sm min-w-[560px]">
```

同时给次要列加 `hidden sm:table-cell` class，在手机上隐藏：

**thead 中的"备注"列：**
```tsx
{/* 原来 */}
<th className="text-left px-4 py-3 text-gray-600 font-medium">备注</th>
{/* 改为 */}
<th className="text-left px-4 py-3 text-gray-600 font-medium hidden sm:table-cell">备注</th>
```

**tbody 中的"备注"td：**
```tsx
{/* 原来 */}
<td className="px-4 py-3 text-gray-500">{tx.note ?? '-'}</td>
{/* 改为 */}
<td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{tx.note ?? '-'}</td>
```

- [ ] **Step 3: MonthlyReport.tsx — 表格加 overflow 容器**

在 `maple-ledger/src/pages/MonthlyReport.tsx` 中，找到：

```tsx
<div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
  <table className="w-full text-sm">
```

改为：

```tsx
<div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
  <table className="w-full text-sm min-w-[480px]">
```

- [ ] **Step 4: ExchangeLoss.tsx — 表格加 overflow 容器，隐藏次要列**

在 `maple-ledger/src/pages/ExchangeLoss.tsx` 中，找到：

```tsx
<div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
  <table className="w-full text-sm">
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="text-left px-4 py-3 text-gray-600 font-medium">日期</th>
        <th className="text-right px-4 py-3 text-gray-600 font-medium">金额 (CAD)</th>
        <th className="text-right px-4 py-3 text-gray-600 font-medium">银行汇率</th>
        <th className="text-right px-4 py-3 text-gray-600 font-medium">市场汇率</th>
        <th className="text-right px-4 py-3 text-gray-600 font-medium">损耗 (CAD)</th>
        <th className="text-right px-4 py-3 text-gray-600 font-medium">损耗%</th>
      </tr>
    </thead>
```

替换为：

```tsx
<div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
  <table className="w-full text-sm min-w-[420px]">
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="text-left px-4 py-3 text-gray-600 font-medium">日期</th>
        <th className="text-right px-4 py-3 text-gray-600 font-medium hidden sm:table-cell">金额 (CAD)</th>
        <th className="text-right px-4 py-3 text-gray-600 font-medium hidden sm:table-cell">银行汇率</th>
        <th className="text-right px-4 py-3 text-gray-600 font-medium hidden sm:table-cell">市场汇率</th>
        <th className="text-right px-4 py-3 text-gray-600 font-medium">损耗 (CAD)</th>
        <th className="text-right px-4 py-3 text-gray-600 font-medium">损耗%</th>
      </tr>
    </thead>
```

同样给 tbody 对应 td 加 `hidden sm:table-cell`：

```tsx
{/* 原来 */}
<td className="px-4 py-3 text-right text-gray-700">CA${r.amount.toFixed(2)}</td>
<td className="px-4 py-3 text-right text-gray-600">{r.bank_rate.toFixed(4)}</td>
<td className="px-4 py-3 text-right text-gray-600">{r.market_rate_at_purchase.toFixed(4)}</td>
{/* 改为 */}
<td className="px-4 py-3 text-right text-gray-700 hidden sm:table-cell">CA${r.amount.toFixed(2)}</td>
<td className="px-4 py-3 text-right text-gray-600 hidden sm:table-cell">{r.bank_rate.toFixed(4)}</td>
<td className="px-4 py-3 text-right text-gray-600 hidden sm:table-cell">{r.market_rate_at_purchase.toFixed(4)}</td>
```

- [ ] **Step 5: TransactionForm.tsx — 表单网格响应式**

在 `maple-ledger/src/components/TransactionForm.tsx` 中，将所有固定列数的 grid 改为响应式：

```tsx
{/* 原来 */}
<div className="grid grid-cols-2 gap-3">
{/* 改为 */}
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

```tsx
{/* 原来 */}
<div className="grid grid-cols-3 gap-2">
{/* 改为 */}
<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
```

底部的 SummaryCards 已经用了 `grid-cols-2 md:grid-cols-4`，不需要改。

- [ ] **Step 6: 验证 maple-ledger**

```bash
cd maple-ledger && npm test
```

Expected: 13 个测试全部通过（TransactionForm.test.tsx 会验证表单渲染）

- [ ] **Step 7: Commit**

```bash
git add maple-ledger/src/components/Layout.tsx \
        maple-ledger/src/pages/Transactions.tsx \
        maple-ledger/src/pages/MonthlyReport.tsx \
        maple-ledger/src/pages/ExchangeLoss.tsx \
        maple-ledger/src/components/TransactionForm.tsx
git commit -m "feat(maple-ledger): mobile responsive layout, table overflow, form grid"
```

---

## Task 6: 收尾验证与合并

- [ ] **Step 1: 前端构建验证**

```bash
cd frontend && npm run build
```

Expected: 无报错，`dist/` 生成

- [ ] **Step 2: 前端测试**

```bash
cd frontend && npm test
```

Expected: 所有现有测试通过（Keys.test.jsx、ResetPassword.test.jsx 等）

- [ ] **Step 3: 全局手动验证清单**

在 `npm run dev` 下，DevTools 手机模式（375px）逐一检查：
- `/dashboard/overview`：汉堡按钮显示，点击 Drawer 滑出，菜单项可点击跳转，Drawer 关闭；MetricCard 2 列
- `/dashboard/keys`：密钥行 meta 信息换行显示
- `/dashboard/logs`：次要列隐藏，表格可滚动
- `/admin/overview`：汉堡按钮和 Drawer 正常
- `/docs/quickstart`：本来已正常，确认无回归
- maple-ledger（`npm run dev` 独立启动）：导航栏换行正常；交易/汇率损耗表格可滚动；TransactionForm 在手机上各字段单列显示

桌面（>768px）：所有页面与改动前一致（有侧边栏，4 列 MetricCard，完整日志表格；maple-ledger 多列表格正常）

- [ ] **Step 4: Commit 并合并**

```bash
# 在 worktree 内
cd /path/to/project-root
git merge mobile-responsive
git worktree remove .worktrees/mobile-responsive
git branch -d mobile-responsive
```
