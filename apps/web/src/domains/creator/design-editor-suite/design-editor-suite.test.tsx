// @vitest-environment jsdom

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  serializeArtboardToJson,
  serializeArtboardToSvg,
} from "./design-artboard-export";
import { DesignEditorWorkbenchPanel } from "./DesignEditorWorkbenchPanel";
import {
  BRAND_KIT_PRESETS,
  DESIGN_EDITOR_TEMPLATES,
  FONT_PAIRING_PRESETS,
  KOREAN_TYPO_EFFECTS,
  PHOTO_MASK_FRAMES,
  applyBrandKitToArtboard,
  buildPhotoMaskSvgGeometry,
  createArtboardFromTemplate,
} from "./brand-kit-templates-catalog";
import {
  computeAutoLayout,
  createUniformPadding,
  flattenAutoLayoutNodes,
  resetInstanceOverride,
  roughifyArrowPath,
  roughifyPolygonPath,
  roughifyRectPath,
  setInstanceOverride,
  syncComponentInstances,
  type AutoLayoutFrameNode,
  type ComponentInstance,
  type ComponentMaster,
} from "./figma-autolayout-engine";
import {
  MAGIC_RESIZE_FORMATS,
  applyMagicResize,
  computePrintBleedMetrics,
  verifyArtboardBounds,
  type DesignArtboardDocument,
} from "./magic-resize-engine";

const HANGUL_REGEX = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
  vi.restoreAllMocks();
});

describe("1. 14종 원클릭 매직 리사이즈 엔진 및 경계 무결성", () => {
  it("명세된 14종 실전 포맷과 정확한 해상도가 모두 등록되어 있다", () => {
    expect(MAGIC_RESIZE_FORMATS).toHaveLength(14);
    const dimById = Object.fromEntries(
      MAGIC_RESIZE_FORMATS.map((fmt) => [fmt.id, `${fmt.width}x${fmt.height}`]),
    );
    expect(dimById).toEqual({
      "webtoon-vertical": "800x1280",
      "naver-webtoon-thumb": "434x330",
      "kakaopage-cover": "720x1080",
      "instagram-card": "1080x1080",
      "reels-shorts": "1080x1920",
      "youtube-thumbnail": "1280x720",
      "ppt-16x9": "1920x1080",
      "a4-print-poster": "2480x3508",
      "x-header": "1500x500",
      "sns-share-banner": "1200x628",
      "business-card": "1050x600",
      "goods-sticker-keyring": "1000x1000",
      "kakao-channel-banner": "800x400",
      "b5-flyer": "2150x3035",
    });
  });

  it("16종 템플릿 × 14종 포맷(총 224개 조합) 전체에서 캔버스 경계 이탈 0건·NaN 0건을 보장한다", () => {
    let checkedCombinations = 0;

    for (const tpl of DESIGN_EDITOR_TEMPLATES) {
      const source = createArtboardFromTemplate(tpl.id);
      for (const fmt of MAGIC_RESIZE_FORMATS) {
        const result = applyMagicResize(source, fmt.id);
        checkedCombinations += 1;

        expect(result.artboard.width).toBe(fmt.width);
        expect(result.artboard.height).toBe(fmt.height);
        expect(result.report.clippedCount).toBe(0);

        const audit = verifyArtboardBounds(result.artboard);
        expect(audit.valid).toBe(true);
        expect(audit.clippedIds).toEqual([]);
        expect(audit.nanIds).toEqual([]);

        for (const el of result.artboard.elements) {
          expect(Number.isFinite(el.x)).toBe(true);
          expect(Number.isFinite(el.y)).toBe(true);
          expect(Number.isFinite(el.width)).toBe(true);
          expect(Number.isFinite(el.height)).toBe(true);
          expect(el.x).toBeGreaterThanOrEqual(0);
          expect(el.y).toBeGreaterThanOrEqual(0);
          expect(el.width).toBeGreaterThan(0);
          expect(el.height).toBeGreaterThan(0);
          expect(el.x + el.width).toBeLessThanOrEqual(fmt.width + 0.01);
          expect(el.y + el.height).toBeLessThanOrEqual(fmt.height + 0.01);
        }
      }
    }

    expect(checkedCombinations).toBe(224);
  });

  it("인쇄 포맷(A4/B5/명함/굿즈)은 3mm 도련·재단선과 안전 여백을 자동 활성화한다", () => {
    const base = createArtboardFromTemplate("webtoon-launch-card");
    const printIds = ["a4-print-poster", "business-card", "goods-sticker-keyring", "b5-flyer"] as const;

    for (const id of printIds) {
      const res = applyMagicResize(base, id);
      expect(res.artboard.showBleedGuides).toBe(true);
      expect(res.report.bleed.enabled).toBe(true);
      expect(res.report.bleed.bleedMm).toBe(3);
      expect(res.report.bleed.bleedPx).toBeGreaterThanOrEqual(20);
      expect(res.report.bleed.safeRect.x).toBeGreaterThan(res.report.bleed.trimRect.x);
      expect(res.report.bleed.cropMarkLengthPx).toBeGreaterThanOrEqual(10);
    }

    const customBleed = computePrintBleedMetrics(1000, 1000, { isPrint: true, dpi: 300, bleedMm: 3 });
    expect(customBleed.bleedPx).toBe(35);
  });

  it("히어로 이미지 종횡비를 유지하고 비정상 NaN/범위초과 입력도 안전하게 복구한다", () => {
    const base = createArtboardFromTemplate("rofan-cover-poster");
    const origHero = base.elements.find((el) => el.role === "hero-image");
    expect(origHero).toBeTruthy();

    const wide = applyMagicResize(base, "x-header");
    const resizedHero = wide.artboard.elements.find((el) => el.role === "hero-image");
    expect(resizedHero).toBeTruthy();
    if (origHero && resizedHero) {
      const origRatio = origHero.width / origHero.height;
      const nextRatio = resizedHero.width / resizedHero.height;
      expect(nextRatio).toBeCloseTo(origRatio, 1);
    }

    const corrupted: DesignArtboardDocument = {
      ...base,
      width: Number.NaN,
      height: -50,
      elements: [
        {
          id: "broken-1",
          role: "headline",
          kind: "text",
          x: -999,
          y: 50000,
          width: Number.NaN,
          height: Number.POSITIVE_INFINITY,
          fontSize: 2,
          textKo: "복구 테스트",
          textEn: "Recovery Test",
        },
      ],
    };

    const recovered = applyMagicResize(corrupted, "naver-webtoon-thumb");
    expect(verifyArtboardBounds(recovered.artboard).valid).toBe(true);
    expect(recovered.artboard.elements[0].fontSize).toBeGreaterThanOrEqual(14);
  });
});

describe("2. Figma Auto-Layout 제약 솔버 · 마스터-인스턴스 전파 · Excalidraw 스케치", () => {
  it("row 방향 padding·gap·fixed·fill·hug 조합의 좌표를 정확히 계산한다", () => {
    const frame: AutoLayoutFrameNode = {
      id: "row-frame",
      kind: "frame",
      x: 10,
      y: 20,
      width: 400,
      height: 120,
      widthMode: "fixed",
      heightMode: "fixed",
      direction: "row",
      padding: createUniformPadding(20),
      gap: 10,
      alignItems: "center",
      justifyContent: "start",
      children: [
        {
          id: "c-fixed",
          kind: "leaf",
          width: 80,
          height: 40,
          widthMode: "fixed",
          heightMode: "fixed",
        },
        {
          id: "c-fill",
          kind: "leaf",
          width: 50,
          height: 60,
          widthMode: "fill",
          heightMode: "fixed",
        },
        {
          id: "c-hug",
          kind: "leaf",
          width: 30,
          height: 30,
          intrinsicWidth: 60,
          intrinsicHeight: 20,
          widthMode: "hug",
          heightMode: "hug",
        },
      ],
    };

    const computed = computeAutoLayout(frame);
    // innerW = 400 - 40 = 360; gaps = 20; fixed(80) + hug(60) = 140 -> fill = 200
    expect(computed.children[0]).toMatchObject({ id: "c-fixed", x: 30, y: 60, width: 80, height: 40 });
    expect(computed.children[1]).toMatchObject({ id: "c-fill", x: 120, y: 50, width: 200, height: 60 });
    expect(computed.children[2]).toMatchObject({ id: "c-hug", x: 330, y: 70, width: 60, height: 20 });
  });

  it("column 방향 space-between · stretch 정렬과 hug 프레임 자동 크기 측정을 정확히 수행한다", () => {
    const colFrame: AutoLayoutFrameNode = {
      id: "col-frame",
      kind: "frame",
      width: 240,
      height: 300,
      widthMode: "fixed",
      heightMode: "fixed",
      direction: "column",
      padding: { top: 16, right: 20, bottom: 16, left: 20 },
      gap: 12,
      alignItems: "stretch",
      justifyContent: "space-between",
      children: [
        { id: "top", kind: "leaf", width: 80, height: 40, widthMode: "fixed", heightMode: "fixed" },
        { id: "mid", kind: "leaf", width: 80, height: 60, widthMode: "fixed", heightMode: "fixed" },
        { id: "bot", kind: "leaf", width: 80, height: 40, widthMode: "fixed", heightMode: "fixed" },
      ],
    };

    const col = computeAutoLayout(colFrame);
    // innerW = 200 -> stretch makes all width 200
    // innerH = 268, sumH = 140 -> space-between stepGap = (268 - 140) / 2 = 64
    expect(col.children[0]).toMatchObject({ x: 20, y: 16, width: 200, height: 40 });
    expect(col.children[1]).toMatchObject({ x: 20, y: 120, width: 200, height: 60 });
    expect(col.children[2]).toMatchObject({ x: 20, y: 244, width: 200, height: 40 });

    const hugFrame: AutoLayoutFrameNode = {
      id: "hug-frame",
      kind: "frame",
      width: 0,
      height: 0,
      widthMode: "hug",
      heightMode: "hug",
      direction: "row",
      padding: createUniformPadding(12),
      gap: 8,
      alignItems: "start",
      justifyContent: "start",
      children: [
        { id: "a", kind: "leaf", width: 50, height: 30, widthMode: "fixed", heightMode: "fixed" },
        { id: "b", kind: "leaf", width: 70, height: 45, widthMode: "fixed", heightMode: "fixed" },
      ],
    };

    const hugged = computeAutoLayout(hugFrame);
    expect(hugged.width).toBe(152); // 12 + 50 + 8 + 70 + 12
    expect(hugged.height).toBe(69); // 12 + 45 + 12
  });

  it("wrap 방향 줄바꿈 및 중첩 프레임 재귀 배치가 정확한 절대 좌표를 산출한다", () => {
    const wrapFrame: AutoLayoutFrameNode = {
      id: "wrap-root",
      kind: "frame",
      width: 220,
      height: 200,
      widthMode: "fixed",
      heightMode: "hug",
      direction: "wrap",
      padding: createUniformPadding(10),
      gap: 10,
      crossAxisGap: 14,
      alignItems: "start",
      justifyContent: "start",
      children: [
        { id: "w1", kind: "leaf", width: 90, height: 30, widthMode: "fixed", heightMode: "fixed" },
        { id: "w2", kind: "leaf", width: 90, height: 40, widthMode: "fixed", heightMode: "fixed" },
        { id: "w3", kind: "leaf", width: 90, height: 35, widthMode: "fixed", heightMode: "fixed" },
      ],
    };

    const wrapped = computeAutoLayout(wrapFrame);
    // innerW = 200. Line 1: w1(90) + 10 + w2(90) = 190 <= 200, lineH = 40. Line 2: w3 at y = 10 + 40 + 14 = 64.
    expect(wrapped.children[0]).toMatchObject({ x: 10, y: 10 });
    expect(wrapped.children[1]).toMatchObject({ x: 110, y: 10 });
    expect(wrapped.children[2]).toMatchObject({ x: 10, y: 64 });
    expect(wrapped.height).toBe(109); // 10 + 40 + 14 + 35 + 10

    // 중첩 프레임 재귀 배치
    const nested: AutoLayoutFrameNode = {
      id: "outer",
      kind: "frame",
      x: 5,
      y: 10,
      width: 300,
      height: 180,
      widthMode: "fixed",
      heightMode: "fixed",
      direction: "column",
      padding: createUniformPadding(15),
      gap: 10,
      alignItems: "stretch",
      justifyContent: "start",
      children: [
        {
          id: "inner-row",
          kind: "frame",
          width: 100,
          height: 50,
          widthMode: "fill",
          heightMode: "fixed",
          direction: "row",
          padding: createUniformPadding(5),
          gap: 10,
          alignItems: "center",
          justifyContent: "start",
          children: [
            { id: "leaf-a", kind: "leaf", width: 60, height: 30, widthMode: "fixed", heightMode: "fixed" },
            { id: "leaf-b", kind: "leaf", width: 40, height: 30, widthMode: "fill", heightMode: "fixed" },
          ],
        },
      ],
    };

    const computedNested = computeAutoLayout(nested);
    const flat = flattenAutoLayoutNodes(computedNested);
    const leafB = flat.find((node) => node.id === "leaf-b");
    // outer innerW = 270 -> inner-row starts at abs (20, 25), width 270 -> inner-row innerW = 260
    // leaf-a at abs x = 25, w = 60; leaf-b at abs x = 25 + 60 + 10 = 95, w = 260 - 60 - 10 = 190
    expect(leafB).toMatchObject({ x: 95, y: 35, width: 190, height: 30 });
  });

  it("컴포넌트 마스터 변경 시 오버라이드되지 않은 속성만 전파하고 오버라이드 및 분리 인스턴스를 보존한다", () => {
    const masterV1: ComponentMaster = {
      id: "btn-master",
      name: "Primary CTA",
      version: 1,
      props: { labelKo: "시작하기", labelEn: "Start", borderRadius: 8, fontSize: 14 },
    };

    const instances: readonly ComponentInstance[] = [
      {
        id: "inst-clean",
        masterId: "btn-master",
        name: "Clean",
        overrides: {},
        resolvedProps: { ...masterV1.props },
        syncedMasterVersion: 1,
      },
      {
        id: "inst-overridden",
        masterId: "btn-master",
        name: "Custom Label",
        overrides: { labelKo: "지금 구독" },
        resolvedProps: { ...masterV1.props, labelKo: "지금 구독" },
        syncedMasterVersion: 1,
      },
      {
        id: "inst-detached",
        masterId: "btn-master",
        name: "Detached",
        overrides: {},
        resolvedProps: { ...masterV1.props },
        syncedMasterVersion: 1,
        detached: true,
      },
    ];

    const masterV2: ComponentMaster = {
      ...masterV1,
      version: 2,
      props: { labelKo: "무료로 시작", labelEn: "Start Free", borderRadius: 20, fontSize: 16 },
    };

    const synced = syncComponentInstances(masterV2, instances);
    expect(synced.updatedCount).toBe(2);
    expect(synced.skippedDetachedCount).toBe(1);
    expect(synced.instances[0].resolvedProps).toEqual(masterV2.props);
    expect(synced.instances[1].resolvedProps.labelKo).toBe("지금 구독");
    expect(synced.instances[1].resolvedProps.borderRadius).toBe(20);
    expect(synced.instances[1].resolvedProps.fontSize).toBe(16);
    expect(synced.preservedOverrideKeysByInstance["inst-overridden"]).toEqual(["labelKo"]);
    expect(synced.instances[2].resolvedProps.borderRadius).toBe(8);

    // 오버라이드 설정 및 초기화 헬퍼 검증
    const extraOverride = setInstanceOverride(synced.instances[0], "fontSize", 22);
    expect(extraOverride.overrides.fontSize).toBe(22);
    const resetBack = resetInstanceOverride(extraOverride, masterV2, "fontSize");
    expect(resetBack.overrides.fontSize).toBeUndefined();
    expect(resetBack.resolvedProps.fontSize).toBe(16);
  });

  it("Excalidraw 손그림 경로 변환기가 결정론적 3차 베지어 이중 스트로크를 생성하고 NaN을 내지 않는다", () => {
    const tri = [
      { x: 10, y: 10 },
      { x: 120, y: 15 },
      { x: 65, y: 110 },
    ];
    const d1 = roughifyPolygonPath(tri, 42);
    const d2 = roughifyPolygonPath(tri, 42);
    const dDifferentSeed = roughifyPolygonPath(tri, 99);

    expect(d1).toBe(d2);
    expect(d1).not.toBe(dDifferentSeed);
    expect(d1).toContain("M ");
    expect(d1).toContain("C ");
    expect(d1).not.toContain("NaN");
    // 닫힌 삼각형(3변) × 이중 스트로크(2회) = 6개 M 커맨드
    expect(d1.match(/M /g)).toHaveLength(6);

    expect(roughifyPolygonPath([{ x: 0, y: 0 }], 1)).toBe("");
    expect(roughifyRectPath(0, 0, 100, 60, 7)).toContain("C ");
    expect(roughifyArrowPath({ x: 10, y: 20 }, { x: 140, y: 90 }, 11)).toContain("C ");
  });
});

describe("3. 브랜드 키트 8종 · 폰트 6종 · 포토 프레임 8종 · 타이포 효과 6종 · 템플릿 16종", () => {
  it("카탈로그 수량(8 · 6 · 8 · 6 · 16)과 ID 고유성이 모두 충족된다", () => {
    expect(BRAND_KIT_PRESETS).toHaveLength(8);
    expect(FONT_PAIRING_PRESETS).toHaveLength(6);
    expect(PHOTO_MASK_FRAMES).toHaveLength(8);
    expect(KOREAN_TYPO_EFFECTS).toHaveLength(6);
    expect(DESIGN_EDITOR_TEMPLATES).toHaveLength(16);

    expect(new Set(BRAND_KIT_PRESETS.map((k) => k.id)).size).toBe(8);
    expect(new Set(FONT_PAIRING_PRESETS.map((f) => f.id)).size).toBe(6);
    expect(new Set(PHOTO_MASK_FRAMES.map((p) => p.id)).size).toBe(8);
    expect(new Set(KOREAN_TYPO_EFFECTS.map((t) => t.id)).size).toBe(6);
    expect(new Set(DESIGN_EDITOR_TEMPLATES.map((t) => t.id)).size).toBe(16);
  });

  it("1클릭 브랜드 키트 전역 리스킨이 원본 불변성을 유지하며 팔레트와 폰트를 일괄 교체한다", () => {
    const initial = createArtboardFromTemplate("webtoon-launch-card");
    const reskinned = applyBrandKitToArtboard(initial, "noir-thriller");

    expect(initial.brandKitId).toBe("editorial-ink");
    expect(reskinned.artboard.brandKitId).toBe("noir-thriller");
    expect(reskinned.artboard.fontPairingId).toBe("blackhansans-impact");
    expect(reskinned.updatedElementCount).toBe(initial.elements.length);
  });

  it("8종 포토 마스크 프레임이 모두 유효한 SVG 클립 경로를 생성하고 NaN이 없다", () => {
    for (const frame of PHOTO_MASK_FRAMES) {
      const geom = buildPhotoMaskSvgGeometry(frame.id, 20, 30, 320, 240);
      expect(geom.clipPathD.startsWith("M ")).toBe(true);
      expect(geom.borderPathD.startsWith("M ")).toBe(true);
      expect(geom.clipPathD).not.toContain("NaN");
      expect(geom.innerImageRect.width).toBeGreaterThan(0);
      expect(geom.innerImageRect.height).toBeGreaterThan(0);
    }
  });

  it("SVG 및 JSON 직렬화가 유효한 마크업과 스키마를 생성하고 원시 hex를 포함하지 않는다", () => {
    const doc = createArtboardFromTemplate("goods-acrylic-sticker");
    const svg = serializeArtboardToSvg(doc, false);
    expect(svg).toContain("<svg xmlns=");
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);

    const al = computeAutoLayout({
      id: "root",
      kind: "frame",
      width: 200,
      height: 100,
      widthMode: "fixed",
      heightMode: "fixed",
      direction: "row",
      padding: createUniformPadding(8),
      gap: 8,
      alignItems: "center",
      justifyContent: "start",
      children: [],
    });
    const json = serializeArtboardToJson({ artboard: doc, autoLayout: al, instances: [] });
    const parsed = JSON.parse(json) as { schema: string; artboard: { templateId: string } };
    expect(parsed.schema).toBe("toonstudio.design-editor-suite/v1");
    expect(parsed.artboard.templateId).toBe("goods-acrylic-sticker");
  });
});

describe("4. DesignEditorWorkbenchPanel UI 상호작용 · 다운로드 · EN 모드 한글 0자 · 위생", () => {
  it("템플릿 전환, 매직 리사이즈, Auto-Layout 조작, 브랜드 키트, 프레임·효과 토글, SVG/JSON 다운로드를 수행한다", () => {
    const createObjUrl = vi.fn(() => "blob:mock-design-export");
    const revokeObjUrl = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    Object.defineProperty(window.URL, "createObjectURL", {
      value: createObjUrl,
      configurable: true,
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      value: revokeObjUrl,
      configurable: true,
    });

    render(<DesignEditorWorkbenchPanel />);

    // 초기 16종 템플릿 & 14종 포맷 표시 확인
    expect(screen.getByTestId("des-template-gallery").querySelectorAll("button")).toHaveLength(16);
    expect(screen.getByTestId("des-magic-resize-grid").querySelectorAll("button")).toHaveLength(14);
    expect(screen.getByTestId("des-bounds-integrity-badge").textContent).toContain("클리핑 0건");

    // 템플릿 전환 -> 매직 리사이즈 (유튜브 썸네일 1280×720)
    fireEvent.click(screen.getByTestId("des-template-psst-business-cover"));
    expect(screen.getByTestId("des-active-dimensions-badge").textContent).toContain("1920×1080");

    fireEvent.click(screen.getByTestId("des-format-youtube-thumbnail"));
    expect(screen.getByTestId("des-active-dimensions-badge").textContent).toContain("1280×720");
    expect(screen.getByTestId("des-resize-report-summary").textContent).toContain("landscape");

    // 손그림 스케치 & 3mm 인쇄 재단선 토글
    fireEvent.click(screen.getByTestId("des-toggle-sketch-btn"));
    expect(screen.getByTestId("des-artboard-stage").getAttribute("data-sketch-mode")).toBe("on");
    fireEvent.click(screen.getByTestId("des-toggle-bleed-btn"));
    expect(screen.getByTestId("des-bleed-guides-overlay")).toBeTruthy();

    // Auto-Layout 탭 전환 및 실시간 방향/간격/마스터 전파 조작
    fireEvent.click(screen.getByTestId("des-tab-autolayout"));
    fireEvent.click(screen.getByTestId("des-al-dir-column"));
    fireEvent.change(screen.getByTestId("des-al-gap-slider"), { target: { value: "20" } });
    fireEvent.click(screen.getByTestId("des-master-radius-24"));
    expect(screen.getByTestId("des-instance-inst-primary").textContent).toContain("R24px");
    expect(screen.getByTestId("des-instance-inst-override").textContent).toContain("한정 굿즈 보기");
    expect(screen.getByTestId("des-instance-inst-override").textContent).toContain("R24px");

    // 브랜드 키트 탭 전환 및 리스킨
    fireEvent.click(screen.getByTestId("des-tab-brand"));
    expect(screen.getByTestId("des-brand-kit-grid").querySelectorAll("button")).toHaveLength(8);
    expect(screen.getByTestId("des-font-pairing-grid").querySelectorAll("button")).toHaveLength(6);
    fireEvent.click(screen.getByTestId("des-kit-rofan-atelier"));
    expect(screen.getByTestId("des-artboard-stage").getAttribute("data-brand-kit")).toBe("rofan-atelier");

    // 포토 프레임 & 타이포 효과 탭 전환
    fireEvent.click(screen.getByTestId("des-tab-effects"));
    expect(screen.getByTestId("des-photo-frame-grid").querySelectorAll("button")).toHaveLength(8);
    expect(screen.getByTestId("des-typo-effect-grid").querySelectorAll("button")).toHaveLength(6);
    fireEvent.click(screen.getByTestId("des-frame-postage-stamp"));
    fireEvent.click(screen.getByTestId("des-typo-curved-arch"));

    // SVG / JSON 다운로드 트리거
    fireEvent.click(screen.getByTestId("des-download-svg-btn"));
    fireEvent.click(screen.getByTestId("des-download-json-btn"));
    expect(createObjUrl).toHaveBeenCalledTimes(2);
    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect(revokeObjUrl).toHaveBeenCalledTimes(2);
  });

  it("EN 모드에서는 모든 탭과 인터랙션 결과에서 한글이 단 1자도 노출되지 않는다", () => {
    useI18n.getState().setLang("en");
    const { container } = render(<DesignEditorWorkbenchPanel />);

    const assertZeroHangul = (phase: string) => {
      const visibleText = container.textContent ?? "";
      expect(visibleText, `${phase} visible text`).not.toMatch(HANGUL_REGEX);
      const ariaLabels = Array.from(container.querySelectorAll("[aria-label]")).map(
        (node) => node.getAttribute("aria-label") ?? "",
      );
      for (const label of ariaLabels) {
        expect(label, `${phase} aria-label`).not.toMatch(HANGUL_REGEX);
      }
      const inputValues = Array.from(container.querySelectorAll("input")).map(
        (node) => node.value,
      );
      for (const val of inputValues) {
        expect(val, `${phase} input value`).not.toMatch(HANGUL_REGEX);
      }
    };

    assertZeroHangul("initial templates tab");

    fireEvent.click(screen.getByTestId("des-format-reels-shorts"));
    fireEvent.click(screen.getByTestId("des-toggle-sketch-btn"));
    fireEvent.click(screen.getByTestId("des-toggle-bleed-btn"));
    assertZeroHangul("after resize & toggles");

    fireEvent.click(screen.getByTestId("des-tab-autolayout"));
    fireEvent.click(screen.getByTestId("des-master-radius-24"));
    assertZeroHangul("autolayout tab");

    fireEvent.click(screen.getByTestId("des-tab-brand"));
    fireEvent.click(screen.getByTestId("des-kit-noir-thriller"));
    assertZeroHangul("brand kit tab");

    fireEvent.click(screen.getByTestId("des-tab-effects"));
    fireEvent.click(screen.getByTestId("des-typo-neon-glow"));
    assertZeroHangul("effects tab");
  });

  it("스위트 소스 파일 전체가 원시 hex 금지 · transition-all 금지 · 800줄 이하 규칙을 지킨다", () => {
    const suiteDir = resolve(process.cwd(), "apps/web/src/domains/creator/design-editor-suite");
    const files = readdirSync(suiteDir).filter((name) => /\.(?:ts|tsx|css)$/.test(name));
    expect(files.length).toBeGreaterThanOrEqual(7);

    for (const file of files) {
      const content = readFileSync(resolve(suiteDir, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} line count`).toBeLessThanOrEqual(800);
      if (file !== "design-editor-suite.test.tsx") {
        expect(content, `${file} raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(content, `${file} transition-all`).not.toMatch(/transition-all|transition:\s*all/);
      }
    }
  });
});
