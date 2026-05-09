// src/pages/ResetPassword.test.jsx
// CT: ResetPassword component — mocks fetch, tests all user-facing states.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ResetPassword from "./ResetPassword.jsx";

function renderWith(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function mockFetch(status, body) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

// ── No token ────────────────────────────────────────────────────────────────

describe("ResetPassword — no token", () => {
  it("shows invalid-link error when token param is absent", () => {
    renderWith("");
    expect(screen.getByText("链接无效")).toBeInTheDocument();
    expect(screen.getByText(/链接缺少 token/)).toBeInTheDocument();
  });
});

// ── With token ───────────────────────────────────────────────────────────────

describe("ResetPassword — with token", () => {
  const TOKEN = "a".repeat(64);
  const SEARCH = `?token=${TOKEN}`;

  it("renders new-password form", () => {
    renderWith(SEARCH);
    expect(screen.getByText("重置密码")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("至少 6 位")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("再输入一次")).toBeInTheDocument();
  });

  it("shows mismatch error without calling API when passwords differ", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    renderWith(SEARCH);

    fireEvent.change(screen.getByPlaceholderText("至少 6 位"), { target: { value: "newpass1" } });
    fireEvent.change(screen.getByPlaceholderText("再输入一次"), { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: /确认重置/ }));

    expect(await screen.findByText("两次输入的密码不一致")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("shows success state on valid submission", async () => {
    mockFetch(200, { ok: true });
    renderWith(SEARCH);

    fireEvent.change(screen.getByPlaceholderText("至少 6 位"), { target: { value: "newpass1" } });
    fireEvent.change(screen.getByPlaceholderText("再输入一次"), { target: { value: "newpass1" } });
    fireEvent.click(screen.getByRole("button", { name: /确认重置/ }));

    expect(await screen.findByText("密码已重置")).toBeInTheDocument();
    expect(screen.getByText(/正在跳转/)).toBeInTheDocument();
  });

  it("navigates to /login when the 2.5s timer fires", async () => {
    // Only capture the 2500ms navigation timer; let all other setTimeout calls
    // (including RTL's internal waitFor polling) pass through normally.
    const originalSetTimeout = globalThis.setTimeout;
    let timerFn;
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn, delay, ...args) => {
      if (delay === 2500) { timerFn = fn; return 0; }
      return originalSetTimeout(fn, delay, ...args);
    });

    mockFetch(200, { ok: true });
    renderWith(SEARCH);

    fireEvent.change(screen.getByPlaceholderText("至少 6 位"), { target: { value: "newpass1" } });
    fireEvent.change(screen.getByPlaceholderText("再输入一次"), { target: { value: "newpass1" } });
    fireEvent.click(screen.getByRole("button", { name: /确认重置/ }));

    await screen.findByText("密码已重置");

    // Fire the captured timer — simulates 2.5s passing.
    await act(async () => timerFn());

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("shows invalid_or_expired_token error from API", async () => {
    mockFetch(400, { error: "invalid_or_expired_token" });
    renderWith(SEARCH);

    fireEvent.change(screen.getByPlaceholderText("至少 6 位"), { target: { value: "newpass1" } });
    fireEvent.change(screen.getByPlaceholderText("再输入一次"), { target: { value: "newpass1" } });
    fireEvent.click(screen.getByRole("button", { name: /确认重置/ }));

    expect(await screen.findByText("链接无效或已过期，请重新申请。")).toBeInTheDocument();
  });

  it("shows weak_password error from API", async () => {
    mockFetch(400, { error: "weak_password" });
    renderWith(SEARCH);

    fireEvent.change(screen.getByPlaceholderText("至少 6 位"), { target: { value: "short" } });
    fireEvent.change(screen.getByPlaceholderText("再输入一次"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /确认重置/ }));

    expect(await screen.findByText("密码至少 6 位。")).toBeInTheDocument();
  });

  it("sends correct token and password to /api/console/reset", async () => {
    const spy = mockFetch(200, { ok: true });
    renderWith(SEARCH);

    fireEvent.change(screen.getByPlaceholderText("至少 6 位"), { target: { value: "mypassword" } });
    fireEvent.change(screen.getByPlaceholderText("再输入一次"), { target: { value: "mypassword" } });
    fireEvent.click(screen.getByRole("button", { name: /确认重置/ }));

    await screen.findByText("密码已重置");

    const body = JSON.parse(spy.mock.calls[0][1].body);
    expect(body.token).toBe(TOKEN);
    expect(body.password).toBe("mypassword");
  });
});
