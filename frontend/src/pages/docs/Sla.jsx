import { Breadcrumb, H1, H2, Lead, P, IC, Callout } from "./Layout.jsx";

export default function SlaArticle() {
  return (
    <article>
      <Breadcrumb section="保真承诺" page="SLA"/>
      <H1 id="top">SLA</H1>
      <Lead>
        Pro 套餐：月度可用率 ≥ 99.9%，p99 延迟 ≤ 500ms（cn-east-1 / hk-1）。
        Enterprise 套餐：月度可用率 ≥ 99.99%，自定义 p99。
      </Lead>

      <H2 id="definition">可用率定义</H2>
      <P>
        "可用"指 <IC>/v1/messages</IC> 在 10 秒内返回 2xx 或 4xx（客户端错误）。
        5xx、网关超时、DNS 故障都记为不可用。每分钟采样一次，月度取算术平均。
      </P>

      <H2 id="credit">服务信用</H2>
      <P>月度可用率低于承诺时，我们按下表退还当月订阅费：</P>
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 20px", margin: "16px 0", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 2 }}>
        &lt; 99.9% · ≥ 99.5% → 10% 退还<br/>
        &lt; 99.5% · ≥ 99.0% → 25% 退还<br/>
        &lt; 99.0% → 50% 退还
      </div>

      <H2 id="consistency">一致性 SLA</H2>
      <P>这一条是同源的立身之本：</P>
      <Callout tone="clay" title="字节级一致率 100%">
        任何一次请求的 <IC>model</IC>、<IC>max_tokens</IC>、<IC>system</IC>、<IC>messages</IC> 被我们修改，我们退 <strong>一个月的费用</strong>，不争辩。
      </Callout>
      <P>审计证据在 <a href="/docs/audit" style={{ color: "var(--clay-press)" }}>请求审计</a> 里详细说明。</P>
    </article>
  );
}
