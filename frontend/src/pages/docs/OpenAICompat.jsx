import { Link } from "react-router-dom";
import { Code } from "./Layout.jsx";
import { useState, useEffect } from "react";

function useOrigin() {
  const [origin, setOrigin] = useState("https://your-domain.com");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);
  return origin;
}

const h2 = { fontSize: 22, fontWeight: 600, margin: "40px 0 12px", letterSpacing: "-0.01em" };
const prose = { fontSize: 15, lineHeight: 1.75, color: "var(--text-2)", margin: "0 0 16px", maxWidth: 680 };
const ic = { fontFamily: "var(--font-mono)", fontSize: 13, background: "var(--code-bg)", color: "var(--code-fg)", padding: "1px 5px", borderRadius: 4 };

export default function OpenAICompatArticle() {
  const origin = useOrigin();
  return (
    <article>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay-press)", marginBottom: 8 }}>API 参考</div>
      <h1 id="top" style={{ fontFamily: "var(--font-serif)", fontSize: 36, fontWeight: 700, margin: "8px 0 16px", letterSpacing: "-0.02em" }}>
        OpenAI 兼容接口
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--text-2)", margin: "0 0 40px", maxWidth: 680 }}>
        同源提供 <code style={ic}>POST /v1/chat/completions</code> 接口，格式与 OpenAI API 完全兼容。任何使用 OpenAI SDK 的工具，只需改 <code style={ic}>base_url</code>，无需改代码。
      </p>

      <h2 id="endpoint" style={h2}>接口地址</h2>
      <Code language="TEXT">{`POST ${origin}/v1/chat/completions`}</Code>
      <p style={prose}>认证方式与 OpenAI 相同，使用 <code style={ic}>Authorization: Bearer sk-relay-*</code> 头。</p>

      <h2 id="python" style={h2}>Python SDK</h2>
      <Code language="PYTHON">{`from openai import OpenAI

client = OpenAI(
    api_key="sk-relay-xxxxxxxx",   # 从控制台 → API 密钥 获取
    base_url="${origin}/v1",
)

resp = client.chat.completions.create(
    model="claude-sonnet-4-6",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)`}</Code>

      <h2 id="nodejs" style={h2}>Node.js / TypeScript</h2>
      <Code language="TYPESCRIPT">{`import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-relay-xxxxxxxx",
  baseURL: "${origin}/v1",
});

const resp = await client.chat.completions.create({
  model: "claude-sonnet-4-6",
  messages: [{ role: "user", content: "你好" }],
});
console.log(resp.choices[0].message.content);`}</Code>

      <h2 id="stream" style={h2}>流式响应</h2>
      <Code language="PYTHON">{`stream = client.chat.completions.create(
    model="claude-sonnet-4-6",
    messages=[{"role": "user", "content": "写一首诗"}],
    stream=True,
)
for chunk in stream:
    delta = chunk.choices[0].delta.content or ""
    print(delta, end="", flush=True)`}</Code>

      <h2 id="curl" style={h2}>cURL</h2>
      <Code language="BASH">{`curl ${origin}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-relay-xxxxxxxx" \\
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [{"role": "user", "content": "你好"}]
  }'`}</Code>

      <h2 id="notes" style={h2}>注意事项</h2>
      <p style={prose}>
        模型 ID 使用同源的格式（如 <code style={ic}>claude-sonnet-4-6</code>），不是 OpenAI 的 <code style={ic}>gpt-4o</code>。可用模型列表见 <Link to="/docs/models" style={{ color: "var(--clay-press)" }}>模型映射</Link>。
      </p>
      <p style={prose}>
        <code style={ic}>system</code> 消息会自动合并为 Anthropic 的 <code style={ic}>system</code> 字段。<code style={ic}>tool_calls</code> 和 <code style={ic}>tool_choice</code> 完整支持。
      </p>
      <p style={prose}>
        不支持的 OpenAI 参数（如 <code style={ic}>logprobs</code>、<code style={ic}>n</code>、<code style={ic}>presence_penalty</code>）会被忽略，不会报错。
      </p>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", gap: 24, fontSize: 14 }}>
        <Link to="/docs/messages" style={{ color: "var(--clay-press)", textDecoration: "none" }}>← messages.create</Link>
        <Link to="/docs/streaming" style={{ color: "var(--clay-press)", textDecoration: "none", marginLeft: "auto" }}>流式响应 →</Link>
      </div>
    </article>
  );
}
