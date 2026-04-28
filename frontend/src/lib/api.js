// API client + session helper.
//
// All app code calls `api(path, opts)` — never fetch directly. The mock
// backend in mock.js intercepts /api/* requests when VITE_USE_MOCK is on;
// otherwise requests hit the Go backend through Vite's dev proxy (see
// vite.config.js) or the same origin in production.

const SESSION_KEY = "ty.session";
const USER_KEY = "ty.user";

export const session = {
  get token() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null")?.token || ""; }
    catch { return ""; }
  },
  get user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); }
    catch { return null; }
  },
  save(user, sess) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
  },
  clear() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SESSION_KEY);
  },
  isAuthed() { return !!this.token; },
};

export class ApiError extends Error {
  constructor(status, data) {
    let msg = `HTTP ${status}`;
    if (data && data.error) {
      if (typeof data.error === "string") {
        msg = data.error;
      } else if (data.error?.issues?.length) {
        const issue = data.error.issues[0];
        const field = issue.path?.join(".") || "";
        msg = field ? `${field}: ${issue.message}` : issue.message;
      } else {
        msg = `HTTP ${status}`;
      }
    }
    super(msg);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, opts = {}) {
  const init = { ...opts };
  init.headers = new Headers(init.headers || {});
  if (init.body && typeof init.body !== "string") {
    init.body = JSON.stringify(init.body);
    init.headers.set("Content-Type", "application/json");
  }
  const tok = session.token;
  if (tok) init.headers.set("Authorization", `Bearer ${tok}`);

  const r = await fetch(path, init);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new ApiError(r.status, data);
  return data;
}

export async function login(email, password) {
  const r = await api("/api/console/login", {
    method: "POST",
    body: { email, password },
  });
  session.save(r.user, r.session);
  return r.user;
}

export async function logout() {
  try { await api("/api/console/logout", { method: "POST" }); } catch (_) {}
  session.clear();
}
