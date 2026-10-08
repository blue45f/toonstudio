import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_PROMO_HISTORY_META,
  createPromoHistoryTracker,
  nextPromoHistoryMeta,
  pushPromoSnapshot,
  scopedPromoCoalesceKey,
  shouldPushPromoUndo,
} from "./promo-history";

describe("promo-history 병합 판정", () => {
  it("병합 키가 없는 이산 편집은 항상 스냅샷을 쌓는다", () => {
    const meta = nextPromoHistoryMeta("field:title", 1_000);
    expect(shouldPushPromoUndo(meta, undefined, 1_100)).toBe(true);
  });

  it("같은 키의 연속 편집은 시간 창 안에서는 스냅샷을 쌓지 않는다", () => {
    const meta = nextPromoHistoryMeta("field:title", 1_000);
    expect(shouldPushPromoUndo(meta, "field:title", 1_500)).toBe(false);
    expect(shouldPushPromoUndo(meta, "field:title", 2_199)).toBe(false);
  });

  it("시간 창이 지나면 같은 키라도 새 스냅샷을 쌓는다", () => {
    const meta = nextPromoHistoryMeta("field:title", 1_000);
    expect(shouldPushPromoUndo(meta, "field:title", 2_200)).toBe(true);
  });

  it("다른 키의 편집은 시간 창 안이라도 새 스냅샷을 쌓는다", () => {
    const meta = nextPromoHistoryMeta("field:title", 1_000);
    expect(shouldPushPromoUndo(meta, "field:synopsis", 1_100)).toBe(true);
  });

  it("초기 메타에서는 어떤 편집도 스냅샷을 쌓는다", () => {
    expect(shouldPushPromoUndo(EMPTY_PROMO_HISTORY_META, "field:title", 500)).toBe(true);
  });

  it("스냅샷 스택은 상한을 유지한다", () => {
    let history: number[] = [];
    for (let i = 0; i < 40; i += 1) history = pushPromoSnapshot(history, i);
    expect(history).toHaveLength(30);
    expect(history[0]).toBe(10);
    expect(history.at(-1)).toBe(39);
  });

  it("트래커는 연속 입력을 병합하고 reset 뒤에는 다시 쌓는다", () => {
    const nowSpy = vi.spyOn(Date, "now");
    try {
      const tracker = createPromoHistoryTracker();
      nowSpy.mockReturnValue(1_000);
      expect(tracker.shouldPush("field:title")).toBe(true);
      nowSpy.mockReturnValue(1_400);
      expect(tracker.shouldPush("field:title")).toBe(false);
      tracker.reset();
      nowSpy.mockReturnValue(1_500);
      expect(tracker.shouldPush("field:title")).toBe(true);
      nowSpy.mockReturnValue(3_000);
      expect(tracker.shouldPush("field:title")).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe("promo-history 하위 편집기 병합 키", () => {
  it("연속 입력 필드에만 범위를 붙이고, 필드 없는 이산 조작은 병합 키를 만들지 않는다", () => {
    expect(scopedPromoCoalesceKey("panel:a", "camera.from.x")).toBe("panel:a:camera.from.x");
    expect(scopedPromoCoalesceKey("panel:a", undefined)).toBeUndefined();
  });

  // 회귀: 컷 전체를 키 하나("panel:<id>")로 묶으면 1.2초 안의 맞바꾸기 버튼이 앞선 슬라이더 입력과
  // 키프레임 모드 전환까지 한 단계로 병합돼, 실행 취소 한 번에 직접 지정 카메라가 통째로 사라졌다.
  it("1.2초 창 안에서도 이산 조작은 직전 연속 입력과 병합하지 않아 실행 취소가 그 조작만 되돌린다", () => {
    const nowSpy = vi.spyOn(Date, "now");
    try {
      const tracker = createPromoHistoryTracker();
      let undo: string[] = [];
      let current = "카메라 프리셋";
      const edit = (next: string, at: number, field?: string) => {
        nowSpy.mockReturnValue(at);
        if (tracker.shouldPush(scopedPromoCoalesceKey("panel:a", field))) undo = pushPromoSnapshot(undo, current);
        current = next;
      };
      edit("직접 지정 카메라", 1_000);
      edit("시작 가로 10%", 1_030, "camera.from.x");
      edit("시작 가로 12%", 1_060, "camera.from.x");
      edit("끝 가로 90%", 1_090, "camera.to.x");
      edit("끝 확대 200%", 1_120, "camera.to.zoom");
      edit("시작·끝 맞바꿈", 1_300);
      expect(undo).toEqual([
        "카메라 프리셋",
        "직접 지정 카메라",
        "시작 가로 12%",
        "끝 가로 90%",
        "끝 확대 200%",
      ]);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
