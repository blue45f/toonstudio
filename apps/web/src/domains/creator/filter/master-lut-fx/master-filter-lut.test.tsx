// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { STUDIO_FILTER_CATALOG } from "../studio-filter-catalog";
import { PHOTOSHOP_WEB_FILTER_PRESETS } from "../studio-photoshop-web-filter-presets";

import { MasterFilterLutGalleryPanel } from "./MasterFilterLutGalleryPanel";
import {
  MASTER_FILTER_CATEGORIES,
  MASTER_FILTER_CATEGORY_IDS,
  MASTER_FILTER_COUNT_BREAKDOWN,
  MASTER_FILTER_IDS,
  MASTER_FILTER_LUT_CATALOG,
  getMasterFilterById,
  getMasterFiltersByCategory,
  searchMasterFilters,
} from "./master-filter-lut-catalog";
import {
  applyMasterFilterToRgba,
  createMasterFilterPreviewArtwork,
  measureRgbaFilterDiff,
} from "./master-filter-pixel-engine";

const HANGUL_REGEX = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const MODULE_DIR = resolve(process.cwd(), "apps/web/src/domains/creator/filter/master-lut-fx");

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

function bytesEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

describe("1. 마스터 LUT·웹툰·광학·인쇄·레트로·종이질감 36종 카탈로그 무결성", () => {
  it("정확히 6개 카테고리 × 36종(8+6+6+6+5+5)이 중복 없이 등록되고 기존 147종과 합쳐 총 183종 무료 필터를 이룬다", () => {
    expect(MASTER_FILTER_CATEGORY_IDS).toHaveLength(6);
    expect(MASTER_FILTER_CATEGORIES).toHaveLength(6);
    expect(MASTER_FILTER_IDS).toHaveLength(36);
    expect(MASTER_FILTER_LUT_CATALOG).toHaveLength(36);

    const uniqueIds = new Set(MASTER_FILTER_LUT_CATALOG.map((item) => item.id));
    expect(uniqueIds.size).toBe(36);

    const expectedCounts: Record<string, number> = {
      "webtoon-mood": 8,
      "cinema-lut": 6,
      "print-manga": 6,
      "optical-light": 6,
      "retro-glitch": 5,
      "paper-extract": 5,
    };

    for (const category of MASTER_FILTER_CATEGORIES) {
      const members = getMasterFiltersByCategory(category.id);
      expect(members).toHaveLength(category.expectedCount);
      expect(category.expectedCount).toBe(expectedCounts[category.id]);
    }

    // 실제 저장소 카탈로그 수량 대조: 기본 86 + Photoshop-Web 61 + 마스터 36 = 183
    expect(STUDIO_FILTER_CATALOG).toHaveLength(MASTER_FILTER_COUNT_BREAKDOWN.baseStudio);
    expect(PHOTOSHOP_WEB_FILTER_PRESETS).toHaveLength(MASTER_FILTER_COUNT_BREAKDOWN.photoshopWeb);
    expect(MASTER_FILTER_LUT_CATALOG).toHaveLength(MASTER_FILTER_COUNT_BREAKDOWN.masterLut);
    expect(
      STUDIO_FILTER_CATALOG.length +
        PHOTOSHOP_WEB_FILTER_PRESETS.length +
        MASTER_FILTER_LUT_CATALOG.length,
    ).toBe(183);
  });

  it("전 36종 필터는 100% 무료이며 유효한 KO/EN 메타데이터·검색 인덱스를 가진다", () => {
    for (const item of MASTER_FILTER_LUT_CATALOG) {
      expect(item.isFree).toBe(true);
      expect(item.nameKo.trim().length).toBeGreaterThan(0);
      expect(item.nameEn.trim().length).toBeGreaterThan(0);
      expect(HANGUL_REGEX.test(item.nameEn)).toBe(false);
      expect(HANGUL_REGEX.test(item.descriptionEn)).toBe(false);
      expect(HANGUL_REGEX.test(item.algorithmTagEn)).toBe(false);
      expect(item.defaultIntensity).toBeGreaterThan(0);
      expect(item.defaultIntensity).toBeLessThanOrEqual(1);
      expect(item.accentToken).toMatch(/^var\(--mfl-/);
      expect(getMasterFilterById(item.id)?.id).toBe(item.id);
    }

    expect(searchMasterFilters("all", "리소그래프").map((f) => f.id)).toContain("risograph-duotone");
    expect(searchMasterFilters("paper-extract", "sobel dog").map((f) => f.id)).toEqual([
      "sobel-dog-line-extract",
    ]);
    expect(searchMasterFilters("paper-extract", "sobel").map((f) => f.id)).toContain(
      "sobel-dog-line-extract",
    );
  });
});

describe("2. 실제 RGBA 픽셀 엔진 36종 전수 검증 (변화량·결정론·불변성·경계방어)", () => {
  const width = 32;
  const height = 24;
  const sourceArtwork = createMasterFilterPreviewArtwork(width, height);
  const originalSnapshot = new Uint8ClampedArray(sourceArtwork);

  it("36종 전체가 비-자명한 일러스트 버퍼에서 실제 픽셀 변화(diff > 0), 범위 [0..255], 결정론, 입력 불변성을 보장한다", () => {
    const outputs = new Map<string, Uint8ClampedArray>();

    for (const spec of MASTER_FILTER_LUT_CATALOG) {
      const outA = applyMasterFilterToRgba(sourceArtwork, width, height, spec.id, {
        intensity: 1,
        seed: 2026,
      });
      const outB = applyMasterFilterToRgba(sourceArtwork, width, height, spec.id, {
        intensity: 1,
        seed: 2026,
      });

      // 입력 불변성
      expect(bytesEqual(sourceArtwork, originalSnapshot)).toBe(true);
      // 출력 크기 일치 & 새 인스턴스
      expect(outA.length).toBe(sourceArtwork.length);
      expect(outA).not.toBe(sourceArtwork);
      // 결정론적 재현
      expect(bytesEqual(outA, outB)).toBe(true);

      // NaN / 범위 초과 0건
      for (let i = 0; i < outA.length; i += 1) {
        const val = outA[i];
        expect(val).toBeDefined();
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(255);
      }

      // 실제 픽셀 변화 검증
      const diff = measureRgbaFilterDiff(sourceArtwork, outA);
      expect(diff.changedPixelCount).toBeGreaterThan(0);
      expect(diff.meanChannelDelta).toBeGreaterThan(0.5);

      // 알파 보존 vs 배경 투명화 검증
      if (!spec.modifiesAlpha) {
        for (let p = 0; p < width * height; p += 1) {
          expect(outA[p * 4 + 3]).toBe(sourceArtwork[p * 4 + 3]);
        }
      } else {
        // 스마트 배경 투명화: 모서리(0,0)는 투명해지고, 중앙 캐릭터 픽셀은 불투명 유지
        expect(outA[3]).toBeLessThan(30);
        const subjectIdx = (Math.floor(height * 0.44) * width + Math.floor(width * 0.58)) * 4;
        expect(outA[subjectIdx + 3]).toBeGreaterThan(200);
      }

      outputs.set(spec.id, outA);
    }

    // 36종 필터 상호 출력 고유성(중복 스텁 없음) 검증
    const ids = MASTER_FILTER_LUT_CATALOG.map((item) => item.id);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = outputs.get(ids[i] ?? "");
        const b = outputs.get(ids[j] ?? "");
        expect(a && b ? bytesEqual(a, b) : true).toBe(false);
      }
    }
  });

  it("intensity=0이면 36종 모두 원본과 바이트 단위로 동일한 새 복사본을 반환한다", () => {
    for (const spec of MASTER_FILTER_LUT_CATALOG) {
      const zeroOut = applyMasterFilterToRgba(sourceArtwork, width, height, spec.id, {
        intensity: 0,
      });
      expect(zeroOut).not.toBe(sourceArtwork);
      expect(bytesEqual(zeroOut, sourceArtwork)).toBe(true);
    }
  });

  it("0×0, 1×1, 음수/NaN/Infinity intensity 등 비정상 입력을 예외 없이 안전하게 방어한다", () => {
    const empty = new Uint8ClampedArray(0);
    expect(applyMasterFilterToRgba(empty, 0, 0, "golden-sunset").length).toBe(0);
    expect(applyMasterFilterToRgba(sourceArtwork, 0, 10, "sobel-dog-line-extract").length).toBe(0);
    expect(applyMasterFilterToRgba(sourceArtwork, Number.NaN, 10, "bayer-4x4-dither").length).toBe(
      0,
    );

    const onePixel = new Uint8ClampedArray([140, 180, 210, 255]);
    const onePixelOrig = new Uint8ClampedArray(onePixel);
    for (const spec of MASTER_FILTER_LUT_CATALOG) {
      const out1x1 = applyMasterFilterToRgba(onePixel, 1, 1, spec.id, { intensity: 1, seed: 7 });
      expect(out1x1.length).toBe(4);
      expect([...out1x1].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(true);
    }
    expect(bytesEqual(onePixel, onePixelOrig)).toBe(true);

    // 음수 및 NaN intensity -> 원본과 동일하게 안전 방어
    const negOut = applyMasterFilterToRgba(sourceArtwork, width, height, "neon-cyberpunk", {
      intensity: -0.75,
    });
    expect(bytesEqual(negOut, sourceArtwork)).toBe(true);

    const nanOut = applyMasterFilterToRgba(sourceArtwork, width, height, "cmyk-rosette-halftone", {
      intensity: Number.NaN,
      seed: Number.NaN,
    });
    expect(bytesEqual(nanOut, sourceArtwork)).toBe(true);

    // +Infinity / > 1 intensity -> 1.0으로 클램프
    const overOut = applyMasterFilterToRgba(sourceArtwork, width, height, "kodak-portra-lut", {
      intensity: 4.2,
    });
    const fullOut = applyMasterFilterToRgba(sourceArtwork, width, height, "kodak-portra-lut", {
      intensity: 1,
    });
    expect(bytesEqual(overOut, fullOut)).toBe(true);
  });
});

describe("3. MasterFilterLutGalleryPanel UI · 분할 슬라이더 · 필터 선택 · KO/EN 검증", () => {
  it("정확한 183종 수치 배지, 6개 카테고리 탭, 필터 선택, 분할/강도 슬라이더, 적용 콜백이 동작한다", () => {
    const onApplyFilter = vi.fn();
    render(<MasterFilterLutGalleryPanel locale="ko" onApplyFilter={onApplyFilter} />);

    // 정확한 183종 수치 배지 확인
    expect(screen.getByTestId("master-filter-total-badge").textContent).toBe(
      "기본 86 + Photoshop-Web 61 + 마스터 LUT/웹툰 36 = 총 183종 무료 필터",
    );

    // 6개 카테고리 탭 전환 시 정원 확인
    for (const category of MASTER_FILTER_CATEGORIES) {
      fireEvent.click(screen.getByTestId(`master-filter-tab-${category.id}`));
      const grid = screen.getByTestId("master-filter-grid");
      expect(grid.querySelectorAll("button.mfl-filter-card")).toHaveLength(category.expectedCount);
    }

    // 전체 탭 복귀 후 특정 필터(리소그래프 2도) 선택
    fireEvent.click(screen.getByTestId("master-filter-tab-all"));
    expect(
      screen.getByTestId("master-filter-grid").querySelectorAll("button.mfl-filter-card"),
    ).toHaveLength(36);

    fireEvent.click(screen.getByTestId("master-filter-card-risograph-duotone"));
    expect(screen.getByTestId("master-filter-active-name").textContent).toBe(
      "리소그래프 2도(형광핑크+코발트)",
    );
    const stage = screen.getByTestId("master-filter-compare-stage");
    expect(stage.getAttribute("data-filter-id")).toBe("risograph-duotone");
    expect(Number(stage.getAttribute("data-changed-pixels"))).toBeGreaterThan(0);

    // Before/After 분할 슬라이더 조작
    const splitSlider = screen.getByTestId("master-filter-split-slider");
    fireEvent.change(splitSlider, { target: { value: "74" } });
    expect(screen.getByTestId("master-filter-split-value").textContent).toBe("74%");
    expect(stage.getAttribute("data-split-pct")).toBe("74");

    // 강도 슬라이더 0% -> 픽셀 변화 0, 100% -> 픽셀 변화 > 0
    const intensitySlider = screen.getByTestId("master-filter-intensity-slider");
    fireEvent.change(intensitySlider, { target: { value: "0" } });
    expect(screen.getByTestId("master-filter-intensity-value").textContent).toBe("0%");
    expect(Number(stage.getAttribute("data-changed-pixels"))).toBe(0);

    fireEvent.change(intensitySlider, { target: { value: "100" } });
    expect(Number(stage.getAttribute("data-changed-pixels"))).toBeGreaterThan(0);

    // 적용 버튼 호출 검증
    fireEvent.click(screen.getByTestId("master-filter-apply-btn"));
    expect(onApplyFilter).toHaveBeenCalledTimes(1);
    expect(onApplyFilter).toHaveBeenCalledWith(
      expect.objectContaining({
        intensity: 1,
        filter: expect.objectContaining({ id: "risograph-duotone" }),
      }),
    );
    expect(screen.getByTestId("master-filter-status-note").textContent).toContain("100%");
  });

  it("EN 모드(prop 및 전역 i18n 스토어)에서 6개 탭·카드·라벨·상태문구 전체에 한글 0자를 유지한다", () => {
    useI18n.setState({ lang: "en" });
    const { container } = render(<MasterFilterLutGalleryPanel />);

    expect(screen.getByTestId("master-filter-total-badge").textContent).toBe(
      "Base 86 + Photoshop-Web 61 + Master LUT/Webtoon 36 = 183 Free Filters Total",
    );

    const assertZeroHangulInDom = () => {
      expect(HANGUL_REGEX.test(container.textContent ?? "")).toBe(false);
      const elements = container.querySelectorAll("[aria-label], [placeholder], [title]");
      for (const el of elements) {
        expect(HANGUL_REGEX.test(el.getAttribute("aria-label") ?? "")).toBe(false);
        expect(HANGUL_REGEX.test(el.getAttribute("placeholder") ?? "")).toBe(false);
        expect(HANGUL_REGEX.test(el.getAttribute("title") ?? "")).toBe(false);
      }
    };

    assertZeroHangulInDom();

    for (const category of MASTER_FILTER_CATEGORIES) {
      fireEvent.click(screen.getByTestId(`master-filter-tab-${category.id}`));
      assertZeroHangulInDom();
    }

    fireEvent.click(screen.getByTestId("master-filter-card-smart-chroma-matte-key"));
    fireEvent.click(screen.getByTestId("master-filter-apply-btn"));
    assertZeroHangulInDom();
  });
});

describe("4. 정적 코드 위생 계약 (800줄 이하 · 원시 hex 0건 · transition-all 0건 · any 0건)", () => {
  it("master-lut-fx/ 하위 모든 파일이 행 수·토큰·타입 위생 기준을 준수한다", () => {
    const files = readdirSync(MODULE_DIR);
    expect(files.length).toBeGreaterThanOrEqual(5);

    for (const file of files) {
      const content = readFileSync(resolve(MODULE_DIR, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount).toBeLessThanOrEqual(800);

      if ((file.endsWith(".css") || file.endsWith(".tsx")) && !file.endsWith(".test.tsx")) {
        expect(content).not.toMatch(/transition-all\b/);
        expect(content).not.toMatch(/transition\s*:\s*all\b/);
        expect(content).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(content).not.toMatch(/\brgba?\s*\(/i);
      }

      if ((file.endsWith(".ts") || file.endsWith(".tsx")) && !file.endsWith(".test.tsx")) {
        expect(content).not.toMatch(/:\s*any\b/);
        expect(content).not.toMatch(/\bas\s+any\b/);
      }
    }
  });
});
