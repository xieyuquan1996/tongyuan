import { Breadcrumb, H1, H2, Lead, P, IC, Code } from "./Layout.jsx";

export default function ToolsArticle() {
  return (
    <article>
      <Breadcrumb section="API 参考" page="工具调用"/>
      <H1 id="top">工具调用 (Tool Use)</H1>
      <Lead>
        Anthropic 原生 <IC>tools</IC> 字段完整透传 — 包括 <IC>cache_control</IC> 标记和 <IC>tool_choice</IC>。
      </Lead>

      <H2 id="declare">声明工具</H2>
      <Code language="JSON">{`{
  "model": "claude-sonnet-4.5",
  "max_tokens": 1024,
  "tools": [{
    "name": "get_weather",
    "description": "获取指定城市的当前天气",
    "input_schema": {
      "type": "object",
      "properties": {
        "city": { "type": "string" }
      },
      "required": ["city"]
    }
  }],
  "messages": [{"role":"user","content":"上海今天天气怎么样？"}]
}`}</Code>

      <H2 id="response">响应结构</H2>
      <P>模型要求调用工具时，响应 <IC>content</IC> 数组里会有一个 <IC>tool_use</IC> 块，<IC>stop_reason</IC> 为 <IC>tool_use</IC>。把工具执行结果按 <IC>tool_result</IC> 块发回去，对话继续。</P>

      <H2 id="force">强制调用</H2>
      <P>用 <IC>tool_choice: {`{ "type": "tool", "name": "get_weather" }`}</IC> 强制模型调用指定工具；用 <IC>{`{ "type": "any" }`}</IC> 强制调用任一工具。</P>
    </article>
  );
}
