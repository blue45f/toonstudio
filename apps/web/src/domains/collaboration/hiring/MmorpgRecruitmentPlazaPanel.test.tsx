// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MmorpgRecruitmentPlazaPanel } from "./MmorpgRecruitmentPlazaPanel";

afterEach(cleanup);

describe("MmorpgRecruitmentPlazaPanel", () => {
  it("객관 납품 신뢰 배지, 파티 매칭 검수방 연결, 실시간 대화 및 인계 툴킷(스타일시트·규격점검·합평반)을 제공한다", async () => {
    const onInvite = vi.fn();
    render(<MmorpgRecruitmentPlazaPanel onInviteMatchedAvatar={onInvite} />);

    // 1. 주관적 별점 대신 객관 납품 신뢰 배지 표시 확인
    expect(screen.getByTestId("objective-trust-badge-av-1").textContent).toContain(
      "안정 마감 마스터",
    );

    // 2. 추천 어시 즉시 파티 슬롯 매칭 및 공유 검수방 링크
    const inviteButtons = screen.getAllByRole("button", { name: "즉시 파티 초대" });
    const enabledInvite = inviteButtons.find((btn) => !(btn as HTMLButtonElement).disabled);
    expect(enabledInvite).toBeTruthy();
    if (enabledInvite) fireEvent.click(enabledInvite);

    expect(onInvite).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("plaza-handoff-room-link").getAttribute("href")).toContain(
      "/collaborate/workspace?party=",
    );

    // 3. 실시간 광장 라운지 메시지 전송
    const msgInput = screen.getByLabelText("광장 실시간 메시지 입력");
    fireEvent.change(msgInput, {
      target: { value: "클튜 EX 300dpi 원본으로 오늘 밤 마감 가능합니다." },
    });
    fireEvent.click(screen.getByTestId("plaza-send-message-btn"));
    expect(
      screen.getByText("클튜 EX 300dpi 원본으로 오늘 밤 마감 가능합니다."),
    ).toBeTruthy();

    // 4. 인계 툴킷: 스타일시트 인계 팩 다운로드 + 규격 점검 + 무상 합평반 개설
    fireEvent.click(screen.getByTestId("download-starter-kit-btn"));
    expect(screen.getByText(/인계 팩을 내려받았습니다/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /규격 자동 점검/ }));
    fireEvent.change(screen.getByLabelText("미해결 필수 수정 핀 수"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByTestId("run-manuscript-preflight-btn"));
    expect(
      (await screen.findByTestId("preflight-result-banner")).textContent,
    ).toContain("승인 보류");

    fireEvent.click(screen.getByRole("tab", { name: /무상 합평 보드/ }));
    fireEvent.change(screen.getByLabelText("교육기관·학과명"), {
      target: { value: "청강문화산업대 만화콘텐츠스쿨" },
    });
    fireEvent.change(screen.getByLabelText("합평 수업·기수명"), {
      target: { value: "졸업작품 주간 합평반" },
    });
    fireEvent.click(screen.getByTestId("create-academy-classroom-btn"));
    expect(await screen.findByText(/무상 합평 보드 \[졸업작품 주간 합평반\] 개설 완료/)).toBeTruthy();
  });
});
