import { Breadcrumb, H1, H2, Lead, P, IC, Code, Callout } from "./Layout.jsx";

export default function StreamingArticle() {
  return (
    <article>
      <Breadcrumb section="API 参考" page="流式响应"/>
      <H1 id="top">流式响应 (SSE)</H1>
      <Lead>
        在请求体里加 <IC>"stream": true</IC>。响应格式和 Anthropic 官方 SSE 完全一致 — 我们用 <IC>FlushInterval: -1</IC> 透传，不缓冲，不合并事件。
      </Lead>

      <H2 id="example">最小示例</H2>
      <Code language="PYTHON">{`from anthropic import Anthropic
client = Anthropic(api_key=KEY, base_url="https://api.tongyuan.ai")

with client.messages.stream(
    model="claude-sonnet-4.5",
    max_tokens=1024,
    messages=[{"role":"user","content":"写一首短诗"}],
) as s:
    for text in s.text_stream:
        print(text, end="", flush=True)`}</Code>

      <H2 id="events">事件类型</H2>
      <P>SSE 每一帧的 <IC>event:</IC> 字段和 Anthropic 一致：<IC>message_start</IC>, <IC>content_block_start</IC>, <IC>content_block_delta</IC>, <IC>content_block_stop</IC>, <IC>message_delta</IC>, <IC>message_stop</IC>, <IC>ping</IC>, <IC>error</IC>。</P>

      <H2 id="billing">计费</H2>
      <P>我们在流式响应结束（<IC>message_stop</IC>）后才扣费，依据是 <IC>message_delta.usage.output_tokens</IC>。中途断流不计输出 tokens，只计输入。</P>
      <Callout tone="clay" title="不会估算 tokens">
        我们只读上游真实的 <IC>usage</IC> 字段。任何声称"按字符数估算 tokens 省钱"的代理，要么在骗你省，要么在骗你多付。
      </Callout>
    </article>
  );
}
