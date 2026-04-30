import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync, fmtRelative } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

export default function AdminLogs() {
  const [status, setStatus] = useState("");
  const [model, setModel] = useState("");
  const [selected, setSelected] = useState(null);

  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (model) qs.set("model", model);
  qs.set("limit", "200");
  const { loading, data, error } = useAsync(() => api("/api/admin/logs?" + qs.toString()), [status, model]);

  if (error) return <ErrorBox error={error}/>;
  const logs = data?.logs || [];
  const statusOptions = data?.facets?.statuses || [];
  const modelOptions = data?.facets?.models || [];

  return (
    <div>
      <PageHeader title="全部请求" sub={loading ? "加载中…" : `跨租户 · 最新 ${logs.length} 条`}/>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={filter}>
          <option value="">状态: 全部</option>
          {statusOptions.map((s) => (
            <option key={s} value={String(s)}>{s} {statusLabel(s)}</option>
          ))}
        </select>
        <select value={model} onChange={(e) => setModel(e.target.value)} style={filter}>
          <option value="">模型: 全部</option>
          {modelOptions.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </div>

      {loading ? <Loading/> : (
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1100 }}>
            <thead>
              <tr style={{ background: "var(--surface-3)" }}>
                <th style={th}>状态</th>
                <th style={th}>请求 ID</th>
                <th style={th}>归属</th>
                <th style={th}>模型</th>
                <th style={{ ...th, textAlign: "right" }}>输入<br/>Tokens</th>
                <th style={{ ...th, textAlign: "right" }}>输出<br/>Tokens</th>
                <th style={th}>类型</th>
                <th style={th}>延迟</th>
                <th style={th}>审计</th>
                <th style={th}>时间</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan="10" style={{ padding: 32, textAlign: "center", color: "var(--text-3)" }}>没有匹配的请求。</td></tr>}
              {logs.map((l) => (
                <tr key={l.id} onClick={() => setSelected(l)} style={{ borderTop: "1px solid var(--divider)", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>
                    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                      background: l.status === 200 ? "var(--ok)" : l.status === 429 ? "var(--warn)" : "var(--err)", marginRight: 8 }}/>
                    {l.status}
                  </td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{l.id}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12 }}>{l.owner_email}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{l.model}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {(l.input_tokens || 0).toLocaleString()}
                  </td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {(l.output_tokens || 0).toLocaleString()}
                  </td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{l.type || "HTTP"}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{l.latency_ms ? l.latency_ms + "ms" : "—"}</td>
                  <td style={td}>{l.audit_match ? <Pill tone="ok" dot>一致</Pill> : <Pill tone="err" dot>不一致</Pill>}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{fmtRelative(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <Drawer log={selected} onClose={() => setSelected(null)}/>}
    </div>
  );
}

function Drawer({ log, onClose }) {
  const { loading, data, error } = useAsync(() => api(`/api/admin/logs/${log.id}`), [log.id]);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 20 }}/>
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 560, maxWidth: "100vw", zIndex: 21,
        background: "var(--surface-2)", borderLeft: "1px solid var(--border-strong)",
        display: "flex", flexDirection: "column",
        boxShadow: "var(--shadow-modal)",
      }}>
        <div style={{ padding: 24, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <Pill tone={log.audit_match ? "clay" : "err"} dot>{log.audit_match ? "字节级一致" : "检测到不一致"}</Pill>
            <button onClick={onClose} style={{ marginLeft: "auto", background: "transparent", border: "none", padding: 6, cursor: "pointer", color: "var(--text-3)" }}><X size={18}/></button>
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px", fontFamily: "var(--font-mono)" }}>{log.id}</h3>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
            {log.owner_email} · {log.model} · {log.latency_ms || "—"}ms · {fmtRelative(log.created_at)}
          </div>
        </div>
        <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
          {loading && <Loading/>}
          {error && <ErrorBox error={error}/>}
          {data && (
            <>
              <Label>UPSTREAM → ANTHROPIC</Label>
              <CodeBlock>{`POST ${data.audit.upstream_endpoint}
content-type: application/json
anthropic-version: 2023-06-01
x-api-key: sk-ant-api03-•••••

{
  "model": "${log.model}",
  "max_tokens": ${data.audit.max_tokens},
  "system": [{"type":"text","text":"... (${data.audit.system_len} chars)"}],
  "messages": [...]
}`}</CodeBlock>
              <div style={{ height: 12 }}/>
              <Label>HASH AUDIT</Label>
              <div style={{ background: "var(--surface-3)", borderRadius: 8, padding: 16, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.8 }}>
                <div>model:        {data.audit.model_hash} {data.audit.match ? "✓" : "✗"}</div>
                <div>max_tokens:   {data.audit.max_tokens} ✓</div>
                <div>system_len:   {data.audit.system_len.toLocaleString()} chars ✓</div>
                <div>messages_len: {data.audit.messages_len.toLocaleString()} chars ✓</div>
                <div style={{ color: data.audit.match ? "var(--ok-text)" : "var(--err)", marginTop: 6 }}>
                  ● {data.audit.match ? "与上行请求字节级一致" : "检测到不一致！请立即核查网关"}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Label({ children }) {
  return <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>{children}</div>;
}
function CodeBlock({ children }) {
  return <pre style={{ margin: 0, background: "var(--code-bg)", color: "var(--code-fg)", padding: 16, borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6, overflow: "auto", whiteSpace: "pre" }}>{children}</pre>;
}

function statusLabel(s) {
  const map = {
    200: "成功", 201: "已创建", 204: "无内容",
    400: "请求错误", 401: "未授权", 402: "余额不足", 403: "禁止访问",
    404: "未找到", 409: "冲突", 429: "限流",
    500: "内部错误", 502: "上游错误", 503: "服务不可用", 504: "超时",
  };
  return map[s] || "";
}

const card = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" };
const th = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", padding: "10px 16px", fontWeight: 400 };
const td = { padding: "12px 16px", color: "var(--text)" };
const filter = { padding: "8px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-2)", cursor: "pointer" };
