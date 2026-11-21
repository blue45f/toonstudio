/**
 * 어울리는 배경·군중 자동 그리기 서랍 패널.
 * 필수 입력은 '장면 한 줄'(또는 원클릭 추천 프리셋) 단 1개이며,
 * 투시·군중 밀도·주인공 비움 영역(Safe Halo)·시간대 세부 조정은 <details>로 점진 공개한다.
 * 모든 색상은 OKLCH 시맨틱 토큰만 사용하며 외부 유료 API 없이 기기 안에서 즉시 생성한다.
 */

import { ChevronDown, Layers, RefreshCw, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import type { StudioBackgroundApply } from "../studio-background-presets";
import { svgToDataUrl } from "../studio-characters";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  analyzeCutContextForBackdrop,
  AUTO_BG_CROWD_QUICK_PRESETS,
  AUTO_BG_THEME_CATALOG,
  composeAutoBgCrowdScene,
  CROWD_DENSITY_LABELS_KO,
  defaultProtagonistBox,
  defaultSpeechBubbles,
  getThemeSpec,
  TIME_OF_DAY_LABELS_KO,
  type AutoBgThemeId,
  type CrowdDensity,
  type CutRect,
  type PerspectiveMode,
  type TimeOfDay,
} from "./auto-bg-crowd-engine";

import { cn } from "@/shared/lib/utils";

export interface StudioAutoBgCrowdDrawerPanelProps {
  readonly canvasW: number;
  readonly canvasH: number;
  readonly onApply: (payload: StudioBackgroundApply) => void;
  /** 컷 내 주인공 바운딩박스(선택). 미지정 시 표준 중앙 인체 프레임을 기준으로 삼는다. */
  readonly protagonistBox?: CutRect;
  /** 컷 내 말풍선 영역 목록(선택). 미지정 시 상단 우측 기본 말풍선 영역을 보호한다. */
  readonly speechBubbles?: readonly CutRect[];
  readonly className?: string;
}

const TIME_OPTIONS: readonly TimeOfDay[] = ["dawn", "day", "sunset", "night", "rain"];
const DENSITY_OPTIONS: readonly CrowdDensity[] = ["none", "sparse", "medium", "bustling"];

export function StudioAutoBgCrowdDrawerPanel({
  canvasW,
  canvasH,
  onApply,
  protagonistBox,
  speechBubbles,
  className,
}: StudioAutoBgCrowdDrawerPanelProps): ReactElement {
  const safeW = Math.max(160, Math.round(canvasW || 720));
  const safeH = Math.max(160, Math.round(canvasH || 1080));
  const promptInputId = useId();
  const horizonSliderId = useId();
  const haloSliderId = useId();

  const effectiveProtagonist = useMemo(
    () => protagonistBox ?? defaultProtagonistBox(safeW, safeH),
    [protagonistBox, safeW, safeH],
  );
  const effectiveBubbles = useMemo(
    () => speechBubbles ?? defaultSpeechBubbles(safeW, safeH),
    [speechBubbles, safeW, safeH],
  );

  const initialAnalysis = useMemo(
    () =>
      analyzeCutContextForBackdrop({
        scenePrompt: AUTO_BG_CROWD_QUICK_PRESETS[0].scenePrompt,
        canvasWidth: safeW,
        canvasHeight: safeH,
        protagonistBox: effectiveProtagonist,
        speechBubbles: effectiveBubbles,
      }),
    [effectiveBubbles, effectiveProtagonist, safeH, safeW],
  );

  const [scenePrompt, setScenePrompt] = useState<string>(
    AUTO_BG_CROWD_QUICK_PRESETS[0].scenePrompt,
  );
  const [theme, setTheme] = useState<AutoBgThemeId>(initialAnalysis.recommendedTheme);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(initialAnalysis.recommendedTimeOfDay);
  const [perspectiveMode, setPerspectiveMode] = useState<PerspectiveMode>(
    initialAnalysis.perspectiveMode,
  );
  const [horizonRatio, setHorizonRatio] = useState<number>(initialAnalysis.horizonRatio);
  const [vanishingXRatio, setVanishingXRatio] = useState<number>(
    Number((initialAnalysis.vanishingPointX / safeW).toFixed(3)),
  );
  const [density, setDensity] = useState<CrowdDensity>(initialAnalysis.recommendedCrowdDensity);
  const [safeHaloPaddingPx, setSafeHaloPaddingPx] = useState<number>(
    Math.round(initialAnalysis.safeHalo.paddingPx),
  );
  const [seed, setSeed] = useState<number>(initialAnalysis.seed);
  const [showPreviewGuides, setShowPreviewGuides] = useState<boolean>(true);
  const [reasoningKo, setReasoningKo] = useState<string>(initialAnalysis.reasoningKo);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const vanishingPointX = Math.round(safeW * vanishingXRatio);
  const vanishingPointY = Math.round(safeH * horizonRatio);
  const secondaryVanishingPointX = Math.round(
    vanishingPointX < safeW * 0.5 ? safeW * 0.94 : safeW * 0.06,
  );

  const composed = useMemo(
    () =>
      composeAutoBgCrowdScene({
        width: safeW,
        height: safeH,
        theme,
        timeOfDay,
        perspectiveMode,
        vanishingPointX,
        vanishingPointY,
        secondaryVanishingPointX,
        density,
        protagonistBox: effectiveProtagonist,
        safeHaloPaddingPx,
        speechBubbles: effectiveBubbles,
        seed,
        showPreviewGuides,
        includeRgbaLayer: false,
      }),
    [
      density,
      effectiveBubbles,
      effectiveProtagonist,
      perspectiveMode,
      safeH,
      safeHaloPaddingPx,
      safeW,
      secondaryVanishingPointX,
      seed,
      showPreviewGuides,
      theme,
      timeOfDay,
      vanishingPointX,
      vanishingPointY,
    ],
  );

  const previewSrc = useMemo(() => svgToDataUrl(composed.previewSvg), [composed.previewSvg]);
  const activeThemeSpec = getThemeSpec(theme);
  const horizonPercent = Math.round(horizonRatio * 100);
  const totalCollisions =
    composed.crowd.collisionAudit.protagonistSafeHaloCollisions +
    composed.crowd.collisionAudit.speechBubbleCollisions;

  const applyRecommendationFromPrompt = (nextPrompt: string): void => {
    const analyzed = analyzeCutContextForBackdrop({
      scenePrompt: nextPrompt,
      canvasWidth: safeW,
      canvasHeight: safeH,
      protagonistBox: effectiveProtagonist,
      speechBubbles: effectiveBubbles,
    });
    setTheme(analyzed.recommendedTheme);
    setTimeOfDay(analyzed.recommendedTimeOfDay);
    setPerspectiveMode(analyzed.perspectiveMode);
    setHorizonRatio(analyzed.horizonRatio);
    setVanishingXRatio(Number((analyzed.vanishingPointX / safeW).toFixed(3)));
    setDensity(analyzed.recommendedCrowdDensity);
    setSafeHaloPaddingPx(Math.round(analyzed.safeHalo.paddingPx));
    setSeed(analyzed.seed);
    setReasoningKo(analyzed.reasoningKo);
    setStatusMessage("장면에 어울리는 투시와 군중 구성을 자동으로 채웠어요.");
  };

  const handleQuickPreset = (presetPrompt: string): void => {
    setScenePrompt(presetPrompt);
    applyRecommendationFromPrompt(presetPrompt);
  };

  const handleInsertBoth = (): void => {
    onApply(composed.backgroundApplyPayload);
    setStatusMessage(
      `${activeThemeSpec.labelKo} 배경과 군중 ${composed.crowd.members.length}명 레이어를 캔버스에 바로 넣었어요.`,
    );
  };

  const handleInsertBackdropOnly = (): void => {
    onApply(composed.backdropOnlyApplyPayload);
    setStatusMessage(`${activeThemeSpec.labelKo} 투시 배경만 캔버스에 넣었어요.`);
  };

  return (
    <section
      aria-label="어울리는 배경과 군중 자동 그리기"
      data-studio-auto-bg-crowd-panel="true"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-line bg-panel p-3 text-fg [word-break:keep-all]",
        className,
      )}
    >
      {/* 상단 안내 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <Sparkles size={15} className="shrink-0 text-accent" aria-hidden />
            어울리는 배경·군중 자동 그리기
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
            장면 한 줄만 적으면 주인공 눈높이에 맞춘 배경 투시와 겹치지 않는 엑스트라를 바로 그려요.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-good/35 bg-good/10 px-2 py-0.5 text-[0.68rem] font-semibold tabular-nums text-good">
          무과금 로컬
        </span>
      </div>

      {/* 필수 입력 단 1개: 장면 한 줄 + AI 추천 자동 채우기 */}
      <div className="flex flex-col gap-2">
        <label htmlFor={promptInputId} className="text-xs font-semibold text-fg-2">
          어떤 장면인가요? (한 줄만 적어 주세요)
        </label>
        <input
          id={promptInputId}
          type="text"
          value={scenePrompt}
          onChange={(event) => {
            setScenePrompt(event.currentTarget.value);
            setStatusMessage(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applyRecommendationFromPrompt(scenePrompt);
            }
          }}
          placeholder="예: 노을 지는 서울 거리에서 주인공이 뒤돌아보는 장면"
          className={cn(
            "min-h-11 w-full rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg placeholder:text-fg-3",
            STUDIO_FOCUS_RING,
          )}
        />

        <button
          type="button"
          onClick={() => applyRecommendationFromPrompt(scenePrompt)}
          className={cn(
            "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-accent/50 bg-accent-soft px-3 py-2 text-xs font-bold text-accent transition-colors duration-150 hover:bg-accent hover:text-on-accent motion-reduce:transition-none",
            STUDIO_FOCUS_RING,
          )}
        >
          <Wand2 size={14} aria-hidden />
          AI 추천으로 자동 채우기
        </button>

        {/* 원클릭 추천 프리셋 */}
        <div
          role="group"
          aria-label="원클릭 추천 장면"
          className="flex flex-wrap gap-1.5"
        >
          {AUTO_BG_CROWD_QUICK_PRESETS.map((preset) => {
            const active = theme === preset.theme && timeOfDay === preset.timeOfDay;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => handleQuickPreset(preset.scenePrompt)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none",
                  STUDIO_FOCUS_RING,
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {preset.labelKo}
              </button>
            );
          })}
        </div>
      </div>

      {/* 추천 근거 한 줄 요약 */}
      <p className="rounded-lg border border-line/80 bg-card/80 px-2.5 py-2 text-xs leading-relaxed text-fg-2">
        {reasoningKo}
      </p>

      {/* 실시간 SVG 미리보기 */}
      <div className="flex flex-col gap-1.5">
        <div className="overflow-hidden rounded-xl border border-line bg-canvas">
          <img
            src={previewSrc}
            alt={`${activeThemeSpec.labelKo} ${TIME_OF_DAY_LABELS_KO[timeOfDay]} 투시 배경과 군중 ${composed.crowd.members.length}명 실시간 미리보기`}
            className="mx-auto max-h-56 w-full object-contain"
          />
        </div>

        {/* 실측 수치 요약 (허위 통계 0건 · 실제 계산값 표시) */}
        <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem] text-fg-3 tabular-nums">
          <span className="rounded-md border border-line bg-card px-2 py-0.5 font-medium text-fg-2">
            눈높이 {horizonPercent}% · {perspectiveMode === "1-point" ? "1점 투시" : "2점 투시"}
          </span>
          <span className="rounded-md border border-line bg-card px-2 py-0.5 font-medium text-fg-2">
            군중 {composed.crowd.members.length}명 (원경 {composed.crowd.tierSummary.background.count} · 중경{" "}
            {composed.crowd.tierSummary.midground.count} · 전경 {composed.crowd.tierSummary.foreground.count})
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-good/35 bg-good/10 px-2 py-0.5 font-semibold text-good">
            <ShieldCheck size={12} aria-hidden />
            주인공·말풍선 충돌 {totalCollisions}건
          </span>
        </div>
      </div>

      {/* 점진적 공개: 세부 설정 (<details>) */}
      <details className="group rounded-xl border border-line bg-card/70">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg motion-reduce:transition-none",
            STUDIO_FOCUS_RING,
          )}
        >
          <span>세부 설정 (테마 · 시간대 · 투시 · 군중 · 비움 영역)</span>
          <ChevronDown
            size={14}
            aria-hidden
            className="shrink-0 text-fg-3 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>

        <div className="flex flex-col gap-3 border-t border-line/70 px-3 py-3">
          {/* 8종 배경 테마 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-fg-2">배경 장소 (8종)</span>
            <div role="group" aria-label="배경 장소 선택" className="grid grid-cols-2 gap-1.5">
              {AUTO_BG_THEME_CATALOG.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={theme === item.id}
                  onClick={() => {
                    setTheme(item.id);
                    setStatusMessage(null);
                  }}
                  className={cn(
                    "min-h-11 rounded-lg border px-2 py-1.5 text-left text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none",
                    STUDIO_FOCUS_RING,
                    theme === item.id
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {item.labelKo}
                </button>
              ))}
            </div>
          </div>

          {/* 시간대 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-fg-2">시간대 빛</span>
            <div role="group" aria-label="시간대 선택" className="flex flex-wrap gap-1.5">
              {TIME_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={timeOfDay === option}
                  onClick={() => {
                    setTimeOfDay(option);
                    setStatusMessage(null);
                  }}
                  className={cn(
                    "min-h-11 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none",
                    STUDIO_FOCUS_RING,
                    timeOfDay === option
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {TIME_OF_DAY_LABELS_KO[option]}
                </button>
              ))}
            </div>
          </div>

          {/* 투시 방식 & 소실점 높이 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg-2">투시 방식</span>
              <div role="group" aria-label="투시 방식 선택" className="flex gap-1">
                {(
                  [
                    { id: "1-point", label: "1점 투시" },
                    { id: "2-point", label: "2점 투시" },
                  ] as const
                ).map((modeOption) => (
                  <button
                    key={modeOption.id}
                    type="button"
                    aria-pressed={perspectiveMode === modeOption.id}
                    onClick={() => setPerspectiveMode(modeOption.id)}
                    className={cn(
                      "min-h-11 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none",
                      STUDIO_FOCUS_RING,
                      perspectiveMode === modeOption.id
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                    )}
                  >
                    {modeOption.label}
                  </button>
                ))}
              </div>
            </div>

            <label
              htmlFor={horizonSliderId}
              className="flex items-center justify-between gap-2 text-xs text-fg-2"
            >
              <span>주인공 눈높이 (지평선)</span>
              <span className="tabular-nums font-semibold text-fg">{horizonPercent}%</span>
            </label>
            <input
              id={horizonSliderId}
              type="range"
              min={20}
              max={74}
              step={1}
              value={horizonPercent}
              onChange={(event) => setHorizonRatio(Number(event.currentTarget.value) / 100)}
              className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
            />
          </div>

          {/* 군중 밀도 & 다시 섞기 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg-2">군중(엑스트라) 밀도</span>
              <button
                type="button"
                onClick={() => setSeed((prev) => prev + 7919)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg motion-reduce:transition-none",
                  STUDIO_FOCUS_RING,
                )}
              >
                <RefreshCw size={12} aria-hidden />
                배치 다시 섞기
              </button>
            </div>
            <div role="group" aria-label="군중 밀도 선택" className="grid grid-cols-2 gap-1.5">
              {DENSITY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={density === option}
                  onClick={() => {
                    setDensity(option);
                    setStatusMessage(null);
                  }}
                  className={cn(
                    "min-h-11 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none",
                    STUDIO_FOCUS_RING,
                    density === option
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {CROWD_DENSITY_LABELS_KO[option]}
                </button>
              ))}
            </div>
          </div>

          {/* 주인공 Safe Halo 여유 간격 */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor={haloSliderId}
              className="flex items-center justify-between gap-2 text-xs text-fg-2"
            >
              <span>주인공 주변 비움 여유 (Safe Halo)</span>
              <span className="tabular-nums font-semibold text-fg">{safeHaloPaddingPx}px</span>
            </label>
            <input
              id={haloSliderId}
              type="range"
              min={12}
              max={96}
              step={4}
              value={safeHaloPaddingPx}
              onChange={(event) => setSafeHaloPaddingPx(Number(event.currentTarget.value))}
              className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
            />
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-fg-2">
            <input
              type="checkbox"
              checked={showPreviewGuides}
              onChange={(event) => setShowPreviewGuides(event.currentTarget.checked)}
              className={cn("size-4 accent-accent", STUDIO_FOCUS_RING)}
            />
            미리보기에 투시 가이드선과 주인공 비움 영역 표시
          </label>
        </div>
      </details>

      {/* 레이어 바로 삽입 CTA */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleInsertBoth}
          className={cn(
            "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-on-accent transition-colors duration-150 hover:bg-accent-2 motion-reduce:transition-none",
            STUDIO_FOCUS_RING,
          )}
        >
          <Layers size={15} aria-hidden />
          배경·군중 레이어 바로 삽입
        </button>

        <button
          type="button"
          onClick={handleInsertBackdropOnly}
          className={cn(
            "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg motion-reduce:transition-none",
            STUDIO_FOCUS_RING,
          )}
        >
          배경만 따로 삽입
        </button>
      </div>

      {statusMessage ? (
        <p
          role="status"
          className="rounded-lg border border-good/35 bg-good/10 px-2.5 py-2 text-xs font-medium text-good"
        >
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}

export default StudioAutoBgCrowdDrawerPanel;
