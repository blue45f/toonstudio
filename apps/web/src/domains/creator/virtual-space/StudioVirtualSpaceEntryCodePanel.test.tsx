// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEntryCodePanel } from "./StudioVirtualSpaceEntryCodePanel";

describe("StudioVirtualSpaceEntryCodePanel", () => {
  it("유효한 코드는 입장 콜백으로 전달한다", () => {
    const onEnterWithCode = vi.fn();
    render(<StudioVirtualSpaceEntryCodePanel onEnterWithCode={onEnterWithCode} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc234" } });
    fireEvent.click(screen.getByRole("button", { name: "입장하기" }));
    expect(onEnterWithCode).toHaveBeenCalledWith("ABC234");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("잘못된 코드는 안내를 보여준다", () => {
    const onEnterWithCode = vi.fn();
    render(<StudioVirtualSpaceEntryCodePanel onEnterWithCode={onEnterWithCode} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "AB12" } });
    fireEvent.click(screen.getByRole("button", { name: "입장하기" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(onEnterWithCode).not.toHaveBeenCalled();
  });

  it("서버가 만료로 거절한 코드는 만료 안내를 보여준다", async () => {
    const onEnterWithCode = vi.fn(async () => ({ ok: false, reason: "expired" as const }));
    render(<StudioVirtualSpaceEntryCodePanel onEnterWithCode={onEnterWithCode} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ZZZ999" } });
    fireEvent.click(screen.getByRole("button", { name: "입장하기" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("만료된 코드");
    expect(onEnterWithCode).toHaveBeenCalledWith("ZZZ999");
  });

  it("잠긴 공간은 남은 시간을 안내하고, 확인 불가는 연결 안내로 구분한다", async () => {
    const onEnterWithCode = vi.fn(async () => ({ ok: false, reason: "locked" as const, retryAfterSeconds: 900 }));
    const view = render(<StudioVirtualSpaceEntryCodePanel onEnterWithCode={onEnterWithCode} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ZZZ999" } });
    fireEvent.click(screen.getByRole("button", { name: "입장하기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("15분");
    view.unmount();

    const unavailable = vi.fn(async () => ({ ok: false, reason: "unavailable" as const }));
    render(<StudioVirtualSpaceEntryCodePanel onEnterWithCode={unavailable} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ZZZ999" } });
    fireEvent.click(screen.getByRole("button", { name: "입장하기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("연결");
  });

  it("프래그먼트로 도착한 코드는 입력칸에 미리 채워진다", () => {
    render(<StudioVirtualSpaceEntryCodePanel onEnterWithCode={vi.fn()} initialCode="K7X2P9" />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("K7X2P9");
  });
});
