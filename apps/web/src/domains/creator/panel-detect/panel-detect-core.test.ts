import { describe, expect, it } from "vitest";

import { detectPanels, detectPanelsAsync } from "./panel-detect-core";
import {
  BLACK,
  FixtureImage,
  INK,
  PASTEL,
  WHITE,
  rectIou,
  rectNear,
} from "./panel-detect-fixtures";
import { PanelDetectError, type PanelDetectResult, type PanelRect } from "./panel-detect-types";

function rects(result: PanelDetectResult): PanelRect[] {
  return result.panels.map(({ x, y, width, height }) => ({ x, y, width, height }));
}

function expectPanels(result: PanelDetectResult, expected: readonly PanelRect[], tolerance = 1): void {
  expect(result.panels).toHaveLength(expected.length);
  const actual = rects(result);
  expected.forEach((rect, index) => {
    expect(rectNear(actual[index], rect, tolerance), `컷 ${index + 1} 기대 ${JSON.stringify(rect)} 실제 ${JSON.stringify(actual[index])}`).toBe(true);
  });
}

/** 2단 격자 만화 페이지(1200×1700): 위 단 3컷, 아래 단 2컷, 여백 24px, 바깥 여백 40px. */
function mangaPage(background = WHITE, borderColor?: readonly [number, number, number]) {
  const image = new FixtureImage(1200, 1700, background);
  const options = (seed: number) => ({ seed, ...(borderColor ? { borderColor } : {}) });
  const expected: PanelRect[] = [
    image.art(40, 40, 360, 700, options(0)),
    image.art(424, 40, 360, 700, options(1)),
    image.art(808, 40, 352, 700, options(2)),
    image.art(40, 764, 560, 896, options(3)),
    image.art(624, 764, 536, 896, options(4)),
  ];
  return { image, expected };
}

describe("컷 감지 — 격자 배치", () => {
  it("흰 여백 만화 페이지에서 5컷을 정확히 찾고 우→좌·상→하 순서로 정렬한다", () => {
    const { image, expected } = mangaPage();
    const result = detectPanels(image.raster(), { readingOrder: "manga" });
    expect(result.gutter.kind).toBe("white");
    expect(result.analysis.step).toBe(1);
    expect(result.panels.map((panel) => panel.order)).toEqual([1, 2, 3, 4, 5]);
    // 위 단: 오른쪽 → 왼쪽, 아래 단: 오른쪽 → 왼쪽
    expectPanels(result, [expected[2], expected[1], expected[0], expected[4], expected[3]], 0);
    expect(result.undetectable).toEqual([]);
    expect(result.level).toBe("high");
  });

  it("같은 이미지를 코믹(좌→우)·웹툰(상→하) 순서로 정렬한다", () => {
    const { image, expected } = mangaPage();
    const comic = detectPanels(image.raster(), { readingOrder: "comic" });
    expectPanels(comic, [expected[0], expected[1], expected[2], expected[3], expected[4]], 0);
    const webtoon = detectPanels(image.raster(), { readingOrder: "webtoon" });
    expectPanels(webtoon, [expected[0], expected[1], expected[2], expected[3], expected[4]], 0);
  });

  it("검정 여백·파스텔 단색 여백·투명 여백도 같은 컷을 찾는다", () => {
    for (const [background, kind, borderColor] of [
      [BLACK, "black", [235, 235, 235] as const],
      [PASTEL, "solid", undefined],
    ] as const) {
      const { image, expected } = mangaPage(background, borderColor);
      const result = detectPanels(image.raster(), { readingOrder: "comic" });
      expect(result.gutter.kind).toBe(kind);
      expectPanels(result, expected, 0);
    }
    const transparent = new FixtureImage(1200, 1700, null);
    const expected = [
      transparent.art(40, 40, 560, 700),
      transparent.art(624, 40, 536, 700),
      transparent.art(40, 764, 1120, 896, { seed: 2 }),
    ];
    const result = detectPanels(transparent.raster(), { readingOrder: "comic" });
    expect(result.gutter.kind).toBe("transparent");
    expectPanels(result, expected, 0);
  });

  it("L 자 배치(긴 컷 + 쌓인 두 컷)는 열로 먼저 나눈 뒤 오른쪽을 행으로 나눈다", () => {
    const image = new FixtureImage(1200, 1200, WHITE);
    const tall = image.art(40, 40, 500, 1120, { seed: 0 });
    const topRight = image.art(580, 40, 580, 540, { seed: 1 });
    const bottomRight = image.art(580, 620, 580, 540, { seed: 2 });
    const manga = detectPanels(image.raster(), { readingOrder: "manga" });
    expectPanels(manga, [topRight, bottomRight, tall], 0);
    const comic = detectPanels(image.raster(), { readingOrder: "comic" });
    expectPanels(comic, [tall, topRight, bottomRight], 0);
  });

  it("스캔 잡티(채널당 ±10)가 있어도 여백과 컷 경계를 같게 찾는다", () => {
    const { image, expected } = mangaPage();
    image.noise(10, 7);
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expectPanels(result, expected, 1);
  });
});

describe("컷 감지 — 웹툰 세로 스트립", () => {
  it("두께가 제각각인 여백(불균일)과 위아래 바깥 여백을 가진 스트립에서 장면을 위→아래로 찾는다", () => {
    const image = new FixtureImage(720, 5200, WHITE);
    const gaps = [180, 12, 400, 60];
    const heights = [900, 700, 1100, 600, 450];
    let y = 120;
    const expected: PanelRect[] = [];
    heights.forEach((height, index) => {
      expected.push(image.art(0, y, 720, height, { seed: index, border: 0 }));
      y += height + (gaps[index] ?? 0);
    });
    const result = detectPanels(image.raster(), { readingOrder: "webtoon" });
    expectPanels(result, expected, 0);
    expect(result.panels.map((panel) => panel.order)).toEqual([1, 2, 3, 4, 5]);
  });

  it("테두리 없는 장면이 가로 폭 일부만 차지해도(가운데 정렬) 장면 경계를 찾는다", () => {
    const image = new FixtureImage(720, 2400, WHITE);
    const first = image.art(100, 80, 520, 800, { border: 0, seed: 1 });
    const second = image.art(40, 1000, 640, 900, { border: 0, seed: 2 });
    const result = detectPanels(image.raster(), { readingOrder: "webtoon" });
    expectPanels(result, [first, second], 0);
  });
});

describe("컷 감지 — 엣지케이스", () => {
  it("완전 흰 이미지는 컷도 검출 불가도 없고 blank-image 경고만 낸다", () => {
    const result = detectPanels(new FixtureImage(800, 1200, WHITE).raster());
    expect(result.panels).toEqual([]);
    expect(result.undetectable).toEqual([]);
    expect(result.warnings).toContain("blank-image");
    expect(result.confidence).toBe(0);
  });

  it("컷이 하나뿐이면 여백을 잘라 낸 사각형 하나를 높은 신뢰도로 돌려준다", () => {
    const image = new FixtureImage(900, 1300, WHITE);
    const only = image.art(60, 80, 780, 1100);
    const result = detectPanels(image.raster());
    expectPanels(result, [only], 0);
    expect(result.level).toBe("high");
    expect(result.warnings).toEqual([]);
  });

  it("여백이 전혀 없는 전면 삽화는 이미지 전체를 낮은 신뢰도의 컷 하나로 돌려주고 쪼개지 않는다", () => {
    const image = new FixtureImage(600, 900, WHITE);
    image.art(0, 0, 600, 900, { border: 0, balloon: false });
    const result = detectPanels(image.raster());
    expect(result.gutter.kind).toBe("none");
    expectPanels(result, [{ x: 0, y: 0, width: 600, height: 900 }], 0);
    expect(result.warnings).toContain("no-gutter-found");
    expect(result.panels[0].warnings).toContain("no-gutter-found");
    expect(result.level).toBe("low");
  });

  it("컷 사이 여백이 최소 두께보다 얇으면 나누지 않고, 민감도를 높이면 나눈다", () => {
    const image = new FixtureImage(1200, 800, WHITE);
    image.art(40, 40, 560, 720, { seed: 0 });
    image.art(604, 40, 556, 720, { seed: 1 });
    const normal = detectPanels(image.raster(), { readingOrder: "comic", sensitivity: "normal" });
    expect(normal.panels).toHaveLength(1);
    const fine = detectPanels(image.raster(), { readingOrder: "comic", sensitivity: "fine" });
    expect(fine.panels).toHaveLength(2);
  });

  it("페이지 번호 같은 작은 조각은 컷으로 만들지 않고 제외 목록에 남긴다", () => {
    const image = new FixtureImage(1200, 1700, WHITE);
    const upper = image.art(40, 40, 1120, 700, { seed: 0 });
    const lower = image.art(40, 764, 1120, 860, { seed: 1 });
    image.fillRect(560, 1660, 40, 22, BLACK);
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expectPanels(result, [upper, lower], 0);
    expect(result.ignored).toHaveLength(1);
    expect(result.ignored[0].reason).toBe("too-small");
    expect(result.warnings).toContain("ignored-fragments");
  });

  it("최대 깊이에 막혀 더 나누지 못한 컷에는 max-depth-reached 경고와 낮은 점수를 준다", () => {
    const { image } = mangaPage();
    const result = detectPanels(image.raster(), { readingOrder: "comic", maxDepth: 1 });
    expect(result.warnings).toContain("max-depth-reached");
    expect(result.panels.some((panel) => panel.warnings.includes("max-depth-reached"))).toBe(true);
    expect(result.panels.length).toBeLessThan(5);
  });
});

describe("컷 감지 — 큰 이미지 다운샘플", () => {
  it("분석 상한을 넘는 이미지는 정수 배율로 줄여 분석하고 원본 좌표를 ±1px 안에서 되돌려 준다", () => {
    const image = new FixtureImage(1600, 2400, WHITE);
    const expected = [
      image.art(48, 51, 1504, 700, { seed: 0 }),
      image.art(48, 827, 733, 900, { seed: 1 }),
      image.art(821, 827, 731, 900, { seed: 2 }),
      image.art(48, 1803, 1504, 549, { seed: 3 }),
    ];
    const result = detectPanels(image.raster(), { readingOrder: "comic", maxAnalysisPixels: 1_000_000 });
    expect(result.analysis.step).toBe(2);
    expect(result.analysis.width).toBe(800);
    expect(result.warnings).toContain("downsampled");
    expectPanels(result, expected, 1);
    result.panels.forEach((panel, index) => {
      expect(rectIou(panel, expected[index])).toBeGreaterThan(0.99);
    });
  });

  it("배율 4 로 줄여도 컷 개수와 읽기 순서가 같다", () => {
    const image = new FixtureImage(1600, 2400, WHITE);
    image.art(48, 51, 1504, 700, { seed: 0 });
    image.art(48, 827, 733, 900, { seed: 1 });
    image.art(821, 827, 731, 900, { seed: 2 });
    const full = detectPanels(image.raster(), { readingOrder: "manga" });
    const reduced = detectPanels(image.raster(), { readingOrder: "manga", maxAnalysisPixels: 240_000 });
    expect(reduced.analysis.step).toBe(4);
    expect(reduced.panels).toHaveLength(full.panels.length);
    reduced.panels.forEach((panel, index) => {
      expect(rectNear(panel, full.panels[index], 4)).toBe(true);
    });
  });
});

describe("컷 감지 — 기울어진 컷과 겹침은 지어내지 않는다", () => {
  it("사선 여백으로 나뉜 두 컷은 컷으로 채택하지 않고 검출 불가 영역으로 보고한다", () => {
    const image = new FixtureImage(1200, 1200, WHITE);
    image.fillPolygon([[40, 40], [1160, 40], [1160, 700], [40, 500]], [130, 160, 200]);
    image.fillPolygon([[40, 560], [1160, 760], [1160, 1160], [40, 1160]], [200, 140, 120]);
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expect(result.panels).toEqual([]);
    expect(result.undetectable).toHaveLength(1);
    expect(result.undetectable[0].reason).toBe("non-separable");
    expect(result.undetectable[0].componentCount).toBe(2);
    expect(result.warnings).toContain("undetectable-regions");
    expect(result.confidence).toBe(0);
  });

  it("안쪽에 겹쳐 놓은 작은 컷(서로 이어지지 않은 중첩)은 검출 불가로 보고한다", () => {
    const image = new FixtureImage(1200, 1200, WHITE);
    image.art(40, 40, 1120, 1120, { seed: 0, balloon: false });
    // 큰 컷 안에 테두리 간격을 두고 올려놓은 별도 프레임: 바깥 컷의 그림을 가운데에서 비운다.
    image.fillRect(120, 120, 960, 960, WHITE);
    image.art(160, 160, 880, 880, { seed: 3, balloon: false });
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expect(result.panels).toEqual([]);
    expect(result.undetectable).toHaveLength(1);
  });

  it("컷 사이 여백이 없고 테두리만 맞닿은(겹침 의심) 컷은 하나로 두되 경고와 낮은 점수를 준다", () => {
    const image = new FixtureImage(1200, 1400, WHITE);
    image.lineArt(40, 40, 1120, 650, { seed: 0 });
    image.lineArt(40, 690, 1120, 670, { seed: 1 });
    // 맞닿은 부분은 두 테두리가 이어진 6px 두께의 가로선이 되어 이웃 줄보다 뚜렷하게 두드러진다.
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expect(result.panels).toHaveLength(1);
    expect(result.panels[0].warnings).toContain("overlap-suspected");
    expect(result.panels[0].level).not.toBe("high");
  });
});

describe("컷 감지 — 말풍선·효과음이 컷 사이 여백을 가로막은 경우", () => {
  function twoStacked(): FixtureImage {
    const image = new FixtureImage(1200, 1600, WHITE);
    image.art(40, 40, 1120, 700, { seed: 0 });
    image.art(40, 780, 1120, 780, { seed: 1 });
    return image;
  }

  it("효과음 글자가 여백을 가로질러도 컷을 지어내 쪼개지 않고, 경고와 분할 제안 위치를 낸다", () => {
    const image = twoStacked();
    image.fillRect(500, 745, 200, 30, INK);
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expect(result.panels).toHaveLength(1);
    expect(result.panels[0].warnings).toContain("bridged-gutter-suspected");
    expect(result.panels[0].level).toBe("medium");
    expect(result.suggestions).toEqual([
      expect.objectContaining({ panelId: "panel-1", orientation: "horizontal", position: 760, reason: "bridged-gutter" }),
    ]);
  });

  it("말풍선이 두 컷의 테두리 일부까지 덮어도 같은 자리를 제안한다", () => {
    const image = twoStacked();
    for (let y = 640; y < 880; y += 1) {
      for (let x = 400; x < 800; x += 1) {
        const distance = ((x - 600) / 200) ** 2 + ((y - 760) / 120) ** 2;
        if (distance <= 1) image.fillRect(x, y, 1, 1, distance > 0.93 ? INK : WHITE);
      }
    }
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expect(result.panels).toHaveLength(1);
    expect(result.suggestions).toHaveLength(1);
    expect(Math.abs(result.suggestions[0].position - 760)).toBeLessThanOrEqual(20);
  });

  it("좌우로 큰 그림이 남은 흰 면(줄의 46% 가 그림)은 가로막힌 여백으로 보지 않는다", () => {
    const image = new FixtureImage(1200, 1000, WHITE);
    image.art(40, 40, 1120, 920, { seed: 0, balloon: false });
    // 가운데 600px 만 비운 흰 면: 남은 그림이 줄의 절반 가까이라 "얇은 장애물에 막힌 여백"이 아니라 그림의 일부다.
    image.fillRect(300, 300, 600, 50, WHITE);
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expect(result.suggestions).toEqual([]);
    expect(result.panels).toHaveLength(1);
  });
});

describe("컷 감지 — 결정성과 실행 규칙", () => {
  it("같은 입력은 배열 종류와 무관하게 같은 결과를 낸다", () => {
    const { image } = mangaPage();
    const fromClamped = detectPanels(image.raster(), { readingOrder: "manga" });
    const fromPlain = detectPanels(
      { width: image.width, height: image.height, data: Array.from(image.data) },
      { readingOrder: "manga" },
    );
    const again = detectPanels(image.raster(), { readingOrder: "manga" });
    expect(fromPlain).toEqual(fromClamped);
    expect(again).toEqual(fromClamped);
  });

  it("비동기 드라이버도 동기 결과와 같고, 양보하며 진행한다", async () => {
    const { image } = mangaPage();
    let yields = 0;
    const asyncResult = await detectPanelsAsync(image.raster(), { readingOrder: "comic", now: ((): (() => number) => {
      let tick = 0;
      return () => (tick += 20);
    })() }, { yieldNow: async () => { yields += 1; } });
    expect(asyncResult).toEqual(detectPanels(image.raster(), { readingOrder: "comic" }));
    expect(yields).toBeGreaterThan(0);
  });

  it("시간 상한을 넘으면 부분 결과 없이 timeout 으로 끝난다", () => {
    const { image } = mangaPage();
    let tick = 0;
    expect(() => detectPanels(image.raster(), { timeLimitMs: 5, now: () => (tick += 10) }))
      .toThrowError(expect.objectContaining({ code: "timeout" }));
  });

  it("취소 신호가 켜지면 cancelled 로 끝난다", async () => {
    const { image } = mangaPage();
    let cancelled = false;
    const run = detectPanelsAsync(
      image.raster(),
      { isCancelled: () => cancelled },
      { yieldNow: async () => { cancelled = true; } },
    );
    await expect(run).rejects.toMatchObject({ code: "cancelled" });
    expect(() => detectPanels(image.raster(), { isCancelled: () => true })).toThrow(PanelDetectError);
  });

  it("잘못된 입력과 옵션은 오류 코드로 거절한다", () => {
    expect(() => detectPanels({ width: 0, height: 10, data: [] })).toThrowError(expect.objectContaining({ code: "invalid-input" }));
    expect(() => detectPanels({ width: 2, height: 2, data: new Uint8ClampedArray(8) })).toThrowError(expect.objectContaining({ code: "invalid-input" }));
    expect(() => detectPanels({ width: 70_000, height: 1, data: new Uint8ClampedArray(4) })).toThrowError(expect.objectContaining({ code: "too-large" }));
    const raster = new FixtureImage(20, 20, WHITE).raster();
    expect(() => detectPanels(raster, { maxDepth: 0 })).toThrowError(expect.objectContaining({ code: "invalid-options" }));
    expect(() => detectPanels(raster, { sensitivity: "nope" as never })).toThrowError(expect.objectContaining({ code: "invalid-options" }));
  });

  it("컷이 상한을 넘으면 조용히 자르지 않고 too-many-panels 로 끝난다", () => {
    const image = new FixtureImage(1200, 400, WHITE);
    for (let index = 0; index < 8; index += 1) image.art(20 + index * 144, 20, 120, 360, { seed: index, balloon: false });
    expect(() => detectPanels(image.raster(), { maxPanels: 4, sensitivity: "fine" }))
      .toThrowError(expect.objectContaining({ code: "too-many-panels" }));
  });
});
