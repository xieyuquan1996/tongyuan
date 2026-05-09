// CT: SecretModal — 关闭前确认用户已复制密钥
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SecretModal } from "./Keys.jsx";

const FAKE_KEY = { secret: "sk-relay-test1234567890", name: "prod-key" };

afterEach(() => vi.restoreAllMocks());

describe("SecretModal — 完成 前确认", () => {
  it("未复制时点完成不关闭，且显示警告", () => {
    const onClose = vi.fn();
    render(<SecretModal keyObj={FAKE_KEY} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /完成/ }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/还没有复制/)).toBeInTheDocument();
  });

  it("警告出现后点「已保存，关闭」可以关闭弹窗", () => {
    const onClose = vi.fn();
    render(<SecretModal keyObj={FAKE_KEY} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /完成/ }));
    fireEvent.click(screen.getByRole("button", { name: /已保存，关闭/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("未复制时点 X 不关闭，显示警告", () => {
    const onClose = vi.fn();
    render(<SecretModal keyObj={FAKE_KEY} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/还没有复制/)).toBeInTheDocument();
  });

  it("复制后点完成直接关闭，不显示警告", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const onClose = vi.fn();
    render(<SecretModal keyObj={FAKE_KEY} onClose={onClose} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /复制密钥/ }));
    });
    fireEvent.click(screen.getByRole("button", { name: /完成/ }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/还没有复制/)).not.toBeInTheDocument();
  });
});
