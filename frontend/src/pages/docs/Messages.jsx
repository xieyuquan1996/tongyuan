import { Breadcrumb, H1, H2, Lead, P, IC, Code } from "./Layout.jsx";

export default function MessagesArticle() {
  return (
    <article>
      <Breadcrumb section="API 参考" page="messages.create" />
      <H1 id="top">messages.create</H1>
      <Lead>
        调用 Claude 模型生成消息。请求和响应格式与 Anthropic 官方 100% 一致 — 我们只是中间的搬运工。
      </Lead>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 11,
          padding: "3px 10px", borderRadius: 999,
          background: "var(--ok-soft)", color: "var(--ok-text)",
        }}>POST</span>
        <code style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>
          https://api.tongyuan.ai/v1/messages
        </code>
      </div>

      <H2 id="params">必填参数</H2>
      <P><IC>model</IC> · 字符串 · 模型 ID，例如 <IC>claude-sonnet-4.5</IC>。我们透传给 Anthropic，绝不替换。</P>
      <P><IC>max_tokens</IC> · 整数 · 最大输出 tokens。我们不会偷偷压缩。</P>
      <P><IC>messages</IC> · 数组 · 对话消息序列。完整透传，包括所有 <IC>cache_control</IC> 标记。</P>

      <H2 id="example">完整请求示例</H2>
      <Code language="HTTP">{`POST /v1/messages HTTP/1.1
host: api.tongyuan.ai
content-type: application/json
x-api-key: sk-relay-9F3A••••

{
  "model": "claude-opus-4.7",
  "max_tokens": 8192,
  "system": "You are a helpful assistant.",
  "messages": [
    { "role": "user", "content": "你好。" }
  ]
}`}</Code>
    </article>
  );
}
