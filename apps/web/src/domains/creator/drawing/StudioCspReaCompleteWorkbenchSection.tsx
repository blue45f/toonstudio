import { useMemo, useState, type ReactElement } from "react";

import { CSP_DEFAULT_LAF_AUTO_ACTION_SET } from "../../../../../../packages/studio-format-gateway/src/csp-laf-sgs-spws";
import {
  CSP_REA_ALL_FILTER_SPECS,
  executeCspReaFilter,
  type CspReaFilterCategory,
  type CspReaFilterId,
} from "../filter/csp-rea/csp-rea-unified-filter-registry";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { StudioCspProExToolsPanel } from "./StudioCspProExToolsPanel";
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
import { evaluateCspReaInternalizationCoverage } from "./studio-csp-rea-obligation-ledger";

export type CspReaWorkbenchTabId = "brush" | "filter" | "core";
export type CspCoreToolSegmentId = "basic" | "pro-ex";

export interface StudioCspReaCompleteWorkbenchSectionProps {
  readonly initialTab?: CspReaWorkbenchTabId;
  readonly initialCoreSegment?: CspCoreToolSegmentId;
  readonly onSelectPresetId?: (presetId: string) => void;
  readonly onApplyFilterId?: (filterId: CspReaFilterId) => void;
  readonly onRunCoreFeature?: (featureId: string) => void;
}

const TABS: readonly {
  readonly id: CspReaWorkbenchTabId;
  readonly labelKo: string;
  readonly guideKo: string;
}[] = [
  {
    id: "brush",
    labelKo: "브러시 고르기",
    guideKo: "원하는 펜·수채·유화 브러시를 고른 뒤 바로 그리기를 눌러 캔버스에 적용하세요.",
  },
  {
    id: "filter",
    labelKo: "필터·색조 보정",
    guideKo: "흐리기·왜곡·색조 보정 46종 가운데 효과를 고르고 현재 레이어에 바로 적용하세요.",
  },
  {
    id: "core",
    labelKo: "만화·애니 도구",
    guideKo:
      "오토 액션·대칭 자·컷 분할·어니언 스킨과 프로·자동 도구(벡터 교차 지우개·힌트 채색·그라데이션 맵 8종 등)를 바로 실행하세요.",
  },
];

const SUPPORTED_CAPABILITY_HIGHLIGHTS_KO: readonly string[] = [
  "펜·연필·수채·유화·먹붓·에어브러시·혼색·데코·지우개 24종 브러시 프리셋",
  "이중 브러시·종이 질감·리본·스프레이·수채 경계·손떨림 보정·벡터 선폭 다듬기",
  "가우시안·모션·방사형 흐리기와 어안·물결·소용돌이·색수차 등 효과 필터 31종",
  "밝기·대비·색조·레벨·톤 커브·컬러 밸런스·그라데이션 맵·경계 효과 등 색조 보정 12종",
  "배경 선·톤 추출, 래스터-벡터 선 변환, 참고 이미지 색감 맞추기 3종",
  "틈 닫기·영역 확장 스마트 채우기와 선택 영역 확장·축소·테두리·흐리기",
  "대칭·퍼스·동심원·방사형·평행선 자 스냅 및 컷 테두리 분할·22종 스크린톤·집중선",
  "원클릭 오토 액션 일괄 실행, 2D 셀 어니언 스킨·라이트 테이블, 다중 페이지 펼침 관리",
  "벡터 교차점 지우개 3모드·선 단순화·제어점 당기기 및 선화 경계 인식 힌트 자동 채색",
  "웹툰 그라데이션 맵 8종·서브뷰 대표색 팔레트 추출·퀵 마스크·타임랩스·3D 데생 인형 프리셋 6종",
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

const SPECTRUM_RIBBON_STYLE = {
  backgroundImage:
    "linear-gradient(90deg, color-mix(in oklch, var(--color-accent) 88%, transparent), color-mix(in oklch, var(--color-info, var(--color-accent)) 82%, transparent), color-mix(in oklch, var(--color-success, var(--color-accent)) 78%, transparent))",
} as const;

const HEADER_TINT_STYLE = {
  backgroundImage:
    "radial-gradient(70% 120% at 10% 0%, color-mix(in oklch, var(--color-accent) 14%, transparent), transparent 72%)",
} as const;

const ACTIVE_TAB_GLOW_STYLE = {
  boxShadow:
    "0 0 0 1px color-mix(in oklch, var(--color-accent) 46%, transparent), 0 6px 16px -8px color-mix(in oklch, var(--color-accent) 48%, transparent)",
} as const;

const PRIMARY_CTA_STYLE = {
  backgroundColor: "var(--color-accent)",
  color: "var(--color-on-accent)",
  boxShadow:
    "0 0 0 1px color-mix(in oklch, var(--color-accent) 55%, transparent), 0 8px 18px -8px color-mix(in oklch, var(--color-accent) 58%, transparent)",
} as const;

const APPLIED_BADGE_STYLE = {
  backgroundColor:
    "color-mix(in oklch, var(--color-success, var(--color-accent)) 14%, var(--color-card))",
  borderColor:
    "color-mix(in oklch, var(--color-success, var(--color-accent)) 45%, transparent)",
} as const;

function formatBrushFeatureLabelKo(featureCode: string): string {
  if (featureCode === "aa-level-0") return "도트 1비트 선";
  if (featureCode === "aa-level-1") return "부드러운 외곽(약)";
  if (featureCode === "aa-level-2") return "부드러운 외곽(중)";
  if (featureCode === "aa-level-3") return "부드러운 외곽(강)";
  if (featureCode === "stabilizer") return "손떨림 보정";
  if (featureCode === "in-out-taper") return "필압 끝 가늘게";
  if (featureCode === "ribbon") return "리본 무늬 이어 그리기";
  if (featureCode === "spray") return "스프레이 입자 분산";
  if (featureCode === "color-jitter") return "색상 자연 변동";
  if (featureCode === "wet-perceptual-lms") return "자연 수채 혼색";
  if (featureCode === "wet-standard-rgb") return "표준 물감 혼색";
  if (featureCode.startsWith("water-edge-")) return "수채 물감 경계";
  if (featureCode.startsWith("dual-")) return "이중 브러시 질감";
  if (featureCode.startsWith("texture-")) return "종이 결 텍스처";
  return featureCode;
}

function createDemoSamplePixels(width: number, height: number): Uint8ClampedArray {
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
 * 창작자 중심 브러시·필터·만화/애니 제작 통합 워크벤치 섹션.
 * 지연 로딩 전용이며 OKLCH 의미 토큰·스펙트럼 연출·44px 터치 타깃·모션 축소를 준수한다.
 */
export function StudioCspReaCompleteWorkbenchSection({
  initialTab = "brush",
  initialCoreSegment = "basic",
  onSelectPresetId,
  onApplyFilterId,
  onRunCoreFeature,
}: StudioCspReaCompleteWorkbenchSectionProps): ReactElement {
  const [activeTab, setActiveTab] = useState<CspReaWorkbenchTabId>(initialTab);
  const [coreSegment, setCoreSegment] = useState<CspCoreToolSegmentId>(initialCoreSegment);
  const [selectedBrushId, setSelectedBrushId] = useState<string>(
    CSP_REA_EXECUTABLE_BRUSH_PRESETS[0]!.id,
  );
  const [selectedFilterId, setSelectedFilterId] = useState<CspReaFilterId>("tone-curve");
  const [selectedActionIdx, setSelectedActionIdx] = useState<number>(0);
  const [symmetryAxes, setSymmetryAxes] = useState<number>(6);
  const [gutterPx, setGutterPx] = useState<number>(12);
  const [spreadMerged, setSpreadMerged] = useState<boolean>(false);
  const [appliedNoticeKo, setAppliedNoticeKo] = useState<string | null>(null);

  const coverage = useMemo(() => evaluateCspReaInternalizationCoverage(), []);
  const activeTabMeta = useMemo(
    () => TABS.find((t) => t.id === activeTab) ?? TABS[0]!,
    [activeTab],
  );

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
    const src = createDemoSamplePixels(16, 16);
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
    const sampleDoc = createCspAutoActionDocumentState(16, 16, createDemoSamplePixels(16, 16));
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
      currentFrameRgba: createDemoSamplePixels(8, 8),
      prevFrames: [createDemoSamplePixels(8, 8)],
      nextFrames: [createDemoSamplePixels(8, 8)],
    });
    let onionVisiblePixels = 0;
    for (let i = 3; i < onionRgba.length; i += 4) {
      if ((onionRgba[i] ?? 0) > 0) onionVisiblePixels += 1;
    }

    const baseStory = createCspStoryProject("웹툰·코믹 단행본", 8, "right-to-left");
    const story = spreadMerged ? combineCspStoryPagesToSpread(baseStory, 1) : baseStory;

    return {
      actionUuid: action.actionUuid,
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

  const handleApplyBrush = (): void => {
    onSelectPresetId?.(brushEvaluation.preset.id);
    setAppliedNoticeKo(`'${brushEvaluation.preset.nameKo}' 브러시 적용됨 · 언제든 되돌리기 가능`);
  };

  const handleApplyFilter = (): void => {
    onApplyFilterId?.(filterEvaluation.spec.id);
    setAppliedNoticeKo(`'${filterEvaluation.spec.labelKo}' 필터 적용됨 · 언제든 되돌리기 가능`);
  };

  const handleRunCoreFeature = (): void => {
    const featureId = `auto-action:${coreEvaluation.actionUuid}`;
    onRunCoreFeature?.(featureId);
    setAppliedNoticeKo(`'${coreEvaluation.actionName}' 도구 적용됨 · 언제든 되돌리기 가능`);
  };

  const tactileButtonClass =
    "min-h-11 min-w-11 rounded-lg px-3 py-1.5 text-xs font-semibold transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none";

  return (
    <section
      data-testid="csp-rea-complete-workbench"
      className="overflow-hidden rounded-xl border border-line bg-panel text-xs text-fg [word-break:keep-all]"
    >
      {/* 상단 OKLCH 스펙트럼 리본 */}
      <div
        aria-hidden="true"
        data-testid="csp-rea-spectrum-ribbon"
        className="h-1 w-full"
        style={SPECTRUM_RIBBON_STYLE}
      />

      <div className="space-y-3 p-3" style={HEADER_TINT_STYLE}>
        <header className="flex flex-wrap items-start justify-between gap-2.5 border-b border-line pb-2.5">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-fg">
              브러시 · 필터 · 만화 제작 스튜디오
            </h3>
            <p className="text-xs text-fg-2">{activeTabMeta.guideKo}</p>
          </div>
          <div
            role="tablist"
            aria-label="제작 도구 선택"
            className="flex flex-wrap gap-1.5"
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  style={isActive ? ACTIVE_TAB_GLOW_STYLE : undefined}
                  className={`${tactileButtonClass} border ${STUDIO_FOCUS_RING} ${
                    isActive
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  }`}
                >
                  {tab.labelKo}
                </button>
              );
            })}
          </div>
        </header>

        {appliedNoticeKo !== null && (
          <div
            role="status"
            aria-live="polite"
            data-testid="csp-rea-applied-feedback"
            style={APPLIED_BADGE_STYLE}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold text-fg"
          >
            <span>✓ {appliedNoticeKo}</span>
            <button
              type="button"
              onClick={() => setAppliedNoticeKo(null)}
              className={`min-h-11 min-w-11 rounded-md px-2 text-xs font-medium text-fg-2 hover:text-fg ${STUDIO_FOCUS_RING}`}
            >
              닫기
            </button>
          </div>
        )}

        {activeTab === "brush" && (
          <div data-testid="csp-rea-tab-brush" className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="csp-rea-brush-select" className="font-medium text-fg-2">
                브러시 선택
              </label>
              <select
                id="csp-rea-brush-select"
                value={selectedBrushId}
                onChange={(e) => {
                  setSelectedBrushId(e.target.value);
                  onSelectPresetId?.(e.target.value);
                }}
                className={`min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg sm:flex-initial ${STUDIO_FOCUS_RING}`}
              >
                {CSP_REA_EXECUTABLE_BRUSH_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameKo} ({BRUSH_CATEGORY_LABELS_KO[p.category] ?? p.category})
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid="csp-rea-brush-primary-cta"
                onClick={handleApplyBrush}
                style={PRIMARY_CTA_STYLE}
                className={`${tactileButtonClass} px-4 hover:brightness-105 ${STUDIO_FOCUS_RING}`}
              >
                이 브러시로 그리기
              </button>
            </div>
            <div
              data-testid="csp-rea-brush-readout"
              className="hidden grid-cols-1 gap-2 rounded-lg bg-card p-2.5 md:grid md:grid-cols-3"
            >
              <div>
                <div className="text-fg-3">실시간 필압 미리보기</div>
                <div className="font-semibold tabular-nums">
                  찍힘 {brushEvaluation.stroke.dabCount}회 · 채워진 영역{" "}
                  {brushEvaluation.stroke.modifiedPixelCount}px
                </div>
              </div>
              <div>
                <div className="text-fg-3">적용되는 브러시 질감</div>
                <div className="font-medium text-fg">
                  {brushEvaluation.featureLabelsKo.join(" · ")}
                </div>
              </div>
              <div>
                <div className="text-fg-3">벡터 선 굵기 조절</div>
                <div className="font-semibold tabular-nums">
                  5.0px → {brushEvaluation.widenedEndWidth}px
                </div>
              </div>
            </div>
            <details className="rounded-lg bg-card px-2.5 py-1.5 md:hidden">
              <summary
                className={`flex min-h-11 cursor-pointer items-center font-medium text-fg-2 ${STUDIO_FOCUS_RING}`}
              >
                브러시 질감 미리보기 수치 보기
              </summary>
              <div className="space-y-1 pb-2 text-fg-2 tabular-nums">
                <div>
                  찍힘 {brushEvaluation.stroke.dabCount}회 · 채워진 영역{" "}
                  {brushEvaluation.stroke.modifiedPixelCount}px
                </div>
                <div>질감: {brushEvaluation.featureLabelsKo.join(" · ")}</div>
              </div>
            </details>
          </div>
        )}

        {activeTab === "filter" && (
          <div data-testid="csp-rea-tab-filter" className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="csp-rea-filter-select" className="font-medium text-fg-2">
                필터·색조 선택 ({CSP_REA_ALL_FILTER_SPECS.length}종)
              </label>
              <select
                id="csp-rea-filter-select"
                value={selectedFilterId}
                onChange={(e) => {
                  const next = e.target.value as CspReaFilterId;
                  setSelectedFilterId(next);
                  onApplyFilterId?.(next);
                }}
                className={`min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg sm:flex-initial ${STUDIO_FOCUS_RING}`}
              >
                {CSP_REA_ALL_FILTER_SPECS.map((f) => (
                  <option key={f.id} value={f.id}>
                    [{FILTER_CATEGORY_LABELS_KO[f.category]}] {f.labelKo}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid="csp-rea-filter-primary-cta"
                onClick={handleApplyFilter}
                style={PRIMARY_CTA_STYLE}
                className={`${tactileButtonClass} px-4 hover:brightness-105 ${STUDIO_FOCUS_RING}`}
              >
                이 필터 바로 적용
              </button>
            </div>
            <div
              data-testid="csp-rea-filter-readout"
              className="hidden grid-cols-1 gap-2 rounded-lg bg-card p-2.5 md:grid md:grid-cols-3"
            >
              <div>
                <div className="text-fg-3">선택한 효과</div>
                <div className="font-semibold">{filterEvaluation.spec.labelKo}</div>
              </div>
              <div>
                <div className="text-fg-3">미리보기 변화 영역</div>
                <div className="font-semibold tabular-nums">
                  변환 픽셀 {filterEvaluation.changedPixels}/256
                </div>
              </div>
              <div>
                <div className="text-fg-3">조절 가능 항목</div>
                <div className="font-semibold tabular-nums">
                  세부 조절 {filterEvaluation.spec.parameters.length}개
                </div>
              </div>
            </div>
            <details className="rounded-lg bg-card px-2.5 py-1.5 md:hidden">
              <summary
                className={`flex min-h-11 cursor-pointer items-center font-medium text-fg-2 ${STUDIO_FOCUS_RING}`}
              >
                필터 미리보기 수치 보기
              </summary>
              <div className="space-y-1 pb-2 text-fg-2 tabular-nums">
                <div>
                  {filterEvaluation.spec.labelKo} · 변환 픽셀 {filterEvaluation.changedPixels}/256
                </div>
                <div>세부 조절 {filterEvaluation.spec.parameters.length}개</div>
              </div>
            </details>
          </div>
        )}

        {activeTab === "core" && (
          <div data-testid="csp-rea-tab-core" className="space-y-2.5">
            <div
              role="group"
              aria-label="만화·애니 도구 하위 영역"
              className="flex flex-wrap items-center gap-1.5"
            >
              <button
                type="button"
                data-testid="csp-rea-core-segment-basic"
                aria-pressed={coreSegment === "basic"}
                onClick={() => setCoreSegment("basic")}
                style={coreSegment === "basic" ? ACTIVE_TAB_GLOW_STYLE : undefined}
                className={`${tactileButtonClass} border ${STUDIO_FOCUS_RING} ${
                  coreSegment === "basic"
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                }`}
              >
                기본 만화·애니
              </button>
              <button
                type="button"
                data-testid="csp-rea-core-segment-pro-ex"
                aria-pressed={coreSegment === "pro-ex"}
                onClick={() => setCoreSegment("pro-ex")}
                style={coreSegment === "pro-ex" ? ACTIVE_TAB_GLOW_STYLE : undefined}
                className={`${tactileButtonClass} border ${STUDIO_FOCUS_RING} ${
                  coreSegment === "pro-ex"
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                }`}
              >
                프로·자동 도구 (7종)
              </button>
            </div>

            {coreSegment === "pro-ex" ? (
              <StudioCspProExToolsPanel
                onExecuteProExTool={(toolId, summaryKo) => {
                  onRunCoreFeature?.(toolId);
                  setAppliedNoticeKo(`${summaryKo} 적용됨 · 언제든 되돌리기 가능`);
                }}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="오토 액션 선택"
                    value={selectedActionIdx}
                    onChange={(e) => setSelectedActionIdx(Number(e.target.value))}
                    className={`min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg sm:flex-initial ${STUDIO_FOCUS_RING}`}
                  >
                    {CSP_DEFAULT_LAF_AUTO_ACTION_SET.actions.map((a, idx) => (
                      <option key={a.actionUuid} value={idx}>
                        오토 액션: {a.actionName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid="csp-rea-core-primary-cta"
                    onClick={handleRunCoreFeature}
                    style={PRIMARY_CTA_STYLE}
                    className={`${tactileButtonClass} px-4 hover:brightness-105 ${STUDIO_FOCUS_RING}`}
                  >
                    선택 도구 바로 실행
                  </button>
                  <div className="hidden flex-wrap items-center gap-1.5 md:flex">
                    <button
                      type="button"
                      onClick={() => setSymmetryAxes((prev) => (prev >= 12 ? 2 : prev + 2))}
                      className={`${tactileButtonClass} border border-line bg-card font-medium text-fg hover:bg-raised ${STUDIO_FOCUS_RING}`}
                    >
                      대칭 자: {symmetryAxes}축
                    </button>
                    <button
                      type="button"
                      onClick={() => setGutterPx((prev) => (prev >= 24 ? 6 : prev + 6))}
                      className={`${tactileButtonClass} border border-line bg-card font-medium text-fg hover:bg-raised ${STUDIO_FOCUS_RING}`}
                    >
                      컷 간격: {gutterPx}px
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpreadMerged((prev) => !prev)}
                      className={`${tactileButtonClass} border border-line bg-card font-medium text-fg hover:bg-raised ${STUDIO_FOCUS_RING}`}
                    >
                      {spreadMerged ? "펼침 페이지 분할" : "2·3쪽 펼침 결합"}
                    </button>
                  </div>
                </div>
                <details className="rounded-lg bg-card px-2.5 py-1.5 md:hidden">
                  <summary
                    className={`flex min-h-11 cursor-pointer items-center font-medium text-fg-2 ${STUDIO_FOCUS_RING}`}
                  >
                    대칭 자 · 컷 간격 · 펼침 세부 설정
                  </summary>
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    <button
                      type="button"
                      onClick={() => setSymmetryAxes((prev) => (prev >= 12 ? 2 : prev + 2))}
                      className={`${tactileButtonClass} border border-line bg-panel font-medium text-fg ${STUDIO_FOCUS_RING}`}
                    >
                      대칭 자: {symmetryAxes}축
                    </button>
                    <button
                      type="button"
                      onClick={() => setGutterPx((prev) => (prev >= 24 ? 6 : prev + 6))}
                      className={`${tactileButtonClass} border border-line bg-panel font-medium text-fg ${STUDIO_FOCUS_RING}`}
                    >
                      컷 간격: {gutterPx}px
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpreadMerged((prev) => !prev)}
                      className={`${tactileButtonClass} border border-line bg-panel font-medium text-fg ${STUDIO_FOCUS_RING}`}
                    >
                      {spreadMerged ? "펼침 페이지 분할" : "2·3쪽 펼침 결합"}
                    </button>
                  </div>
                </details>
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
                      컷 분할 {coreEvaluation.splitVerticesA}+{coreEvaluation.splitVerticesB} · 톤{" "}
                      {coreEvaluation.toneInkPixels}px · 집중선 {coreEvaluation.focusInkPixels}px
                    </div>
                  </div>
                  <div>
                    <div className="text-fg-3">대칭 자 · 어니언 스킨 · 스토리</div>
                    <div className="font-medium tabular-nums">
                      대칭선 {coreEvaluation.rulerBranchCount}줄 · 어니언 합성{" "}
                      {coreEvaluation.onionVisiblePixels}px · 페이지 {coreEvaluation.storyNodeCount}개
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* 하단 기본 접힘 호환 기능 요약 (쉬운 한글 전용) */}
        <details
          data-testid="csp-rea-compatibility-summary"
          className="rounded-lg bg-card px-3 py-1"
        >
          <summary
            className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 text-xs font-medium text-fg-2 ${STUDIO_FOCUS_RING}`}
          >
            <span>지원 호환 기능 한눈에 보기</span>
            <span className="tabular-nums text-fg-3">
              브러시 {coverage.brushEngineSummary.executablePresetCount}종 · 필터{" "}
              {coverage.filterEngineSummary.totalExecutableFilters}종 · 제작 도구{" "}
              {coverage.coreFeatureSummary.executableCoreSubsystemCount}종
            </span>
          </summary>
          <ul className="space-y-1 border-t border-line py-2 text-fg-2">
            {SUPPORTED_CAPABILITY_HIGHLIGHTS_KO.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
