// @vitest-environment jsdom
/**
 * 글로벌 마스터 무료 기본 브러시 60종 통합 검증 테스트.
 * - 60종 고유 ID · 12카테고리 × 5종 균형 · 60/60 고유 물리 지문 · 100% freeByDefault
 * - generateMasterBrushDabs 결정론 · 60종 2D Canvas 스트로크 렌더링
 * - 검색 · 카테고리/경쟁사 필터 · 선택 콜백 · 라이브 테스트 패드 · EN 모드 한글 0자
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GLOBAL_MASTER_BRUSH_CATALOG,
  GLOBAL_MASTER_BRUSH_CATEGORIES,
  GLOBAL_MASTER_BRUSH_COUNTS,
  computeGlobalMasterBrushFingerprint,
  filterGlobalMasterBrushes,
  formatGlobalMasterCountBadge,
} from "./global-master-brush-catalog";
import {
  buildMasterBrushSamplePoints,
  generateMasterBrushDabs,
  renderMasterBrushStrokeSample,
} from "./global-master-brush-renderer";
import { GlobalMasterBrushGalleryPanel } from "./GlobalMasterBrushGalleryPanel";

const HANGUL_REGEX = /[가-힣ㄱ-ㅎㅏ-ㅣ]/u;

const EXPECTED_60_KO_NAMES: readonly string[] = [
  // webtoon-ink
  "리얼 G펜 프로", "마루펜 극세선", "거친 만화 먹펜", "스피드 딥펜 하드", "사인펜 카툰 라이너",
  // rofan-deco
  "로판 프릴 리본", "앤틱 레이스 테두리", "다이아 브로치 체인", "진주 목걸이 스트랜드", "금사 자수 문양",
  // nature-foliage
  "수채 구름 뭉게", "벚꽃잎 산란", "활엽수 나뭇잎 군락", "잔디·풀잎 다발", "장미 꽃송이 스탬프",
  // oriental-calligraphy
  "동양 갈필 먹붓", "한지 번짐 수묵", "한글 붓글씨 세필", "굵은 서예 평붓", "먹물 비산 스패터",
  // granulating-watercolor
  "과립 분리 수채", "웨트 엣지 백런(꽃피움)", "워시 투명 플랫", "소금 결정 수채", "젖은 종이 블리드",
  // impasto-oil
  "두꺼운 팔레트 나이프", "돈모 필버트 유화", "브리스틀 립 임파스토", "웻-인-웻 혼색 오일", "금박 메탈릭 포일",
  // alcohol-marker
  "코픽 브러시 마커", "치즐 평마커", "알코올 겹침 블렌더", "건조 보드마커", "형광 하이라이트 마커",
  // graphite-pastel
  "6B 거친 흑연 연필", "크로키 각목탄", "부드러운 파스텔 초크", "오일 파스텔 크레용", "색연필 종이결 쉐이딩",
  // light-fx-glitter
  "네온 림라이트 글로우", "별빛 스파클 보케", "아나모픽 렌즈 플레어", "성운 네뷸라 더스트", "마법진 룬 광채",
  // manga-tone-speed
  "만화 집중선 브러시", "크로스해칭 망점 펜", "도트 그라데이션 톤", "노이즈 모래 톤", "속도선 액션 스트로크",
  // hair-fabric-surface
  "윤기 머리카락 가닥", "땋은 머리 브레이드", "벽돌·줄눈 질감", "니트·직물 짜임", "동물 털·깃털 다발",
  // blender-eraser-pro
  "젖은 수채 번짐 블렌더", "유화 스머지 나이프", "질감 보존 떡지우개", "극세사 하이라이트 지우개", "크로마 색번짐 브러시",
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createMockCanvasContext() {
  const clearRect = vi.fn();
  const fillRect = vi.fn();
  const save = vi.fn();
  const restore = vi.fn();
  const translate = vi.fn();
  const rotate = vi.fn();
  const beginPath = vi.fn();
  const closePath = vi.fn();
  const moveTo = vi.fn();
  const lineTo = vi.fn();
  const ellipse = vi.fn();
  const arc = vi.fn();
  const fill = vi.fn();
  const stroke = vi.fn();

  const ctx = {
    clearRect,
    fillRect,
    save,
    restore,
    translate,
    rotate,
    beginPath,
    closePath,
    moveTo,
    lineTo,
    ellipse,
    arc,
    fill,
    stroke,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;

  return { ctx, clearRect, fillRect, fill, stroke, ellipse };
}

function stubHtmlCanvas2d() {
  const mock = createMockCanvasContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() => mock.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
  return mock;
}

describe("글로벌 마스터 무료 기본 브러시 60종 카탈로그 무결성", () => {
  it("정확히 60종의 고유 브러시와 12카테고리×5종 균형 및 502종 총합 계약을 충족한다", () => {
    expect(GLOBAL_MASTER_BRUSH_CATALOG).toHaveLength(60);
    expect(GLOBAL_MASTER_BRUSH_CATEGORIES).toHaveLength(12);
    expect(GLOBAL_MASTER_BRUSH_COUNTS).toEqual({
      coreAndPro: 246,
      mypaintCc0: 196,
      globalMaster: 60,
      totalFreeSelectable: 502,
    });
    expect(
      GLOBAL_MASTER_BRUSH_COUNTS.coreAndPro +
        GLOBAL_MASTER_BRUSH_COUNTS.mypaintCc0 +
        GLOBAL_MASTER_BRUSH_COUNTS.globalMaster,
    ).toBe(GLOBAL_MASTER_BRUSH_COUNTS.totalFreeSelectable);

    const uniqueIds = new Set(GLOBAL_MASTER_BRUSH_CATALOG.map((p) => p.id));
    const uniqueKo = new Set(GLOBAL_MASTER_BRUSH_CATALOG.map((p) => p.nameKo));
    const uniqueEn = new Set(GLOBAL_MASTER_BRUSH_CATALOG.map((p) => p.nameEn));
    expect(uniqueIds.size).toBe(60);
    expect(uniqueKo.size).toBe(60);
    expect(uniqueEn.size).toBe(60);

    for (const expectedName of EXPECTED_60_KO_NAMES) {
      expect(uniqueKo.has(expectedName)).toBe(true);
    }

    for (const meta of GLOBAL_MASTER_BRUSH_CATEGORIES) {
      const inCategory = GLOBAL_MASTER_BRUSH_CATALOG.filter(
        (preset) => preset.category === meta.id,
      );
      expect(inCategory).toHaveLength(5);
      expect(meta.count).toBe(5);
      expect(HANGUL_REGEX.test(meta.labelEn)).toBe(false);
      expect(HANGUL_REGEX.test(meta.summaryEn)).toBe(false);
    }
  });

  it("60종 모두 100% 고유 물리 파라미터 지문(중복 0건)과 freeByDefault: true를 만족한다", () => {
    const fingerprints = new Set<string>();
    const tipShapes = new Set<string>();

    for (const preset of GLOBAL_MASTER_BRUSH_CATALOG) {
      expect(preset.freeByDefault).toBe(true);
      expect(preset.competitorEquivalents.length).toBeGreaterThanOrEqual(2);
      expect(preset.competitorSources.length).toBeGreaterThanOrEqual(2);
      expect(preset.defaultSizePx).toBeGreaterThan(0);
      expect(preset.defaultOpacity).toBeGreaterThan(0);
      expect(preset.defaultOpacity).toBeLessThanOrEqual(1);
      expect(preset.spacing).toBeGreaterThan(0);
      expect(preset.wetness).toBeGreaterThanOrEqual(0);
      expect(preset.wetness).toBeLessThanOrEqual(1);
      expect(preset.impastoHeight).toBeGreaterThanOrEqual(0);
      expect(preset.impastoHeight).toBeLessThanOrEqual(1);
      expect(preset.km7PigmentMix).toBeGreaterThanOrEqual(0);
      expect(preset.km7PigmentMix).toBeLessThanOrEqual(1);

      // 영문 필드에 한글이 섞이지 않았는지 검증
      expect(HANGUL_REGEX.test(preset.nameEn)).toBe(false);
      expect(HANGUL_REGEX.test(preset.signatureFeelEn)).toBe(false);
      for (const equivalent of preset.competitorEquivalents) {
        expect(HANGUL_REGEX.test(equivalent)).toBe(false);
      }

      fingerprints.add(computeGlobalMasterBrushFingerprint(preset));
      tipShapes.add(preset.tipProfile.shape);
    }

    expect(fingerprints.size).toBe(60);
    expect(tipShapes.size).toBe(60);
  });

  it("경쟁사 별칭·한글 키워드 검색 필터가 정확히 동작한다", () => {
    expect(filterGlobalMasterBrushes({ query: "CSP" }).length).toBeGreaterThanOrEqual(30);
    expect(filterGlobalMasterBrushes({ query: "Procreate" }).length).toBeGreaterThanOrEqual(20);
    expect(filterGlobalMasterBrushes({ query: "Rebelle" }).length).toBeGreaterThanOrEqual(12);
    expect(filterGlobalMasterBrushes({ query: "ibisPaint" }).length).toBeGreaterThanOrEqual(12);
    expect(filterGlobalMasterBrushes({ query: "Kyle" }).length).toBeGreaterThanOrEqual(8);
    expect(filterGlobalMasterBrushes({ query: "Krita" }).length).toBeGreaterThanOrEqual(8);
    expect(filterGlobalMasterBrushes({ query: "SAI" }).length).toBeGreaterThanOrEqual(6);

    const rofanResults = filterGlobalMasterBrushes({ query: "로판" });
    expect(rofanResults.length).toBeGreaterThanOrEqual(5);
    expect(rofanResults.some((item) => item.nameKo === "로판 프릴 리본")).toBe(true);
  });
});

describe("결정론적 댑 생성기 및 2D Canvas 스트로크 렌더러", () => {
  it("generateMasterBrushDabs는 동일 입력에 대해 100% 결정론적 출력을 보장한다", () => {
    for (const preset of GLOBAL_MASTER_BRUSH_CATALOG) {
      const samplePoints = buildMasterBrushSamplePoints(200, 56, preset);
      const runA = generateMasterBrushDabs(preset, samplePoints);
      const runB = generateMasterBrushDabs(preset, samplePoints);

      expect(runA.length).toBeGreaterThan(0);
      expect(runA).toEqual(runB);

      for (const dab of runA) {
        expect(Number.isFinite(dab.x)).toBe(true);
        expect(Number.isFinite(dab.y)).toBe(true);
        expect(dab.radiusX).toBeGreaterThan(0);
        expect(dab.radiusY).toBeGreaterThan(0);
        expect(dab.opacity).toBeGreaterThan(0);
        expect(dab.opacity).toBeLessThanOrEqual(1);
      }
    }

    // 서로 다른 두 프리셋은 서로 다른 댑 시퀀스를 생성해야 한다
    const gpen = GLOBAL_MASTER_BRUSH_CATALOG[0]!;
    const sakura = GLOBAL_MASTER_BRUSH_CATALOG.find(
      (p) => p.id === "gm-nature-sakura-petal-scatter",
    )!;
    const sharedPoints = buildMasterBrushSamplePoints(200, 56, gpen);
    expect(generateMasterBrushDabs(gpen, sharedPoints)).not.toEqual(
      generateMasterBrushDabs(sakura, sharedPoints),
    );
  });

  it("renderMasterBrushStrokeSample이 60종 전체를 예외 없이 2D 캔버스에 렌더링한다", () => {
    const { ctx, clearRect, fill, stroke } = createMockCanvasContext();
    for (const preset of GLOBAL_MASTER_BRUSH_CATALOG) {
      const result = renderMasterBrushStrokeSample(ctx, preset, 200, 54);
      expect(result.presetId).toBe(preset.id);
      expect(result.dabCount).toBeGreaterThan(0);
    }
    expect(clearRect).toHaveBeenCalledTimes(60);
    expect(fill.mock.calls.length + stroke.mock.calls.length).toBeGreaterThan(60);
  });
});

describe("GlobalMasterBrushGalleryPanel UI 및 라이브 테스트 패드", () => {
  it("정확한 502종 배지·12카테고리 필터·경쟁사 검색·선택 콜백·라이브 드로잉을 지원한다", () => {
    stubHtmlCanvas2d();
    const onSelectPreset = vi.fn();

    render(<GlobalMasterBrushGalleryPanel locale="ko" onSelectPreset={onSelectPreset} />);

    // 정확한 내장 무료 브러시 총합 배지
    const badge = screen.getByTestId("gm-brush-count-badge");
    expect(badge.textContent).toContain(formatGlobalMasterCountBadge("ko"));
    expect(badge.textContent).toContain(
      "Core+Pro 246 + MyPaint CC0 196 + 글로벌 마스터 60 = 총 502종 선택 가능 무료 브러시",
    );

    // 초기 60종 표시
    const grid = screen.getByTestId("gm-brush-grid");
    expect(within(grid).getAllByRole("button")).toHaveLength(60);

    // 카테고리 필터: 과립 수채화 5종
    fireEvent.click(screen.getByTestId("gm-brush-category-granulating-watercolor"));
    expect(within(grid).getAllByRole("button")).toHaveLength(5);
    expect(screen.getByTestId("gm-brush-result-counter").textContent).toContain("5 / 60");

    // 전체 복귀 후 경쟁사 별칭 검색 ("Rebelle")
    fireEvent.click(screen.getByTestId("gm-brush-category-all"));
    const searchInput = screen.getByTestId("gm-brush-search-input");
    fireEvent.change(searchInput, { target: { value: "Rebelle" } });
    expect(within(grid).getAllByRole("button").length).toBeGreaterThanOrEqual(12);

    // "로판" 검색 후 카드 선택 → onSelectPreset 호출 확인
    fireEvent.change(searchInput, { target: { value: "로판" } });
    const frillCard = screen.getByTestId("gm-brush-card-gm-rofan-frill-ribbon");
    fireEvent.click(frillCard);
    expect(onSelectPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "gm-rofan-frill-ribbon",
        nameKo: "로판 프릴 리본",
        freeByDefault: true,
      }),
    );
    expect(screen.getByTestId("gm-brush-active-name").textContent).toBe("로판 프릴 리본");

    // 라이브 테스트 드로잉 패드 포인터 스트로크
    const liveCanvas = screen.getByTestId("gm-brush-live-pad-canvas");
    fireEvent.pointerDown(liveCanvas, {
      button: 0,
      pointerId: 1,
      pointerType: "pen",
      pressure: 0.78,
      clientX: 24,
      clientY: 64,
      timeStamp: 100,
    });
    fireEvent.pointerMove(liveCanvas, {
      button: 0,
      pointerId: 1,
      pointerType: "pen",
      pressure: 0.92,
      clientX: 140,
      clientY: 90,
      timeStamp: 120,
    });
    fireEvent.pointerUp(liveCanvas, {
      button: 0,
      pointerId: 1,
      pointerType: "pen",
      pressure: 0.25,
      clientX: 140,
      clientY: 90,
      timeStamp: 140,
    });

    expect(screen.getByTestId("gm-brush-live-pad-status").textContent).toContain("직접 드로잉 1획");

    // 지우기 및 적용 버튼 동작 확인
    fireEvent.click(screen.getByTestId("gm-brush-pad-clear"));
    expect(screen.getByTestId("gm-brush-live-pad-status").textContent).toContain("댑 0개");

    fireEvent.click(screen.getByTestId("gm-brush-apply-btn"));
    expect(onSelectPreset).toHaveBeenCalledTimes(2);
  });

  it("EN 모드에서는 렌더링된 텍스트·placeholder·aria-label 전체에 한글이 0자이다", () => {
    stubHtmlCanvas2d();
    const { container } = render(<GlobalMasterBrushGalleryPanel locale="en" />);

    expect(screen.getByTestId("gm-brush-count-badge").textContent).toContain(
      "Core+Pro 246 + MyPaint CC0 196 + Global Master 60 = 502 Free Selectable Brushes",
    );

    const assertZeroKoreanInDom = () => {
      expect(HANGUL_REGEX.test(container.textContent ?? "")).toBe(false);
      const allElements = container.querySelectorAll("*");
      for (const el of allElements) {
        const ariaLabel = el.getAttribute("aria-label") ?? "";
        const placeholder = el.getAttribute("placeholder") ?? "";
        const title = el.getAttribute("title") ?? "";
        expect(HANGUL_REGEX.test(ariaLabel)).toBe(false);
        expect(HANGUL_REGEX.test(placeholder)).toBe(false);
        expect(HANGUL_REGEX.test(title)).toBe(false);
      }
    };

    assertZeroKoreanInDom();

    // 다른 카테고리와 프리셋을 전환한 뒤에도 한글 0자 유지 검증
    fireEvent.click(screen.getByTestId("gm-brush-category-oriental-calligraphy"));
    fireEvent.click(screen.getByTestId("gm-brush-card-gm-oriental-dry-sumi-brush"));
    assertZeroKoreanInDom();

    // 검색 결과 없음 상태에서도 한글 0자 유지 검증
    fireEvent.change(screen.getByTestId("gm-brush-search-input"), {
      target: { value: "nonexistent-brush-xyz" },
    });
    expect(screen.getByTestId("gm-brush-empty")).toBeTruthy();
    assertZeroKoreanInDom();
  });
});
