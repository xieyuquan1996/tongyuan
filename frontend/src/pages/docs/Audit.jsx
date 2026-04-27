import { Breadcrumb, H1, H2, Lead, P, IC, Code, Callout } from "./Layout.jsx";

export default function AuditArticle() {
  return (
    <article>
      <Breadcrumb section="保真承诺" page="请求审计" />
      <H1 id="top">请求审计：怎么知道你拿到的就是你点的</H1>
      <Lead>
        对每一次 <IC>messages.create</IC>，我们记录上行（你 → 同源）和下行（同源 → Anthropic）
        两份请求体的 SHA-256 哈希。两份哈希在控制台公开可查。
      </Lead>

      <H2 id="how">工作原理</H2>
      <P>
        请求到达后，我们对 <IC>model</IC>、<IC>max_tokens</IC>、<IC>system</IC>、<IC>messages</IC>
        四个字段分别哈希。然后用同样的字段构造发给 Anthropic 的请求体，再哈希一次。两组哈希一一对应。
      </P>
      <Code language="JSON">{`{
  "audit_id": "aud_8f3a91c2_c4e8",
  "upstream":   { "model": "sha256:a3f1...", "max_tokens": 4096, "system_len": 4201 },
  "downstream": { "model": "sha256:a3f1...", "max_tokens": 4096, "system_len": 4201 },
  "match": true
}`}</Code>
      <Callout tone="ok" title="数据透明">
        每一份审计日志保留 30 天，Pro 用户可导出 CSV。
      </Callout>
    </article>
  );
}
