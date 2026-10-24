import Module from "node:module";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  booleanVectorPaths,
  mergeBubbleChain,
  mergeBubbleWithTail,
  pointsToPolylinePathData,
  sanitizeLineartPoints,
  simplifyVectorPath,
  vectorizeLineartStroke,
} from "./studio-lineart-vectorizer";

interface NodeModuleLoader {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
}

const nodeModuleLoader = Module as unknown as NodeModuleLoader;
const originalNodeModuleLoad = nodeModuleLoader._load;

// Paper.js Node 어댑터가 jsdom canvas 를 opportunistic 하게 시도하는 것을 차단.
// (studio-engine-vector-geometry-provider.test.ts 와 동일한 패턴)
beforeAll(() => {
  nodeModuleLoader._load = function loadWithoutOptionalJsdom(
    request: string,
    parent: unknown,
    isMain: boolean,
  ): unknown {
    if (request === "jsdom") throw new Error("Paper geometry test omits optional jsdom");
    return originalNodeModuleLoad.call(this, request, parent, isMain);
  };
});

afterAll(() => {
  nodeModuleLoader._load = originalNodeModuleLoad;
});

describe("sanitizeLineartPoints & pointsToPolylinePathData", () => {
  it("점열을 M/L 폴리라인으로 변환하고 closed 옵션 시 Z를 붙인다", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10.5, y: 20.25 },
      { x: 30, y: 40 },
    ];
    expect(pointsToPolylinePathData(pts)).toBe("M0 0L10.5 20.25L30 40");
    expect(pointsToPolylinePathData(pts, { closed: true })).toBe(
      "M0 0L10.5 20.25L30 40Z",
    );
  });

  it("빈 점열은 빈 문자열을 반환한다", () => {
    expect(pointsToPolylinePathData([])).toBe("");
  });

  it("점 하나는 M만 반환한다", () => {
    expect(pointsToPolylinePathData([{ x: 5, y: 7 }])).toBe("M5 7");
  });

  it("NaN/Infinity 및 연속 중복 점(minStepPx 미만)을 걸러낸다", () => {
    const cleaned = sanitizeLineartPoints([
      { x: 0, y: 0 },
      { x: 0.01, y: 0.01 }, // 중복
      { x: Number.NaN, y: 10 },
      { x: 10, y: 20 },
      { x: 10, y: 20 }, // 중복
      { x: 30, y: 40 },
    ]);
    expect(cleaned).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });
});

describe("vectorizeLineartStroke", () => {
  it("유효한 점이 2개 미만이면 실패한다", async () => {
    const result = await vectorizeLineartStroke([
      { x: 0, y: 0 },
      { x: 0, y: 0 }, // 중복 제거 후 1개만 남음
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("최소 2개");
  });

  it("직선 점열을 스무딩된 벡터 패스로 변환한다", async () => {
    const points = Array.from({ length: 10 }, (_, i) => ({
      x: i * 10,
      y: 50 + Math.sin(i) * 2,
    }));
    const result = await vectorizeLineartStroke(points);
    expect(result.ok).toBe(true);
    expect(result.closed).toBe(false);
    expect(result.pathData.length).toBeGreaterThan(0);
  });

  it("closeLoopThresholdPx 이내의 시작·끝 점열은 닫힌 루프(closed=true, Z)로 스무딩한다", async () => {
    const circlePts = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return { x: 50 + Math.cos(a) * 30, y: 50 + Math.sin(a) * 30 };
    });
    const result = await vectorizeLineartStroke(circlePts, {
      closeLoopThresholdPx: 15,
    });
    expect(result.ok).toBe(true);
    expect(result.closed).toBe(true);
    expect(result.pathData.endsWith("Z") || result.pathData.endsWith("z")).toBe(
      true,
    );
  });

  it("simplifyTolerance 를 주면 단순화까지 적용된다", async () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      x: i * 5,
      y: 50,
    }));
    const result = await vectorizeLineartStroke(points, {
      simplifyTolerance: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.pathData.length).toBeGreaterThan(0);
  });
});

describe("mergeBubbleWithTail / mergeBubbleChain / booleanVectorPaths", () => {
  it("pathData 가 비어 있으면 실패한다", async () => {
    const result = await mergeBubbleWithTail("", "M0 0L10 10Z");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("모두 필요");
  });

  it("겹치는 사각형 두 개를 합성한다", async () => {
    const bubble = "M0 0H100V100H0Z";
    const tail = "M50 50H150V150H50Z";
    const result = await mergeBubbleWithTail(bubble, tail);
    expect(result.ok).toBe(true);
    expect(result.pathData.length).toBeGreaterThan(0);
  });

  it("3개 이상의 연결 말풍선 체인(mergeBubbleChain)을 단일 윤곽선으로 합성한다", async () => {
    const b1 = "M0 0H80V60H0Z";
    const b2 = "M60 20H140V80H60Z";
    const tail = "M120 70L160 110L110 80Z";
    const result = await mergeBubbleChain([b1, b2, tail]);
    expect(result.ok).toBe(true);
    expect(result.closed).toBe(true);
    expect(result.pathData.length).toBeGreaterThan(0);
  });

  it("booleanVectorPaths subtract 연산으로 말풍선 꼬리/프레임 컷아웃을 수행한다", async () => {
    const outer = "M0 0H100V100H0Z";
    const cutter = "M50 50H120V120H50Z";
    const subtracted = await booleanVectorPaths(outer, cutter, "subtract");
    expect(subtracted.ok).toBe(true);
    expect(subtracted.pathData.length).toBeGreaterThan(0);
  });
});

describe("simplifyVectorPath", () => {
  it("빈 pathData 는 실패한다", async () => {
    const result = await simplifyVectorPath("", 1);
    expect(result.ok).toBe(false);
  });

  it("음수 tolerance 는 실패한다", async () => {
    const result = await simplifyVectorPath("M0 0L10 10", -1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("tolerance");
  });

  it("지그재그 패스를 단순화한다", async () => {
    const zigzag =
      "M0 0" +
      Array.from({ length: 20 }, (_, i) => `L${i * 5} ${(i % 2) * 10}`).join("");
    const inputSegments = (zigzag.match(/L/g) ?? []).length;
    const result = await simplifyVectorPath(zigzag, 2);
    expect(result.ok).toBe(true);
    const outputSegments = (result.pathData.match(/[CL]/g) ?? []).length;
    expect(outputSegments).toBeLessThan(inputSegments);
  });
});
