// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MmorpgRecruitmentPlazaPanel } from "./MmorpgRecruitmentPlazaPanel";

afterEach(cleanup);

describe("MmorpgRecruitmentPlazaPanel", () => {
  it("추천 어시스턴트를 즉시 파티 슬롯에 매칭하고 공유 검수방 연결과 실시간 광장 대화를 지원한다", () => {
    const onInvite = vi.fn();
    render(<MmorpgRecruitmentPlazaPanel onInviteMatchedAvatar={onInvite} />);

    const inviteButtons = screen.getAllByRole("button", { name: "즉시 파티 초대" });
    const enabledInvite = inviteButtons.find((btn) => !(btn as HTMLButtonElement).disabled);
    expect(enabledInvite).toBeTruthy();
    if (enabledInvite) fireEvent.click(enabledInvite);

    expect(onInvite).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("plaza-handoff-room-link").getAttribute("href")).toContain(
      "/collaborate/workspace?party=",
    );

    const msgInput = screen.getByLabelText("광장 실시간 메시지 입력");
    fireEvent.change(msgInput, {
      target: { value: "클튜 EX 300dpi 원본으로 오늘 밤 마감 가능합니다." },
    });
    fireEvent.click(screen.getByTestId("plaza-send-message-btn"));
    expect(
      screen.getByText("클튜 EX 300dpi 원본으로 오늘 밤 마감 가능합니다."),
    ).toBeTruthy();
  });
});
