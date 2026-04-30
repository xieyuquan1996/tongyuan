// Browser-side alert evaluator. Polls metrics every 30s and fires
// Notification API for any enabled browser-channel alert whose threshold
// has just been crossed.
//
// State is stored in localStorage so we only notify once per crossing,
// not every tick.

import { api } from "./api.js";

const KEY = "ty.alert_fired";
const INTERVAL_MS = 30_000;

function loadFired() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function saveFired(m) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {}
}

function notify(title, body) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try { new Notification(title, { body, icon: "/logo.svg" }); } catch {}
}

function extractNumber(s) {
  if (s == null) return 0;
  const n = parseFloat(String(s).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function evaluateOnce() {
  let alerts;
  try {
    const r = await api("/api/console/alerts");
    alerts = r.alerts || [];
  } catch { return; }
  const browserAlerts = alerts.filter((a) => a.enabled && a.channel === "browser");
  if (browserAlerts.length === 0) return;

  // Load metrics in parallel. Only fetch overview if we need error_rate / p99.
  const needOverview = browserAlerts.some((a) => a.kind === "error_rate" || a.kind === "p99_latency");
  const needMe = browserAlerts.some((a) => a.kind === "balance_low");
  const needBilling = browserAlerts.some((a) => a.kind === "spend_daily");

  const [me, overview, billing] = await Promise.all([
    needMe ? api("/api/console/me").catch(() => null) : null,
    needOverview ? api("/api/console/overview").catch(() => null) : null,
    needBilling ? api("/api/console/billing").catch(() => null) : null,
  ]);

  const fired = loadFired();
  let dirty = false;

  for (const a of browserAlerts) {
    const threshold = parseFloat(a.threshold);
    if (!Number.isFinite(threshold)) continue;

    let value = null;
    let label = "";
    let unit = "";
    let triggered = false;

    if (a.kind === "balance_low" && me) {
      // Balance from /me is in CNY (balance_cny) or USD — use balance_cny if present.
      value = extractNumber(me.balance_cny ?? me.balance_usd);
      label = "余额";
      unit = "¥";
      triggered = value < threshold;
    } else if (a.kind === "spend_daily" && billing) {
      value = extractNumber(billing.billing?.used);
      label = "今日消费";
      unit = "¥";
      triggered = value > threshold;
    } else if (a.kind === "error_rate" && overview) {
      value = extractNumber(overview.metrics?.error_rate);
      label = "错误率";
      unit = "%";
      triggered = value > threshold;
    } else if (a.kind === "p99_latency" && overview) {
      value = Number(overview.metrics?.p99_live_ms) || 0;
      label = "p99 延迟";
      unit = "ms";
      triggered = value > threshold;
    }

    const key = `${a.id}`;
    if (triggered && !fired[key]) {
      notify(`同源 · 告警触发`, `${label}当前 ${unit}${value.toFixed?.(2) ?? value}（阈值 ${unit}${threshold}）`);
      fired[key] = Date.now();
      dirty = true;
    } else if (!triggered && fired[key]) {
      // Crossed back below threshold — clear so next crossing re-fires.
      delete fired[key];
      dirty = true;
    }
  }

  if (dirty) saveFired(fired);
}

let timer = null;

export function startAlertPoller() {
  if (timer) return;
  evaluateOnce();
  timer = setInterval(evaluateOnce, INTERVAL_MS);
}

export function stopAlertPoller() {
  if (timer) { clearInterval(timer); timer = null; }
}
