/**
 * StudioAiWebtoonEcosystemCategory34Panels.tsx
 *
 * `StudioAiWebtoonEcosystemWorkbenchPanel`의 카테고리 3 (콘티·콘셉트 기획: LlamaGen AI · 미드저니/SD · 포토샵 Firefly) 및
 * 카테고리 4 (사진·영상 만화 변환: 원더쉐어 필모라 · 캔바 AI) 탭 패널 서브컴포넌트.
 */

import { CheckCircle2, Compass, Film } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  buildMidjourneyStableDiffusionConceptPlan,
  buildPhotoshopFireflyGenerativePlan,
  FILMORA_WEBTOON_FILTER_PRESETS,
  runCanvaInstatoonCarouselPipeline,
  runFilmoraMediaToWebtoonPipeline,
  runLlamaGenWebtoonStoryboardDraft,
  type FilmoraWebtoonFilterPresetId,
  type FireflyEditOperationMode,
  type LlamaGenLayoutId,
  type LlamaGenSuiteFormat,
} from "./storyboard-style-transfer-suite";

import { cn } from "@/shared/lib/utils";

export interface StudioAiWebtoonCategory3PanelProps {
  readonly scriptInput: string;
  readonly storyGenre: string;
}

export function StudioAiWebtoonCategory3Panel({
  scriptInput,
  storyGenre,
}: StudioAiWebtoonCategory3PanelProps): ReactElement {
  const [llamaFormat, setLlamaFormat] = useState<LlamaGenSuiteFormat>("Webtoon");
  const [llamaLayout, setLlamaLayout] = useState<LlamaGenLayoutId>("Layout0");
  const [mjLocksCostume, setMjLocksCostume] = useState<boolean>(true);
  const [fireflyMode, setFireflyMode] = useState<FireflyEditOperationMode>(
    "generative-expand-vertical",
  );

  const llamaGenResult = useMemo(
    () =>
      runLlamaGenWebtoonStoryboardDraft({
        scriptText: scriptInput,
        format: llamaFormat,
        activeLayout: llamaLayout,
      }),
    [scriptInput, llamaFormat, llamaLayout],
  );

  const mjSdResult = useMemo(
    () =>
      buildMidjourneyStableDiffusionConceptPlan({
        genreEra: storyGenre,
        locksCostume: mjLocksCostume,
      }),
    [storyGenre, mjLocksCostume],
  );

  const fireflyResult = useMemo(
    () => buildPhotoshopFireflyGenerativePlan({ mode: fireflyMode }),
    [fireflyMode],
  );

  return (
    <div
      role="tabpanel"
      id="panel-cat-3-storyboard"
      aria-labelledby="tab-cat-3-storyboard"
      data-testid="ecosystem-panel-cat-3"
      className="flex flex-col gap-2"
    >
      {/* 3-A. LlamaGen AI 세로 스크롤 비트별 감정 전환 초안 */}
      <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1 font-bold text-fg">
            <Compass size={12} className="text-accent" aria-hidden="true" />
            LlamaGen AI 한국형 세로 스크롤({llamaGenResult.pageShape}) 스토리 비트 감정 전환 초안
          </span>
          <div className="flex flex-wrap gap-1">
            {(["Webtoon", "Comic", "Manga"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                aria-pressed={llamaFormat === fmt}
                onClick={() => setLlamaFormat(fmt)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.57rem] font-semibold",
                  STUDIO_FOCUS_RING,
                  llamaFormat === fmt
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3",
                )}
              >
                {fmt}
              </button>
            ))}
            {llamaGenResult.availableLayouts.map((ly) => (
              <button
                key={ly}
                type="button"
                aria-pressed={llamaLayout === ly}
                onClick={() => setLlamaLayout(ly)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.57rem] font-semibold",
                  STUDIO_FOCUS_RING,
                  llamaLayout === ly
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3",
                )}
              >
                {ly}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {llamaGenResult.panels.map((p) => (
            <div key={p.panelIndex} className="rounded border border-line bg-card p-1.5 text-[0.58rem]">
              <strong className="text-accent">{p.caption}</strong> (여백 {p.verticalGapPx}px · {p.imageStatus})
            </div>
          ))}
        </div>
        <span className="text-[0.56rem] text-fg-3">
          지원 에디터 포맷: Comic({llamaGenResult.supportedImportFormats.comicEditor.join("/")}) · Character(
          {llamaGenResult.supportedImportFormats.characterEditor.join("/")}) · 동기화 디바운스{" "}
          {llamaGenResult.revisionSyncSpec.debounceMs}ms
        </span>
      </div>

      {/* 3-B. 미드저니 v6.1 / 스테이블 디퓨전 & 포토샵 AI (Adobe Firefly) */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded border border-line bg-raised p-2 text-[0.59rem]">
          <div className="flex items-center justify-between gap-1">
            <strong className="text-accent">미드저니 v6.1 & 스테이블 디퓨전 고증·무드보드</strong>
            <button
              type="button"
              aria-pressed={mjLocksCostume}
              onClick={() => setMjLocksCostume((prev) => !prev)}
              className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.56rem] font-semibold text-fg-2"
            >
              --cw {mjSdResult.midjourneyParams.crefWeightCw} ({mjLocksCostume ? "의상 고정" : "얼굴만 고정"})
            </button>
          </div>
          <code
            data-testid="midjourney-v6-command-code"
            className="block rounded bg-card p-1 font-mono text-[0.55rem] text-fg-2"
          >
            {mjSdResult.midjourneyV6Command}
          </code>
          <span className="text-fg-3">
            고증: {mjSdResult.historicalCostumeReference.silhouetteAndFabricKo}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded border border-line bg-raised p-2 text-[0.59rem]">
          <strong className="text-accent">포토샵 AI (Adobe Firefly) 생성형 채우기·확장</strong>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Firefly 작업 모드 선택">
            {(
              [
                { id: "generative-expand-vertical", label: "세로 배경 확장" },
                { id: "object-removal-cleanplate", label: "불필요 사물 지우기" },
                { id: "costume-prop-partial-edit", label: "캐릭터 의상 부분 수정" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={fireflyMode === m.id}
                onClick={() => setFireflyMode(m.id)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.56rem] font-semibold",
                  fireflyMode === m.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-fg-2">{fireflyResult.seamBlendingGuaranteeKo}</p>
          <span className="font-mono text-[0.55rem] text-fg-3">
            레이어: {fireflyResult.nonDestructiveLayerNameKo} (Feather {fireflyResult.maskRegionSpec.featherPx}px)
          </span>
        </div>
      </div>
    </div>
  );
}

export interface StudioAiWebtoonCategory4PanelProps {
  readonly storyGenre: string;
}

export function StudioAiWebtoonCategory4Panel({
  storyGenre,
}: StudioAiWebtoonCategory4PanelProps): ReactElement {
  const [filmoraPresetId, setFilmoraPresetId] =
    useState<FilmoraWebtoonFilterPresetId>("filmora-k-webtoon-cel");
  const [canvaRatio, setCanvaRatio] = useState<
    "4:5-instatoon-1080x1350" | "1:1-square-1080x1080"
  >("4:5-instatoon-1080x1350");
  const [canvaSlides, setCanvaSlides] = useState<number>(6);

  const filmoraResult = useMemo(
    () => runFilmoraMediaToWebtoonPipeline({ filterPresetId: filmoraPresetId }),
    [filmoraPresetId],
  );

  const canvaResult = useMemo(
    () =>
      runCanvaInstatoonCarouselPipeline({
        topicTitle: `${storyGenre} 인스타툰`,
        slideCount: canvaSlides,
        canvasRatio: canvaRatio,
      }),
    [storyGenre, canvaSlides, canvaRatio],
  );

  return (
    <div
      role="tabpanel"
      id="panel-cat-4-style-transfer"
      aria-labelledby="tab-cat-4-style-transfer"
      data-testid="ecosystem-panel-cat-4"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {/* 4-A. 원더쉐어 필모라 (Filmora) */}
      <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-[0.59rem]">
        <strong className="inline-flex items-center gap-1 text-accent">
          <Film size={12} aria-hidden="true" />
          원더쉐어 필모라 (Filmora) 비디오·사진 → 웹툰/애니메이션 필터 변환
        </strong>
        <div className="flex flex-wrap gap-1" role="group" aria-label="필모라 웹툰 필터 선택">
          {FILMORA_WEBTOON_FILTER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={filmoraPresetId === preset.id}
              onClick={() => setFilmoraPresetId(preset.id)}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[0.56rem] font-semibold",
                filmoraPresetId === preset.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-3",
              )}
            >
              {preset.labelKo}
            </button>
          ))}
        </div>
        <p className="text-fg-2">
          플리커 억제율 {filmoraResult.keyframeExtractionSpec.temporalFlickerSuppressionScore}% · 키프레임{" "}
          {filmoraResult.keyframeExtractionSpec.extractedKeyframesCount}컷 자동 추출
        </p>
        <ul className="flex list-none flex-col gap-0.5 p-0 text-[0.57rem] text-fg-3">
          {filmoraResult.convertedPanels.map((frame) => (
            <li key={frame.frameNumber}>
              #{frame.frameNumber} ({frame.timestampSec}s): {frame.motionEffectKo}
            </li>
          ))}
        </ul>
      </div>

      {/* 4-B. 캔바 (Canva) AI 인스타툰·카드뉴스 & 원클릭 누끼 */}
      <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-[0.59rem]">
        <div className="flex items-center justify-between gap-1">
          <strong className="inline-flex items-center gap-1 text-accent">
            <CheckCircle2 size={12} aria-hidden="true" />
            캔바 (Canva) AI 인스타툰 캐러셀 & 원클릭 배경 제거(누끼)
          </strong>
          <div className="flex gap-1" role="group" aria-label="캔바 인스타툰 비율 선택">
            {(
              [
                { id: "4:5-instatoon-1080x1350", label: "4:5 (1080×1350)" },
                { id: "1:1-square-1080x1080", label: "1:1 (1080×1080)" },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={canvaRatio === r.id}
                onClick={() => setCanvaRatio(r.id)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.56rem] font-semibold",
                  canvaRatio === r.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-fg-2">
            슬라이드 {canvaResult.slideCount}장 · 누끼 머리카락 정밀도{" "}
            {canvaResult.backgroundRemoverSpec.hairEdgeRefinementScore}% · 스티커 외곽선{" "}
            {canvaResult.backgroundRemoverSpec.stickerWhiteOutlinePx}px
          </span>
          <button
            type="button"
            data-testid="canva-carousel-10-slides-btn"
            onClick={() => setCanvaSlides((prev) => (prev === 6 ? 10 : 6))}
            className="rounded border border-accent bg-accent-soft px-1.5 py-0.5 text-[0.56rem] font-bold text-accent"
          >
            {canvaSlides === 6 ? "10장 캐러셀 확장" : "6장 기본으로"}
          </button>
        </div>
        <ul className="flex list-none flex-col gap-0.5 p-0 text-[0.57rem] text-fg-3">
          {canvaResult.slides.slice(0, 4).map((sl) => (
            <li key={sl.slideNumber}>
              슬라이드 #{sl.slideNumber} [{sl.slideRoleKo}]: {sl.headlineText}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
