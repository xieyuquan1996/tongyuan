import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, X, ChevronRight, Info } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync, fmtRelative } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

const PAGE_SIZE = 50;

export default function Logs() {
  const [status, setStatus] = useState("");
  const [model, setModel] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);

  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (model) qs.set("model", model);
  qs.set("limit", String(PAGE_SIZE));
  qs.set("offset", String(page * PAGE_SIZE));

  const { loading, data, error } = useAsync(
    () => api("/api/console/logs?" + qs.toString()),
    [status, model, page]
  );
  const statusOptions = data?.facets?.statuses || [];
  const modelOptions = data?.facets?.models || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleFilterChange(setter) {
    return (e) => { setter(e.target.value); setPage(0); };
  }

  return (
    <div style={{ position: "relative" }}>
      <PageHeader title="请求日志" sub={loading ? "加载中…" : `共 ${total} 条`} />
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={status} onChange={handleFilterChange(setStatus)} style={filterBtn}>
          <option value="">状态: 全部</option>
          {statusOptions.map((s) => (
            <option key={s} value={String(s)}>{s} {statusLabel(s)}</option>
          ))}
        </select>
        <select value={model} onChange={handleFilterChange(setModel)} style={filterBtn}>
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
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
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
                <TokenCell row={r} />
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

function TokenCell({ row }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!pos) return;
    function handler(e) {
      if (btnRef.current && !btnRef.current.contains(e.target)) setPos(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pos]);

  const total = row.input_tokens || 0;
  const raw = row.input_tokens_raw || 0;
  const cacheRead = row.cache_read_tokens || 0;
  const cacheWrite5m = row.cache_write_tokens || 0;
  const cacheWrite1h = row.cache_write_1h_tokens || 0;

  function handleToggle(e) {
    e.stopPropagation();
    if (pos) { setPos(null); return; }
    const rect = btnRef.current.getBoundingClientRect();
    const popupH = 220;
    const openUp = window.innerHeight - rect.bottom < popupH;
    setPos({
      right: window.innerWidth - rect.right,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: Math.min(rect.bottom + 6, window.innerHeight - popupH) }),
    });
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
      {total.toLocaleString()}
      <button
        ref={btnRef}
        onClick={handleToggle}
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--text-3)", display: "inline-flex", alignItems: "center" }}
      >
        <Info size={12} />
      </button>
      {pos && createPortal(
        <div style={{
          position: "fixed", ...pos, zIndex: 9999,
          background: "var(--surface-2)", border: "1px solid var(--border-strong)",
          borderRadius: 8, padding: "12px 14px", boxShadow: "var(--shadow-modal)",
          minWidth: 200, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2,
          whiteSpace: "nowrap",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>输入 Token 明细</div>
          <TokenRow label="基础输入" value={raw} />
          <TokenRow label="缓存读取" value={cacheRead} highlight="ok" />
          <TokenRow label="缓存写入 5m" value={cacheWrite5m} highlight="warn" />
          <TokenRow label="缓存写入 1h" value={cacheWrite1h} highlight="warn" />
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", color: "var(--text)", fontWeight: 600 }}>
            <span>合计</span>
            <span>{total.toLocaleString()}</span>
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}

function TokenRow({ label, value, highlight }) {
  const colorMap = { ok: "var(--ok-text)", warn: "var(--warn-text)" };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 24, color: highlight ? colorMap[highlight] : "var(--text-2)" }}>
      <span>{label}</span>
      <span>{value.toLocaleString()}</span>
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

function Pagination({ page, totalPages, onChange }) {
  const pages = buildPageList(page, totalPages);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 16 }}>
      <PageBtn disabled={page === 0} onClick={() => onChange(page - 1)}>‹</PageBtn>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={i} style={{ padding: "0 4px", color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 13 }}>…</span>
        ) : (
          <PageBtn key={p} active={p === page} onClick={() => onChange(p)}>{p + 1}</PageBtn>
        )
      )}
      <PageBtn disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}>›</PageBtn>
    </div>
  );
}

function PageBtn({ children, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 32, height: 32, padding: "0 6px",
        background: active ? "var(--clay)" : "transparent",
        color: active ? "var(--on-clay)" : disabled ? "var(--text-3)" : "var(--text-2)",
        border: "1px solid", borderColor: active ? "var(--clay)" : "var(--border)",
        borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 13,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages = new Set([0, total - 1, current, current - 1, current + 1].filter(p => p >= 0 && p < total));
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  let prev = -1;
  for (const p of sorted) {
    if (p - prev > 1) result.push("…");
    result.push(p);
    prev = p;
  }
  return result;
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
            {fmtRelative(log.created_at)} · {log.model} · {log.tokens} tokens · {log.display_latency_ms || "—"}ms
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
                <Kv k="latency" v={(log.display_latency_ms || "—") + "ms"} />
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
