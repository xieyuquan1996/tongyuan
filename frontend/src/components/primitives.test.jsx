import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "./primitives.jsx";

describe("Input", () => {
  it("renders with value and responds to change", () => {
    const onChange = vi.fn();
    render(<Input value="hello" onChange={onChange} />);
    const input = screen.getByDisplayValue("hello");
    fireEvent.change(input, { target: { value: "world" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("renders placeholder", () => {
    render(<Input value="" onChange={() => {}} placeholder="输入邮箱" />);
    expect(screen.getByPlaceholderText("输入邮箱")).toBeInTheDocument();
  });

  it("applies disabled state", () => {
    render(<Input value="" onChange={() => {}} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("passes type prop to native input", () => {
    render(<Input value="" onChange={() => {}} type="email" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("type", "email");
  });
});
