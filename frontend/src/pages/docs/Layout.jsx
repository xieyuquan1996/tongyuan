import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router-dom";
import { Search, ChevronRight, Copy, Check, Menu, X } from "lucide-react";
import { LogoMark } from "../../components/primitives.jsx";
import { session } from "../../lib/api.js";
import { useIsMobile } from "../../lib/hooks.js";

const SECTIONS = [
  ["入门", [
    ["quickstart",  "快速开始"],
    ["claude-code", "接入 Claude Code"],
    ["auth",        "认证与密钥"],
    // ["regions",     "区域选择"],  // 暂时隐藏
  ]],
  ["扩展接入", [
    ["openclaw", "接入 OpenClaw"],
    ["hermes",   "接入 Hermes Agent"],
  ]],
  ["API 参考", [
    ["messages",  "Anthropic 原生接口"],
    ["openai",    "OpenAI 兼容接口"],
    ["streaming", "流式响应"],
    ["tools",     "工具调用"],
  ]],
  ["保真承诺", [
    ["audit",  "请求审计"],
    ["models", "模型映射"],
    // ["sla",    "SLA"],  // 暂时隐藏
  ]],
];

const TOC = {
  quickstart: [
    { id: "top", label: "5 分钟接入" },
    { id: "install", label: "1 · 安装 SDK" },
    { id: "key", label: "2 · 获取密钥" },
    { id: "call", label: "3 · 第一次调用" },
    { id: "verify", label: "4 · 验证保真" },
    { id: "next", label: "下一步" },
  ],
  "claude-code": [
    { id: "top", label: "接入 Claude Code" },
    { id: "install", label: "方式 A · 自动安装" },
    { id: "manual", label: "方式 B · 手动配置" },
    { id: "verify", label: "验证接入成功" },
    { id: "troubleshoot", label: "常见问题" },
  ],
  auth: [
    { id: "top", label: "认证与密钥" },
    { id: "format", label: "密钥格式" },
    { id: "rotate", label: "轮换" },
    { id: "scope", label: "子密钥 / 限制" },
  ],
  regions: [
    { id: "top", label: "区域选择" },
    { id: "list", label: "机房一览" },
    { id: "pin", label: "显式指定" },
    { id: "failover", label: "故障转移" },
  ],  messages: [
    { id: "top", label: "messages.create" },
    { id: "params", label: "必填参数" },
    { id: "example", label: "完整请求示例" },
  ],
  openai: [
    { id: "top", label: "OpenAI 兼容接口" },
    { id: "endpoint", label: "接口地址" },
    { id: "python", label: "Python SDK" },
    { id: "nodejs", label: "Node.js / TypeScript" },
    { id: "stream", label: "流式响应" },
    { id: "curl", label: "cURL" },
    { id: "notes", label: "注意事项" },
  ],
  streaming: [
    { id: "top", label: "流式响应" },
    { id: "example", label: "最小示例" },
    { id: "events", label: "事件类型" },
    { id: "billing", label: "计费" },
  ],
  tools: [
    { id: "top", label: "工具调用" },
    { id: "declare", label: "声明工具" },
    { id: "response", label: "响应结构" },
    { id: "force", label: "强制调用" },
  ],
  audit: [
    { id: "top", label: "请求审计" },
    { id: "how", label: "工作原理" },
  ],
  models: [
    { id: "top", label: "模型映射" },
    { id: "list", label: "当前支持" },
    { id: "snapshot", label: "快照版本" },
    { id: "deprecation", label: "退役策略" },
  ],
  sla: [
    { id: "top", label: "SLA" },
    { id: "definition", label: "可用率定义" },
    { id: "credit", label: "服务信用" },
    { id: "consistency", label: "一致性 SLA" },
  ],
  providers: [
    { id: "top", label: "接入第三方模型" },
  ],
  openclaw: [
    { id: "top", label: "接入 OpenClaw" },
    { id: "script", label: "一键脚本" },
    { id: "onboard", label: "onboarding" },
    { id: "manual", label: "手写配置" },
  ],
  hermes: [
    { id: "top", label: "接入 Hermes Agent" },
    { id: "script", label: "一键脚本" },
    { id: "manual", label: "手写配置" },
  ],
};

export default function DocsLayout() {
  const loc = useLocation();
  const page = loc.pathname.split("/").filter(Boolean)[1] || "quickstart";
  const tocItems = TOC[page] || [];
  const mobile = useIsMobile(900);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); setNavOpen(false); }, [loc.pathname]);

  return (
    <div>
      <header style={{
        position: "sticky", top: 0, zIndex: 10,
        height: 64, display: "flex", alignItems: "center",
        padding: mobile ? "0 16px" : "0 32px", gap: mobile ? 8 : 32,
        background: "var(--surface-glass)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border)",
      }}>
        {mobile && (
          <button onClick={() => setNavOpen(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 4 }}>
            {navOpen ? <X size={20}/> : <Menu size={20}/>}
          </button>
        )}
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <LogoMark size={26} />
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 600 }}>同源</span>
          {!mobile && <>
            <span style={{ color: "var(--text-4)", margin: "0 4px" }}>/</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-2)" }}>docs</span>
          </>}
        </Link>
        {!mobile && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("ty:open-palette"))}
            title="打开搜索 ⌘K"
            style={{
              flex: 1, maxWidth: 480, position: "relative",
              display: "flex", alignItems: "center",
              padding: "8px 12px 8px 34px",
              border: "1px solid var(--border)", borderRadius: 6,
              background: "var(--surface-2)", fontSize: 13,
              color: "var(--text-3)", cursor: "pointer",
              textAlign: "left", fontFamily: "inherit",
            }}
          >
            <Search size={14} color="var(--text-3)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            搜索文档、跳转页面…
            <span style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)",
              padding: "2px 6px", border: "1px solid var(--border)",
              borderRadius: 4, background: "var(--surface-3)",
            }}>⌘K</span>
          </button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          {!mobile && <Link to="/" style={{ fontSize: 14, color: "var(--text-2)", textDecoration: "none" }}>主页</Link>}
          <Link to={session.isAuthed() ? "/dashboard" : "/login"} style={{ fontSize: 14, color: "var(--text)", textDecoration: "none" }}>
            {session.isAuthed() ? "控制台 →" : "登录 →"}
          </Link>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobile && navOpen && (
        <div style={{
          position: "fixed", top: 64, left: 0, right: 0, bottom: 0,
          background: "var(--surface-2)", zIndex: 9, overflowY: "auto",
          padding: "16px",
          borderTop: "1px solid var(--border)",
        }}>
          {SECTIONS.map(([title, items]) => (
            <div key={title} style={{ marginBottom: 20 }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em",
                textTransform: "uppercase", color: "var(--text-3)", padding: "0 12px 8px",
              }}>{title}</div>
              {items.map(([key, label]) => <DocsLink key={key} to={key}>{label}</DocsLink>)}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", maxWidth: 1440, margin: "0 auto" }}>
        {!mobile && (
          <aside style={{
            width: 240, padding: "24px 16px",
            borderRight: "1px solid var(--border)",
            minHeight: "calc(100vh - 64px)",
            position: "sticky", top: 64, alignSelf: "flex-start",
            background: "var(--surface-2)",
          }}>
            {SECTIONS.map(([title, items]) => (
              <div key={title} style={{ marginBottom: 20 }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em",
                  textTransform: "uppercase", color: "var(--text-3)", padding: "0 12px 8px",
                }}>{title}</div>
                {items.map(([key, label]) => <DocsLink key={key} to={key}>{label}</DocsLink>)}
              </div>
            ))}
          </aside>
        )}

        <main style={{ flex: 1, padding: mobile ? "24px 16px 64px" : "48px 48px 96px", maxWidth: 760, minWidth: 0 }}>
          <Outlet />
        </main>

        {!mobile && (
          <aside style={{
            width: 200, padding: "32px 16px 32px 24px",
            position: "sticky", top: 64, alignSelf: "flex-start",
          }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em",
              textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12,
            }}>本页内容</div>
            {tocItems.map((it, i) => (
              <a key={i} href={`#${it.id}`} style={{
                display: "block", padding: "4px 0", fontSize: 12,
                color: i === 0 ? "var(--text)" : "var(--text-3)",
                textDecoration: "none",
                borderLeft: i === 0 ? "2px solid var(--clay)" : "2px solid transparent",
                paddingLeft: 12, marginLeft: -2,
              }}>{it.label}</a>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}

function DocsLink({ to, children }) {
  const render = ({ isActive }) => ({
    display: "block", width: "100%", textAlign: "left",
    padding: "6px 12px", borderRadius: 6,
    background: isActive ? "var(--surface-3)" : "transparent",
    color: isActive ? "var(--text)" : "var(--text-2)",
    fontWeight: isActive ? 500 : 400,
    borderLeft: isActive ? "2px solid var(--clay)" : "2px solid transparent",
    marginBottom: 1, fontSize: 13, textDecoration: "none",
  });
  return <NavLink to={to} style={render}>{children}</NavLink>;
}

// Exported prose primitives so the article pages can import them.
export function Breadcrumb({ section, page }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay-press)" }}>{section}</span>
      <ChevronRight size={12} color="var(--text-4)"/>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>{page}</span>
    </div>
  );
}

export function H1({ children, id }) {
  return <h1 id={id} style={{ fontFamily: "var(--font-serif)", fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 12px" }}>{children}</h1>;
}
export function H2({ children, id }) {
  return <h2 id={id} style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.2, margin: "48px 0 16px", paddingTop: 16, borderTop: "1px solid var(--divider)" }}>{children}</h2>;
}
export function P({ children }) {
  return <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--text)", margin: "0 0 16px" }}>{children}</p>;
}
export function Lead({ children }) {
  return <p style={{ fontSize: 18, lineHeight: 1.6, color: "var(--text-2)", margin: "0 0 32px", maxWidth: 640 }}>{children}</p>;
}
export function IC({ children }) {
  return <code style={{ fontFamily: "var(--font-mono)", fontSize: 14, background: "var(--surface-3)", padding: "1px 6px", borderRadius: 4, color: "var(--text)" }}>{children}</code>;
}

export function Code({ language, children, copy = true }) {
  const [copied, setCopied] = useState(false);
  async function doCopy() {
    try { await navigator.clipboard.writeText(String(children)); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch (_) {}
  }
  return (
    <div style={{ position: "relative", margin: "16px 0 24px" }}>
      <div style={{
        display: "flex", alignItems: "center", height: 36, padding: "0 12px 0 16px",
        background: "var(--code-header-bg)", borderTopLeftRadius: 8, borderTopRightRadius: 8,
        color: "var(--code-header-fg)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em",
      }}>
        {language}
        {copy && (
          <button onClick={doCopy} style={{
            marginLeft: "auto", background: "transparent", border: "none",
            color: copied ? "var(--ok)" : "var(--code-header-fg)",
            fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            {copied ? <Check size={12}/> : <Copy size={12}/>}
            {copied ? "已复制" : "复制"}
          </button>
        )}
      </div>
      <pre style={{
        margin: 0, background: "var(--code-bg)", color: "var(--code-fg)",
        padding: 20, borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
        fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.7, overflow: "auto",
      }}>{children}</pre>
    </div>
  );
}

export function Callout({ tone = "info", children, title }) {
  const palettes = {
    info: ["var(--info-soft)", "var(--info-text)", "var(--info)"],
    ok:   ["var(--ok-soft)", "var(--ok-text)", "var(--ok)"],
    warn: ["var(--warn-soft)", "var(--warn-text)", "var(--warn)"],
    clay: ["var(--clay-soft)", "var(--clay-press)", "var(--clay)"],
  };
  const c = palettes[tone];
  return (
    <div style={{
      display: "flex", gap: 12, padding: "16px 18px",
      background: c[0], borderRadius: 8, margin: "20px 0",
      borderLeft: `2px solid ${c[2]}`,
    }}>
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontWeight: 600, color: c[1], marginBottom: 4, fontSize: 14 }}>{title}</div>}
        <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text)" }}>{children}</div>
      </div>
    </div>
  );
}
