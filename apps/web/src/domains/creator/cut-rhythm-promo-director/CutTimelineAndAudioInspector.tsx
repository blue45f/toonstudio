/**
 * 컷별 서사 비트 타임라인 · 선택 컷 2.5D 키프레임 튜닝 · BGM/SFX 큐시트 · Remotion JSON 프리뷰 인스펙터.
 *
 * - Calm Atelier 시맨틱 토큰 전용(원시 색상 비사용 · 명시적 transition 속성만 사용).
 */

import {
  Check,
  Code2,
  Copy,
  Download,
  Music,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";
import type { ReactElement } from "react";

import { NARRATIVE_BEAT_LABELS_KO } from "./cut-rhythm-promo-engine";
import type {
  AnalyzedWebtoonCut,
  BgmSectionKind,
  CutParallaxTrack,
  DirectedWebtoonPromoPlan,
  NarrativeBeat,
  SfxCueMarker,
  SfxMarkerKind,
} from "./types";

export type PromoInspectorTab = "timeline" | "manifest";

export interface CutTimelineAndAudioInspectorProps {
  readonly promoPlan: DirectedWebtoonPromoPlan;
  readonly activeCut: AnalyzedWebtoonCut | undefined;
  readonly activeTrack: CutParallaxTrack | undefined;
  readonly activeCutSfxList: readonly SfxCueMarker[];
  readonly seriesLabel: string;
  readonly inspectorTab: PromoInspectorTab;
  readonly manifestJson: string;
  readonly copiedNotice: boolean;
  readonly onChangeTab: (tab: PromoInspectorTab) => void;
  readonly onSeekFrame: (frame: number) => void;
  readonly onUpdateCutMetric: (
    field: "actionIntensity" | "gutterWhitespaceRatio",
    value: number,
  ) => void;
  readonly onCopyManifest: () => void;
  readonly onDownloadManifest: () => void;
}

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING} [word-break:keep-all]`;
const BTN_ACTIVE_CHIP = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

const BEAT_TONE_CLASSES: Readonly<Record<NarrativeBeat, string>> = {
  hook: "border-accent bg-accent-soft text-accent",
  setup: "border-cool bg-info-soft text-cool",
  "tension-rise": "border-warn bg-warning-soft text-warn",
  "climax-drop": "border-bad bg-bad-soft text-bad",
  cliffhanger: "border-good bg-good-soft text-good",
};

const BGM_SECTION_CLASSES: Readonly<Record<BgmSectionKind, string>> = {
  intro: "border-cool bg-info-soft text-cool",
  build: "border-warn bg-warning-soft text-warn",
  drop: "border-bad bg-bad-soft text-bad",
  sting: "border-good bg-good-soft text-good",
};

const SFX_KIND_CLASSES: Readonly<Record<SfxMarkerKind, string>> = {
  whoosh: "border-cool bg-info-soft text-cool",
  "impact-hit": "border-bad bg-bad-soft text-bad",
  heartbeat: "border-warn bg-warning-soft text-warn",
  "spark-chime": "border-accent bg-accent-soft text-accent",
  "page-turn": "border-line-strong bg-raised text-fg-2",
};

export function CutTimelineAndAudioInspector({
  promoPlan,
  activeCut,
  activeTrack,
  activeCutSfxList,
  seriesLabel,
  inspectorTab,
  manifestJson,
  copiedNotice,
  onChangeTab,
  onSeekFrame,
  onUpdateCutMetric,
  onCopyManifest,
  onDownloadManifest,
}: CutTimelineAndAudioInspectorProps): ReactElement {
  const totalFrames = promoPlan.rhythm.totalFrames;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 lg:col-span-7">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex items-center gap-2" role="tablist" aria-label="연출 상세 보기">
          <button
            type="button"
            role="tab"
            aria-selected={inspectorTab === "timeline"}
            onClick={() => onChangeTab("timeline")}
            className={inspectorTab === "timeline" ? BTN_ACTIVE_CHIP : BTN_OUTLINE}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>컷 리듬 · 오디오 큐</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inspectorTab === "manifest"}
            onClick={() => onChangeTab("manifest")}
            className={inspectorTab === "manifest" ? BTN_ACTIVE_CHIP : BTN_OUTLINE}
          >
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Remotion JSON</span>
          </button>
        </div>

        <span className="text-xs text-fg-3 [word-break:keep-all]">{seriesLabel}</span>
      </div>

      {/* 컷별 비례 비트 타임라인 바 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-fg-2">
          <span className="font-semibold text-fg [word-break:keep-all]">
            컷별 서사 비트 타임라인 ({promoPlan.rhythm.cuts.length}컷)
          </span>
          <span className="tabular-nums text-fg-3">
            1박 {promoPlan.rhythm.framesPerBeat.toFixed(1)}f
          </span>
        </div>
        <div className="flex w-full gap-1 overflow-x-auto pb-1">
          {promoPlan.rhythm.cuts.map((cut) => {
            const isSelected = activeCut?.id === cut.id;
            const widthPct = Math.max(10, (cut.durationFrames / totalFrames) * 100);
            return (
              <button
                key={cut.id}
                type="button"
                aria-pressed={isSelected}
                style={{ flexBasis: `${widthPct.toFixed(1)}%` }}
                onClick={() => onSeekFrame(cut.startFrame)}
                className={`flex min-h-11 min-w-[78px] shrink-0 cursor-pointer flex-col items-start justify-between rounded-lg border px-2 py-1.5 text-left transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                  isSelected
                    ? BEAT_TONE_CLASSES[cut.beat]
                    : "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised"
                }`}
              >
                <span className="text-[11px] font-bold tabular-nums">
                  C{cut.order} · {cut.durationFrames}f
                </span>
                <span className="truncate text-[11px] font-medium [word-break:keep-all]">
                  {NARRATIVE_BEAT_LABELS_KO[cut.beat]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {inspectorTab === "timeline" ? (
        <div className="flex flex-col gap-3">
          {activeCut && activeTrack && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-canvas p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-fg [word-break:keep-all]">
                    CUT {activeCut.order}. {activeCut.title}
                  </h3>
                  <p className="text-xs text-fg-2 [word-break:keep-all]">
                    {activeCut.sceneSummary}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold [word-break:keep-all] ${BEAT_TONE_CLASSES[activeCut.beat]}`}
                >
                  {activeTrack.cameraStyleKo}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs tabular-nums sm:grid-cols-4">
                <div className="rounded-lg border border-line bg-card p-2">
                  <div className="text-fg-3">구간</div>
                  <div className="font-semibold text-fg">
                    {activeCut.startFrame}~{activeCut.endFrame}f
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-card p-2">
                  <div className="text-fg-3">말풍선</div>
                  <div className="font-semibold text-fg">
                    {activeCut.balloonCharCount}자 · {activeCut.balloonWordCount}어절
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-card p-2">
                  <div className="text-fg-3">읽기 가중치</div>
                  <div className="font-semibold text-fg">
                    {activeCut.readingWeight.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-card p-2">
                  <div className="text-fg-3">컷 SFX</div>
                  <div className="font-semibold text-fg">{activeCutSfxList.length}건</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 border-t border-line pt-2.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="flex items-center justify-between text-fg-2">
                    <span>액션 · 충격 강도</span>
                    <strong className="tabular-nums text-fg">
                      {Math.round(activeCut.actionIntensity * 100)}%
                    </strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={activeCut.actionIntensity}
                    aria-label="선택 컷 액션 강도"
                    onChange={(e) => onUpdateCutMetric("actionIntensity", Number(e.target.value))}
                    className={`min-h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="flex items-center justify-between text-fg-2">
                    <span>세로 여백(거터) 비율</span>
                    <strong className="tabular-nums text-fg">
                      {Math.round(activeCut.gutterWhitespaceRatio * 100)}%
                    </strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={activeCut.gutterWhitespaceRatio}
                    aria-label="선택 컷 여백 비율"
                    onChange={(e) =>
                      onUpdateCutMetric("gutterWhitespaceRatio", Number(e.target.value))
                    }
                    className={`min-h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-1.5 border-t border-line pt-2 text-[11px] tabular-nums">
                {activeTrack.keyframes.map((kf) => (
                  <div key={kf.phase} className="rounded-md border border-line bg-card px-2 py-1.5">
                    <div className="font-semibold text-fg">
                      {kf.phase === "start" ? "시작" : kf.phase === "mid" ? "중간" : "끝"} (
                      {kf.frame}f)
                    </div>
                    <div className="text-fg-2">
                      줌 {kf.zoom.toFixed(2)}x · 틸트 {kf.tiltDeg.toFixed(1)}°
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BGM 에너지 전환 & SFX 큐시트 배지 */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-canvas p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Music className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                BGM 에너지 전환 ({promoPlan.audioCueSheet.bgmTransitions.length}구간)
              </span>
              <span className="text-[11px] text-fg-3 tabular-nums">
                박자 그리드 {promoPlan.audioCueSheet.beatGridFrames.length}박
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {promoPlan.audioCueSheet.bgmTransitions.map((bgm) => (
                <button
                  key={bgm.id}
                  type="button"
                  onClick={() => onSeekFrame(bgm.frame)}
                  className={`flex min-h-11 cursor-pointer flex-col items-start justify-center rounded-lg border px-2.5 py-1.5 text-left transition-colors motion-reduce:transition-none ${FOCUS_RING} ${BGM_SECTION_CLASSES[bgm.section]}`}
                >
                  <span className="text-xs font-bold [word-break:keep-all]">{bgm.labelKo}</span>
                  <span className="text-[11px] tabular-nums">
                    {bgm.frame}f · B{bgm.beatIndex}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Volume2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                SFX 큐 마커 ({promoPlan.audioCueSheet.sfxMarkers.length}개)
              </span>
              <span className="text-[11px] text-fg-3 [word-break:keep-all]">
                배지를 누르면 해당 프레임으로 이동
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {promoPlan.audioCueSheet.sfxMarkers.map((cue) => (
                <button
                  key={cue.id}
                  type="button"
                  onClick={() => onSeekFrame(cue.frame)}
                  className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${SFX_KIND_CLASSES[cue.kind]}`}
                >
                  <span className="[word-break:keep-all]">{cue.labelKo}</span>
                  <span className="tabular-nums opacity-85">{cue.frame}f</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-fg tabular-nums">
                {promoPlan.manifest.compositionId}
              </span>
              <span className="text-[11px] text-fg-2 tabular-nums">
                {promoPlan.manifest.width}×{promoPlan.manifest.height} ·{" "}
                {promoPlan.manifest.durationInFrames}f · 시퀀스{" "}
                {promoPlan.manifest.sequences.length}개 · 오차 {promoPlan.manifest.frameDrift}f
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onCopyManifest} className={BTN_OUTLINE}>
                {copiedNotice ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-good" aria-hidden="true" />
                    <span>복사됨</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>JSON 복사</span>
                  </>
                )}
              </button>
              <button type="button" onClick={onDownloadManifest} className={BTN_PRIMARY}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>JSON 저장</span>
              </button>
            </div>
          </div>

          <pre
            data-testid="remotion-manifest-json"
            className="max-h-[360px] overflow-auto rounded-lg border border-line bg-reader-canvas p-3 font-mono text-[11px] leading-relaxed text-fg"
          >
            {manifestJson}
          </pre>
        </div>
      )}
    </div>
  );
}
