import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast.jsx";

function TestHarness() {
  const { toast } = useToast();
  return (
    <div>
      <button onClick={() => toast("保存成功", { tone: "ok" })}>trigger-ok</button>
      <button onClick={() => toast("请求失败", { tone: "err" })}>trigger-err</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <TestHarness />
    </ToastProvider>
  );
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("Toast", () => {
  it("shows toast message after trigger", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("trigger-ok"));
    expect(screen.getByText("保存成功")).toBeInTheDocument();
  });

  it("auto-dismisses after duration", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("trigger-ok"));
    expect(screen.getByText("保存成功")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3100); });
    expect(screen.queryByText("保存成功")).not.toBeInTheDocument();
  });

  it("can be manually dismissed via close button", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("trigger-err"));
    expect(screen.getByText("请求失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByText("请求失败")).not.toBeInTheDocument();
  });

  it("stacks multiple toasts", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("trigger-ok"));
    fireEvent.click(screen.getByText("trigger-err"));
    expect(screen.getByText("保存成功")).toBeInTheDocument();
    expect(screen.getByText("请求失败")).toBeInTheDocument();
  });
});
