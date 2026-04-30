import { useState } from "react";
import { Download, X, ChevronRight } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync, fmtRelative } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

export default function Logs() {
  const [status, setStatus] = useState("");
  const [model, setModel] = useState("");
  const [selected, setSelected] = useState(null);
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (model) qs.set("model", model);
  const { loading, data, error } = useAsync(
    () => api("/api/console/logs?" + qs.toString()),
    [status, model]
  );
  const statusOptions = data?.facets?.statuses || [];
  const modelOptions = data?.facets?.models || [];

  return (
    <div style={{ position: "relative" }}>
      <PageHeader title="请求日志" sub={loading ? "加载中…" : `共 ${data?.total || 0} 条 · 过去 24 小时`} />
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={filterBtn}>
          <option value="">状态: 全部</option>
          {statusOptions.map((s) => (
            <option key={s} value={String(s)}>{s} {statusLabel(s)}</option>
          ))}
        </select>
        <select value={model} onChange={(e) => setModel(e.target.value)} style={filterBtn}>
          <option value="">模型: 全部</option>
          {modelOptions.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
        <button style={{ ...filterBtn, marginLeft: "auto" }}>
          <Download size={14} /> 导出 CSV
        </button>
      </div>
      {error ? <ErrorBox error={error} /> : loading ? <Loading /> : (
        <LogsTable rows={data.logs} onRowClick={(r) => setSelected(r)} />
      )}
      {selected && <AuditDrawer log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function LogsTable({ rows, onRowClick }) {
  const visible = rows || [];
  return (
    <div style={{
      background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: 12, overflow: "auto",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 960 }}>
        <thead>
          <tr style={{ background: "var(--surface-3)" }}>
            <th style={th}>时间</th>
            <th style={th}>请求 ID</th>
            <th style={th}>模型</th>
            <th style={{ ...th, textAlign: "right" }}>输入<br />Tokens</th>
            <th style={{ ...th, textAlign: "right" }}>输出<br />Tokens</th>
            <th style={th}>类型</th>
            <th style={th}>服务层</th>
            <th style={th}>请求路径</th>
            <th style={{ ...th, width: 24 }} />
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr><td colSpan="9" style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>没有符合条件的请求。</td></tr>
          )}
          {visible.map((r) => (
            <tr
              key={r.id}
              onClick={() => onRowClick && onRowClick(r)}
              style={{ borderTop: "1px solid var(--divider)", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)", whiteSpace: "nowrap" }}>
                {fmtTime(r.created_at)}
              </td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>
                <StatusDot status={r.status} />
                {r.id}
              </td>
              <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.model}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {(r.input_tokens || 0).toLocaleString()}
              </td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {(r.output_tokens || 0).toLocaleString()}
              </td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.type || "HTTP"}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.service_tier === "Standard" ? "标准" : (r.service_tier || "标准")}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
                {r.endpoint || "/v1/messages"}
              </td>
              <td style={{ ...td, color: "var(--text-3)" }}>
                <ChevronRight size={14} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusDot({ status }) {
  const color = status === 200 ? "var(--ok)" : status === 429 ? "var(--warn)" : "var(--err)";
  return (
    <span style={{
      display: "inline-block", width: 6, height: 6, borderRadius: "50%",
      background: color, marginRight: 8, verticalAlign: "middle",
    }} />
  );
}

function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

function AuditDrawer({ log, onClose }) {
  const { loading, data, error } = useAsync(() => api(`/api/console/logs/${log.id}`), [log.id]);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 20 }} />
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: 560, maxWidth: "100vw", zIndex: 21,
          background: "var(--surface-2)",
          borderLeft: "1px solid var(--border-strong)",
          display: "flex", flexDirection: "column",
          boxShadow: "var(--shadow-modal)",
        }}
      >
        <div style={{ padding: 24, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <Pill tone="clay" dot>完整透传</Pill>
            <button onClick={onClose} style={{ marginLeft: "auto", background: "transparent", border: "none", padding: 6, cursor: "pointer", color: "var(--text-3)" }}>
              <X size={18} />
            </button>
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px", fontFamily: "var(--font-mono)" }}>{log.id}</h3>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
            {fmtRelative(log.created_at)} · {log.model} · {log.tokens} tokens · {log.latency_ms || "—"}ms
          </div>
        </div>
        <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
          {loading && <Loading />}
          {error && <ErrorBox error={error} />}
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
              <div style={{ height: 12 }} />
              <Label>HASH AUDIT · 字节级一致性</Label>
              <div style={{
                background: "var(--surface-3)", borderRadius: 8, padding: 16,
                fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.8,
              }}>
                <div>model:        {data.audit.model_hash} ✓</div>
                <div>max_tokens:   {data.audit.max_tokens} ✓</div>
                <div>system_len:   {data.audit.system_len.toLocaleString()} chars ✓</div>
                <div>messages_len: {data.audit.messages_len.toLocaleString()} chars ✓</div>
                <div style={{ color: data.audit.match ? "var(--ok-text)" : "var(--err)", marginTop: 6 }}>
                  ● {data.audit.match ? "与上行请求字节级一致" : "检测到不一致！"}
                </div>
              </div>
              <div style={{ height: 16 }} />
              <Label>区域 / 延迟 / 费用</Label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                <Kv k="region" v={log.region} />
                <Kv k="latency" v={(log.latency_ms || "—") + "ms"} />
                <Kv k="cost" v={"$" + log.cost} />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Kv({ k, v }) {
  return (
    <div style={{ background: "var(--surface-3)", borderRadius: 6, padding: "8px 12px" }}>
      <div style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>{k}</div>
      <div>{v}</div>
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em",
      textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10,
    }}>{children}</div>
  );
}

function CodeBlock({ children }) {
  return (
    <pre style={{
      margin: 0, background: "var(--code-bg)", color: "var(--code-fg)",
      padding: 16, borderRadius: 8, fontFamily: "var(--font-mono)",
      fontSize: 12, lineHeight: 1.6, overflow: "auto", whiteSpace: "pre",
    }}>{children}</pre>
  );
}

const filterBtn = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 12px", background: "transparent",
  border: "1px solid var(--border)", borderRadius: 6,
  fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-2)",
  cursor: "pointer",
};

const th = {
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em",
  textTransform: "uppercase", color: "var(--text-3)",
  textAlign: "left", padding: "10px 16px", fontWeight: 400,
  whiteSpace: "nowrap",
};

const td = { padding: "12px 16px", color: "var(--text)", whiteSpace: "nowrap" };
