import { describe, expect, it } from "vitest";

import {
  officeBoardShimmer,
  officeClockHands,
  officeClockSecondBucket,
  officeCoolerBubbleField,
  officeLampGlow,
  officeMonitorGlow,
  officeNeonFlicker,
  officePlantSway,
  officePropFrame,
  officePropKindForCampusObject,
  officePropKindForFurniture,
  officeScreenGlow,
  STUDIO_OFFICE_COOLER_BUBBLE_COUNT,
  STUDIO_OFFICE_PROP_KINDS,
} from "./studio-virtual-space-office-props";

describe("officeClockHands", () => {
  it("자정에는 모든 바늘이 12시를 가리킨다", () => {
    const hands = officeClockHands(0);
    expect(hands.hourAngle).toBe(0);
    expect(hands.minuteAngle).toBe(0);
    expect(hands.secondAngle).toBe(0);
    expect(hands.second).toBe(0);
  });

  it("6시는 시침이 아래, 30분은 분침이 아래, 15초는 초침이 오른쪽이다", () => {
    expect(officeClockHands(6 * 3600 * 1000).hourAngle).toBeCloseTo(Math.PI, 6);
    expect(officeClockHands(30 * 60 * 1000).minuteAngle).toBeCloseTo(Math.PI, 6);
    expect(officeClockHands(15 * 1000).secondAngle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("시침은 분을 반영해 천천히 이동한다 (6시 30분이면 6~7시 사이)", () => {
    const hands = officeClockHands((6 * 3600 + 30 * 60) * 1000);
    expect(hands.hourAngle).toBeGreaterThan(Math.PI);
    expect(hands.hourAngle).toBeLessThan(Math.PI + Math.PI / 6);
  });

  it("무효한 시각은 0으로 취급한다", () => {
    expect(officeClockHands(Number.NaN).secondAngle).toBe(0);
    expect(officeClockHands(-500).hourAngle).toBe(0);
  });

  it("초 버킷은 1초마다 바뀐다", () => {
    expect(officeClockSecondBucket(1500)).toBe(1);
    expect(officeClockSecondBucket(1999)).toBe(1);
    expect(officeClockSecondBucket(2000)).toBe(2);
  });
});

describe("officeMonitorGlow", () => {
  it("항상 0~1 범위에서 은은하게 변한다", () => {
    for (let time = 0; time < 20_000; time += 137) {
      const value = officeMonitorGlow(time, "desk-1", false);
      expect(value).toBeGreaterThanOrEqual(0.5);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("같은 입력은 같은 값을 돌려준다 (결정적)", () => {
    expect(officeMonitorGlow(4321, "desk-1", false)).toBe(officeMonitorGlow(4321, "desk-1", false));
  });

  it("모션 줄이기에서는 고정 밝기다", () => {
    expect(officeMonitorGlow(0, "desk-1", true)).toBe(officeMonitorGlow(9999, "desk-1", true));
  });
});

describe("officeNeonFlicker", () => {
  it("항상 0~1 범위이고 대부분 켜져 있다", () => {
    let lit = 0;
    for (let time = 0; time < 20_000; time += 90) {
      const value = officeNeonFlicker(time, "cafe-neon", false);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      if (value > 0.8) lit += 1;
    }
    expect(lit).toBeGreaterThan(150);
  });

  it("모션 줄이기에서는 깜빡이지 않고 계속 켜져 있다", () => {
    expect(officeNeonFlicker(123, "cafe-neon", true)).toBe(1);
    expect(officeNeonFlicker(987_654, "cafe-neon", true)).toBe(1);
  });
});

describe("officePlantSway", () => {
  it("흔들림이 작은 범위 안에 머문다", () => {
    for (let time = 0; time < 30_000; time += 211) {
      const sway = officePlantSway(time, "plant-1", false);
      expect(Math.abs(sway.rotation)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(sway.offsetX)).toBeLessThanOrEqual(2);
    }
  });

  it("모션 줄이기에서는 흔들리지 않는다", () => {
    expect(officePlantSway(5000, "plant-1", true)).toEqual({ rotation: 0, offsetX: 0 });
  });
});

describe("officePropFrame / 종류 매핑", () => {
  it("소품 종류는 8종이다 (웨이브 2에서 램프·정수기·보드·화면 4종 추가)", () => {
    expect(STUDIO_OFFICE_PROP_KINDS).toEqual([
      "monitor-glow", "wall-clock", "neon-flicker", "plant-sway",
      "lamp-glow", "cooler-bubbles", "board-shimmer", "screen-glow",
    ]);
  });

  it("시계 프레임은 바늘을 포함하고 나머지는 null이다", () => {
    expect(officePropFrame("wall-clock", 15_000, "clock", false).clock?.second).toBe(15);
    expect(officePropFrame("monitor-glow", 15_000, "desk", false).clock).toBeNull();
  });

  it("모션 줄이기에서 시계 초침은 초 단위로 끊긴다", () => {
    const frame = officePropFrame("wall-clock", 15_700, "clock", true);
    expect(frame.clock?.secondAngle).toBeCloseTo((15 / 60) * Math.PI * 2, 6);
  });

  it("캠퍼스 오브젝트 종류를 소품 종류로 연결한다", () => {
    expect(officePropKindForCampusObject("desk-monitor")).toBe("monitor-glow");
    expect(officePropKindForCampusObject("wall-clock")).toBe("wall-clock");
    expect(officePropKindForCampusObject("neon-sign")).toBe("neon-flicker");
    expect(officePropKindForCampusObject("whiteboard")).toBe("board-shimmer");
    expect(officePropKindForCampusObject("water-cooler")).toBe("cooler-bubbles");
    expect(officePropKindForCampusObject("vending-machine")).toBe("screen-glow");
    expect(officePropKindForCampusObject("softbox")).toBe("lamp-glow");
    expect(officePropKindForCampusObject("reception")).toBeNull();
  });

  it("가구 종류를 소품 종류로 연결한다 (화분 흔들림 포함)", () => {
    expect(officePropKindForFurniture("plant")).toBe("plant-sway");
    expect(officePropKindForFurniture("desk-monitor")).toBe("monitor-glow");
    expect(officePropKindForFurniture("floor-lamp")).toBe("lamp-glow");
    expect(officePropKindForFurniture("water-cooler")).toBe("cooler-bubbles");
    expect(officePropKindForFurniture("whiteboard")).toBe("board-shimmer");
    expect(officePropKindForFurniture("display-screen")).toBe("screen-glow");
    expect(officePropKindForFurniture("vending-machine")).toBe("screen-glow");
    expect(officePropKindForFurniture("sofa")).toBeNull();
  });
});

describe("웨이브 2 소품 연출 (램프·화면·보드·정수기)", () => {
  it("램프 빛은 느린 호흡으로 0~1 안에서만 움직이고 모션 줄이기에서는 고정된다", () => {
    for (let now = 0; now <= 6000; now += 250) {
      const value = officeLampGlow(now, "lamp-1", false);
      expect(value).toBeGreaterThanOrEqual(0.6);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(officeLampGlow(0, "lamp-1", false)).not.toBeCloseTo(officeLampGlow(750, "lamp-1", false), 3);
    expect(officeLampGlow(1234, "lamp-1", true)).toBe(0.92);
    expect(officeLampGlow(9876, "lamp-1", true)).toBe(0.92);
  });

  it("화면 순환광은 위상이 0~1로 순환하고 모션 줄이기에서는 정지한다", () => {
    const first = officeScreenGlow(1000, "screen-1", false);
    expect(first.progress).toBeGreaterThanOrEqual(0);
    expect(first.progress).toBeLessThan(1);
    expect(first.intensity).toBeGreaterThanOrEqual(0);
    expect(first.intensity).toBeLessThanOrEqual(1);
    const later = officeScreenGlow(1000 + 9000, "screen-1", false);
    expect(later.progress).toBeCloseTo(first.progress, 6);
    expect(officeScreenGlow(4321, "screen-1", true)).toEqual({ intensity: 0.85, progress: 0 });
  });

  it("보드 반짝임은 주기 일부에서만 sweep이 0~1을 가로지르고 나머지는 쉰다", () => {
    let sawSweep = false;
    let sawRest = false;
    for (let now = 0; now <= 7000; now += 100) {
      const frame = officeBoardShimmer(now, "board-1", false);
      if (frame.sweep >= 0) {
        sawSweep = true;
        expect(frame.sweep).toBeLessThanOrEqual(1);
        expect(frame.intensity).toBeGreaterThan(0);
      } else {
        sawRest = true;
        expect(frame.intensity).toBe(0);
      }
    }
    expect(sawSweep).toBe(true);
    expect(sawRest).toBe(true);
    expect(officeBoardShimmer(1000, "board-1", true)).toEqual({ intensity: 0, sweep: -1 });
  });

  it("정수기 기포는 결정적으로 떠오르고 모션 줄이기에서는 제자리에 멈춘다", () => {
    const early = officeCoolerBubbleField(0, "cooler-1", false);
    const late = officeCoolerBubbleField(1800, "cooler-1", false);
    expect(early).toHaveLength(STUDIO_OFFICE_COOLER_BUBBLE_COUNT);
    expect(late).toHaveLength(STUDIO_OFFICE_COOLER_BUBBLE_COUNT);
    for (const bubble of [...early, ...late]) {
      expect(bubble.offsetX).toBeGreaterThanOrEqual(-0.7);
      expect(bubble.offsetX).toBeLessThanOrEqual(0.7);
      expect(bubble.rise).toBeGreaterThanOrEqual(0);
      expect(bubble.rise).toBeLessThan(1);
    }
    expect(early.map((bubble) => bubble.rise)).not.toEqual(late.map((bubble) => bubble.rise));
    expect(officeCoolerBubbleField(0, "cooler-1", true))
      .toEqual(officeCoolerBubbleField(9999, "cooler-1", true));
  });

  it("신규 종류 프레임은 기존 필드 규약(progress·sweep)을 채운다", () => {
    const screen = officePropFrame("screen-glow", 1000, "screen-1", false);
    expect(screen.progress).toBeGreaterThanOrEqual(0);
    expect(screen.sweep).toBe(-1);
    expect(screen.clock).toBeNull();
    const cooler = officePropFrame("cooler-bubbles", 1000, "cooler-1", false);
    expect(cooler.progress).toBeGreaterThanOrEqual(0);
    expect(cooler.intensity).toBeGreaterThanOrEqual(0.4);
    const lamp = officePropFrame("lamp-glow", 1000, "lamp-1", false);
    expect(lamp.intensity).toBeGreaterThan(0);
    expect(lamp.progress).toBe(0);
    const board = officePropFrame("board-shimmer", 1000, "board-1", false);
    expect(board.sweep === -1 || board.intensity > 0).toBe(true);
    const monitor = officePropFrame("monitor-glow", 1000, "desk-1", false);
    expect(monitor.progress).toBe(0);
    expect(monitor.sweep).toBe(-1);
  });
});
