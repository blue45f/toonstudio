import { describe, expect, it } from "vitest";

import { studioWorkspaceDormancyMatches } from "./studio-shell-interactions";

describe("모바일 작업공간 관리자 요청 전·후 휴면 계약", () => {
  const hiddenGate = { gateCount: 1, triggerCount: 1, heavyMenuCount: 0, dialogCount: 0, triggerVisible: false };
  const unmounted = { ...hiddenGate, gateCount: 0, triggerCount: 0 };
  it("요청 전 기본 그리기에서는 미마운트, 기존 모바일 셸에서는 숨은 경량 게이트 하나만 허용한다", () => {
    expect(studioWorkspaceDormancyMatches(unmounted, true)).toBe(true);
    expect(studioWorkspaceDormancyMatches(hiddenGate, false)).toBe(true);
    expect(studioWorkspaceDormancyMatches(hiddenGate, true)).toBe(false);
    expect(studioWorkspaceDormancyMatches(unmounted, false)).toBe(false);
  });
  it("그리기 화면에서 창 배치를 요청하면 관리자는 휴면 상태로 두고 실제 진입 버튼을 표시한다", () => {
    const visibleGate = { ...hiddenGate, triggerVisible: true };
    expect(studioWorkspaceDormancyMatches(visibleGate, true, "project-tools")).toBe(true);
    expect(studioWorkspaceDormancyMatches(hiddenGate, true, "project-tools")).toBe(false);
    expect(studioWorkspaceDormancyMatches(unmounted, true, "project-tools")).toBe(false);
    expect(studioWorkspaceDormancyMatches(hiddenGate, false, "project-tools")).toBe(true);
    for (const violation of [{ heavyMenuCount: 1 }, { dialogCount: 1 }, { gateCount: 2 }, { triggerCount: 2 }]) {
      expect(studioWorkspaceDormancyMatches({ ...visibleGate, ...violation }, true, "project-tools")).toBe(false);
    }
  });
  it.each([
    { heavyMenuCount: 1 }, { dialogCount: 1 }, { triggerVisible: true },
    { gateCount: 2 }, { triggerCount: 2 }, { triggerCount: 0 },
  ])("%j 상태에서는 관리자의 조기 로딩·중복·숨김 계약 위반을 실패시킨다", (violation) => {
    expect(studioWorkspaceDormancyMatches({ ...hiddenGate, ...violation }, false)).toBe(false);
  });
});
