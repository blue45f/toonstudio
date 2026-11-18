import { describe, expect, it } from "vitest";

import { studioWorkspaceDormancyMatches } from "./studio-shell-interactions";

describe("모바일 작업공간 관리자 요청 전·후 휴면 계약", () => {
  const hiddenGate = { gateCount: 1, triggerCount: 1, heavyMenuCount: 0, dialogCount: 0, triggerVisible: false };
  const unmounted = { ...hiddenGate, gateCount: 0, triggerCount: 0 };
  it("기본 그리기에서는 미마운트, 창 배치 요청 뒤에는 숨은 경량 게이트 하나만 허용한다", () => {
    expect(studioWorkspaceDormancyMatches(unmounted, true)).toBe(true);
    expect(studioWorkspaceDormancyMatches(hiddenGate, false)).toBe(true);
    expect(studioWorkspaceDormancyMatches(hiddenGate, true)).toBe(false);
    expect(studioWorkspaceDormancyMatches(unmounted, false)).toBe(false);
  });
  it.each([
    { heavyMenuCount: 1 }, { dialogCount: 1 }, { triggerVisible: true },
    { gateCount: 2 }, { triggerCount: 2 }, { triggerCount: 0 },
  ])("%j 상태에서는 관리자의 조기 로딩·중복·숨김 계약 위반을 실패시킨다", (violation) => {
    expect(studioWorkspaceDormancyMatches({ ...hiddenGate, ...violation }, false)).toBe(false);
  });
});
