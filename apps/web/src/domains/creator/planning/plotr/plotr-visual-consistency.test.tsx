// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditCharacterConsistencyAcrossCuts,
  syncCharacterConsistencyAcrossCuts,
} from "./plotr-character-sheet-model";
import {
  clearPlotrMemoryStoreForTest,
  createPlotrDocumentFromTemplate,
  parsePlotrDocumentState,
} from "./plotr-device-store";
import { auditReverseShotAxis } from "./plotr-script-cut-engine";
import {
  buildVisualContiSummaryText,
  renderVisualStoryboardToCanvas,
} from "./plotr-visual-canvas-export";
import {
  PLOTR_IDEA_QUICK_PRESETS,
  applyCutFramingPreset,
  applyCutLightingMood,
  generateFourCutWebtoonFromIdea,
  inferCutCameraFraming,
  inferCutLightingMood,
} from "./plotr-visual-cut-renderer";
import { PlotrStoryAtelierWorkbench } from "./PlotrStoryAtelierWorkbench";

vi.mock("../../studio-local-database-runtime", () => {
  const store = new Map<string, string>();
  return {
    resetFailedStudioLocalDatabaseOwnership: async () => false,
    acquireStudioLocalDatabase: async () => ({
      asAsyncKeyValueStore: (ns: string) => ({
        get: async (key: string) => store.get(`${ns}/${key}`) ?? null,
        set: async (key: string, value: string) => {
          store.set(`${ns}/${key}`, value);
        },
      }),
    }),
  };
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearPlotrMemoryStoreForTest();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Plotr Wave 4 — 아이디어→4컷 비주얼 웹툰 & 캐릭터 일관성 바이블", () => {
  it("1문장 아이디어와 빠른 예시 칩 4종이 외부 API 없이 결정론적으로 4컷 드라마틱 웹툰을 생성한다", () => {
    const doc = generateFourCutWebtoonFromIdea({
      idea: "비 오는 옥상에서 옛 연인과 다시 마주쳤다",
      projectId: "proj-idea-unit",
    });

    expect(doc.cuts).toHaveLength(4);
    expect(doc.cuts.map((c) => inferCutCameraFraming(c))).toEqual([
      "full",
      "bust",
      "closeup",
      "high-angle",
    ]);
    expect(doc.cuts.every((c) => inferCutLightingMood(c) === "rain")).toBe(true);
    expect(doc.cuts.every((c) => c.bubblesApplied && c.renderReady)).toBe(true);
    expect(auditReverseShotAxis(doc.cuts)).toHaveLength(0);

    const audit = auditCharacterConsistencyAcrossCuts(
      doc.assets,
      doc.cuts,
      doc.codexEntries,
    );
    expect(audit.totalCharacterCount).toBe(2);
    expect(audit.issues).toHaveLength(0);
    expect(audit.consistencyScore).toBe(100);
    expect(doc.rawScript).toContain("[컷 1]");
    expect(doc.rawScript).toContain("[컷 4]");

    for (const preset of PLOTR_IDEA_QUICK_PRESETS) {
      const presetDoc = generateFourCutWebtoonFromIdea({
        idea: preset.idea,
        projectId: `proj-${preset.id}`,
      });
      expect(presetDoc.cuts).toHaveLength(4);
      expect(inferCutLightingMood(presetDoc.cuts[0]!)).toBe(preset.moodId);
      expect(
        auditCharacterConsistencyAcrossCuts(
          presetDoc.assets,
          presetDoc.cuts,
          presetDoc.codexEntries,
        ).consistencyScore,
      ).toBe(100);
    }
  });

  it("전 컷 캐릭터 일관성 감사기가 누락 참조·화자 표기 불일치·미등록 화자·빈 외형을 감지하고 원클릭 동기화로 100% 해소한다", () => {
    const base = createPlotrDocumentFromTemplate("proj-drift", "regression-hunter");
    // 강도윤 외형을 비우고, 1컷 참조를 고의로 제거하고, 대사 화자를 축약명('도윤')으로 변경해 복합 드리프트를 유도
    const drifted = {
      ...base,
      assets: base.assets.map((asset) =>
        asset.name === "강도윤" ? { ...asset, visualNote: "" } : asset,
      ),
      cuts: base.cuts.map((cut, idx) =>
        idx === 2
          ? {
              ...cut,
              referencedAssetIds: [],
              dialogues: cut.dialogues.map((d) =>
                d.speaker === "강도윤" ? { ...d, speaker: "도윤" } : d,
              ),
            }
          : cut,
      ),
    };

    const beforeAudit = auditCharacterConsistencyAcrossCuts(
      drifted.assets,
      drifted.cuts,
      drifted.codexEntries,
    );
    expect(beforeAudit.consistencyScore).toBeLessThan(100);
    expect(beforeAudit.issues.some((i) => i.kind === "empty-visual-profile")).toBe(true);
    expect(beforeAudit.issues.some((i) => i.kind === "speaker-alias-mismatch")).toBe(true);
    expect(beforeAudit.issues.some((i) => i.kind === "missing-asset-reference")).toBe(true);
    expect(beforeAudit.issues.some((i) => i.kind === "unregistered-speaker")).toBe(true);

    const synced = syncCharacterConsistencyAcrossCuts(drifted);
    expect(synced.auditAfter.issues).toHaveLength(0);
    expect(synced.auditAfter.consistencyScore).toBe(100);
    expect(synced.addedCharacterCount).toBeGreaterThanOrEqual(1);
    expect(synced.normalizedSpeakerCount).toBeGreaterThanOrEqual(1);
    expect(synced.linkedCutCount).toBeGreaterThanOrEqual(1);
    // 화자 이름 통일 후에도 원문 대사 텍스트는 100% 보존된다.
    expect(synced.nextDocument.cuts[2]!.dialogues[0]!.speaker).toBe("강도윤");
    expect(synced.nextDocument.cuts[2]!.dialogues[0]!.text).toBe(
      base.cuts[2]!.dialogues[0]!.text,
    );
  });

  it("구도·조명 전환, 콘티 요약 생성, HTML5 Canvas 4컷 PNG 렌더링 및 레거시 스키마 v1 역직렬화가 안전하게 동작한다", () => {
    const doc = generateFourCutWebtoonFromIdea({
      idea: "노을 진 연회장에서 은빛 회중시계가 거꾸로 돌기 시작했다",
      projectId: "proj-canvas",
    });

    const reframed = applyCutFramingPreset(doc.cuts, doc.cuts[0]!.id, "closeup");
    expect(inferCutCameraFraming(reframed[0]!)).toBe("closeup");
    expect(reframed[0]!.cameraShot).toContain("클로즈업");

    const relit = applyCutLightingMood(reframed, reframed[0]!.id, "neon-night");
    expect(inferCutLightingMood(relit[0]!)).toBe("neon-night");

    const summary = buildVisualContiSummaryText({ ...doc, cuts: relit });
    expect(summary).toContain("캐릭터 일관성 바이블");
    expect(summary).toContain("클로즈업");
    expect(summary).toContain("네온밤");

    // Canvas 2D 미지원(null) 환경에서도 예외 없이 안전 가드로 응답한다.
    const fallbackCanvas = document.createElement("canvas");
    vi.spyOn(fallbackCanvas, "getContext").mockReturnValue(null);
    const fallbackRes = renderVisualStoryboardToCanvas(fallbackCanvas, doc);
    expect(fallbackRes.ok).toBe(false);
    expect(fallbackRes.renderedCutCount).toBe(0);

    // 모킹된 2D 컨텍스트에서 4컷 전체를 OKLCH로 그려 PNG dataURL을 반환한다.
    const mockCtx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    } as unknown as CanvasRenderingContext2D;
    const mockCanvas = document.createElement("canvas");
    vi.spyOn(mockCanvas, "getContext").mockReturnValue(mockCtx);
    vi.spyOn(mockCanvas, "toDataURL").mockReturnValue("data:image/png;base64,PLOTR4CUT");

    const okRes = renderVisualStoryboardToCanvas(mockCanvas, doc);
    expect(okRes.ok).toBe(true);
    expect(okRes.renderedCutCount).toBe(4);
    expect(okRes.dataUrl).toBe("data:image/png;base64,PLOTR4CUT");
    expect(mockCtx.fillText).toHaveBeenCalled();

    // 신규 옵셔널 필드가 없는 기존 스키마 v1 JSON도 100% 호환 복원된다.
    const legacyRaw = JSON.stringify({
      schemaVersion: 1,
      projectId: "proj-legacy",
      title: "기존 저장본",
      templateId: null,
      format: "webtoon",
      inputMode: "script",
      helper: doc.helper,
      rawScript: "[컷 1] 테스트",
      assets: [],
      cuts: [],
      artStyle: doc.artStyle,
      customStylePresets: [],
      panelBorderEnabled: true,
      panelBorderWidthPx: 3,
      scenes: [],
      sceneSnapshots: [],
      codexEntries: [],
      subwayTimeline: doc.subwayTimeline,
      spatialBoard: doc.spatialBoard,
      updatedAtIso: "2026-11-20T00:00:00.000Z",
    });
    expect(parsePlotrDocumentState(legacyRaw, "proj-legacy")?.title).toBe("기존 저장본");
  });

  it("워크벤치 UI에서 1문장 생성 → 비주얼 컷 구도/조명 실시간 전환 → 캐릭터 바이블 팔레트/표정 락 → 동기화·복사·재마운트 복원이 동작한다", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const projectId = "proj-visual-ui-e2e";
    const { unmount } = render(
      <MemoryRouter>
        <PlotrStoryAtelierWorkbench projectId={projectId} />
      </MemoryRouter>,
    );

    // 1) 1문장 아이디어 직접 입력 후 4컷 비주얼 웹툰 생성
    const ideaInput = screen.getByTestId("plotr-idea-input") as HTMLInputElement;
    fireEvent.change(ideaInput, {
      target: { value: "비 오는 옥상에서 옛 연인과 다시 마주쳤다" },
    });
    fireEvent.click(screen.getByTestId("plotr-idea-generate-btn"));

    const cutList = screen.getByTestId("plotr-cut-strip-list");
    expect(cutList.children).toHaveLength(4);

    // 2) 첫 번째 비주얼 컷 프리뷰 카드에서 구도(클로즈업) · 조명(네온밤) 원클릭 전환
    const preview1 = screen.getByTestId("plotr-visual-preview-plotr-idea-cut-1");
    expect(preview1.getAttribute("data-framing")).toBe("full");
    expect(preview1.getAttribute("data-mood")).toBe("rain");

    fireEvent.click(screen.getByTestId("plotr-cut-framing-plotr-idea-cut-1-closeup"));
    fireEvent.click(screen.getByTestId("plotr-cut-mood-plotr-idea-cut-1-neon-night"));
    expect(preview1.getAttribute("data-framing")).toBe("closeup");
    expect(preview1.getAttribute("data-mood")).toBe("neon-night");

    // 3) 캐릭터 일관성 바이블에서 표정 락(분노) & 3색 팔레트 교체 + 콘티 시트 복사
    const bibleGrid = screen.getByTestId("plotr-character-bible-grid");
    expect(within(bibleGrid).getAllByRole("article")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("plotr-char-expr-asset-idea-char-1-angry"));
    fireEvent.click(screen.getByTestId("plotr-char-palette-asset-idea-char-1-2"));
    expect(
      screen
        .getByTestId("plotr-char-expr-asset-idea-char-1-angry")
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByTestId("plotr-copy-conti-summary-btn"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    // 4) 재마운트 후에도 선택한 구도(closeup)·조명(neon-night)·표정 락(angry)이 영속 복원된다.
    unmount();
    render(
      <MemoryRouter>
        <PlotrStoryAtelierWorkbench projectId={projectId} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const restored = screen.getByTestId("plotr-visual-preview-plotr-idea-cut-1");
      expect(restored.getAttribute("data-framing")).toBe("closeup");
      expect(restored.getAttribute("data-mood")).toBe("neon-night");
    });
    expect(
      screen
        .getByTestId("plotr-char-expr-asset-idea-char-1-angry")
        .getAttribute("aria-pressed"),
    ).toBe("true");

    // 5) 회귀헌터 샘플 전환 → 자동 감지된 드리프트 경고 확인 → 원클릭 전 컷 일관성 동기화로 100% 복구
    fireEvent.click(screen.getByTestId("plotr-template-regression-hunter"));
    expect(screen.getByTestId("plotr-consistency-drift-panel")).toBeTruthy();
    fireEvent.click(screen.getByTestId("plotr-sync-character-consistency-btn"));
    expect(screen.queryByTestId("plotr-consistency-drift-panel")).toBeNull();
    expect(screen.getByTestId("plotr-consistency-score").textContent).toContain("100%");
  });

  it("Wave 4 신규·수정 Plotr 모듈 전부 800줄 이하 · OKLCH 전용 · 무금지패턴 · 모션/접근성 가드레일을 준수한다", () => {
    const wave4Files = [
      "plotr-types.ts",
      "plotr-character-sheet-model.ts",
      "plotr-visual-cut-renderer.ts",
      "plotr-visual-canvas-export.ts",
      "PlotrIdeaToWebtoonBar.tsx",
      "PlotrVisualCutPreviewCard.tsx",
      "PlotrCharacterConsistencySheet.tsx",
      "PlotrScriptHelperDrawer.tsx",
      "PlotrCutStripAndAssetsPane.tsx",
      "PlotrStoryAtelierWorkbench.tsx",
    ];
    for (const name of wave4Files) {
      const src = readFileSync(resolve(__dirname, name), "utf8");
      expect(src.split("\n").length, name).toBeLessThanOrEqual(800);
      expect(src, name).not.toContain("@ts-nocheck");
      expect(src, name).not.toContain("@ts-ignore");
      expect(src, name).not.toContain("eslint-disable");
      expect(src, name).not.toContain("transition-all");
      expect(src, name).not.toContain("animate-spin");
      expect(src, name).not.toContain("animate-bounce");
      expect(src, name).not.toContain("animate-ping");
      expect(src, name).not.toContain("bg-white");
      expect(src, name).not.toContain("font-black");
      expect(src, name).not.toMatch(/:\s*any\b/u);
      expect(src, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src, name).not.toMatch(/\brgb\s*\(/u);
    }

    const css = readFileSync(resolve(__dirname, "plotr-story-atelier.css"), "utf8");
    expect(css.split("\n").length).toBeLessThanOrEqual(800);
    expect(css).toContain("color-mix(in oklch");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("prefers-contrast: more");
    expect(css).toContain("forced-colors: active");
    expect(css).not.toContain("transition-all");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/\brgb\s*\(/u);
  });
});
