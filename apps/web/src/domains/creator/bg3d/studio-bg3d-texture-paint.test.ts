import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_TEXTURE_PAINT_MAX_STROKES,
  STUDIO_BG3D_TEXTURE_PAINT_MAX_TOTAL_POINTS,
  StudioBg3dTexturePaintSurface,
  appendStudioBg3dTexturePaintStroke,
  beginStudioBg3dTexturePaintStroke,
  countStudioBg3dTexturePaintPoints,
  extendStudioBg3dTexturePaintStroke,
  extractStudioBg3dTexturePaintUv,
  finishStudioBg3dTexturePaintStroke,
  normalizeStudioBg3dTexturePaint,
  paintStudioBg3dTexture,
  removeLastStudioBg3dTexturePaintStroke,
  type StudioBg3dPaintCanvas,
  type StudioBg3dPaintCanvas2d,
  type StudioBg3dTexturePaintStroke,
} from "./studio-bg3d-texture-paint";

/** 호출을 기록하는 최소 2D 컨텍스트 — 래스터 좌표·순서를 픽셀 대신 호출 단위로 고정한다. */
function createRecordingContext() {
  const calls: Array<readonly [string, ...number[]]> = [];
  const context: StudioBg3dPaintCanvas2d & { calls: typeof calls } = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "",
    lineJoin: "",
    calls,
    fillRect: (x, y, w, h) => void calls.push(["fillRect", x, y, w, h]),
    beginPath: () => void calls.push(["beginPath"]),
    moveTo: (x, y) => void calls.push(["moveTo", x, y]),
    lineTo: (x, y) => void calls.push(["lineTo", x, y]),
    stroke: () => void calls.push(["stroke"]),
    arc: (x, y, r) => void calls.push(["arc", x, y, r]),
    fill: () => void calls.push(["fill"]),
  };
  return context;
}

function createFakeCanvas(width: number, height: number, context: StudioBg3dPaintCanvas2d) {
  const canvas: StudioBg3dPaintCanvas & { exportedWith: string[] } = {
    width,
    height,
    exportedWith: [],
    getContext: () => context,
    toDataURL: (type) => {
      canvas.exportedWith.push(type ?? "");
      return "data:image/png;base64,FAKE";
    },
  };
  return canvas;
}

const stroke: StudioBg3dTexturePaintStroke = {
  color: "#e11d48",
  size: 0.04,
  opacity: 1,
  points: [
    [0.1, 0.2],
    [0.5, 0.6],
  ],
};

/** append/표면 경유 시 정규화(UV 1/4096 양자화)를 거친 획의 기대 형태. */
const normalizedStroke: StudioBg3dTexturePaintStroke = {
  color: "#e11d48",
  size: 0.04,
  opacity: 1,
  points: [
    [0.10009765625, 0.199951171875],
    [0.5, 0.60009765625],
  ],
};

describe("normalizeStudioBg3dTexturePaint", () => {
  it("유효한 획은 색을 정규화하고 UV를 0..1로 고정해 통과시킨다", () => {
    const paint = normalizeStudioBg3dTexturePaint({
      version: 1,
      strokes: [{ color: "#E11D48", size: 0.04, opacity: 1, points: [[-1, 2], [0.5, 0.5]] }],
    });
    expect(paint?.strokes[0]?.color).toBe("#e11d48");
    expect(paint?.strokes[0]?.points[0]).toEqual([0, 1]);
  });

  it("획이 없거나 전부 무효하면 null이다", () => {
    expect(normalizeStudioBg3dTexturePaint(null)).toBeNull();
    expect(normalizeStudioBg3dTexturePaint({ strokes: [] })).toBeNull();
    expect(normalizeStudioBg3dTexturePaint({ strokes: [{ color: "#fff", points: [] }] })).toBeNull();
    expect(normalizeStudioBg3dTexturePaint({ strokes: [{ points: [["x", 0]] }] })).toBeNull();
  });

  it("획 수 한도를 강제한다", () => {
    const strokes = Array.from({ length: STUDIO_BG3D_TEXTURE_PAINT_MAX_STROKES + 5 }, () => stroke);
    const paint = normalizeStudioBg3dTexturePaint({ version: 1, strokes });
    expect(paint?.strokes.length).toBe(STUDIO_BG3D_TEXTURE_PAINT_MAX_STROKES);
  });
});

describe("획 연산 (추가·Undo·Redo 계약)", () => {
  it("추가한 획은 removeLast로 정확히 분리되고 빈 페인트는 null로 돌아간다", () => {
    const paint = appendStudioBg3dTexturePaintStroke(null, stroke);
    expect(paint?.strokes).toHaveLength(1);
    const { paint: afterUndo, removed } = removeLastStudioBg3dTexturePaintStroke(paint);
    expect(removed).toEqual(normalizedStroke);
    expect(afterUndo).toBeNull();
    const redone = appendStudioBg3dTexturePaintStroke(afterUndo, removed!);
    expect(redone?.strokes).toEqual([normalizedStroke]);
  });

  it("점 총량 한도를 넘기는 획은 조용히 자르지 않고 null로 거부한다", () => {
    const bigStroke: StudioBg3dTexturePaintStroke = {
      ...stroke,
      points: Array.from({ length: 512 }, (_, i) => [i / 512, 0.5] as const),
    };
    let paint = appendStudioBg3dTexturePaintStroke(null, bigStroke);
    let guard = 0;
    while (paint && guard < 40) {
      const next = appendStudioBg3dTexturePaintStroke(paint, bigStroke);
      if (!next) break;
      paint = next;
      guard += 1;
    }
    expect(countStudioBg3dTexturePaintPoints(paint)).toBeLessThanOrEqual(
      STUDIO_BG3D_TEXTURE_PAINT_MAX_TOTAL_POINTS,
    );
    expect(appendStudioBg3dTexturePaintStroke(paint, bigStroke)).toBeNull();
  });
});

describe("포인터 → UV 투영", () => {
  it("Three 교차 객체의 uv를 읽고, uv가 없으면 그릴 수 없음을 null로 알린다", () => {
    expect(extractStudioBg3dTexturePaintUv({ uv: { x: 0.25, y: 0.75 } })).toEqual([0.25, 0.75]);
    expect(extractStudioBg3dTexturePaintUv({ uv: [0.5, 0.5] })).toEqual([0.5, 0.5]);
    expect(extractStudioBg3dTexturePaintUv({ point: { x: 1, y: 2, z: 3 } })).toBeNull();
    expect(extractStudioBg3dTexturePaintUv(null)).toBeNull();
  });

  it("획 초안은 너무 가까운 샘플을 버리고 점 1개로도 확정된다", () => {
    let draft = beginStudioBg3dTexturePaintStroke({ color: "#000000", size: 0.04, uv: [0.5, 0.5] });
    draft = extendStudioBg3dTexturePaintStroke(draft, [0.5001, 0.5001]);
    expect(draft.points).toHaveLength(1);
    draft = extendStudioBg3dTexturePaintStroke(draft, [0.6, 0.5]);
    expect(draft.points).toHaveLength(2);
    expect(finishStudioBg3dTexturePaintStroke(draft)?.points).toHaveLength(2);
  });
});

describe("래스터화·복구·내보내기", () => {
  it("바탕을 먼저 깔고 획을 UV→캔버스 좌표(y 뒤집기)로 그린다", () => {
    const context = createRecordingContext();
    paintStudioBg3dTexture(context, { version: 1, strokes: [stroke] }, {
      width: 512,
      height: 512,
      baseColor: "#9fb4c9",
    });
    expect(context.calls[0]).toEqual(["fillRect", 0, 0, 512, 512]);
    expect(context.calls).toContainEqual(["moveTo", 0.1 * 512, (1 - 0.2) * 512]);
    expect(context.calls).toContainEqual(["lineTo", 0.5 * 512, (1 - 0.6) * 512]);
    expect(context.calls[context.calls.length - 1]).toEqual(["stroke"]);
  });

  it("표면은 획 확정·Undo·컨텍스트 손실 복구에서 같은 호출 순서를 재생한다", () => {
    const context = createRecordingContext();
    const surface = new StudioBg3dTexturePaintSurface({
      createCanvas: (w, h) => createFakeCanvas(w, h, context),
      baseColor: "#9fb4c9",
    });
    expect(surface.commitStroke(stroke)).toBe(true);
    expect(surface.currentPaint?.strokes).toHaveLength(1);
    const before = context.calls.length;
    surface.recoverFromContextLoss();
    const replay = context.calls.slice(before);
    // 복구는 바탕부터 다시 그리는 전체 재래스터여야 한다 — 부분 재생은 손실 복구가 아니다.
    expect(replay[0]).toEqual(["fillRect", 0, 0, 512, 512]);
    expect(replay).toContainEqual(["stroke"]);
    expect(surface.undoLastStroke()).toEqual(normalizedStroke);
    expect(surface.currentPaint).toBeNull();
  });

  it("내보내기는 PNG data URL을 만든다", () => {
    const context = createRecordingContext();
    const canvas = createFakeCanvas(512, 512, context);
    const surface = new StudioBg3dTexturePaintSurface({
      createCanvas: () => canvas,
      baseColor: "#ffffff",
      paint: { version: 1, strokes: [stroke] },
    });
    expect(surface.exportPngDataUrl()).toBe("data:image/png;base64,FAKE");
    expect(canvas.exportedWith).toEqual(["image/png"]);
  });
});
