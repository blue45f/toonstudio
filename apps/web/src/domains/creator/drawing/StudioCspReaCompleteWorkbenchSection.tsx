import { useMemo, useState, type ReactElement } from "react";

import { CSP_DEFAULT_LAF_AUTO_ACTION_SET } from "../../../../../../packages/studio-format-gateway/src/csp-laf-sgs-spws";
import {
  CSP_REA_ALL_FILTER_SPECS,
  executeCspReaFilter,
  type CspReaFilterCategory,
  type CspReaFilterId,
} from "../filter/csp-rea/csp-rea-unified-filter-registry";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  CSP_REA_EXECUTABLE_BRUSH_PRESETS,
  adjustCspVectorLineWidth,
  renderCspFullBrushStroke,
} from "./studio-csp-brush-stroke-engine";
import {
  combineCspStoryPagesToSpread,
  compositeCspOnionSkinRgba,
  createCspAutoActionDocumentState,
  createCspStoryProject,
  executeCspAutoAction,
  floodFillCspWithCloseGapAndExpand,
  projectPolylineToCspRuler,
  rasterizeCspFocusAndStreamLines,
  rasterizeCspScreentoneLayer,
  splitCspComicFramePolygon,
} from "./studio-csp-core-features-engine";
import {
  CSP_REA_INTERNALIZATION_OBLIGATIONS,
  CSP_REA_STATIC_EVIDENCE_RECORDS,
  evaluateCspReaInternalizationCoverage,
} from "./studio-csp-rea-obligation-ledger";

export type CspReaWorkbenchTabId = "brush" | "filter" | "core" | "evidence";

export interface StudioCspReaCompleteWorkbenchSectionProps {
  readonly initialTab?: CspReaWorkbenchTabId;
  readonly onSelectPresetId?: (presetId: string) => void;
  readonly onApplyFilterId?: (filterId: CspReaFilterId) => void;
}

const TABS: readonly { readonly id: CspReaWorkbenchTabId; readonly labelKo: string }[] = [
  { id: "brush", labelKo: "브러시 엔진 (24종)" },
  { id: "filter", labelKo: "필터 · 색조 (46종)" },
  { id: "core", labelKo: "만화 · 애니 제작" },
  { id: "evidence", labelKo: "검증 원장" },
];

const FILTER_CATEGORY_LABELS_KO: Readonly<Record<CspReaFilterCategory, string>> = {
  blur: "흐리기",
  distort: "변형·왜곡",
  sharpen: "선명도",
  effect: "효과",
  "noise-render": "노이즈",
  "tonal-correction": "색조 보정",
  "layer-convert": "레이어 변환",
};

const BRUSH_CATEGORY_LABELS_KO: Readonly<Record<string, string>> = {
  pen: "펜",
  "pencil-pastel": "연필·파스텔",
  watercolor: "수채",
  "thick-paint": "유화·구아슈",
  "india-ink": "먹·붓펜",
  airbrush: "에어브러시",
  blend: "혼색",
  decoration: "데코레이션",
  eraser: "지우개",
};

function formatBrushFeatureLabelKo(featureCode: string): string {
  if (featureCode === "aa-level-0") return "도트 1비트(무안티)";
  if (featureCode === "aa-level-1") return "안티에일리어싱(약)";
  if (featureCode === "aa-level-2") return "안티에일리어싱(중)";
  if (featureCode === "aa-level-3") return "안티에일리어싱(강)";
  if (featureCode === "stabilizer") return "손떨림 보정";
  if (featureCode === "in-out-taper") return "들어가기·빼기 테이퍼";
  if (featureCode === "ribbon") return "리본 스트로크";
  if (featureCode === "spray") return "스프레이 입자 분산";
  if (featureCode === "color-jitter") return "색상 지터";
  if (featureCode === "wet-perceptual-lms") return "지각 LMS 습식 혼색";
  if (featureCode === "wet-standard-rgb") return "표준 습식 혼색";
  if (featureCode.startsWith("water-edge-")) return "수채 경계";
  if (featureCode.startsWith("dual-")) return "이중 브러시";
  if (featureCode.startsWith("texture-")) return "종이 텍스처";
  return featureCode;
}

function createDemoSampleRgba(width: number, height: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const isInk = Math.abs(x - y) <= 1 || x === Math.floor(width / 2);
      buf[idx] = isInk ? 24 : 210 + ((x * 5) % 35);
      buf[idx + 1] = isInk ? 28 : 170 + ((y * 7) % 45);
      buf[idx + 2] = isInk ? 36 : 140 + (((x + y) * 3) % 55);
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

/**
 * CSP 5.1.5 호환 브러시·필터·만화/애니 제작 통합 워크벤치 섹션.
 * 지연 로딩 전용이며 OKLCH 의미 토큰과 44px 터치 영역, 모션 축소 접근성을 준수한다.
 */
export function StudioCspReaCompleteWorkbenchSection({
  initialTab = "brush",
  onSelectPresetId,
  onApplyFilterId,
}: StudioCspReaCompleteWorkbenchSectionProps): ReactElement {
  const [activeTab, setActiveTab] = useState<CspReaWorkbenchTabId>(initialTab);
  const [selectedBrushId, setSelectedBrushId] = useState<string>(
    CSP_REA_EXECUTABLE_BRUSH_PRESETS[0]!.id,
  );
  const [selectedFilterId, setSelectedFilterId] = useState<CspReaFilterId>("tone-curve");
  const [selectedActionIdx, setSelectedActionIdx] = useState<number>(0);
  const [symmetryAxes, setSymmetryAxes] = useState<number>(6);
  const [gutterPx, setGutterPx] = useState<number>(12);
  const [spreadMerged, setSpreadMerged] = useState<boolean>(false);

  const coverage = useMemo(() => evaluateCspReaInternalizationCoverage(), []);

  const brushEvaluation = useMemo(() => {
    const preset =
      CSP_REA_EXECUTABLE_BRUSH_PRESETS.find((p) => p.id === selectedBrushId) ??
      CSP_REA_EXECUTABLE_BRUSH_PRESETS[0]!;
    const stroke = renderCspFullBrushStroke({
      width: 32,
      height: 32,
      points: [
        { x: 4, y: 16, pressure: 0.4 },
        { x: 14, y: 10, pressure: 0.9 },
        { x: 28, y: 20, pressure: 0.6 },
      ],
      mainColor: { r: 36, g: 82, b: 196 },
      subColor: { r: 232, g: 168, b: 48 },
      params: preset.params,
      seed: 42,
      isEraser: preset.category === "eraser",
    });
    const widened = adjustCspVectorLineWidth(
      [
        { x: 4, y: 16, widthPx: 3, pressure: 0.5 },
        { x: 24, y: 16, widthPx: 5, pressure: 0.8 },
      ],
      "thicken",
      1.5,
    );
    return {
      preset,
      stroke,
      featureLabelsKo: stroke.appliedFeatures.map(formatBrushFeatureLabelKo),
      widenedEndWidth: widened[1]?.widthPx ?? 5,
    };
  }, [selectedBrushId]);

  const filterEvaluation = useMemo(() => {
    const spec =
      CSP_REA_ALL_FILTER_SPECS.find((f) => f.id === selectedFilterId) ??
      CSP_REA_ALL_FILTER_SPECS[0]!;
    const src = createDemoSampleRgba(16, 16);
    const out = executeCspReaFilter(spec.id, src, 16, 16);
    let diffCount = 0;
    for (let i = 0; i < src.length; i += 4) {
      if (
        src[i] !== out[i] ||
        src[i + 1] !== out[i + 1] ||
        src[i + 2] !== out[i + 2] ||
        src[i + 3] !== out[i + 3]
      ) {
        diffCount += 1;
      }
    }
    return { spec, changedPixels: diffCount };
  }, [selectedFilterId]);

  const coreEvaluation = useMemo(() => {
    const sampleDoc = createCspAutoActionDocumentState(16, 16, createDemoSampleRgba(16, 16));
    const action =
      CSP_DEFAULT_LAF_AUTO_ACTION_SET.actions[selectedActionIdx] ??
      CSP_DEFAULT_LAF_AUTO_ACTION_SET.actions[0]!;
    const actionRun = executeCspAutoAction(sampleDoc, action);

    const fillRes = floodFillCspWithCloseGapAndExpand({
      targetRgba: new Uint8ClampedArray(16 * 16 * 4),
      width: 16,
      height: 16,
      seedX: 8,
      seedY: 8,
      fillColor: [64, 148, 224, 255],
      closeGapPx: 1,
      expandPx: 1,
    });

    const split = splitCspComicFramePolygon({
      polygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      cutStart: { x: 0, y: 50 },
      cutEnd: { x: 100, y: 50 },
      gutterPx,
    });

    const toneBytes = rasterizeCspScreentoneLayer({
      width: 16,
      height: 16,
      dotShape: "cherryblossom-01",
      lpi: 60,
      angleDeg: 45,
      fixedDensity01: 0.45,
    });
    let toneInkPixels = 0;
    for (let i = 3; i < toneBytes.length; i += 4) {
      if ((toneBytes[i] ?? 0) > 32) toneInkPixels += 1;
    }

    const focusBytes = rasterizeCspFocusAndStreamLines({
      width: 24,
      height: 24,
      mode: "focus-lines",
      lineCount: 16,
    });
    let focusInkPixels = 0;
    for (let i = 3; i < focusBytes.length; i += 4) {
      if ((focusBytes[i] ?? 0) > 32) focusInkPixels += 1;
    }

    const rulerBranches = projectPolylineToCspRuler(
      { type: "symmetry", origin: { x: 50, y: 50 }, symmetryLineCount: symmetryAxes, mirrorReflect: true },
      [
        { x: 60, y: 40 },
        { x: 75, y: 55 },
      ],
    );

    const onionRgba = compositeCspOnionSkinRgba({
      width: 8,
      height: 8,
      currentFrameRgba: createDemoSampleRgba(8, 8),
      prevFrames: [createDemoSampleRgba(8, 8)],
      nextFrames: [createDemoSampleRgba(8, 8)],
    });
    let onionVisiblePixels = 0;
    for (let i = 3; i < onionRgba.length; i += 4) {
      if ((onionRgba[i] ?? 0) > 0) onionVisiblePixels += 1;
    }

    const baseStory = createCspStoryProject("웹툰·코믹 단행본", 8, "right-to-left");
    const story = spreadMerged ? combineCspStoryPagesToSpread(baseStory, 1) : baseStory;

    return {
      actionName: action.actionName,
      executedStepCount: actionRun.executedStepCount,
      resultingLayers: actionRun.nextDoc.layers.length,
      filledPixels: fillRes.filledPixelCount,
      splitVerticesA: split.panelA.length,
      splitVerticesB: split.panelB.length,
      toneInkPixels,
      focusInkPixels,
      rulerBranchCount: rulerBranches.length,
      onionVisiblePixels,
      storyNodeCount: story.pages.length,
    };
  }, [selectedActionIdx, gutterPx, symmetryAxes, spreadMerged]);

  return (
    <section
      data-testid="csp-rea-complete-workbench"
      className="space-y-3 rounded-xl border border-line bg-panel p-3 text-xs text-fg [word-break:keep-all]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <div>
          <h3 className="text-sm font-semibold text-fg">
            브러시 · 필터 · 만화 제작 스튜디오
          </h3>
          <p className="text-xs text-fg-2">
            브러시 {coverage.brushEngineSummary.executablePresetCount}종 · 필터·색조{" "}
            {coverage.filterEngineSummary.totalExecutableFilters}종 · 제작 도구{" "}
            {coverage.coreFeatureSummary.executableCoreSubsystemCount}모듈 · 내재화{" "}
            {coverage.coveragePercent}%
          </p>
        </div>
        <div role="tablist" aria-label="스튜디오 제작 도구 영역" className="flex flex-wrap gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-11 min-w-11 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${STUDIO_FOCUS_RING} ${
                activeTab === tab.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:bg-raised"
              }`}
            >
              {tab.labelKo}
            </button>
          ))}
        </div>
      </header>

      {activeTab === "brush" && (
        <div data-testid="csp-rea-tab-brush" className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="csp-rea-brush-select" className="font-medium text-fg-2">
              서브툴 프리셋
            </label>
            <select
              id="csp-rea-brush-select"
              value={selectedBrushId}
              onChange={(e) => {
                setSelectedBrushId(e.target.value);
                onSelectPresetId?.(e.target.value);
              }}
              className={`min-h-11 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg ${STUDIO_FOCUS_RING}`}
            >
              {CSP_REA_EXECUTABLE_BRUSH_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameKo} ({BRUSH_CATEGORY_LABELS_KO[p.category] ?? p.category})
                </option>
              ))}
            </select>
          </div>
          <div
            data-testid="csp-rea-brush-readout"
            className="grid grid-cols-1 gap-2 rounded-lg bg-card p-2.5 md:grid-cols-3"
          >
            <div>
              <div className="text-fg-3">실시간 브러시 스트로크 시뮬레이션</div>
              <div className="font-semibold tabular-nums">
                스탬프 {brushEvaluation.stroke.dabCount}회 · 변경 픽셀{" "}
                {brushEvaluation.stroke.modifiedPixelCount}px
              </div>
            </div>
            <div>
              <div className="text-fg-3">적용된 브러시 효과</div>
              <div className="font-medium text-fg">
                {brushEvaluation.featureLabelsKo.join(" · ")}
              </div>
            </div>
            <div>
              <div className="text-fg-3">벡터 선폭 보정</div>
              <div className="font-semibold tabular-nums">
                5.0px → {brushEvaluation.widenedEndWidth}px
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "filter" && (
        <div data-testid="csp-rea-tab-filter" className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="csp-rea-filter-select" className="font-medium text-fg-2">
              필터 · 색조 보정 ({CSP_REA_ALL_FILTER_SPECS.length}종)
            </label>
            <select
              id="csp-rea-filter-select"
              value={selectedFilterId}
              onChange={(e) => {
                const next = e.target.value as CspReaFilterId;
                setSelectedFilterId(next);
                onApplyFilterId?.(next);
              }}
              className={`min-h-11 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg ${STUDIO_FOCUS_RING}`}
            >
              {CSP_REA_ALL_FILTER_SPECS.map((f) => (
                <option key={f.id} value={f.id}>
                  [{FILTER_CATEGORY_LABELS_KO[f.category]}] {f.labelKo}
                </option>
              ))}
            </select>
          </div>
          <div
            data-testid="csp-rea-filter-readout"
            className="grid grid-cols-1 gap-2 rounded-lg bg-card p-2.5 md:grid-cols-3"
          >
            <div>
              <div className="text-fg-3">선택 필터</div>
              <div className="font-semibold">{filterEvaluation.spec.labelKo}</div>
            </div>
            <div>
              <div className="text-fg-3">실제 픽셀 처리 결과</div>
              <div className="font-semibold tabular-nums">
                변환 픽셀 {filterEvaluation.changedPixels}/256
              </div>
            </div>
            <div>
              <div className="text-fg-3">세부 조절 항목</div>
              <div className="font-semibold tabular-nums">
                {filterEvaluation.spec.parameters.length}개 파라미터
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "core" && (
        <div data-testid="csp-rea-tab-core" className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="오토 액션 선택"
              value={selectedActionIdx}
              onChange={(e) => setSelectedActionIdx(Number(e.target.value))}
              className={`min-h-11 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg ${STUDIO_FOCUS_RING}`}
            >
              {CSP_DEFAULT_LAF_AUTO_ACTION_SET.actions.map((a, idx) => (
                <option key={a.actionUuid} value={idx}>
                  오토 액션: {a.actionName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSymmetryAxes((prev) => (prev >= 12 ? 2 : prev + 2))}
              className={`min-h-11 min-w-11 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-raised motion-reduce:transition-none ${STUDIO_FOCUS_RING}`}
            >
              대칭 자: {symmetryAxes}축
            </button>
            <button
              type="button"
              onClick={() => setGutterPx((prev) => (prev >= 24 ? 6 : prev + 6))}
              className={`min-h-11 min-w-11 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-raised motion-reduce:transition-none ${STUDIO_FOCUS_RING}`}
            >
              컷 간격: {gutterPx}px
            </button>
            <button
              type="button"
              onClick={() => setSpreadMerged((prev) => !prev)}
              className={`min-h-11 min-w-11 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-raised motion-reduce:transition-none ${STUDIO_FOCUS_RING}`}
            >
              {spreadMerged ? "펼침 페이지 분할" : "2·3쪽 펼침 결합"}
            </button>
          </div>
          <div
            data-testid="csp-rea-core-readout"
            className="grid grid-cols-1 gap-2 rounded-lg bg-card p-2.5 md:grid-cols-3"
          >
            <div>
              <div className="text-fg-3">오토 액션 · 스마트 채우기</div>
              <div className="font-medium tabular-nums">
                {coreEvaluation.actionName} ({coreEvaluation.executedStepCount}단계 →{" "}
                {coreEvaluation.resultingLayers}레이어) · 채움 {coreEvaluation.filledPixels}px
              </div>
            </div>
            <div>
              <div className="text-fg-3">컷 분할 · 스크린톤 · 집중선</div>
              <div className="font-medium tabular-nums">
                컷 정점 {coreEvaluation.splitVerticesA}+{coreEvaluation.splitVerticesB} · 톤{" "}
                {coreEvaluation.toneInkPixels}px · 집중선 {coreEvaluation.focusInkPixels}px
              </div>
            </div>
            <div>
              <div className="text-fg-3">대칭 자 · 어니언 스킨 · 스토리</div>
              <div className="font-medium tabular-nums">
                복제 경로 {coreEvaluation.rulerBranchCount}줄 · 어니언 합성{" "}
                {coreEvaluation.onionVisiblePixels}px · 페이지 {coreEvaluation.storyNodeCount}개
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "evidence" && (
        <div data-testid="csp-rea-tab-evidence" className="rounded-lg bg-card p-2.5">
          <div className="font-semibold text-fg">
            클린룸 분석 증거 {CSP_REA_STATIC_EVIDENCE_RECORDS.length}건 · 검증 완료{" "}
            {coverage.obligationVerifiedCount}/{coverage.obligationTotal} ({coverage.coveragePercent}
            %) · 분석 엔진: {coverage.analysisProviderEnforced}
          </div>
          <ul className="mt-1.5 divide-y divide-line text-fg-2">
            {CSP_REA_INTERNALIZATION_OBLIGATIONS.map((item) => (
              <li key={item.obligationId} className="py-1">
                <span className="font-semibold text-accent">[{item.obligationId}]</span>{" "}
                {item.titleKo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
