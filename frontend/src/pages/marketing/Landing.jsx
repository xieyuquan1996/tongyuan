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
      <div className="landing-sections">
        <SignalCompare />
        <PromiseGrid />
        {/* <StatusStrip /> */}{/* 暂时隐藏 */}
        <ModelsTable />
        {/* <Pricing /> */}{/* 暂时隐藏 - Starter/Pro 套餐 */}
        <Faq />
      </div>
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
          {/* <a href="#pricing" style={{ color: "var(--text-2)", textDecoration: "none" }}>定价</a> */}{/* 暂时隐藏 */}
          <Link to="/docs" style={{ color: "var(--text-2)", textDecoration: "none" }}>文档</Link>
          {/* <Link to="/status" style={{ color: "var(--text-2)", textDecoration: "none" }}>状态</Link> */}{/* 暂时隐藏 */}
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
        <SectionLabel>
          枫连 · MAPLELINK · SAME SOURCE
          <svg
            role="img"
            aria-label="Claude"
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            style={{ verticalAlign: "middle", opacity: 0.8, marginLeft: "8px" }}
          >
            <path
              d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"
              fill="var(--clay-press)"
            />
          </svg>
        </SectionLabel>
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
            <Button size="lg"><span style={{ whiteSpace: "nowrap" }}>立即使用</span></Button>
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

/**
 * Landing 区块外壳。
 * 背景颜色由父级 `.landing-sections` 的 nth-of-type 规则自动交替(灰/米黄),
 * 子组件不需要也不应再写 background。padding 走 .landing-section CSS。
 */
function Section({ id, children }) {
  return <section id={id} className="landing-section">{children}</section>;
}

function SignalCompare() {
  const mobile = useIsMobile();
  return (
    <Section>
      <div style={{ maxWidth: 1216, margin: "0 auto" }}>
        <SectionLabel>什么是"模型掺水"</SectionLabel>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: mobile ? 28 : 40, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 48px", whiteSpace: mobile ? "normal" : "nowrap" }}>
          你付了 Opus 的钱，得到的可能不是 Opus。
        </h2>
        <div className="landing-compare-grid" style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          <div style={compareCard}>
            <Pill tone="clay" dot style={{ marginBottom: 12 }}>枫连</Pill>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
              透明传输 (Transparent Pass-through)
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12, lineHeight: 1.5 }}>
              完整透传系统提示词，保留 200k 全量上下文
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay-press)", marginBottom: 8 }}>完整透传 · 信号干净</div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 80" style={{ width: "100%", height: 80, display: "block", marginBottom: 16 }} preserveAspectRatio="none" aria-label="clean signal">
              <path d="M 0 40 C 50 40, 100 10, 150 40 S 250 70, 300 40 S 400 10, 450 40 S 550 70, 600 40 S 700 10, 750 40 S 850 70, 900 40 S 1000 10, 1050 40 S 1150 70, 1200 40" fill="none" stroke="var(--text)" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7, color: "var(--text-2)" }}>
              model:        claude-opus-4.7<br/>
              max_tokens:   8192<br/>
              system:       (4,201 chars · 完整保留)<br/>
              context:      200,000 tokens
            </div>
          </div>
          <div style={compareCard}>
            <Pill style={{ marginBottom: 12 }} dot>其他中转</Pill>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-3)", marginBottom: 4 }}>
              黑箱阉割 (Opaque Modification)
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12, lineHeight: 1.5 }}>
              悄悄替换廉价模型，强制截断 System Prompt 导致逻辑崩坏
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>偷换、截断、压缩</div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 80" style={{ width: "100%", height: 80, display: "block", marginBottom: 16 }} preserveAspectRatio="none" aria-label="diluted signal">
              <path d="M 0 40 L 30 38 L 50 52 L 70 28 L 95 48 L 120 32 L 140 60 L 160 22 L 185 50 L 210 30 L 232 58 L 256 24 L 282 54 L 308 28 L 332 62 L 360 30 L 386 50 L 412 24 L 440 58 L 468 32 L 494 56 L 520 26 L 548 60 L 576 28 L 604 52 L 630 22 L 658 56 L 684 32 L 712 60 L 738 24 L 766 54 L 794 28 L 822 58 L 848 30 L 876 52 L 904 22 L 932 60 L 960 32 L 988 54 L 1016 26 L 1044 58 L 1072 30 L 1100 52 L 1128 24 L 1156 56 L 1184 32 L 1200 40" fill="none" stroke="var(--text-3)" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round"/>
            </svg>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7, color: "var(--text-3)" }}>
              model:        <span style={{ color: "var(--err)", textDecoration: "line-through" }}>claude-opus-4.7</span> → claude-sonnet-4.5<br/>
              max_tokens:   <span style={{ color: "var(--err)", textDecoration: "line-through" }}>8192</span> → 4096<br/>
              system:       (<span style={{ color: "var(--err)" }}>1,000 chars · 已截断</span>)<br/>
              context:      <span style={{ color: "var(--err)" }}>32,000 tokens</span>
            </div>
          </div>
        </div>
      </div>
    </Section>
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
    <Section>
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
    </Section>
  );
}

/* 暂时隐藏 - 各区域实时延迟
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
*/

function ModelsTable() {
  const [models, setModels] = useState([]);
  useEffect(() => { api("/api/public/models").then(r => setModels(r.models || [])).catch(() => {}); }, []);
  return (
    <Section id="models">
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
    </Section>
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
    ["如何验证模型响应的真实性？", "我们为每一笔请求生成唯一的 Audit ID。你可以在控制台中通过该 ID 追溯完整的哈希记录，包含上行 model 字段、max_tokens 参数及 system prompt 长度。我们承诺：若发现单次模型指纹（Fingerprint）不一致，补偿当月全额费用。"],
    ["中转链路如何实现比直连更低的延迟？", "我们在全球核心节点部署了 BGP 最佳路径优化与 Anycast 网络。通过枫连专线绕过公网拥塞，直接对接 Anthropic 骨干网边缘。对于国内开发者，我们通过 CN2/GIA 极速链路将首字响应（TTFT）优化至毫秒级，有效规避了公网直连的丢包与抖动。"],
    ["Anthropic 发布新模型后，多久可以接入？", "通常在官方发布后的 4 小时内完成全节点上架。"],
    ["是否兼容现有的 OpenAI / Anthropic 生态？", "枫连完全兼容 OpenAI 格式接口与 Anthropic 原生格式。无论是直接调用 LangChain、LlamaIndex，还是使用 Cursor、NextChat 等客户端，只需修改 BASE_URL 即可无缝切换。"],
    ["是否支持企业财务合规报销？", "支持。我们提供正式企业增值税普通发票，类目可选 \"信息技术服务\" 或 \"软件服务\"。针对团队用户，我们支持按月度导出详细账单流水（Consumption Report），满足企业级审计与支出凭证需求。"],
  ];
  return (
    <Section>
      <div data-testid="faq-content" style={{ maxWidth: 1216, margin: "0 auto" }}>
        <SectionLabel>常见问题</SectionLabel>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 40, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 32px" }}>
          常见FAQ
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
    </Section>
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
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 600, color: "var(--text)" }}>枫连</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 320, color: "var(--text-2)", margin: 0 }}>
              链接稳定，模型保真。一个不掺水的 Claude 中转站。
            </p>
          </div>
          {[
            ["产品", [/* ["定价", "#pricing"], 暂时隐藏 */ ["模型", "#models"], ["状态页", "/status"], ["更新日志", "/changelog"]]],
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
          <div>© 2026 枫连 · 沪ICP备2026000000号</div>
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
