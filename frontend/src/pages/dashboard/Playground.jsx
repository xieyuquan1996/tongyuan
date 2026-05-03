import { useState, useEffect, useRef } from "react";
import { Send, Copy, Check, Loader2, Plus, X, Square } from "lucide-react";
import { api, session, ApiError } from "../../lib/api.js";
import { PageHeader } from "../../components/dashboard-widgets.jsx";
import { Pill } from "../../components/primitives.jsx";

const DEFAULT_SYSTEM = "你是一个乐于助人的助手。回答要简洁。";

// Parse a single SSE frame (`event:` + `data:` lines separated from the next
// frame by a blank line) and return { event, data }. Tolerant of frames
// that are just `data: ...` with no explicit `event:` (Anthropic's stream
// always sends both, but it's cheap to be lenient).
function parseSseFrame(raw) {
  let event = "message";
  let data = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  return { event, data };
}

// Send a streaming /v1/messages request and stream its SSE frames into
// `onEvent`. Returns the final assembled state once the upstream finishes.
// Throws on HTTP errors before the stream starts (so the UI can show a
// proper error pill instead of a half-rendered response).
async function streamPlayground(body, { onEvent, signal }) {
  const r = await fetch("/api/console/playground", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!r.ok) {
    // Error responses come back as JSON, not SSE. Match the api() shape so
    // the catch site below can render `e.message` consistently.
    let data = null;
    try { data = await r.json(); } catch {}
    throw new ApiError(r.status, data);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // Frames are blank-line-separated. Hold back the trailing partial.
    const frames = buf.split(/\n\n/);
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      if (!frame.trim()) continue;
      const { event, data } = parseSseFrame(frame);
      if (!data) continue;
      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }
      onEvent(event, parsed);
    }
  }
}

export default function Playground() {
  const [model, setModel] = useState("");
  const [maxTokens, setMaxTokens] = useState(1024);
  const [temperature, setTemperature] = useState(1.0);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM);
  const [streamMode, setStreamMode] = useState(false);
  const [messages, setMessages] = useState([
    { role: "user", content: "用一句话证明你是 Sonnet 4.5。" },
  ]);
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState(null);
  const [err, setErr] = useState(null);
  const [models, setModels] = useState([]);
  const [tab, setTab] = useState("response");
  const [streamBuf, setStreamBuf] = useState(""); // live-updating text as SSE arrives
  const [streamRaw, setStreamRaw] = useState(""); // raw SSE frames for debugging
  const abortRef = useRef(null);

  useEffect(() => {
    api("/api/public/models").then((r) => {
      const list = r.models || [];
      setModels(list);
      if (list.length > 0) setModel(list[0].id);
    }).catch(() => {});
  }, []);

  function addMessage() {
    setMessages((ms) => [...ms, { role: ms.at(-1)?.role === "user" ? "assistant" : "user", content: "" }]);
  }
  function removeMessage(i) {
    setMessages((ms) => ms.filter((_, j) => j !== i));
  }
  function updateMessage(i, patch) {
    setMessages((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function run() {
    setBusy(true); setErr(null); setResp(null); setStreamBuf(""); setStreamRaw("");
    const body = {
      model, max_tokens: maxTokens, temperature,
      system: systemPrompt,
      messages: messages.filter((m) => m.content.trim()),
    };
    try {
      if (streamMode) {
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        const t0 = performance.now();
        // Accumulate text deltas; capture usage / final model id from the
        // terminal events so the response pane can show the same pills as
        // the non-stream path.
        let assembled = { content: [{ type: "text", text: "" }], usage: { input_tokens: 0, output_tokens: 0 } };
        let modelId = "";
        await streamPlayground(body, {
          signal: ctrl.signal,
          onEvent(event, ev) {
            setStreamRaw((r) => r + `event: ${event}\ndata: ${JSON.stringify(ev)}\n\n`);
            if (event === "message_start" && ev.message) {
              modelId = ev.message.model;
              assembled = {
                ...assembled,
                id: ev.message.id,
                model: modelId,
                role: ev.message.role,
                usage: ev.message.usage ?? assembled.usage,
              };
            } else if (event === "content_block_delta" && ev.delta?.type === "text_delta") {
              assembled.content[0].text += ev.delta.text;
              setStreamBuf(assembled.content[0].text);
            } else if (event === "message_delta") {
              if (ev.usage) assembled.usage = { ...assembled.usage, ...ev.usage };
              if (ev.delta?.stop_reason) assembled.stop_reason = ev.delta.stop_reason;
            }
          },
        });
        assembled.latencyMs = Math.round(performance.now() - t0);
        setResp(assembled);
      } else {
        const r = await api("/api/console/playground", { method: "POST", body });
        setResp(r);
      }
    } catch (e) {
      // AbortError from the user's stop button isn't really an error.
      if (e?.name === "AbortError") setErr({ message: "已停止。" });
      else setErr(e);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  const reqPreview = JSON.stringify({
    model, max_tokens: maxTokens, temperature,
    stream: streamMode || undefined,
    system: systemPrompt, messages,
  }, null, 2);

  return (
    <div>
      <PageHeader title="Playground" sub="在浏览器里直接发一次 messages.create。每次调用都会写入请求日志。"/>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* LEFT: input */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title="参数">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="模型">
                <select value={model} onChange={(e) => setModel(e.target.value)} style={ctrl}>
                  {models.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
              </Field>
              <Field label="最大 tokens">
                <input type="number" min={1} max={200000} value={maxTokens}
                  onChange={(e) => setMaxTokens(+e.target.value || 1024)} style={ctrl}/>
              </Field>
              <Field label="温度">
                <input type="number" step="0.1" min={0} max={2} value={temperature}
                  onChange={(e) => setTemperature(+e.target.value)} style={ctrl}/>
              </Field>
              <Field label="流式">
                <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", fontSize: 13, color: "var(--text-2)", cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={streamMode}
                    onChange={(e) => setStreamMode(e.target.checked)}
                    style={{ width: 14, height: 14, cursor: "pointer" }}/>
                  逐 token 输出
                </label>
              </Field>
            </div>
          </Panel>

          <Panel title="系统提示">
            <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
              style={{ ...ctrl, minHeight: 80, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 13 }}/>
          </Panel>

          <Panel title="对话消息" right={<button onClick={addMessage} style={ghostBtn}><Plus size={12}/> 新增</button>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <select value={m.role} onChange={(e) => updateMessage(i, { role: e.target.value })}
                    style={{ ...ctrl, width: 110 }}>
                    <option value="user">用户</option>
                    <option value="assistant">助手</option>
                  </select>
                  <textarea value={m.content} onChange={(e) => updateMessage(i, { content: e.target.value })}
                    style={{ ...ctrl, flex: 1, minHeight: 64, fontFamily: "var(--font-mono)", fontSize: 13 }}/>
                  <button onClick={() => removeMessage(i)} style={{ ...iconBtn }}><X size={14}/></button>
                </div>
              ))}
            </div>
          </Panel>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={run} disabled={busy} style={{
              flex: 1,
              padding: "12px 20px",
              background: busy ? "var(--btn-disabled-bg)" : "var(--clay)",
              color: busy ? "var(--btn-disabled-fg)" : "var(--on-clay)", border: "none", borderRadius: 8,
              fontSize: 14, fontWeight: 500,
              cursor: busy ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              {busy ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }}/> : <Send size={14}/>}
              {busy ? "请求中…" : "发送请求"}
            </button>
            {busy && streamMode && (
              <button onClick={stop} style={{
                padding: "12px 16px",
                background: "transparent", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 8,
                fontSize: 14, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                <Square size={14}/> 停止
              </button>
            )}
          </div>
        </div>

        {/* RIGHT: output */}
        <div>
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 12 }}>
            <Tab active={tab === "response"} onClick={() => setTab("response")}>响应</Tab>
            <Tab active={tab === "request"} onClick={() => setTab("request")}>请求</Tab>
            <Tab active={tab === "curl"} onClick={() => setTab("curl")}>cURL</Tab>
          </div>
          {tab === "response" && (
            <div>
              {err && (
                <div style={{ background: "var(--err-soft)", color: "var(--err-text)", padding: 14, borderRadius: 8, fontSize: 13, borderLeft: "2px solid var(--err)" }}>
                  {err.message}
                </div>
              )}
              {!resp && !err && !busy && (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 12 }}>
                  点击"发送请求"查看返回。
                </div>
              )}
              {busy && !streamBuf && (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 12 }}>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }}/>
                </div>
              )}
              {busy && streamBuf && (
                <div>
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                    <Pill tone="clay" dot>流式中…</Pill>
                  </div>
                  <Code>{streamBuf}</Code>
                  {streamRaw && (
                    <details open style={{ marginTop: 12, fontSize: 13 }}>
                      <summary style={{ cursor: "pointer", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>原始 SSE 事件</summary>
                      <Code mono scroll>{streamRaw}</Code>
                    </details>
                  )}
                </div>
              )}
              {resp && (
                <div>
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                    <Pill tone="ok" dot>200 OK</Pill>
                    <Pill dot>{resp.latency_ms ?? resp.latencyMs}ms</Pill>
                    {(resp.audit_id ?? resp.id) && <Pill dot mono>{(resp.audit_id ?? resp.id)?.slice(0, 16)}…</Pill>}
                    <Pill tone="clay" dot>{resp.usage.input_tokens + resp.usage.output_tokens} 个 token</Pill>
                  </div>
                  {(() => {
                    const blocks = Array.isArray(resp.content) ? resp.content : [];
                    const thinking = blocks.filter(b => b?.type === "thinking").map(b => b.thinking).join("\n\n").trim();
                    const text = blocks.filter(b => b?.type === "text").map(b => b.text).join("\n\n").trim();
                    return (
                      <>
                        {thinking && (
                          <details open style={{ marginBottom: 12, fontSize: 13, background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                            <summary style={{ cursor: "pointer", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, userSelect: "none" }}>
                              ▸ 思考过程
                            </summary>
                            <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6, color: "var(--text-2)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{thinking}</div>
                          </details>
                        )}
                        {text
                          ? <Code>{text}</Code>
                          : (!thinking && <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 12 }}>
                              响应里没有文本内容。
                            </div>)}
                      </>
                    );
                  })()}
                  <details style={{ marginTop: 16, fontSize: 13 }}>
                    <summary style={{ cursor: "pointer", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>完整 JSON</summary>
                    <Code mono scroll>{JSON.stringify(resp, null, 2)}</Code>
                  </details>
                  {streamRaw && (
                    <details open style={{ marginTop: 12, fontSize: 13 }}>
                      <summary style={{ cursor: "pointer", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>原始 SSE 事件</summary>
                      <Code mono scroll>{streamRaw}</Code>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
          {tab === "request" && <Code mono>{reqPreview}</Code>}
          {tab === "curl" && <Code mono>{toCurl({ model, maxTokens, temperature, systemPrompt, messages })}</Code>}
        </div>
      </div>
    </div>
  );
}

function toCurl({ model, maxTokens, temperature, systemPrompt, messages }) {
  const body = JSON.stringify({ model, max_tokens: maxTokens, temperature, system: systemPrompt, messages }, null, 2);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-relay.example.com";
  return `curl ${origin}/v1/messages \\
  -H "content-type: application/json" \\
  -H "x-api-key: $RELAY_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '${body.replace(/'/g, "'\\''")}'`;
}

function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 16px", border: "none",
      background: "transparent", cursor: "pointer",
      fontSize: 13, color: active ? "var(--text)" : "var(--text-3)",
      fontWeight: active ? 500 : 400,
      borderBottom: active ? "2px solid var(--clay)" : "2px solid transparent",
      marginBottom: -1,
    }}>{children}</button>
  );
}

function Panel({ title, children, right }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>{title}</div>
        {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function Code({ children, mono, scroll }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(String(children)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }
  return (
    <div style={{ position: "relative" }}>
      <button onClick={copy} style={{
        position: "absolute", top: 8, right: 8, zIndex: 1,
        background: "var(--code-bg)", border: "1px solid var(--border-strong)",
        color: copied ? "var(--ok)" : "var(--text-4)", padding: "4px 8px",
        borderRadius: 4, fontSize: 11, fontFamily: "var(--font-mono)", cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 4,
      }}>
        {copied ? <Check size={11}/> : <Copy size={11}/>}
        {copied ? "已复制" : "复制"}
      </button>
      <div style={{
        background: "var(--code-bg)", color: "var(--code-fg)",
        borderRadius: 8, padding: "14px 16px",
        fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        ...(scroll ? { maxHeight: 360, overflow: "auto" } : {}),
      }}>
        {children}
      </div>
    </div>
  );
}

const ctrl = {
  width: "100%", boxSizing: "border-box",
  padding: "8px 10px", border: "1px solid var(--border)",
  borderRadius: 6, background: "var(--surface-2)", color: "var(--text)", fontSize: 13,
};
const ghostBtn = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "4px 10px", background: "transparent",
  border: "1px solid var(--border)", borderRadius: 6,
  fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-2)", cursor: "pointer",
};
const iconBtn = {
  width: 32, height: 32, border: "1px solid var(--border)",
  background: "transparent", borderRadius: 6, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)",
};
