import { Link } from "react-router-dom";
import { LogoMark } from "../../components/primitives.jsx";

function Shell({ title, children }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", color: "var(--text)" }}>
      <header style={{ height: 64, display: "flex", alignItems: "center", padding: "0 32px", gap: 12, borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <LogoMark size={24}/>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 600 }}>同源</span>
        </Link>
      </header>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 32px" }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 32 }}>{title}</h1>
        {children}
      </main>
    </div>
  );
}

const prose = { fontSize: 15, lineHeight: 1.8, color: "var(--text-2)" };
const h2 = { fontSize: 20, fontWeight: 600, margin: "32px 0 12px", color: "var(--text)" };

export function AboutPage() {
  return (
    <Shell title="关于同源">
      <p style={prose}>同源（Tongyuan）是一个稳定、透明的 Claude API 中转服务。我们的目标是让每一位开发者都能以最低的门槛、最高的可靠性使用 Claude 系列模型。</p>
      <h2 style={h2}>我们的承诺</h2>
      <p style={prose}>不掺水。你指定什么模型，到 Anthropic 那端就是什么模型。我们对每一次请求计算双向哈希，任何人都可以在控制台验证。</p>
      <h2 style={h2}>技术架构</h2>
      <p style={prose}>多 Key 池自动切换、全量 SSE 流式透传、Redis 限流与幂等、Prometheus 可观测。部署在国内低延迟节点，p99 延迟通常低于 500ms（不含 Anthropic 本身的推理时间）。</p>
      <h2 style={h2}>联系我们</h2>
      <p style={prose}>如有商务合作或技术问题，请发邮件至 <a href="mailto:hi@tongyuan.ai" style={{ color: "var(--clay-press)" }}>hi@tongyuan.ai</a>。</p>
    </Shell>
  );
}

export function ContactPage() {
  return (
    <Shell title="联系我们">
      <p style={prose}>我们欢迎任何反馈、合作意向或技术问题。</p>
      <h2 style={h2}>邮件</h2>
      <p style={prose}><a href="mailto:hi@tongyuan.ai" style={{ color: "var(--clay-press)" }}>hi@tongyuan.ai</a> — 一般咨询、商务合作</p>
      <p style={prose}><a href="mailto:support@tongyuan.ai" style={{ color: "var(--clay-press)" }}>support@tongyuan.ai</a> — 技术支持、账单问题</p>
      <h2 style={h2}>响应时间</h2>
      <p style={prose}>工作日 24 小时内回复。紧急技术问题请在邮件标题注明「紧急」。</p>
      <h2 style={h2}>状态与公告</h2>
      <p style={prose}>服务状态请查看 <Link to="/status" style={{ color: "var(--clay-press)" }}>状态页</Link>。重要更新会通过控制台横幅通知。</p>
    </Shell>
  );
}

export function TermsPage() {
  return (
    <Shell title="服务条款">
      <p style={{ ...prose, color: "var(--text-3)", fontSize: 13 }}>最后更新：2026 年 4 月 27 日</p>
      <h2 style={h2}>1. 服务说明</h2>
      <p style={prose}>同源提供 Claude API 中转服务。使用本服务即表示你同意遵守本条款及 Anthropic 的使用政策。</p>
      <h2 style={h2}>2. 账户与密钥</h2>
      <p style={prose}>你对账户下的所有 API 密钥及其产生的费用负责。请妥善保管密钥，不得共享或公开。</p>
      <h2 style={h2}>3. 禁止用途</h2>
      <p style={prose}>禁止将本服务用于违反法律法规、生成有害内容、绕过 Anthropic 使用政策的任何用途。</p>
      <h2 style={h2}>4. 计费</h2>
      <p style={prose}>按实际用量计费，以 token 为单位。余额不足时请求将被拒绝。充值后余额不可退款，但账户注销时未使用余额可申请退还。</p>
      <h2 style={h2}>5. 服务可用性</h2>
      <p style={prose}>我们承诺尽力维持高可用，但不对因 Anthropic 上游故障、不可抗力导致的中断承担责任。{/* SLA 条款见 <Link to="/docs/sla" style={{ color: "var(--clay-press)" }}>SLA 文档</Link>。暂时隐藏 */}</p>
      <h2 style={h2}>6. 条款变更</h2>
      <p style={prose}>条款变更将提前 7 天通过控制台公告通知。继续使用服务视为接受新条款。</p>
    </Shell>
  );
}

export function PrivacyPage() {
  return (
    <Shell title="隐私政策">
      <p style={{ ...prose, color: "var(--text-3)", fontSize: 13 }}>最后更新：2026 年 4 月 27 日</p>
      <h2 style={h2}>我们收集什么</h2>
      <p style={prose}>账户信息（邮箱、密码哈希）、API 请求日志（模型、token 数、延迟、审计哈希）、账单记录。我们不存储请求的完整内容（messages 字段）。</p>
      <h2 style={h2}>如何使用</h2>
      <p style={prose}>用于提供服务、计费、安全审计和改善服务质量。不会出售给第三方，不用于训练模型。</p>
      <h2 style={h2}>数据保留</h2>
      <p style={prose}>请求日志保留 30 天，账单记录保留 7 年（法规要求）。账户注销后个人信息在 30 天内删除。</p>
      <h2 style={h2}>Cookie</h2>
      <p style={prose}>仅使用必要的会话 Cookie，不使用追踪或广告 Cookie。</p>
      <h2 style={h2}>联系</h2>
      <p style={prose}>隐私相关问题请联系 <a href="mailto:privacy@tongyuan.ai" style={{ color: "var(--clay-press)" }}>privacy@tongyuan.ai</a>。</p>
    </Shell>
  );
}
