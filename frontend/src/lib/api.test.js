// src/lib/api.test.js
//
// Unit tests for the api() fetch wrapper.
// Covers 401 auto-logout: clears session and redirects to /login.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, session, ApiError } from "./api.js";

function mockFetch(status, body) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => {
  localStorage.clear();
  // Reset location.href tracking
  delete globalThis.window.location;
  globalThis.window.location = { href: "http://localhost/" };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api() — 401 handling", () => {
  it("clears session and redirects to /login when response is 401", async () => {
    session.save({ id: "u1" }, { token: "tok123" });
    expect(session.isAuthed()).toBe(true);

    mockFetch(401, { error: "unauthorized" });

    await expect(api("/api/console/me")).rejects.toBeInstanceOf(ApiError);

    expect(session.isAuthed()).toBe(false);
    expect(window.location.href).toBe("/login");
  });

  it("does not redirect for non-401 errors", async () => {
    mockFetch(500, { error: "internal_error" });

    await expect(api("/api/console/me")).rejects.toBeInstanceOf(ApiError);

    expect(window.location.href).toBe("http://localhost/");
  });

  it("returns data normally on 200", async () => {
    mockFetch(200, { ok: true });
    const data = await api("/api/console/me");
    expect(data).toEqual({ ok: true });
  });
});
