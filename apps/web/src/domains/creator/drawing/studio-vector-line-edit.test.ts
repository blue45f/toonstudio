import { describe, expect, it } from "vitest";

import {
  STUDIO_VECTOR_LINE_MIN_WIDTH_PX,
  brushAdjustVectorLineWidth,
  clearVectorLineHistory,
  connectVectorLines,
  createVectorLineCommand,
  deleteControlPoint,
  editableLineFromVectorizerPoints,
  emptyVectorLineHistory,
  eraseVectorLineToIntersection,
  estimateWidthFromPressure,
  insertControlPoint,
  insertControlPointAt,
  moveControlPoint,
  normalizeWidthRange,
  pinchVectorLine,
  pushVectorLineCommand,
  redoVectorLine,
  scaleWidthInRange,
  setWidthInRange,
  simplifyVectorLine,
  taperWidthInRange,
  undoVectorLine,
  vectorLineOutlinePathData,
  type StudioEditableVectorLine,
} from "./studio-vector-line-edit";

function sampleLine(widths?: number[]): StudioEditableVectorLine {
  const line = editableLineFromVectorizerPoints(
    Array.from({ length: 8 }, (_, i) => ({
      x: i * 20,
      y: 50 + (i % 2) * 2,
      pressure: 0.5,
    })),
    { id: "test-line", color: "#123456" },
  );
  if (!line) throw new Error("샘플 선 생성 실패");
  if (!widths) return line;
  return {
    ...line,
    points: line.points.map((p, i) => ({ ...p, width: widths[i] ?? p.width })),
  };
}

describe("editableLineFromVectorizerPoints", () => {
  it("점이 2개 미만이면 null 을 반환한다", () => {
    expect(editableLineFromVectorizerPoints([])).toBeNull();
    expect(editableLineFromVectorizerPoints([{ x: 0, y: 0 }])).toBeNull();
  });

  it("벡터라이저 입력에서 중심선+선폭 모델을 만든다", () => {
    const line = editableLineFromVectorizerPoints(
      [
        { x: 0, y: 0, pressure: 0.2 },
        { x: 10, y: 0, pressure: 0.9 },
      ],
      { size: 20, thinning: 0.8 },
    );
    expect(line).not.toBeNull();
    expect(line!.points).toHaveLength(2);
    expect(line!.points[0]!.x).toBe(0);
    // 필압이 높을수록 선폭이 크다
    expect(line!.points[1]!.width).toBeGreaterThan(line!.points[0]!.width);
  });

  it("ID 를 자동 발급하고 색상 기본값을 둔다", () => {
    const a = editableLineFromVectorizerPoints([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
    const b = editableLineFromVectorizerPoints([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
    expect(a!.id).not.toBe(b!.id);
    expect(a!.color).toBeTruthy();
  });
});

describe("estimateWidthFromPressure", () => {
  it("thinning=0 이면 필압과 무관하게 일정하다", () => {
    const a = estimateWidthFromPressure(20, 0, 0.1);
    const b = estimateWidthFromPressure(20, 0, 0.9);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeCloseTo(20, 6);
  });

  it("필압이 높을수록 굵어진다", () => {
    expect(estimateWidthFromPressure(20, 0.8, 0.9)).toBeGreaterThan(
      estimateWidthFromPressure(20, 0.8, 0.1),
    );
  });

  it("비정상 입력에도 최소 폭을 보장한다", () => {
    expect(estimateWidthFromPressure(NaN, 0.5, 0.5)).toBeGreaterThan(0);
    expect(estimateWidthFromPressure(0, 0.5, 0)).toBe(
      STUDIO_VECTOR_LINE_MIN_WIDTH_PX,
    );
  });
});

describe("normalizeWidthRange", () => {
  it("범위를 클램프하고 정렬한다", () => {
    expect(normalizeWidthRange(8, 6, 2)).toEqual({ startIndex: 2, endIndex: 6 });
    expect(normalizeWidthRange(8, -5, 99)).toEqual({ startIndex: 0, endIndex: 7 });
  });

  it("점이 없으면 빈 구간을 반환한다", () => {
    expect(normalizeWidthRange(0, 0, 3)).toEqual({ startIndex: 0, endIndex: -1 });
  });
});

describe("구간 선폭 편집", () => {
  it("scaleWidthInRange: 구간만 늘이기/줄이기", () => {
    const line = sampleLine([10, 10, 10, 10, 10, 10, 10, 10]);
    const scaled = scaleWidthInRange(line, normalizeWidthRange(8, 2, 5), 2);
    expect(scaled.points[0]!.width).toBe(10);
    expect(scaled.points[2]!.width).toBe(20);
    expect(scaled.points[5]!.width).toBe(20);
    expect(scaled.points[6]!.width).toBe(10);

    const reduced = scaleWidthInRange(line, normalizeWidthRange(8, 0, 7), 0.5);
    expect(reduced.points[3]!.width).toBe(5);
  });

  it("배율은 상한으로 클램프된다", () => {
    const line = sampleLine([10, 10]);
    const scaled = scaleWidthInRange(line, normalizeWidthRange(2, 0, 1), 999);
    expect(scaled.points[0]!.width).toBeLessThanOrEqual(10 * 8);
  });

  it("setWidthInRange: 절대값 설정", () => {
    const line = sampleLine([10, 20, 30]);
    const result = setWidthInRange(line, normalizeWidthRange(3, 1, 2), 7);
    expect(result.points[0]!.width).toBe(10);
    expect(result.points[1]!.width).toBe(7);
    expect(result.points[2]!.width).toBe(7);
  });

  it("taperWidthInRange toEnd: 구간 끝으로 갈수록 가늘어진다", () => {
    const line = sampleLine([20, 20, 20, 20, 20, 20, 20, 20]);
    const tapered = taperWidthInRange(line, normalizeWidthRange(8, 0, 4), {
      direction: "toEnd",
      endFactor: 0.1,
    });
    const widths = tapered.points.map((p) => p.width);
    expect(widths[0]).toBeCloseTo(20, 6);
    expect(widths[4]).toBeCloseTo(2, 6);
    for (let i = 1; i <= 4; i += 1) {
      expect(widths[i]).toBeLessThanOrEqual(widths[i - 1]!);
    }
    // 구간 밖은 그대로
    expect(widths[5]).toBe(20);
  });

  it("taperWidthInRange toStart: 반대 방향", () => {
    const line = sampleLine([20, 20, 20, 20, 20]);
    const tapered = taperWidthInRange(line, normalizeWidthRange(5, 0, 4), {
      direction: "toStart",
      endFactor: 0.1,
    });
    expect(tapered.points[0]!.width).toBeCloseTo(2, 6);
    expect(tapered.points[4]!.width).toBeCloseTo(20, 6);
  });

  it("taperWidthInRange bothEnds: 가운데가 가장 굵다", () => {
    const line = sampleLine([20, 20, 20, 20, 20]);
    const tapered = taperWidthInRange(line, normalizeWidthRange(5, 0, 4), {
      direction: "bothEnds",
      endFactor: 0.2,
    });
    const widths = tapered.points.map((p) => p.width);
    expect(widths[2]).toBeCloseTo(20, 6);
    expect(widths[0]).toBeCloseTo(4, 6);
    expect(widths[4]).toBeCloseTo(4, 6);
  });

  it("원본 선은 변경하지 않는다 (불변)", () => {
    const line = sampleLine([10, 10, 10]);
    scaleWidthInRange(line, normalizeWidthRange(3, 0, 2), 3);
    expect(line.points[0]!.width).toBe(10);
  });
});

describe("컨트롤 포인트 편집", () => {
  it("moveControlPoint: 위치만 바꾸고 선폭은 유지", () => {
    const line = sampleLine([12, 12, 12]);
    const moved = moveControlPoint(line, 1, 100, 200);
    expect(moved.points[1]).toEqual({ x: 100, y: 200, width: 12 });
    expect(moved.points[0]).toEqual(line.points[0]);
  });

  it("moveControlPoint: 잘못된 인덱스는 무시", () => {
    const line = sampleLine();
    expect(moveControlPoint(line, 99, 0, 0)).toBe(line);
  });

  it("deleteControlPoint: 가운데 점을 지운다", () => {
    const line = sampleLine();
    const deleted = deleteControlPoint(line, 3);
    expect(deleted.points).toHaveLength(line.points.length - 1);
    expect(deleted.points[3]).toEqual(line.points[4]);
  });

  it("deleteControlPoint: 2개 이하로 줄이면 무시", () => {
    const line = editableLineFromVectorizerPoints([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ])!;
    expect(line.points).toHaveLength(2);
    expect(deleteControlPoint(line, 0)).toBe(line);
  });

  it("insertControlPoint: 선분 위에 보간된 점을 끼운다", () => {
    const base = editableLineFromVectorizerPoints(
      [
        { x: 0, y: 0, pressure: 0.2 },
        { x: 100, y: 0, pressure: 0.8 },
      ],
      { size: 20, thinning: 1 },
    )!;
    const inserted = insertControlPoint(base, 0, 0.5);
    expect(inserted.points).toHaveLength(3);
    const mid = inserted.points[1]!;
    expect(mid.x).toBeCloseTo(50, 6);
    expect(mid.y).toBeCloseTo(0, 6);
    // 선폭도 선형 보간
    expect(mid.width).toBeCloseTo((base.points[0]!.width + base.points[1]!.width) / 2, 6);
  });

  it("insertControlPointAt: 가장 가까운 선분을 찾아 끼운다", () => {
    const line = editableLineFromVectorizerPoints([
      { x: 0, y: 50, pressure: 0.5 },
      { x: 40, y: 50, pressure: 0.5 },
      { x: 80, y: 50, pressure: 0.5 },
    ])!;
    const inserted = insertControlPointAt(line, 60, 300);
    expect(inserted.points).toHaveLength(line.points.length + 1);
    // 1~2번 앵커 사이 선분의 중점에 끼워진다
    const added = inserted.points.find((p) => p.x === 60 && p.y === 50);
    expect(added).toBeDefined();
  });
});

describe("simplifyVectorLine", () => {
  it("일직선상의 중간 앵커를 제거한다", () => {
    const line = editableLineFromVectorizerPoints(
      Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 50, pressure: 0.5 })),
    )!;
    const simplified = simplifyVectorLine(line, 1);
    expect(simplified.points.length).toBeLessThan(line.points.length);
    // 양 끝점은 유지
    expect(simplified.points[0]).toEqual(line.points[0]);
    expect(simplified.points[simplified.points.length - 1]).toEqual(
      line.points[line.points.length - 1],
    );
  });

  it("tolerance 0 이면 변경하지 않는다", () => {
    const line = sampleLine();
    expect(simplifyVectorLine(line, 0)).toBe(line);
  });

  it("살아남은 앵커의 선폭을 유지한다", () => {
    const line = sampleLine([5, 6, 7, 8, 9, 10, 11, 12]);
    const simplified = simplifyVectorLine(line, 1);
    expect(simplified.points[0]!.width).toBe(5);
    expect(simplified.points[simplified.points.length - 1]!.width).toBe(12);
  });
});

describe("커맨드 모델 (되돌리기)", () => {
  it("push → undo → redo 가 before/after 스냅샷을 오간다", () => {
    const before = sampleLine([10, 10, 10]);
    const after = scaleWidthInRange(before, normalizeWidthRange(3, 0, 2), 2);
    const command = createVectorLineCommand("선폭 늘이기", before, after);

    let history = pushVectorLineCommand(emptyVectorLineHistory(), command);
    const undone = undoVectorLine(history);
    expect(undone).not.toBeNull();
    expect(undone!.stroke.points[0]!.width).toBe(10);
    history = undone!.history;

    const redone = redoVectorLine(history);
    expect(redone).not.toBeNull();
    expect(redone!.stroke.points[0]!.width).toBe(20);
  });

  it("빈 스택에서는 null", () => {
    expect(undoVectorLine(emptyVectorLineHistory())).toBeNull();
    expect(redoVectorLine(emptyVectorLineHistory())).toBeNull();
  });

  it("새 커맨드는 redo 스택을 비운다", () => {
    const before = sampleLine([10, 10]);
    const after = scaleWidthInRange(before, normalizeWidthRange(2, 0, 1), 2);
    let history = pushVectorLineCommand(
      emptyVectorLineHistory(),
      createVectorLineCommand("a", before, after),
    );
    history = undoVectorLine(history)!.history;
    expect(history.future).toHaveLength(1);
    history = pushVectorLineCommand(
      history,
      createVectorLineCommand("b", after, before),
    );
    expect(history.future).toHaveLength(0);
    expect(redoVectorLine(history)).toBeNull();
  });

  it("clearVectorLineHistory 로 초기화", () => {
    const before = sampleLine([10, 10]);
    const history = pushVectorLineCommand(
      emptyVectorLineHistory(),
      createVectorLineCommand("a", before, before),
    );
    const cleared = clearVectorLineHistory();
    expect(cleared.past).toHaveLength(0);
    expect(cleared.future).toHaveLength(0);
    expect(history.past).toHaveLength(1);
  });
});

describe("vectorLineOutlinePathData", () => {
  it("점이 2개 미만이면 빈 문자열", () => {
    const line = sampleLine();
    expect(vectorLineOutlinePathData({ ...line, points: [] })).toBe("");
    expect(
      vectorLineOutlinePathData({ ...line, points: [line.points[0]!] }),
    ).toBe("");
  });

  it("외곽선 path data 를 만든다", () => {
    const line = sampleLine([10, 10, 10]);
    const d = vectorLineOutlinePathData(line);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("선폭이 크면 외곽선도 커진다", () => {
    const make = (width: number): StudioEditableVectorLine => {
      const line = editableLineFromVectorizerPoints([
        { x: 0, y: 0, pressure: 0.5 },
        { x: 100, y: 0, pressure: 0.5 },
      ])!;
      return { ...line, points: line.points.map((p) => ({ ...p, width })) };
    };
    const thin = vectorLineOutlinePathData(make(10));
    const thick = vectorLineOutlinePathData(make(30));
    expect(thick.length).toBeGreaterThan(thin.length);
    // 굵은 선의 외곽선은 y=±15 까지 벌어진다
    expect(thick).toContain("15");
    expect(thin).not.toContain("15");
  });
});

describe("CSP 벡터 레이어 심화 편집 (곡선 집기·선폭 브러시·교차점 지우개·선 연결)", () => {
  it("pinchVectorLine: 코사인 벨 감쇠로 기준점 주변만 부드럽게 밀고 양 끝점을 고정할 수 있다", () => {
    const line = editableLineFromVectorizerPoints(
      Array.from({ length: 5 }, (_, i) => ({ x: i * 25, y: 50, pressure: 0.5 })),
      { id: "pinch-target" },
    )!;
    const pinched = pinchVectorLine(line, {
      originX: 50,
      originY: 50,
      deltaX: 0,
      deltaY: -20,
      pinchRadiusPx: 60,
      fixEndpoints: "both",
    });
    expect(pinched.points[0]!.y).toBe(50);
    expect(pinched.points[4]!.y).toBe(50);
    expect(pinched.points[2]!.y).toBeCloseTo(30, 5);
    expect(pinched.points[1]!.y).toBeLessThan(50);
    expect(pinched.points[1]!.y).toBeGreaterThan(30);
  });

  it("brushAdjustVectorLineWidth: 브러시 반경 내 제어점만 방사형으로 굵기를 조절한다", () => {
    const line = sampleLine([10, 10, 10, 10, 10, 10, 10, 10]);
    const adjusted = brushAdjustVectorLineWidth(line, {
      x: line.points[3]!.x,
      y: line.points[3]!.y,
      radiusPx: 25,
      mode: "add",
      amount: 6,
    });
    expect(adjusted.points[3]!.width).toBeCloseTo(16, 4);
    expect(adjusted.points[0]!.width).toBe(10);
    expect(adjusted.points[7]!.width).toBe(10);
  });

  it("eraseVectorLineToIntersection: 교차점 지우개가 삐져나온 꼬리 구간만 정확히 잘라낸다", () => {
    const horizontal: StudioEditableVectorLine = {
      id: "horiz",
      color: "#111111",
      closed: false,
      points: [
        { x: 0, y: 50, width: 8 },
        { x: 50, y: 50, width: 8 },
        { x: 100, y: 50, width: 8 },
      ],
    };
    const verticalCutter: StudioEditableVectorLine = {
      id: "vert",
      color: "#111111",
      closed: false,
      points: [
        { x: 60, y: 0, width: 8 },
        { x: 60, y: 100, width: 8 },
      ],
    };
    // 오른쪽 삐져나온 꼬리(x=85, y=50)를 지우개로 터치하면 x=60 교차점까지만 잘리고 왼쪽(0..60)만 남는다.
    const trimmed = eraseVectorLineToIntersection(horizontal, [verticalCutter], {
      x: 85,
      y: 50,
      radiusPx: 16,
    });
    expect(trimmed).toHaveLength(1);
    const survivor = trimmed[0]!;
    expect(survivor.points[0]!.x).toBeCloseTo(0, 4);
    expect(survivor.points[survivor.points.length - 1]!.x).toBeCloseTo(60, 4);
  });

  it("eraseVectorLineToIntersection: 두 교차선 사이의 가운데 구간을 지우면 양쪽 두 선으로 분할된다", () => {
    const horizontal: StudioEditableVectorLine = {
      id: "horiz-mid",
      color: "#111111",
      closed: false,
      points: [
        { x: 0, y: 50, width: 8 },
        { x: 100, y: 50, width: 8 },
      ],
    };
    const cutterLeft: StudioEditableVectorLine = {
      id: "cut-l",
      color: "#111111",
      closed: false,
      points: [
        { x: 30, y: 0, width: 8 },
        { x: 30, y: 100, width: 8 },
      ],
    };
    const cutterRight: StudioEditableVectorLine = {
      id: "cut-r",
      color: "#111111",
      closed: false,
      points: [
        { x: 70, y: 0, width: 8 },
        { x: 70, y: 100, width: 8 },
      ],
    };
    const split = eraseVectorLineToIntersection(horizontal, [cutterLeft, cutterRight], {
      x: 50,
      y: 50,
      radiusPx: 16,
    });
    expect(split).toHaveLength(2);
    expect(split[0]!.points[split[0]!.points.length - 1]!.x).toBeCloseTo(30, 4);
    expect(split[1]!.points[0]!.x).toBeCloseTo(70, 4);
  });

  it("connectVectorLines: 인접한 두 열린 벡터 선의 끝점을 스냅하여 하나의 선으로 연결한다", () => {
    const lineA: StudioEditableVectorLine = {
      id: "seg-a",
      color: "#222222",
      closed: false,
      points: [
        { x: 0, y: 0, width: 6 },
        { x: 40, y: 0, width: 10 },
      ],
    };
    const lineB: StudioEditableVectorLine = {
      id: "seg-b",
      color: "#222222",
      closed: false,
      points: [
        { x: 44, y: 2, width: 14 },
        { x: 90, y: 2, width: 8 },
      ],
    };
    const connected = connectVectorLines(lineA, lineB, 10);
    expect(connected).not.toBeNull();
    expect(connected!.points).toHaveLength(3);
    expect(connected!.points[1]!.x).toBeCloseTo(42, 4);
    expect(connected!.points[1]!.width).toBeCloseTo(12, 4);
    expect(connectVectorLines(lineA, lineB, 2)).toBeNull();
  });
});

