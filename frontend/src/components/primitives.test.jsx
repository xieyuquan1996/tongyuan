import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input, Select, FormField, Banner } from "./primitives.jsx";

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

describe("Select", () => {
  const options = [
    { label: "Claude 3.5", value: "claude-3.5" },
    { label: "Claude 4", value: "claude-4" },
  ];

  it("renders options", () => {
    render(<Select value="" onChange={() => {}} options={options} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("Claude 3.5")).toBeInTheDocument();
    expect(screen.getByText("Claude 4")).toBeInTheDocument();
  });

  it("renders placeholder as disabled first option", () => {
    render(<Select value="" onChange={() => {}} options={options} placeholder="选择模型" />);
    const placeholder = screen.getByText("选择模型");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toBeDisabled();
  });

  it("responds to value change", () => {
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={options} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "claude-4" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("applies disabled state", () => {
    render(<Select value="" onChange={() => {}} options={options} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});

describe("FormField", () => {
  it("renders label and children", () => {
    render(
      <FormField label="邮箱">
        <Input value="" onChange={() => {}} />
      </FormField>
    );
    expect(screen.getByText("邮箱")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("displays error message when error prop is set", () => {
    render(
      <FormField label="密码" error="密码至少 6 位">
        <Input value="" onChange={() => {}} type="password" />
      </FormField>
    );
    expect(screen.getByText("密码至少 6 位")).toBeInTheDocument();
  });

  it("does not display error element when error is null", () => {
    render(
      <FormField label="名称" error={null}>
        <Input value="" onChange={() => {}} />
      </FormField>
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Banner", () => {
  it("renders children with default info tone", () => {
    render(<Banner>操作已完成</Banner>);
    expect(screen.getByText("操作已完成")).toBeInTheDocument();
  });

  it("renders with err tone", () => {
    render(<Banner tone="err">请求失败</Banner>);
    expect(screen.getByText("请求失败")).toBeInTheDocument();
  });

  it("calls onDismiss when close button is clicked", () => {
    const onDismiss = vi.fn();
    render(<Banner tone="warn" dismissible onDismiss={onDismiss}>警告</Banner>);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not show close button when dismissible is false", () => {
    render(<Banner tone="ok">成功</Banner>);
    expect(screen.queryByRole("button", { name: "关闭" })).not.toBeInTheDocument();
  });
});
