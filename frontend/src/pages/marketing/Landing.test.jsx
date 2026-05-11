// frontend/src/pages/marketing/Landing.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Landing from "./Landing";

vi.mock("../../lib/api.js", () => ({
  api: vi.fn(() => Promise.resolve({})),
  session: { isAuthed: () => false },
}));

vi.mock("../../lib/hooks.js", () => ({
  useIsMobile: () => false,
}));

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("Landing — Claude icon in Hero", () => {
  it("renders Claude SVG icon in the SectionLabel row", () => {
    renderLanding();
    expect(screen.getByRole("img", { name: "Claude" })).toBeInTheDocument();
  });
});

describe("Landing — SignalCompare card labels", () => {
  it("renders 透明传输 title in left card", () => {
    renderLanding();
    expect(screen.getByText("透明传输 (Transparent Pass-through)")).toBeInTheDocument();
  });

  it("renders 黑箱阉割 title in right card", () => {
    renderLanding();
    expect(screen.getByText("黑箱阉割 (Opaque Modification)")).toBeInTheDocument();
  });

  it("renders left card description", () => {
    renderLanding();
    expect(screen.getByText("完整透传系统提示词，保留 200k 全量上下文")).toBeInTheDocument();
  });

  it("renders right card description", () => {
    renderLanding();
    expect(screen.getByText("悄悄替换廉价模型，强制截断 System Prompt 导致逻辑崩坏")).toBeInTheDocument();
  });
});

describe("Landing — FAQ", () => {
  it("renders h2 as 常见FAQ", () => {
    renderLanding();
    expect(screen.getByRole("heading", { level: 2, name: "常见FAQ" })).toBeInTheDocument();
  });

  it("renders new Q1", () => {
    renderLanding();
    expect(screen.getByText("如何验证模型响应的真实性？")).toBeInTheDocument();
  });

  it("renders new Q2", () => {
    renderLanding();
    expect(screen.getByText("中转链路如何实现比直连更低的延迟？")).toBeInTheDocument();
  });

  it("renders new Q3", () => {
    renderLanding();
    expect(screen.getByText("Anthropic 发布新模型后，多久可以接入？")).toBeInTheDocument();
  });

  it("renders new Q4", () => {
    renderLanding();
    expect(screen.getByText("是否兼容现有的 OpenAI / Anthropic 生态？")).toBeInTheDocument();
  });

  it("renders new Q5", () => {
    renderLanding();
    expect(screen.getByText("是否支持企业财务合规报销？")).toBeInTheDocument();
  });

  it("FAQ content container uses maxWidth 1216", () => {
    renderLanding();
    const faqContent = screen.getByTestId("faq-content");
    expect(faqContent).toHaveStyle({ maxWidth: "1216px" });
  });
});
