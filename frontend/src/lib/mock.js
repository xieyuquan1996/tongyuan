// In-browser mock backend.
// Intercepts fetch("/api/*") and serves JSON from a localStorage-persisted store.

const STORE_KEY = "ty.mock.store.v1";
const SESSION_KEY = "ty.session";

function randHex(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function seed() {
  const userId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const otherUsers = [
    { id: crypto.randomUUID(), email: "lin@acme.io",     name: "Lin",     plan: "Pro",        balance: "842.10", spent: "324.00", limit: "1000.00", daysAgo: 90, status: "active" },
    { id: crypto.randomUUID(), email: "wang@bytes.dev",  name: "Wang",    plan: "Enterprise", balance: "18420.60", spent: "4210.00", limit: "20000.00", daysAgo: 180, status: "active" },
    { id: crypto.randomUUID(), email: "chen@studio.cn",  name: "Chen",    plan: "Starter",   balance: "3.20",   spent: "6.80",   limit: "50.00",  daysAgo: 12,  status: "active" },
    { id: crypto.randomUUID(), email: "guo@lab.ai",      name: "Guo",     plan: "Pro",        balance: "120.40", spent: "78.50",  limit: "500.00", daysAgo: 45,  status: "suspended" },
  ];
  const now = Date.now();
  const day = 86_400_000;

  const allUserIds = [userId, ...otherUsers.map((u) => u.id)];

  const mkKey = (ownerId, name, prefix, daysAgo, state, lastUsed) => ({
    id: crypto.randomUUID(),
    user_id: ownerId,
    name,
    prefix,
    created_at: new Date(now - daysAgo * day).toISOString(),
    last_used_at: lastUsed ? new Date(lastUsed).toISOString() : null,
    state,
  });

  const models = ["claude-opus-4.7", "claude-sonnet-4.5", "claude-haiku-4.5"];
  const statuses = [200, 200, 200, 200, 200, 200, 429, 200, 200, 500, 200, 200];
  const regions = ["cn-east-1", "cn-north-1", "hk-1"];
  const logs = [];
  // Demo user logs (recent, visible in their console).
  for (let i = 0; i < 60; i++) {
    const status = statuses[i % statuses.length];
    const model = models[i % models.length];
    const latency = status === 200 ? 180 + ((i * 37) % 900) : 0;
    const tokens = status === 200 ? 400 + ((i * 311) % 12000) : 0;
    logs.push({
      id: "req_" + randHex(6),
      user_id: userId,
      status,
      model,
      latency_ms: latency,
      tokens,
      cost: ((tokens / 1_000_000) * 3.0).toFixed(4),
      region: regions[i % regions.length],
      created_at: new Date(now - i * 97_000).toISOString(),
      audit_match: true,
    });
  }
  // Cross-tenant logs for the admin platform view.
  for (let i = 0; i < 180; i++) {
    const owner = otherUsers[i % otherUsers.length];
    const status = statuses[(i * 7) % statuses.length];
    const model = models[(i * 3) % models.length];
    const latency = status === 200 ? 160 + ((i * 53) % 900) : 0;
    const tokens = status === 200 ? 300 + ((i * 211) % 14000) : 0;
    logs.push({
      id: "req_" + randHex(6),
      user_id: owner.id,
      status,
      model,
      latency_ms: latency,
      tokens,
      cost: ((tokens / 1_000_000) * 3.0).toFixed(4),
      region: regions[(i * 2) % regions.length],
      created_at: new Date(now - i * 67_000 - 3_600_000).toISOString(),
      audit_match: i % 47 !== 0,
    });
  }

  // Daily usage buckets for analytics (last 30 days).
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const requests = 120_000 + Math.floor(Math.sin(i / 4) * 30_000) + ((i * 5381) % 20_000);
    const tokens = requests * (800 + ((i * 97) % 600));
    daily.push({
      date: new Date(now - i * day).toISOString().slice(0, 10),
      requests,
      tokens,
      cost: (tokens / 1_000_000 * 3.0).toFixed(2),
      latency_p50: 170 + ((i * 13) % 70),
      latency_p99: 380 + ((i * 37) % 150),
    });
  }

  // p99 latency samples for the last 90 days (overview chart).
  const latency_p99_90d = [];
  for (let i = 89; i >= 0; i--) {
    latency_p99_90d.push(380 + ((i * 37) % 150) + Math.floor(Math.cos(i / 7) * 40));
  }

  const demoUser = {
    id: userId,
    email: "demo@tongyuan.ai",
    name: "zhang",
    plan: "Pro",
    balance: "115.80",
    spent_this_month: "84.20",
    limit_this_month: "200.00",
    created_at: new Date(now - 30 * day).toISOString(),
    password: "demo1234",
    company: "同源科技",
    phone: "",
    theme: "light",
    notify_email: true,
    notify_browser: false,
    role: "user",
    status: "active",
  };
  const adminUser = {
    id: adminId,
    email: "admin@tongyuan.ai",
    name: "root",
    plan: "Enterprise",
    balance: "0.00",
    spent_this_month: "0.00",
    limit_this_month: "0.00",
    created_at: new Date(now - 365 * day).toISOString(),
    password: "admin1234",
    company: "同源科技 · 运营组",
    phone: "",
    theme: "light",
    notify_email: true,
    notify_browser: true,
    role: "admin",
    status: "active",
  };
  const otherUserMap = {};
  for (const o of otherUsers) {
    otherUserMap[o.email] = {
      id: o.id,
      email: o.email,
      name: o.name,
      plan: o.plan,
      balance: o.balance,
      spent_this_month: o.spent,
      limit_this_month: o.limit,
      created_at: new Date(now - o.daysAgo * day).toISOString(),
      password: "pass1234",
      company: "",
      phone: "",
      theme: "light",
      notify_email: true,
      notify_browser: false,
      role: "user",
      status: o.status,
    };
  }

  const keys = [
    mkKey(userId, "production-app", "sk-relay-9F3A", 45, "active", now - 2_000),
    mkKey(userId, "staging",        "sk-relay-7C1B", 45, "active", now - 3_600_000),
    mkKey(userId, "local-dev",      "sk-relay-2D8E", 60, "active", now - 3 * day),
    mkKey(userId, "old-cli",        "sk-relay-1A4F", 115, "revoked", null),
    mkKey(otherUsers[0].id, "acme-prod",  "sk-relay-5B2E", 30, "active",   now - 60_000),
    mkKey(otherUsers[0].id, "acme-ci",    "sk-relay-3D7C", 80, "active",   now - 30 * 60_000),
    mkKey(otherUsers[1].id, "bytes-main", "sk-relay-8A91", 170, "active",  now - 1_200),
    mkKey(otherUsers[1].id, "bytes-edge", "sk-relay-6E4D", 90, "active",   now - 5_000),
    mkKey(otherUsers[1].id, "bytes-lab",  "sk-relay-9C13", 30, "active",   now - 12 * 3_600_000),
    mkKey(otherUsers[2].id, "studio-dev", "sk-relay-2F8B", 10, "active",   now - 48 * 3_600_000),
    mkKey(otherUsers[3].id, "lab-proto",  "sk-relay-0B6A", 40, "revoked",  null),
  ];

  const invoices = [
    { id: "inv_2026_03", user_id: userId, period: "2026-03", amount: "164.80", status: "paid" },
    { id: "inv_2026_02", user_id: userId, period: "2026-02", amount: "142.05", status: "paid" },
    { id: "inv_2026_01", user_id: userId, period: "2026-01", amount: "98.40", status: "paid" },
    { id: "inv_2026_03_acme",  user_id: otherUsers[0].id, period: "2026-03", amount: "612.00", status: "paid" },
    { id: "inv_2026_03_bytes", user_id: otherUsers[1].id, period: "2026-03", amount: "4210.00", status: "paid" },
    { id: "inv_2026_03_studio",user_id: otherUsers[2].id, period: "2026-03", amount: "6.80",   status: "pending" },
    { id: "inv_2026_03_lab",   user_id: otherUsers[3].id, period: "2026-03", amount: "78.50",  status: "pending" },
  ];

  const recharges = [
    { id: "rch_2026_04_01", user_id: userId, amount: "200.00", method: "alipay", status: "succeeded", created_at: new Date(now - 14 * day).toISOString() },
    { id: "rch_2026_03_02", user_id: userId, amount: "500.00", method: "wechat", status: "succeeded", created_at: new Date(now - 35 * day).toISOString() },
    { id: "rch_2026_04_acme",  user_id: otherUsers[0].id, amount: "1000.00", method: "alipay", status: "succeeded", created_at: new Date(now - 6 * day).toISOString() },
    { id: "rch_2026_04_bytes", user_id: otherUsers[1].id, amount: "20000.00", method: "bank",   status: "succeeded", created_at: new Date(now - 3 * day).toISOString() },
    { id: "rch_2026_04_lab",   user_id: otherUsers[3].id, amount: "200.00",  method: "wechat", status: "succeeded", created_at: new Date(now - 21 * day).toISOString() },
  ];

  return {
    schema_version: 3,
    users: {
      "demo@tongyuan.ai": demoUser,
      "admin@tongyuan.ai": adminUser,
      ...otherUserMap,
    },
    sessions: {},
    keys,
    logs,
    daily,
    latency_p99_90d,
    invoices,
    recharges,
    alerts: [
      { id: "al_balance_low", user_id: userId, kind: "balance_low", threshold: "20", channel: "email", enabled: true },
      { id: "al_spend_daily", user_id: userId, kind: "spend_daily", threshold: "30", channel: "email", enabled: true },
      { id: "al_error_rate", user_id: userId, kind: "error_rate", threshold: "5", channel: "browser", enabled: false },
    ],
    announcements: [
      { id: "anc_welcome",  title: "控制台 v2 上线", body: "全新的控制台界面已经上线，命令面板 ⌘K 可直达任何页面。", severity: "info",   pinned: true,  visible: true, created_at: new Date(now - 5 * day).toISOString() },
      { id: "anc_maint",    title: "4 月 28 日网关维护",  body: "cn-east-1 将在 2026-04-28 02:00-02:30 进行热升级，期间可能有 30s 以内抖动。", severity: "warn", pinned: false, visible: true, created_at: new Date(now - 2 * day).toISOString() },
      { id: "anc_opus",     title: "Opus 4.7 限时 8 折", body: "5 月 1 日前 claude-opus-4.7 的输出 token 8 折。", severity: "info", pinned: false, visible: false, created_at: new Date(now - 9 * day).toISOString() },
    ],
    audit_log: [
      { id: "evt_" + randHex(4), at: new Date(now - 3 * 60_000).toISOString(),   actor: "root",  action: "admin.user.suspend", target: otherUsers[3].email, note: "疑似异常刷量" },
      { id: "evt_" + randHex(4), at: new Date(now - 55 * 60_000).toISOString(),  actor: "root",  action: "admin.model.update", target: "claude-opus-4.7",   note: "price 更新" },
      { id: "evt_" + randHex(4), at: new Date(now - 6 * 3600_000).toISOString(), actor: "root",  action: "admin.region.update",target: "us-west-2",          note: "status=warn" },
      { id: "evt_" + randHex(4), at: new Date(now - 1 * day).toISOString(),      actor: "root",  action: "admin.announcement.create", target: "anc_maint",    note: "维护预告" },
    ],
    changelog: [
      { date: "2026-04-21", tag: "feature", title: "Opus 4.7 上线", body: "claude-opus-4.7 与 Anthropic 同步上架，所有区域可用，价格 $15 / $75 per Mtok。" },
      { date: "2026-04-12", tag: "improvement", title: "p99 延迟降至 412ms", body: "cn-east-1 / hk-1 两个核心机房完成网络升级，p99 从 540ms 降到 412ms。" },
      { date: "2026-03-30", tag: "feature", title: "请求审计可导出 CSV", body: "Pro 用户现可在请求日志页一键导出 90 天审计数据。" },
      { date: "2026-03-14", tag: "fix", title: "修复 SSE 流式响应偶发断连", body: "超长对话（>4 min）会在某些客户端上 EOF。已修复。" },
      { date: "2026-02-28", tag: "feature", title: "审计日志保留期延长至 30 天", body: "原 7 天 → 30 天。所有套餐生效。" },
    ],
    status_components: [
      { id: "gateway", name: "网关", status: "ok", note: "各区域正常" },
      { id: "auth", name: "鉴权服务", status: "ok", note: "" },
      { id: "billing", name: "计费管道", status: "ok", note: "" },
      { id: "anthropic", name: "上游 · Anthropic", status: "ok", note: "api.anthropic.com 正常" },
      { id: "console", name: "控制台", status: "ok", note: "" },
    ],
    regions: [
      { id: "cn-east-1", name: "上海", status: "ok", latency: "187ms" },
      { id: "cn-north-1", name: "北京", status: "ok", latency: "203ms" },
      { id: "cn-south-1", name: "深圳", status: "ok", latency: "194ms" },
      { id: "hk-1", name: "香港", status: "ok", latency: "84ms" },
      { id: "us-west-2", name: "美西", status: "warn", latency: "1.2s" },
    ],
    models: [
      { id: "claude-opus-4.7", context: "200k", price: "$15 / $75", note: "最强能力", recommended: true },
      { id: "claude-sonnet-4.5", context: "200k", price: "$3 / $15", note: "性价比之选" },
      { id: "claude-sonnet-4.0", context: "200k", price: "$3 / $15", note: "稳定旧版" },
      { id: "claude-haiku-4.5", context: "200k", price: "$0.80 / $4", note: "高吞吐" },
      { id: "claude-haiku-4.0", context: "200k", price: "$0.25 / $1.25", note: "经济" },
    ],
    plans: [
      { name: "Starter", price: "¥0", per: "起步赠送 1M tokens", cta: "免费开始",
        features: ["全部模型可用", "标准延迟（~200ms）", "社区支持"] },
      { name: "Pro", price: "¥199", per: "/ 月起 · 按量计费", cta: "升级到 Pro", featured: true,
        features: ["专属低延迟通道", "p99 ≤ 500ms 保证", "工单支持 · 12h 响应", "审计日志导出"] },
      { name: "Enterprise", price: "面议", per: "团队 / 企业", cta: "联系我们",
        features: ["独占网关实例", "SLA 99.99% 保证", "专属客户经理", "私有部署可选"] },
    ],
    stats: {
      uptime_30d: "99.97%",
      p50_latency: "187ms",
      p99_latency: "412ms",
      consistency: "100%",
      region: "cn-east-1",
    },
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.schema_version === 3) return s;
    }
  } catch (_) {}
  const s = seed();
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
  return s;
}
function saveStore(s) { localStorage.setItem(STORE_KEY, JSON.stringify(s)); }

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function currentToken() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null")?.token || ""; }
  catch { return ""; }
}
function stripSecret(k) { const c = { ...k }; delete c.secret; return c; }

function getUser(store, userId) {
  for (const e of Object.keys(store.users)) {
    if (store.users[e].id === userId) return store.users[e];
  }
  return null;
}

function requireUser(store) {
  const tok = currentToken();
  const sess = store.sessions[tok];
  if (!sess) return null;
  const u = getUser(store, sess.user_id);
  if (!u) return null;
  const { password: _p, ...safe } = u;
  return safe;
}

function issueSession(store, user) {
  const token = crypto.randomUUID().replace(/-/g, "");
  const sess = {
    token,
    user_id: user.id,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  };
  store.sessions[token] = sess;
  return sess;
}

// Fake Claude response for playground requests.
function fakePlaygroundResponse(body) {
  const model = body.model || "claude-sonnet-4.5";
  const lastUserMsg = Array.isArray(body.messages)
    ? body.messages.filter((m) => m.role === "user").slice(-1)[0]?.content || ""
    : "";
  const text =
    typeof lastUserMsg === "string" && lastUserMsg.length > 0
      ? `(mock · ${model}) 我收到你说的「${lastUserMsg.slice(0, 80)}${lastUserMsg.length > 80 ? "…" : ""}」。真实环境下这里是模型生成的回答。`
      : `(mock · ${model}) Hello. 这是 mock 后端返回的假数据，用来演示 playground UI。接真实后端后，同样的请求会透传到 Anthropic。`;
  const inputTok = Math.max(20, Math.floor((JSON.stringify(body).length) / 4));
  const outputTok = Math.max(40, Math.floor(text.length / 2.5));
  return {
    id: "msg_" + randHex(10),
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: inputTok, output_tokens: outputTok },
    audit_id: "aud_" + randHex(6),
    latency_ms: 180 + Math.floor(Math.random() * 600),
  };
}

async function handle(path, opts) {
  const method = (opts.method || "GET").toUpperCase();
  const body = opts.body ? (() => { try { return JSON.parse(opts.body); } catch { return {}; } })() : {};
  const store = loadStore();

  // ---------- PUBLIC ----------
  if (path === "/api/public/stats" && method === "GET") return json(200, store.stats);
  if (path === "/api/public/regions" && method === "GET") return json(200, { regions: store.regions });
  if (path === "/api/public/models" && method === "GET") return json(200, { models: store.models });
  if (path === "/api/public/plans" && method === "GET") return json(200, { plans: store.plans });
  if (path === "/api/public/status" && method === "GET") {
    return json(200, {
      overall: "ok",
      components: store.status_components,
      regions: store.regions,
      incidents: [],
    });
  }
  if (path === "/api/public/changelog" && method === "GET") {
    return json(200, { entries: store.changelog });
  }

  // ---------- AUTH ----------
  if (path === "/api/console/register" && method === "POST") {
    const email = (body.email || "").toLowerCase().trim();
    const password = body.password || "";
    const name = (body.name || email.split("@")[0] || "").trim();
    if (!email || !password) return json(400, { error: "missing_fields" });
    if (!/.+@.+\..+/.test(email)) return json(400, { error: "invalid_email" });
    if (password.length < 6) return json(400, { error: "weak_password" });
    if (store.users[email]) return json(409, { error: "email_exists" });
    const u = {
      id: crypto.randomUUID(),
      email, name, password,
      plan: "Starter",
      balance: "10.00",
      spent_this_month: "0.00",
      limit_this_month: "50.00",
      created_at: new Date().toISOString(),
      company: "",
      phone: "",
      theme: "light",
      notify_email: true,
      notify_browser: false,
      role: "user",
      status: "active",
    };
    store.users[email] = u;
    const sess = issueSession(store, u);
    saveStore(store);
    const { password: _p, ...safe } = u;
    return json(201, { user: safe, session: sess });
  }

  if (path === "/api/console/login" && method === "POST") {
    const u = store.users[(body.email || "").toLowerCase()];
    if (!u || u.password !== body.password) return json(401, { error: "invalid_credentials" });
    if (u.status === "suspended") return json(403, { error: "account_suspended" });
    const sess = issueSession(store, u);
    saveStore(store);
    const { password: _p, ...safe } = u;
    return json(200, { user: safe, session: sess });
  }

  if (path === "/api/console/logout" && method === "POST") {
    const tok = currentToken();
    if (tok) { delete store.sessions[tok]; saveStore(store); }
    return json(200, { ok: true });
  }

  if (path === "/api/console/forgot" && method === "POST") {
    // Always succeed (so we don't leak which emails exist).
    return json(200, { ok: true, hint: "如果该邮箱已注册，我们已经发送了重置链接。" });
  }

  // ---------- AUTH-REQUIRED ----------
  const me = requireUser(store);
  if (!me) return json(401, { error: "unauthorized" });

  if (path === "/api/console/me" && method === "GET") return json(200, me);

  if (path === "/api/console/profile" && method === "PATCH") {
    const u = store.users[me.email.toLowerCase()];
    if (!u) return json(404, { error: "not_found" });
    if (typeof body.name === "string") u.name = body.name.trim();
    if (typeof body.company === "string") u.company = body.company.trim();
    if (typeof body.phone === "string") u.phone = body.phone.trim();
    if (body.theme === "light" || body.theme === "dark") u.theme = body.theme;
    if (typeof body.notify_email === "boolean") u.notify_email = body.notify_email;
    if (typeof body.notify_browser === "boolean") u.notify_browser = body.notify_browser;
    saveStore(store);
    const { password: _p, ...safe } = u;
    return json(200, safe);
  }

  if (path === "/api/console/password" && method === "POST") {
    const u = store.users[me.email.toLowerCase()];
    if (!u) return json(404, { error: "not_found" });
    if (u.password !== body.current) return json(401, { error: "wrong_password" });
    if (!body.next || body.next.length < 6) return json(400, { error: "weak_password" });
    u.password = body.next;
    saveStore(store);
    return json(200, { ok: true });
  }

  if (path === "/api/console/overview" && method === "GET") {
    const recent = store.logs.filter((l) => l.user_id === me.id).slice(0, 5);
    return json(200, {
      metrics: {
        uptime_30d: "99.97",
        p99_live_ms: 412,
        requests_30d: "4.28M",
        spent: "¥" + me.spent_this_month,
        projection: "¥168",
      },
      latency_series: store.latency_p99_90d,
      recent_requests: recent,
    });
  }

  if (path.startsWith("/api/console/analytics") && method === "GET") {
    return json(200, {
      daily: store.daily,
      by_model: [
        { model: "claude-opus-4.7",   requests: 812_300, tokens_m: 2_430, cost: "¥48.60", share: 38 },
        { model: "claude-sonnet-4.5", requests: 1_904_200, tokens_m: 1_140, cost: "¥27.40", share: 44 },
        { model: "claude-haiku-4.5",  requests: 561_500, tokens_m: 260,   cost: "¥8.20",  share: 18 },
      ],
      by_region: [
        { region: "cn-east-1",  requests: 2_140_000, share: 50, p99: 412 },
        { region: "cn-north-1", requests: 860_000,   share: 20, p99: 438 },
        { region: "cn-south-1", requests: 520_000,   share: 12, p99: 421 },
        { region: "hk-1",       requests: 760_000,   share: 18, p99: 196 },
      ],
      errors: [
        { kind: "rate_limit_429", count: 412, pct: "0.10%" },
        { kind: "upstream_5xx",    count: 88,  pct: "0.02%" },
        { kind: "auth_401",        count: 17,  pct: "0.00%" },
      ],
    });
  }

  if (path === "/api/console/keys" && method === "GET") {
    const keys = store.keys
      .filter((k) => k.user_id === me.id)
      .map(stripSecret)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return json(200, { keys });
  }
  if (path === "/api/console/keys" && method === "POST") {
    const raw =
      "sk-relay-" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[b % 32])
        .join("");
    const k = {
      id: crypto.randomUUID(),
      user_id: me.id,
      name: body.name || "new-key",
      prefix: raw.slice(0, 14),
      secret: raw,
      created_at: new Date().toISOString(),
      last_used_at: null,
      state: "active",
      rpm_limit: body.rpm_limit ?? null,
      tpm_limit: body.tpm_limit ?? null,
    };
    store.keys.unshift(k);
    saveStore(store);
    return json(201, k);
  }
  const patchMatch = path.match(/^\/api\/console\/keys\/([^/]+)$/);
  if (patchMatch && method === "PATCH") {
    const k = store.keys.find((x) => x.id === patchMatch[1] && x.user_id === me.id);
    if (!k) return json(404, { error: "not_found" });
    if (body.name !== undefined) k.name = body.name;
    if (body.rpm_limit !== undefined) k.rpm_limit = body.rpm_limit;
    if (body.tpm_limit !== undefined) k.tpm_limit = body.tpm_limit;
    saveStore(store);
    return json(200, stripSecret(k));
  }
  const revokeMatch = path.match(/^\/api\/console\/keys\/([^/]+)\/revoke$/);
  if (revokeMatch && method === "POST") {
    const k = store.keys.find((x) => x.id === revokeMatch[1] && x.user_id === me.id);
    if (!k) return json(404, { error: "not_found" });
    k.state = "revoked";
    saveStore(store);
    return json(200, stripSecret(k));
  }

  if (path.startsWith("/api/console/logs") && method === "GET") {
    const url = new URL(path, "http://x");
    const parts = url.pathname.split("/");
    if (parts.length === 5) {
      const id = parts[4];
      const l = store.logs.find((x) => x.id === id && x.user_id === me.id);
      if (!l) return json(404, { error: "not_found" });
      return json(200, {
        log: l,
        audit: {
          upstream_endpoint: "https://api.anthropic.com/v1/messages",
          model_hash: "sha256:a3f1...e8b2",
          max_tokens: 4096,
          system_len: 4201,
          messages_len: 8940,
          match: l.audit_match,
        },
      });
    }
    const limit = Math.min(+url.searchParams.get("limit") || 50, 200);
    const statusF = url.searchParams.get("status");
    const modelF = url.searchParams.get("model");
    const logs = store.logs
      .filter((l) =>
        l.user_id === me.id &&
        (!statusF || String(l.status) === statusF) &&
        (!modelF || l.model === modelF)
      )
      .slice(0, limit);
    return json(200, { logs, total: logs.length });
  }

  if (path === "/api/console/billing" && method === "GET") {
    return json(200, {
      billing: {
        month_label: "2026 年 4 月",
        used: "¥" + me.spent_this_month,
        limit: "¥" + me.limit_this_month,
        projection: "¥168",
        next_reset: "2026-05-01",
        balance: "¥" + me.balance,
      },
      plan: me.plan,
    });
  }
  if (path === "/api/console/invoices" && method === "GET") {
    const invoices = store.invoices.filter((i) => i.user_id === me.id);
    return json(200, { invoices });
  }
  if (path === "/api/console/recharges" && method === "GET") {
    const recharges = store.recharges.filter((r) => r.user_id === me.id);
    return json(200, { recharges });
  }
  if (path === "/api/console/recharge" && method === "POST") {
    const amt = parseFloat(body.amount || "0");
    if (!(amt > 0) || amt > 100000) return json(400, { error: "invalid_amount" });
    const method_ = body.method || "alipay";
    const u = store.users[me.email.toLowerCase()];
    u.balance = (parseFloat(u.balance) + amt).toFixed(2);
    const rec = {
      id: "rch_" + randHex(4),
      user_id: u.id,
      amount: amt.toFixed(2),
      method: method_,
      status: "succeeded",
      created_at: new Date().toISOString(),
    };
    store.recharges.unshift(rec);
    saveStore(store);
    return json(201, { recharge: rec, balance: u.balance });
  }

  if (path === "/api/console/alerts" && method === "GET") {
    return json(200, { alerts: store.alerts.filter((a) => a.user_id === me.id) });
  }
  if (path === "/api/console/alerts" && method === "POST") {
    const a = {
      id: "al_" + randHex(4),
      user_id: me.id,
      kind: body.kind || "balance_low",
      threshold: String(body.threshold || "20"),
      channel: body.channel || "email",
      enabled: body.enabled !== false,
    };
    store.alerts.push(a);
    saveStore(store);
    return json(201, a);
  }
  const alertMatch = path.match(/^\/api\/console\/alerts\/([^/]+)$/);
  if (alertMatch && method === "PATCH") {
    const a = store.alerts.find((x) => x.id === alertMatch[1] && x.user_id === me.id);
    if (!a) return json(404, { error: "not_found" });
    if (typeof body.threshold !== "undefined") a.threshold = String(body.threshold);
    if (typeof body.channel === "string") a.channel = body.channel;
    if (typeof body.enabled === "boolean") a.enabled = body.enabled;
    saveStore(store);
    return json(200, a);
  }
  if (alertMatch && method === "DELETE") {
    const idx = store.alerts.findIndex((x) => x.id === alertMatch[1] && x.user_id === me.id);
    if (idx < 0) return json(404, { error: "not_found" });
    store.alerts.splice(idx, 1);
    saveStore(store);
    return json(200, { ok: true });
  }

  if (path === "/api/console/playground" && method === "POST") {
    // Simulate latency 200–900ms.
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 700));
    const resp = fakePlaygroundResponse(body);
    // Record a log entry so the playground call shows up in /logs.
    const l = {
      id: "req_" + randHex(6),
      user_id: me.id,
      status: 200,
      model: body.model || "claude-sonnet-4.5",
      latency_ms: resp.latency_ms,
      tokens: resp.usage.input_tokens + resp.usage.output_tokens,
      cost: ((resp.usage.input_tokens + resp.usage.output_tokens) / 1_000_000 * 3.0).toFixed(4),
      region: "cn-east-1",
      created_at: new Date().toISOString(),
      audit_match: true,
    };
    store.logs.unshift(l);
    saveStore(store);
    return json(200, resp);
  }

  // ---------- ADMIN ----------
  if (path.startsWith("/api/admin/")) {
    if (me.role !== "admin") return json(403, { error: "forbidden" });
    return handleAdmin(path, method, body, store);
  }

  return json(404, { error: "route_not_found", path });
}

function adminAudit(store, actor, action, target, note) {
  store.audit_log = store.audit_log || [];
  store.audit_log.unshift({
    id: "evt_" + randHex(4),
    at: new Date().toISOString(),
    actor,
    action,
    target,
    note: note || "",
  });
  if (store.audit_log.length > 200) store.audit_log.length = 200;
}

function handleAdmin(path, method, body, store) {
  const now = Date.now();
  const day = 86_400_000;

  // /api/admin/overview
  if (path === "/api/admin/overview" && method === "GET") {
    const users = Object.values(store.users);
    const activeUsers = users.filter((u) => u.status !== "suspended").length;
    const newUsers7d = users.filter((u) => new Date(u.created_at).getTime() > now - 7 * day).length;
    const logs24h = store.logs.filter((l) => new Date(l.created_at).getTime() > now - day);
    const errors24h = logs24h.filter((l) => l.status >= 400);
    const totalBalance = users.reduce((a, u) => a + parseFloat(u.balance || "0"), 0);
    const spent30d = users.reduce((a, u) => a + parseFloat(u.spent_this_month || "0"), 0);
    // Per-day requests + errors series (last 30d)
    const daily = [];
    for (let i = 29; i >= 0; i--) {
      const start = now - i * day;
      const end = start - day;
      const bucket = store.logs.filter((l) => {
        const t = new Date(l.created_at).getTime();
        return t <= start && t > end;
      });
      daily.push({
        date: new Date(start).toISOString().slice(0, 10),
        requests: bucket.length || (100 + ((i * 37) % 80)),
        errors: bucket.filter((l) => l.status >= 400).length,
      });
    }
    return json(200, {
      metrics: {
        users_total: users.length,
        users_active: activeUsers,
        users_new_7d: newUsers7d,
        requests_24h: logs24h.length,
        errors_24h: errors24h.length,
        error_rate: logs24h.length ? (errors24h.length / logs24h.length * 100).toFixed(2) + "%" : "0.00%",
        balance_total: totalBalance.toFixed(2),
        spent_30d: spent30d.toFixed(2),
      },
      daily,
      recent_audit: (store.audit_log || []).slice(0, 6),
    });
  }

  // /api/admin/users
  if (path.startsWith("/api/admin/users") && method === "GET") {
    const url = new URL(path, "http://x");
    const parts = url.pathname.split("/");
    if (parts.length === 5) {
      const id = parts[4];
      const u = Object.values(store.users).find((x) => x.id === id);
      if (!u) return json(404, { error: "not_found" });
      const { password: _p, ...safe } = u;
      const userKeys = store.keys.filter((k) => k.user_id === id).map(stripSecret);
      const userLogs = store.logs.filter((l) => l.user_id === id).slice(0, 20);
      const userRecharges = store.recharges.filter((r) => r.user_id === id);
      const userInvoices = store.invoices.filter((i) => i.user_id === id);
      return json(200, { user: safe, keys: userKeys, recent_logs: userLogs, recharges: userRecharges, invoices: userInvoices });
    }
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const statusF = url.searchParams.get("status") || "";
    const planF = url.searchParams.get("plan") || "";
    const users = Object.values(store.users)
      .filter((u) => !q || u.email.toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q))
      .filter((u) => !statusF || u.status === statusF)
      .filter((u) => !planF || u.plan === planF)
      .map((u) => {
        const { password: _p, ...safe } = u;
        return safe;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return json(200, { users, total: users.length });
  }

  const userPatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userPatch && method === "PATCH") {
    const u = Object.values(store.users).find((x) => x.id === userPatch[1]);
    if (!u) return json(404, { error: "not_found" });
    if (typeof body.plan === "string") u.plan = body.plan;
    if (typeof body.limit_this_month === "string") u.limit_this_month = body.limit_this_month;
    if (typeof body.role === "string" && (body.role === "user" || body.role === "admin")) u.role = body.role;
    if (typeof body.status === "string" && (body.status === "active" || body.status === "suspended")) u.status = body.status;
    saveStore(store);
    adminAudit(store, "root", "admin.user.update", u.email, Object.keys(body).join(","));
    saveStore(store);
    const { password: _p, ...safe } = u;
    return json(200, safe);
  }

  const userAdjust = path.match(/^\/api\/admin\/users\/([^/]+)\/adjust$/);
  if (userAdjust && method === "POST") {
    const u = Object.values(store.users).find((x) => x.id === userAdjust[1]);
    if (!u) return json(404, { error: "not_found" });
    const delta = parseFloat(body.delta || "0");
    if (!Number.isFinite(delta) || delta === 0) return json(400, { error: "invalid_amount" });
    u.balance = (parseFloat(u.balance || "0") + delta).toFixed(2);
    store.recharges.unshift({
      id: "rch_" + randHex(4),
      user_id: u.id,
      amount: delta.toFixed(2),
      method: "admin_adjust",
      status: "succeeded",
      created_at: new Date().toISOString(),
    });
    adminAudit(store, "root", "admin.user.adjust", u.email, (delta > 0 ? "+" : "") + delta.toFixed(2) + " · " + (body.note || ""));
    saveStore(store);
    const { password: _p, ...safe } = u;
    return json(200, { user: safe, balance: u.balance });
  }

  // /api/admin/keys — all keys across tenants
  if (path.startsWith("/api/admin/keys") && method === "GET") {
    const url = new URL(path, "http://x");
    const ownerF = url.searchParams.get("user_id") || "";
    const stateF = url.searchParams.get("state") || "";
    const usersById = {};
    for (const u of Object.values(store.users)) usersById[u.id] = u;
    const keys = store.keys
      .filter((k) => (!ownerF || k.user_id === ownerF) && (!stateF || k.state === stateF))
      .map((k) => ({
        ...stripSecret(k),
        owner_email: usersById[k.user_id]?.email || "—",
        owner_name: usersById[k.user_id]?.name || "—",
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return json(200, { keys, total: keys.length });
  }

  const adminKeyRevoke = path.match(/^\/api\/admin\/keys\/([^/]+)\/revoke$/);
  if (adminKeyRevoke && method === "POST") {
    const k = store.keys.find((x) => x.id === adminKeyRevoke[1]);
    if (!k) return json(404, { error: "not_found" });
    k.state = "revoked";
    adminAudit(store, "root", "admin.key.revoke", k.prefix, body.reason || "");
    saveStore(store);
    return json(200, stripSecret(k));
  }

  // /api/admin/logs — cross-tenant
  if (path.startsWith("/api/admin/logs") && method === "GET") {
    const url = new URL(path, "http://x");
    const parts = url.pathname.split("/");
    const usersById = {};
    for (const u of Object.values(store.users)) usersById[u.id] = u;
    if (parts.length === 5) {
      const id = parts[4];
      const l = store.logs.find((x) => x.id === id);
      if (!l) return json(404, { error: "not_found" });
      return json(200, {
        log: { ...l, owner_email: usersById[l.user_id]?.email || "—" },
        audit: {
          upstream_endpoint: "https://api.anthropic.com/v1/messages",
          model_hash: "sha256:a3f1...e8b2",
          max_tokens: 4096,
          system_len: 4201,
          messages_len: 8940,
          match: l.audit_match,
        },
      });
    }
    const limit = Math.min(+url.searchParams.get("limit") || 100, 500);
    const statusF = url.searchParams.get("status");
    const modelF = url.searchParams.get("model");
    const ownerF = url.searchParams.get("user_id");
    const logs = store.logs
      .filter((l) =>
        (!statusF || String(l.status) === statusF) &&
        (!modelF || l.model === modelF) &&
        (!ownerF || l.user_id === ownerF)
      )
      .slice(0, limit)
      .map((l) => ({ ...l, owner_email: usersById[l.user_id]?.email || "—" }));
    return json(200, { logs, total: logs.length });
  }

  // /api/admin/billing — platform-wide billing + per-user summary
  if (path === "/api/admin/billing" && method === "GET") {
    const users = Object.values(store.users);
    const byUser = users.map((u) => ({
      id: u.id,
      email: u.email,
      plan: u.plan,
      balance: u.balance,
      spent_this_month: u.spent_this_month,
      limit_this_month: u.limit_this_month,
      status: u.status,
    })).sort((a, b) => parseFloat(b.spent_this_month) - parseFloat(a.spent_this_month));
    const totalRevenue = users.reduce((a, u) => a + parseFloat(u.spent_this_month || "0"), 0);
    const totalBalance = users.reduce((a, u) => a + parseFloat(u.balance || "0"), 0);
    const byPlan = {};
    for (const u of users) {
      const k = u.plan || "—";
      byPlan[k] = byPlan[k] || { plan: k, count: 0, revenue: 0 };
      byPlan[k].count += 1;
      byPlan[k].revenue += parseFloat(u.spent_this_month || "0");
    }
    return json(200, {
      totals: {
        revenue_this_month: totalRevenue.toFixed(2),
        balance_outstanding: totalBalance.toFixed(2),
        pending_invoices: store.invoices.filter((i) => i.status === "pending").length,
      },
      by_plan: Object.values(byPlan).map((p) => ({ ...p, revenue: p.revenue.toFixed(2) })),
      by_user: byUser,
      invoices: store.invoices,
      recharges: store.recharges,
    });
  }

  // /api/admin/models — CRUD
  if (path === "/api/admin/models" && method === "GET") {
    return json(200, { models: store.models });
  }
  if (path === "/api/admin/models" && method === "POST") {
    if (!body.id) return json(400, { error: "missing_fields" });
    if (store.models.find((m) => m.id === body.id)) return json(409, { error: "model_exists" });
    const m = {
      id: body.id,
      context: body.context || "200k",
      price: body.price || "$0 / $0",
      note: body.note || "",
      recommended: !!body.recommended,
    };
    store.models.unshift(m);
    adminAudit(store, "root", "admin.model.create", m.id, m.price);
    saveStore(store);
    return json(201, m);
  }
  const modelPatch = path.match(/^\/api\/admin\/models\/([^/]+)$/);
  if (modelPatch && method === "PATCH") {
    const m = store.models.find((x) => x.id === decodeURIComponent(modelPatch[1]));
    if (!m) return json(404, { error: "not_found" });
    if (typeof body.context === "string") m.context = body.context;
    if (typeof body.price === "string") m.price = body.price;
    if (typeof body.note === "string") m.note = body.note;
    if (typeof body.recommended === "boolean") m.recommended = body.recommended;
    adminAudit(store, "root", "admin.model.update", m.id, Object.keys(body).join(","));
    saveStore(store);
    return json(200, m);
  }
  if (modelPatch && method === "DELETE") {
    const idx = store.models.findIndex((x) => x.id === decodeURIComponent(modelPatch[1]));
    if (idx < 0) return json(404, { error: "not_found" });
    const [removed] = store.models.splice(idx, 1);
    adminAudit(store, "root", "admin.model.delete", removed.id);
    saveStore(store);
    return json(200, { ok: true });
  }

  // /api/admin/regions — CRUD + status patch
  if (path === "/api/admin/regions" && method === "GET") {
    return json(200, { regions: store.regions, components: store.status_components });
  }
  const regionPatch = path.match(/^\/api\/admin\/regions\/([^/]+)$/);
  if (regionPatch && method === "PATCH") {
    const r = store.regions.find((x) => x.id === regionPatch[1]);
    if (!r) return json(404, { error: "not_found" });
    if (typeof body.status === "string") r.status = body.status;
    if (typeof body.latency === "string") r.latency = body.latency;
    if (typeof body.name === "string") r.name = body.name;
    adminAudit(store, "root", "admin.region.update", r.id, body.status || "");
    saveStore(store);
    return json(200, r);
  }
  const componentPatch = path.match(/^\/api\/admin\/components\/([^/]+)$/);
  if (componentPatch && method === "PATCH") {
    const c = store.status_components.find((x) => x.id === componentPatch[1]);
    if (!c) return json(404, { error: "not_found" });
    if (typeof body.status === "string") c.status = body.status;
    if (typeof body.note === "string") c.note = body.note;
    adminAudit(store, "root", "admin.component.update", c.id, body.status || "");
    saveStore(store);
    return json(200, c);
  }

  // /api/admin/announcements
  if (path === "/api/admin/announcements" && method === "GET") {
    return json(200, { announcements: store.announcements });
  }
  if (path === "/api/admin/announcements" && method === "POST") {
    const a = {
      id: "anc_" + randHex(4),
      title: body.title || "未命名公告",
      body: body.body || "",
      severity: body.severity || "info",
      pinned: !!body.pinned,
      visible: body.visible !== false,
      created_at: new Date().toISOString(),
    };
    store.announcements.unshift(a);
    adminAudit(store, "root", "admin.announcement.create", a.id, a.title);
    saveStore(store);
    return json(201, a);
  }
  const annMatch = path.match(/^\/api\/admin\/announcements\/([^/]+)$/);
  if (annMatch && method === "PATCH") {
    const a = store.announcements.find((x) => x.id === annMatch[1]);
    if (!a) return json(404, { error: "not_found" });
    if (typeof body.title === "string") a.title = body.title;
    if (typeof body.body === "string") a.body = body.body;
    if (typeof body.severity === "string") a.severity = body.severity;
    if (typeof body.pinned === "boolean") a.pinned = body.pinned;
    if (typeof body.visible === "boolean") a.visible = body.visible;
    adminAudit(store, "root", "admin.announcement.update", a.id);
    saveStore(store);
    return json(200, a);
  }
  if (annMatch && method === "DELETE") {
    const idx = store.announcements.findIndex((x) => x.id === annMatch[1]);
    if (idx < 0) return json(404, { error: "not_found" });
    const [removed] = store.announcements.splice(idx, 1);
    adminAudit(store, "root", "admin.announcement.delete", removed.id);
    saveStore(store);
    return json(200, { ok: true });
  }

  // /api/admin/audit
  if (path === "/api/admin/audit" && method === "GET") {
    return json(200, { events: store.audit_log || [] });
  }

  return json(404, { error: "route_not_found", path });
}

export function installMock() {
  if (typeof window === "undefined") return;
  if (window.__TY_MOCK_INSTALLED__) return;
  window.__TY_MOCK_INSTALLED__ = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input.url;
    const path = url.startsWith("http") ? new URL(url).pathname + new URL(url).search : url;
    if (path.startsWith("/api/")) {
      try { return await handle(path, init || {}); }
      catch (e) { return json(500, { error: "mock_error", message: String(e) }); }
    }
    return origFetch(input, init);
  };
}

export function resetMockStore() {
  localStorage.removeItem(STORE_KEY);
}
