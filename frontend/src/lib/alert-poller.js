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

  // /billing has balance_cny and used_cny (already converted at current rate).
  // /overview has error_rate and p99_live_ms.
  const needBilling = browserAlerts.some((a) => a.kind === "balance_low" || a.kind === "spend_daily");
  const needOverview = browserAlerts.some((a) => a.kind === "error_rate" || a.kind === "p99_latency");

  const [billing, overview] = await Promise.all([
    needBilling ? api("/api/console/billing").catch(() => null) : null,
    needOverview ? api("/api/console/overview").catch(() => null) : null,
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

    if (a.kind === "balance_low" && billing) {
      // balance_cny is a decimal string like "72.000000"
      value = Number(billing.billing?.balance_cny ?? 0);
      label = "余额";
      unit = "¥";
      triggered = value < threshold;
    } else if (a.kind === "spend_daily" && billing) {
      // Note: API only exposes month-to-date spend, not daily. We compare MTD.
      value = Number(billing.billing?.used_cny ?? 0);
      label = "本月消费";
      unit = "¥";
      triggered = value > threshold;
    } else if (a.kind === "error_rate" && overview) {
      // error_rate is formatted as "0.00%" — strip the % sign.
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
      const display = typeof value === "number" ? value.toFixed(2) : String(value);
      notify(`同源 · 告警触发`, `${label}当前 ${unit}${display}（阈值 ${unit}${threshold}）`);
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
