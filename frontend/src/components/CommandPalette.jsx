import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Command as CmdIcon } from "lucide-react";
import { session } from "../lib/api.js";

const COMMANDS = [
  { id: "home", label: "返回首页", path: "/", keywords: "home 首页 产品 介绍 landing" },
  { id: "docs", label: "打开文档", path: "/docs", keywords: "docs 文档" },
  { id: "status", label: "系统状态页", path: "/status", keywords: "status 状态" },
  { id: "changelog", label: "更新日志", path: "/changelog", keywords: "changelog 更新 发布" },
  { id: "login", label: "登录", path: "/login", keywords: "login signin 登录", public: true },
  { id: "register", label: "注册", path: "/register", keywords: "register signup 注册", public: true },
  { id: "overview", label: "控制台 · 概览", path: "/dashboard/overview", keywords: "overview dashboard 概览", auth: true },
  { id: "analytics", label: "控制台 · 使用分析", path: "/dashboard/analytics", keywords: "analytics usage 分析 统计", auth: true },
  { id: "playground", label: "控制台 · Playground", path: "/dashboard/playground", keywords: "playground 测试 试玩", auth: true },
  { id: "keys", label: "控制台 · API 密钥", path: "/dashboard/keys", keywords: "api keys 密钥", auth: true },
  { id: "logs", label: "控制台 · 请求日志", path: "/dashboard/logs", keywords: "logs requests 日志", auth: true },
  { id: "billing", label: "控制台 · 账单", path: "/dashboard/billing", keywords: "billing 账单", auth: true },
  { id: "recharge", label: "控制台 · 充值", path: "/dashboard/recharge", keywords: "recharge topup 充值", auth: true },
  { id: "alerts", label: "控制台 · 告警", path: "/dashboard/alerts", keywords: "alerts 告警", auth: true },
  { id: "settings", label: "控制台 · 设置", path: "/dashboard/settings", keywords: "settings 设置 profile", auth: true },
  { id: "admin-overview",      label: "后台 · 平台概览", path: "/admin/overview",      keywords: "admin 后台 overview 概览", admin: true },
  { id: "admin-users",         label: "后台 · 用户管理", path: "/admin/users",         keywords: "admin 后台 users 用户 租户", admin: true },
  { id: "admin-keys",          label: "后台 · 全部密钥", path: "/admin/keys",          keywords: "admin 后台 keys 密钥 撤销", admin: true },
  { id: "admin-logs",          label: "后台 · 全部请求", path: "/admin/logs",          keywords: "admin 后台 logs 请求 审计", admin: true },
  { id: "admin-billing",       label: "后台 · 账单收入", path: "/admin/billing",       keywords: "admin 后台 billing 账单 营收", admin: true },
  { id: "admin-models",        label: "后台 · 模型管理", path: "/admin/models",        keywords: "admin 后台 models 模型 上架", admin: true },
  { id: "admin-announcements", label: "后台 · 公告",     path: "/admin/announcements", keywords: "admin 后台 announcements 公告 通知", admin: true },
  { id: "admin-audit",         label: "后台 · 审计日志", path: "/admin/audit",         keywords: "admin 后台 audit 审计 操作记录", admin: true },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
        setSel(0);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    const openEvt = () => { setOpen(true); setQ(""); setSel(0); };
    window.addEventListener("keydown", h);
    window.addEventListener("ty:open-palette", openEvt);
    return () => {
      window.removeEventListener("keydown", h);
      window.removeEventListener("ty:open-palette", openEvt);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const authed = session.isAuthed();
  const isAdmin = authed && session.user?.role === "admin";
  const visible = COMMANDS.filter((c) => {
    if (c.admin && !isAdmin) return false;
    if (c.auth && !authed) return false;
    return true;
  });
  const filtered = q
    ? visible.filter((c) => (c.label + " " + c.keywords).toLowerCase().includes(q.toLowerCase()))
    : visible;

  if (!open) return null;

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(filtered.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[sel];
      if (c) { nav(c.path); setOpen(false); }
    }
  }

  return (
    <>
      <div onClick={() => setOpen(false)} style={{
        position: "fixed", inset: 0, background: "var(--overlay-bg)",
        zIndex: 50, animation: "fadeIn 120ms var(--ease)",
      }}/>
      <div style={{
        position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)",
        width: 560, maxWidth: "calc(100vw - 32px)", zIndex: 51,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        borderRadius: 12, boxShadow: "var(--shadow-modal)",
        animation: "fadeIn 140ms var(--ease)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <Search size={16} color="var(--text-3)"/>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKey}
            placeholder="跳转到页面、搜索命令…"
            style={{
              flex: 1, border: "none", outline: "none",
              background: "transparent", fontSize: 15, color: "var(--text)",
            }}
          />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)",
            padding: "2px 6px", border: "1px solid var(--border)",
            borderRadius: 4, background: "var(--surface-3)",
          }}>ESC</span>
        </div>
        <div style={{ maxHeight: 360, overflow: "auto", padding: 6 }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>没有匹配的命令。</div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              onClick={() => { nav(c.path); setOpen(false); }}
              onMouseEnter={() => setSel(i)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 12px", borderRadius: 6, border: "none",
                background: i === sel ? "var(--surface-3)" : "transparent",
                cursor: "pointer", fontSize: 14, color: "var(--text)",
                textAlign: "left",
              }}
            >
              <CmdIcon size={14} color="var(--text-3)"/>
              <span style={{ flex: 1 }}>{c.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{c.path}</span>
            </button>
          ))}
        </div>
        <div style={{
          padding: "10px 16px", borderTop: "1px solid var(--border)",
          display: "flex", gap: 16, fontFamily: "var(--font-mono)",
          fontSize: 10, color: "var(--text-3)", letterSpacing: "0.08em",
        }}>
          <span>↑↓ 选择</span>
          <span>↵ 打开</span>
          <span style={{ marginLeft: "auto" }}>⌘K 切换</span>
        </div>
      </div>
    </>
  );
}
