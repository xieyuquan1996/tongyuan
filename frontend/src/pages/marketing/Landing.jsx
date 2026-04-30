import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, ShieldCheck, Zap, Activity, Check, Plus, Minus } from "lucide-react";
import { Button, Pill, LogoLockup, SectionLabel, LogoMark } from "../../components/primitives.jsx";
import { api, session } from "../../lib/api.js";
import { useIsMobile } from "../../lib/hooks.js";

export default function Landing() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div>
      <Nav />
      <Hero />
      <SignalCompare />
      <PromiseGrid />
      <ModelsTable />
      <Pricing />
      <Faq />
      <Footer />
    </div>
  );
}

function Nav() {
  const authed = session.isAuthed();
  const mobile = useIsMobile();
  return (
    <header
      className="landing-nav"
      style={{
        position: "sticky", top: 0, zIndex: 10, height: 64,
        display: "flex", alignItems: "center",
        padding: mobile ? "0 16px" : "0 32px", gap: mobile ? 12 : 32,
        background: "var(--surface-glass)", backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
        <LogoLockup />
      </Link>
      {!mobile && (
        <nav style={{ display: "flex", gap: 28, fontSize: 14 }}>
          <a href="#models" style={{ color: "var(--text-2)", textDecoration: "none" }}>模型</a>
          <a href="#pricing" style={{ color: "var(--text-2)", textDecoration: "none" }}>定价</a>
          <Link to="/docs" style={{ color: "var(--text-2)", textDecoration: "none" }}>文档</Link>
          <a href="#status" style={{ color: "var(--text-2)", textDecoration: "none" }}>状态</a>
        </nav>
      )}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: mobile ? 8 : 14 }}>
        {!mobile && <Pill tone="ok" dot>所有系统正常</Pill>}
        <Link to={authed ? "/dashboard" : "/login"} style={{ fontSize: 14, color: "var(--text)", textDecoration: "none" }}>
          {authed ? "控制台 →" : "登录"}
        </Link>
        <Link to={authed ? "/dashboard" : "/login"} style={{ textDecoration: "none" }}>
          <Button size="sm">{authed ? "进入控制台" : "开始使用"}</Button>
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  const [stats, setStats] = useState(null);
  const mobile = useIsMobile();
  useEffect(() => { api("/api/public/stats").then(setStats).catch(() => {}); }, []);
  return (
    <section className="landing-hero" style={{ position: "relative", padding: mobile ? "56px 16px 48px" : "96px 32px 80px", overflow: "hidden" }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "url(/assets/grid-tile.svg)",
        backgroundSize: "40px 40px",
        opacity: 0.6, pointerEvents: "none",
      }}/>
      <div style={{ maxWidth: 1216, margin: "0 auto", position: "relative" }}>
        <SectionLabel>同源 · TONGYUAN · SAME SOURCE</SectionLabel>
        <h1 style={{
          fontFamily: "var(--font-serif)", fontSize: mobile ? 40 : 76, lineHeight: 1.05,
          fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 24px",
          maxWidth: 1080,
        }}>
          链接稳定，<br/>模型保真，<span style={{ color: "var(--clay)", whiteSpace: "nowrap" }}>绝不掺水。</span>
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.55, color: "var(--text-2)", maxWidth: 640, margin: "0 0 36px" }}>
          一个不偷换模型、不截断 system prompt、不压缩 max_tokens 的 Claude 中转。
          你选 <code style={codeInline}>claude-sonnet-4.5</code>，到模型那一端就是 <code style={codeInline}>claude-sonnet-4.5</code>。
        </p>
        <div style={{ display: "flex", gap: 12, marginBottom: 56, flexWrap: "wrap" }}>
          <Link to="/login" style={{ textDecoration: "none" }}>
            <Button size="lg"><span style={{ whiteSpace: "nowrap" }}>免费试用 · 1M tokens</span></Button>
          </Link>
          <Link to="/docs" style={{ textDecoration: "none" }}>
            <Button size="lg" variant="secondary"><span style={{ whiteSpace: "nowrap" }}>查看文档 →</span></Button>
          </Link>
        </div>
        <div className="landing-hero-stats" style={{
          display: "grid", gridTemplateColumns: mobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
          borderTop: "1px solid var(--border)",
          paddingTop: 28, maxWidth: 880,
        }}>
          {[
            ["UPTIME · 30D", stats?.uptime_30d, "实时监控"],
            ["P50 LATENCY", stats?.p50_latency, stats?.region],
            ["P99 LATENCY", stats?.p99_latency, stats?.region],
            ["请求一致率", stats?.consistency, "model 字段全量审计"],
          ].map(([k, v, sub]) => (
            <div key={k}>
              <div style={statLabel}>{k}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{v || "—"}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{sub || "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SignalCompare() {
  const mobile = useIsMobile();
  return (
    <section style={{ padding: mobile ? "56px 16px" : "80px 32px", background: "var(--surface-3)" }}>
      <div style={{ maxWidth: 1216, margin: "0 auto" }}>
        <SectionLabel>什么是"模型掺水"</SectionLabel>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: mobile ? 28 : 40, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 12px", maxWidth: 760 }}>
          你付了 Opus 的钱，得到的可能不是 Opus。
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--text-2)", maxWidth: 720, margin: "0 0 48px" }}>
          很多中转站会在请求到达 Anthropic 之前，悄悄把 <code style={codeInline}>model</code> 字段换成更便宜的那个、把 <code style={codeInline}>max_tokens</code> 砍一半、或者直接截断你的 system prompt。我们不会。
        </p>
        <div className="landing-compare-grid" style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          <div style={compareCard}>
            <Pill tone="clay" dot style={{ marginBottom: 16 }}>同源</Pill>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay-press)", marginBottom: 8 }}>完整透传 · 信号干净</div>
            <img src="/assets/signal-line.svg" style={{ width: "100%", height: 80, display: "block", marginBottom: 16 }} alt="clean signal"/>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7, color: "var(--text-2)" }}>
              model:        claude-opus-4.7<br/>
              max_tokens:   8192<br/>
              system:       (4,201 chars · 完整保留)<br/>
              context:      200,000 tokens
            </div>
          </div>
          <div style={compareCard}>
            <Pill style={{ marginBottom: 16 }} dot>其他中转</Pill>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>偷换、截断、压缩</div>
            <img src="/assets/signal-line-diluted.svg" style={{ width: "100%", height: 80, display: "block", marginBottom: 16 }} alt="diluted signal"/>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7, color: "var(--text-3)" }}>
              model:        <span style={{ color: "var(--err)", textDecoration: "line-through" }}>claude-opus-4.7</span> → claude-sonnet-4.5<br/>
              max_tokens:   <span style={{ color: "var(--err)", textDecoration: "line-through" }}>8192</span> → 4096<br/>
              system:       (<span style={{ color: "var(--err)" }}>1,000 chars · 已截断</span>)<br/>
              context:      <span style={{ color: "var(--err)" }}>32,000 tokens</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PromiseGrid() {
  const mobile = useIsMobile();
  const items = [
    ["不偷换模型", "你写的 model 字段是什么，发给 Anthropic 的就是什么。每次请求我们都做哈希审计，全量公开。", KeyRound],
    ["不截断 system prompt", "200k 上下文一字不少。包括你的所有 cache_control 块。", ShieldCheck],
    ["不压缩 max_tokens", "你设多少就是多少。我们不会偷偷除以二。", Zap],
    ["不重路由到便宜区域", "你看到的 region 是真实 region。北美就是北美，香港就是香港。", Activity],
  ];
  return (
    <section style={{ padding: mobile ? "56px 16px" : "96px 32px" }}>
      <div style={{ maxWidth: 1216, margin: "0 auto" }}>
        <SectionLabel>四条底线</SectionLabel>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: mobile ? 28 : 40, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 56px" }}>
          我们承诺<span style={{ color: "var(--clay)" }}>不做</span>什么。
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2, 1fr)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
          {items.map(([title, body, Icon], i) => (
            <div key={title} style={{
              padding: mobile ? "24px 0" : "32px 32px 32px 0",
              borderBottom: mobile ? "1px solid var(--border)" : (i < items.length - 2 ? "1px solid var(--border)" : "none"),
              borderRight: !mobile && i % 2 === 0 ? "1px solid var(--border)" : "none",
              paddingLeft: !mobile && i % 2 === 1 ? 32 : 0,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <Icon size={24} color="var(--clay)" style={{ flexShrink: 0, marginTop: 4 }}/>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.01em" }}>{title}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-2)", margin: 0 }}>{body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatusStrip() {
  const [regions, setRegions] = useState([]);
  useEffect(() => { api("/api/public/regions").then(r => setRegions(r.regions || [])).catch(() => {}); }, []);
  return (
    <section id="status" style={{ padding: "64px 32px", background: "var(--surface-emphasis)", color: "var(--text-on-emphasis)" }}>
      <div style={{ maxWidth: 1216, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 24, gap: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay)" }}>● LIVE</div>
          <h3 style={{ fontSize: 18, fontWeight: 500, margin: 0, color: "var(--text-on-emphasis)", whiteSpace: "nowrap" }}>各区域实时延迟 · 每 10 秒刷新</h3>
          <a href="/status" style={{ marginLeft: "auto", color: "var(--text-on-emphasis-3)", fontSize: 13, textDecoration: "none" }}>查看完整状态页 →</a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, regions.length)}, 1fr)`, borderTop: "1px solid var(--track)" }}>
          {regions.map(r => (
            <div key={r.id} style={{ padding: "20px 20px 20px 0", borderBottom: "1px solid var(--track)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.status === "ok" ? "var(--ok)" : r.status === "warn" ? "var(--warn)" : "var(--err)" }}/>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-on-emphasis-3)" }}>{r.id}</span>
              </div>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{r.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{r.latency}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ModelsTable() {
  const [models, setModels] = useState([]);
  useEffect(() => { api("/api/public/models").then(r => setModels(r.models || [])).catch(() => {}); }, []);
  return (
    <section id="models" style={{ padding: "96px 32px" }}>
      <div style={{ maxWidth: 1216, margin: "0 auto" }}>
        <SectionLabel>支持的模型</SectionLabel>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 40, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 8px" }}>
          全系 Claude 模型 · 与官方同步上架
        </h2>
        <p style={{ fontSize: 15, color: "var(--text-3)", margin: "0 0 32px" }}>按量计费 · 无最低消费</p>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "var(--surface-3)" }}>
                <th style={th}>模型</th>
                <th style={th}>上下文</th>
                <th style={th}>输入 / 输出 价格</th>
                <th style={th}>说明</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {models.map(m => (
                <tr key={m.id} style={{ borderTop: "1px solid var(--divider)" }}>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 500 }}>{m.id}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>{m.context}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{m.price}</td>
                  <td style={{ ...td, color: "var(--text-2)" }}>{m.note}</td>
                  <td style={{ ...td, textAlign: "right" }}>{m.recommended && <Pill tone="clay" dot>当前推荐</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const [plans, setPlans] = useState([]);
  useEffect(() => { api("/api/public/plans").then(r => setPlans(r.plans || [])).catch(() => {}); }, []);
  return (
    <section id="pricing" style={{ padding: "96px 32px", background: "var(--surface-3)" }}>
      <div style={{ maxWidth: 1216, margin: "0 auto" }}>
        <SectionLabel>定价</SectionLabel>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 40, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 48px" }}>
          按量计费 · 无最低消费
        </h2>
        <div className="landing-pricing-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, plans.length)}, 1fr)`, gap: 16 }}>
          {plans.map(t => (
            <div key={t.name} style={{
              background: "var(--surface-2)", borderRadius: 12, padding: 32,
              border: t.featured ? "none" : "1px solid var(--border)",
              boxShadow: t.featured ? "var(--shadow-pop)" : "none",
              position: "relative",
            }}>
              {t.featured && <Pill tone="clay" dot style={{ position: "absolute", top: -10, left: 32 }}>推荐</Pill>}
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{t.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em" }}>{t.price}</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", marginBottom: 24 }}>{t.per}</div>
              <Link to="/login" style={{ textDecoration: "none", display: "block" }}>
                <Button variant={t.featured ? "primary" : "secondary"} style={{ width: "100%", whiteSpace: "nowrap" }}>{t.cta}</Button>
              </Link>
              <div style={{ height: 1, background: "var(--divider)", margin: "24px 0" }}/>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {t.features.map(f => (
                  <li key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "var(--text-2)" }}>
                    <Check size={16} color="var(--ok)" style={{ flexShrink: 0, marginTop: 4 }}/>{f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  const items = [
    ["你们怎么证明没有偷换模型？", "每一次请求我们都会把上行的 model / max_tokens / system 长度做哈希记录，控制台里可以按请求 ID 查询到完整审计。如果发现一次不一致，我们退一个月费用。"],
    ["延迟为什么比直连快？", "我们在中国大陆有四个机房（上海、北京、深圳）和香港中转，使用 Anthropic 的官方 API endpoint，没有 IP 池漂移。p99 延迟稳定在 500ms 内。"],
    ["新模型多久会上架？", "Anthropic 发布后通常 4 小时内可用。我们不会自作主张做 alias，所有模型用官方完整 ID。"],
    ["支持哪些 SDK？", "完全兼容官方 anthropic-sdk-python / anthropic-sdk-typescript。把 base URL 换成 api.tongyuan.ai 就可以，其他什么都不用改。"],
    ["可以发票吗？", "Pro / Enterprise 用户可开 6% 增值税专票。控制台 → 账单 → 发票申请。"],
  ];
  return (
    <section style={{ padding: "96px 32px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <SectionLabel>常见问题</SectionLabel>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 40, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 32px" }}>
          预先回答几个怀疑。
        </h2>
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {items.map(([q, a], i) => (
            <div key={i} style={{ borderBottom: "1px solid var(--border)" }}>
              <button onClick={() => setOpen(open === i ? -1 : i)} style={faqBtn}>
                <span style={{ flex: 1 }}>{q}</span>
                {open === i ? <Minus size={18} color="var(--text-3)"/> : <Plus size={18} color="var(--text-3)"/>}
              </button>
              {open === i && (
                <div style={{ paddingBottom: 24, fontSize: 15, lineHeight: 1.6, color: "var(--text-2)", maxWidth: 720 }}>{a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const mobile = useIsMobile();
  return (
    <footer style={{ background: "var(--surface-2)", color: "var(--text-3)", padding: mobile ? "48px 16px 32px" : "64px 32px 48px", borderTop: "1px solid var(--border)" }}>
      <div style={{ maxWidth: 1216, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "2fr 1fr 1fr 1fr", gap: mobile ? 32 : 48 }}>
          <div style={{ gridColumn: mobile ? "1 / -1" : "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <LogoMark size={28} />
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 600, color: "var(--text)" }}>同源</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 320, color: "var(--text-2)", margin: 0 }}>
              链接稳定，模型保真。一个不掺水的 Claude 中转站。
            </p>
          </div>
          {[
            ["产品", [["定价", "#pricing"], ["模型", "#models"], ["状态页", "/status"], ["更新日志", "/changelog"]]],
            ["开发者", [["快速开始", "/docs"], ["API 参考", "/docs/messages"], ["流式", "/docs/streaming"], ["工具调用", "/docs/tools"]]],
            ["公司", [["关于", "/about"], ["联系", "/contact"], ["条款", "/terms"], ["隐私", "/privacy"]]],
          ].map(([title, links]) => (
            <div key={title}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 14 }}>{title}</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {links.map(([l, href]) => (
                  <li key={l}>
                    {href.startsWith("/") ? (
                      <Link to={href} style={{ color: "var(--text-2)", textDecoration: "none", fontSize: 14 }}>{l}</Link>
                    ) : (
                      <a href={href} style={{ color: "var(--text-2)", textDecoration: "none", fontSize: 14 }}>{l}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--divider)", marginTop: 48, paddingTop: 24, display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
          <div>© 2026 同源 · 沪ICP备2026000000号</div>
          <div>build · ty-2026.04.26 · cn-east-1</div>
        </div>
      </div>
    </footer>
  );
}

const codeInline = { fontFamily: "var(--font-mono)", fontSize: 16, background: "var(--surface-3)", padding: "2px 6px", borderRadius: 4 };
const statLabel = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 };
const compareCard = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 28 };
const th = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", padding: "14px 20px", fontWeight: 400 };
const td = { padding: "16px 20px", color: "var(--text)" };
const faqBtn = {
  width: "100%", textAlign: "left", background: "transparent", border: "none",
  padding: "20px 0", display: "flex", alignItems: "center", gap: 16,
  fontSize: 16, fontWeight: 500, color: "var(--text)", cursor: "pointer",
};
