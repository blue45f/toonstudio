/**
 * Wave 45C — 웹툰 오디오 큐 디렉터(한국어 립싱크 비젬 · BGM 전환 · SFX 타임라인) 스튜디오 패널.
 *
 * - Calm Atelier 시맨틱 토큰 전용(원시 색 · 광범위 트랜지션 · 빈 객체 기본 Props · Web Storage · 큰 정수 리터럴 미사용)
 * - 모든 타이밍·음압·비젬 결과는 규칙 기반 추정(`추정` 배지 명시)이며 Props 없이 단독 렌더링 지원
 */

import {
  AudioWaveform, CheckCircle2, Copy, FileCode2, FileText, Headphones,
  Mic, Music2, Plus, RotateCcw, SlidersHorizontal, Trash2, Volume2, Waves,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import {
  AUDIO_CUE_EPISODE_PRESETS, BGM_MOOD_CATALOG, BGM_MOOD_IDS, DEFAULT_DIALOGUE_DUCKING_DB,
  DEFAULT_LIP_SYNC_FPS, DEFAULT_SYLLABLES_PER_SECOND, EMOTION_TONE_PROFILES, LIP_SYNC_VISEMES,
  SFX_CATEGORY_CATALOG, SFX_CATEGORY_IDS, SPEECH_EMOTION_TONES, TARGET_BGM_LUFS,
  VISEME_PROFILES, buildEpisodeAudioCueSheet, decomposeHangulSyllable, exportAudioCueJson,
  exportAudioCueWebVtt, formatSmpteTimecode, formatWebVttTimestamp, getAudioCueEpisodePreset,
  type AudioCueCutInput, type AudioCuePresetId, type BgmMoodId, type EpisodeAudioCueSheet,
  type LipSyncFrame, type LipSyncViseme, type ScheduledAudioCut, type SemanticToneToken,
  type SfxCategoryId,
} from "./audio-cue-director-engine";

import { OperationStatus } from "./OperationStatus";
import { MAX_AUDIO_CUTS, MAX_DIALOGUE_LENGTH, MAX_SFX_PER_CUT, assertAudioCueInput } from "./audio-cue-input-contract";
import { useClipboardOutput } from "./use-clipboard-output";
import { useExampleNotification } from "./use-example-notification";

export type AudioCueExportFormat = "webvtt" | "json";

export interface StudioWebtoonAudioCuePanelProps {
  readonly initialPreset?: AudioCuePresetId;
  readonly initialFps?: number;
  readonly initialSyllablesPerSecond?: number;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onCueSheetChange?: (cueSheet: EpisodeAudioCueSheet) => void;
  readonly onCopyWebVtt?: (webVtt: string) => void;
  readonly onCopyJson?: (json: string) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} border-accent bg-accent text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border-line bg-card text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border-accent bg-accent-soft text-accent`;
const INPUT_BASE = `w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg ${FOCUS_RING}`;
const FPS_CHOICES: readonly number[] = [12, 24, 30];

function semanticBadgeClass(tone: SemanticToneToken): string {
  if (tone === "accent") return "border-accent bg-accent-soft text-accent";
  if (tone === "cool") return "border-cool bg-info-soft text-cool";
  if (tone === "good") return "border-good bg-good-soft text-good";
  if (tone === "warn") return "border-warn bg-warning-soft text-warn";
  if (tone === "bad") return "border-bad bg-bad-soft text-bad";
  return "border-line-strong bg-raised text-fg-2";
}

function visemeSegmentClass(viseme: LipSyncViseme): string {
  if (viseme === "A") return "border-accent bg-accent text-on-accent";
  if (viseme === "E") return "border-cool bg-info-soft text-cool";
  if (viseme === "I") return "border-good bg-good-soft text-good";
  if (viseme === "O") return "border-warn bg-warning-soft text-warn";
  if (viseme === "U") return "border-accent bg-accent-soft text-accent";
  if (viseme === "M-B-P") return "border-bad bg-bad-soft text-bad";
  return "border-line bg-raised text-fg-3";
}

function KpiCard(cardProps: { readonly label: string; readonly value: string; readonly sub: string; readonly testId: string; readonly toneClass?: string }): ReactElement {
  return (
    <div className="rounded-xl border border-line bg-raised px-3.5 py-2.5">
      <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{cardProps.label}</div>
      <div data-testid={cardProps.testId} className={`mt-0.5 text-base font-bold tabular-nums ${cardProps.toneClass ?? "text-fg"}`}>{cardProps.value}</div>
      <div className="mt-0.5 text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">{cardProps.sub}</div>
    </div>
  );
}

function MouthShapePreviewSvg(svgProps: { readonly frame: LipSyncFrame | null; readonly isEn: boolean }): ReactElement {
  const { frame, isEn } = svgProps;
  const viseme: LipSyncViseme = frame ? frame.viseme : "REST";
  const openness = frame ? frame.openness01 : 0;
  const width = frame ? frame.width01 : 0.48;
  const roundness = frame ? frame.roundness01 : 0.14;
  const rx = Math.round((12 + width * 24 - roundness * 10) * 10) / 10;
  const ry = Math.round((1.8 + openness * 18) * 10) / 10;
  const toneClass = viseme === "M-B-P" ? "text-bad" : viseme === "REST" ? "text-fg-3" : "text-accent";

  return (
    <svg
      data-testid="audio-cue-mouth-svg" data-viseme={viseme} viewBox="0 0 120 76"
      className="h-20 w-32 shrink-0 rounded-xl border border-line bg-canvas text-fg"
      role="img" aria-label={isEn ? `Estimated mouth viseme ${viseme}` : `추정 입모양 비젬 ${viseme}`}
    >
      <ellipse cx="60" cy="38" rx="46" ry="30" className="text-raised" fill="currentColor" />
      <ellipse cx="60" cy="38" rx="46" ry="30" className="text-line-strong" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {viseme === "M-B-P" || viseme === "REST" ? (
        <line x1={60 - rx} y1="40" x2={60 + rx} y2="40" className={toneClass} stroke="currentColor" strokeWidth={viseme === "M-B-P" ? "3.2" : "1.8"} strokeLinecap="round" />
      ) : (
        <g>
          <ellipse cx="60" cy="40" rx={rx} ry={ry} className={toneClass} fill="currentColor" fillOpacity={0.22} stroke="currentColor" strokeWidth="2.2" />
          <ellipse cx="60" cy="40" rx={Math.max(4, rx * 0.62)} ry={Math.max(1.5, ry * 0.56)} className="text-fg" fill="currentColor" fillOpacity={0.72} />
        </g>
      )}
      <text x="60" y="16" textAnchor="middle" fontSize="9.5" fontWeight="700" className={toneClass} fill="currentColor">{viseme}</text>
    </svg>
  );
}

function BgmDuckingMatrixTable(tableProps: {
  readonly cueSheet: EpisodeAudioCueSheet; readonly selectedCutIndex: number; readonly isEn: boolean; readonly onSelectCut: (cutIndex: number) => void;
}): ReactElement {
  const { cueSheet, selectedCutIndex, isEn, onSelectCut } = tableProps;
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  return (
    <div data-testid="audio-cue-bgm-matrix" className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Music2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("BGM 크로스페이드 · 자동 덕킹 · SFX 매트릭스", "BGM Crossfade, Auto-Ducking & SFX Matrix")}</h3>
        </div>
        <span className="text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">
          {pick(`기준 ${cueSheet.targetLufs.toFixed(1)} LUFS · 대사 덕킹 ${cueSheet.dialogueDuckingDb.toFixed(1)} dB (${cueSheet.duckingAttackMs}/${cueSheet.duckingReleaseMs}ms)`, `Target ${cueSheet.targetLufs.toFixed(1)} LUFS · Duck ${cueSheet.dialogueDuckingDb.toFixed(1)} dB`)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-line text-[11px] text-fg-3">
              <th className="py-2 pr-2 font-semibold [word-break:keep-all]">{pick("컷 / 스크롤", "Cut / Scroll")}</th>
              <th className="px-2 py-2 font-semibold [word-break:keep-all]">{pick("BGM 무드 · 전환", "BGM Mood / Fade")}</th>
              <th className="px-2 py-2 font-semibold [word-break:keep-all]">{pick("목표 음압", "Target LUFS")}</th>
              <th className="px-2 py-2 font-semibold [word-break:keep-all]">{pick("대사 덕킹", "Dialogue Duck")}</th>
              <th className="py-2 pl-2 font-semibold [word-break:keep-all]">{pick("SFX 마커", "SFX Hits")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {cueSheet.cuts.map((cut: ScheduledAudioCut) => {
              const mood = BGM_MOOD_CATALOG[cut.bgmMood];
              const transition = cueSheet.bgmTransitions.find((tr) => tr.cutIndex === cut.cutIndex);
              return (
                <tr key={cut.cutId} data-testid={`audio-cue-matrix-row-${cut.cutIndex}`} className={cut.cutIndex === selectedCutIndex ? "bg-accent-soft" : "bg-transparent"}>
                  <td className="py-2 pr-2 align-top">
                    <button type="button" onClick={() => onSelectCut(cut.cutIndex)} className={`inline-flex min-h-11 flex-col items-start justify-center rounded-md px-2 py-1 text-left transition-colors motion-reduce:transition-none hover:bg-raised ${FOCUS_RING}`}>
                      <span className="font-semibold text-fg [word-break:keep-all]">{cut.label}</span>
                      <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${cut.scrollStartPct.toFixed(1)}%–${cut.scrollEndPct.toFixed(1)}% · ${formatSmpteTimecode(cut.startTimeMs, cueSheet.fps)}`}</span>
                    </button>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold [word-break:keep-all] ${semanticBadgeClass(mood.semanticTone)}`}>{isEn ? mood.labelEn : mood.labelKo}</span>
                    <div className="mt-1 text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">
                      {transition ? pick(`전환 · ${transition.crossfadeMs}ms (${transition.curve})`, `Shift · ${transition.crossfadeMs}ms`) : pick("이전 무드 유지", "Hold mood")}
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top font-mono text-fg tabular-nums">{`${cut.bgmTargetLufs.toFixed(1)} LUFS`}</td>
                  <td className="px-2 py-2 align-top">
                    {cut.isDuckingActive ? (
                      <span data-testid={`audio-cue-duck-badge-${cut.cutIndex}`} className="inline-flex flex-col rounded-lg border border-warn bg-warning-soft px-2 py-1 font-mono text-[11px] font-semibold text-warn tabular-nums">
                        <span>{`${cueSheet.dialogueDuckingDb.toFixed(1)} dB`}</span>
                        <span>{`→ ${cut.bgmDuckedLufs.toFixed(1)} LUFS`}</span>
                      </span>
                    ) : (
                      <span data-testid={`audio-cue-duck-badge-${cut.cutIndex}`} className="inline-flex rounded-lg border border-line bg-raised px-2 py-1 text-[11px] text-fg-3 [word-break:keep-all]">{pick("덕킹 없음", "No duck")}</span>
                    )}
                  </td>
                  <td className="py-2 pl-2 align-top">
                    {cut.sfxEvents.length === 0 ? <span className="text-[11px] text-fg-3">—</span> : (
                      <ul className="space-y-1">
                        {cut.sfxEvents.map((sfx) => (
                          <li key={sfx.eventId} className="rounded-md border border-line bg-card px-2 py-1 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">
                            <span className="font-semibold text-fg">{sfx.label}</span>
                            <span className="ml-1.5 font-mono text-fg-3">{`${sfx.triggerScrollPct.toFixed(1)}% · ${sfx.gainDb}dB`}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 웹툰 오디오 큐 디렉터(한국어 립싱크 비젬 · BGM 전환 · SFX 타임라인) 스튜디오 패널. */
export function StudioWebtoonAudioCuePanel(props: StudioWebtoonAudioCuePanelProps): ReactElement {
  const {
    initialPreset = "noir-rooftop-chase", initialFps = DEFAULT_LIP_SYNC_FPS,
    initialSyllablesPerSecond = DEFAULT_SYLLABLES_PER_SECOND, locale = "ko",
    className, onCueSheetChange, onCopyWebVtt, onCopyJson,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [presetId, setPresetId] = useState<AudioCuePresetId>(initialPreset);
  const [episodeTitle, setEpisodeTitle] = useState<string>(() => getAudioCueEpisodePreset(initialPreset).episodeTitle);
  const [episodeNumber, setEpisodeNumber] = useState<number>(() => getAudioCueEpisodePreset(initialPreset).episodeNumber);
  const [cuts, setCuts] = useState<readonly AudioCueCutInput[]>(() => getAudioCueEpisodePreset(initialPreset).cuts);
  const [selectedCutIndex, setSelectedCutIndex] = useState<number>(0);
  const [fps, setFps] = useState<number>(initialFps);
  const [syllablesPerSecond, setSyllablesPerSecond] = useState<number>(initialSyllablesPerSecond);
  const [targetLufs, setTargetLufs] = useState<number>(TARGET_BGM_LUFS);
  const [dialogueDuckingDb, setDialogueDuckingDb] = useState<number>(DEFAULT_DIALOGUE_DUCKING_DB);
  const [scrubFrameIndex, setScrubFrameIndex] = useState<number>(0);
  const [exportFormat, setExportFormat] = useState<AudioCueExportFormat>("webvtt");
  const [newSfxCategory, setNewSfxCategory] = useState<SfxCategoryId>("impact-hit");
  const [newSfxLabel, setNewSfxLabel] = useState<string>("");
  const [newSfxOffsetPct, setNewSfxOffsetPct] = useState<number>(50);
  const [cutSeq, setCutSeq] = useState<number>(1);
  const [sfxSeq, setSfxSeq] = useState<number>(1);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const cueSheet = useMemo<EpisodeAudioCueSheet>(
    () => buildEpisodeAudioCueSheet({ episodeTitle, episodeNumber, fps, targetLufs, dialogueDuckingDb, defaultSyllablesPerSecond: syllablesPerSecond, cuts }),
    [cuts, dialogueDuckingDb, episodeNumber, episodeTitle, fps, syllablesPerSecond, targetLufs],
  );
  const webVttOutput = useMemo<string>(() => exportAudioCueWebVtt(cueSheet), [cueSheet]);
  const jsonOutput = useMemo<string>(() => exportAudioCueJson(cueSheet, { includeLipSyncFrames: false, pretty: true }), [cueSheet]);

  const cueNotification = useExampleNotification(onCueSheetChange);
  const vttNotification = useExampleNotification(onCopyWebVtt);
  const jsonNotification = useExampleNotification(onCopyJson);
  const clipboard = useClipboardOutput();
  const channels = [cueNotification, vttNotification, jsonNotification, clipboard];
  const busy = channels.some((channel) => channel.status === "pending");
  const notifyCueSheet = cueNotification.notify;
  const lastCueSheetRef = useRef<EpisodeAudioCueSheet | null>(null);
  useEffect(() => {
    if (lastCueSheetRef.current === cueSheet) return;
    lastCueSheetRef.current = cueSheet;
    notifyCueSheet(cueSheet);
  }, [cueSheet, notifyCueSheet]);

  const safeSelectedIndex = Math.min(selectedCutIndex, Math.max(0, cuts.length - 1));
  const selectedCutInput = cuts[safeSelectedIndex];
  const selectedScheduledCut = cueSheet.cuts[safeSelectedIndex];
  const activeFrames = selectedScheduledCut?.lipSync.frames ?? [];
  const safeFrameIndex = activeFrames.length > 0 ? Math.min(scrubFrameIndex, activeFrames.length - 1) : 0;
  const activeFrame: LipSyncFrame | null = activeFrames[safeFrameIndex] ?? null;
  const activeDecomposed = activeFrame && activeFrame.sourceChar ? decomposeHangulSyllable(activeFrame.sourceChar) : null;

  const handleLoadPreset = (nextPresetId: AudioCuePresetId): void => {
    const preset = getAudioCueEpisodePreset(nextPresetId);
    setPresetId(preset.id); setEpisodeTitle(preset.episodeTitle); setEpisodeNumber(preset.episodeNumber);
    setCuts(preset.cuts); setSelectedCutIndex(0); setScrubFrameIndex(0);
    setStatusMessage(pick(`'${preset.labelKo}' 오디오 큐 프리셋을 불러왔습니다.`, `Loaded '${preset.labelEn}' preset.`));
  };

  const handleReset = (): void => {
    const preset = getAudioCueEpisodePreset(initialPreset);
    setPresetId(preset.id); setEpisodeTitle(preset.episodeTitle); setEpisodeNumber(preset.episodeNumber);
    setCuts(preset.cuts); setFps(initialFps); setSyllablesPerSecond(initialSyllablesPerSecond);
    setTargetLufs(TARGET_BGM_LUFS); setDialogueDuckingDb(DEFAULT_DIALOGUE_DUCKING_DB);
    setSelectedCutIndex(0); setScrubFrameIndex(0);
    setStatusMessage(pick("오디오 큐 디렉터를 기본값(-14 LUFS · -10 dB 덕킹)으로 복원했습니다.", "Reset audio cue director to defaults."));
  };

  function commitCuts(next: readonly AudioCueCutInput[]): boolean {
    try {
      assertAudioCueInput({ episodeTitle, cuts: next });
      setCuts(next);
      return true;
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : pick("입력을 확인하세요.", "Check the input."));
      return false;
    }
  }
  const handleUpdateSelectedCut = (patch: Partial<AudioCueCutInput>): boolean => commitCuts(cuts.map((cut, idx) => (idx === safeSelectedIndex ? { ...cut, ...patch } : cut)));

  const handleAddCut = (): void => {
    if (cuts.length >= MAX_AUDIO_CUTS) { setStatusMessage(pick("컷 상한은 64개입니다.", "The cut limit is 64.")); return; }
    const nextIndex = cuts.length;
    const prevMood = cuts[cuts.length - 1]?.bgmMood ?? "mystery-pulse";
    const next: readonly AudioCueCutInput[] = [...cuts, { id: `cut-custom-${cutSeq}`, label: pick(`${nextIndex + 1}컷 · 추가 연출`, `Cut ${nextIndex + 1} · Added`), panelHeightPx: 1080, speaker: pick("주인공", "Lead"), dialogue: pick("지금 바로 다음 장면으로 넘어가자!", "Move straight into the next beat!"), emotionTone: "urgent", bgmMood: prevMood, crossfadeMs: 800, sfxMarkers: [] }];
    if (!commitCuts(next)) return;
    setCutSeq((n) => n + 1);
    setSelectedCutIndex(nextIndex); setScrubFrameIndex(0);
    setStatusMessage(pick(`${nextIndex + 1}번 컷을 큐시트에 추가했습니다.`, `Appended cut ${nextIndex + 1}.`));
  };

  const handleRemoveCut = (indexToRemove: number): void => {
    if (cuts.length <= 1) return;
    setCuts((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setSelectedCutIndex((prev) => Math.max(0, Math.min(prev, cuts.length - 2)));
    setScrubFrameIndex(0);
    setStatusMessage(pick(`${indexToRemove + 1}번 컷을 큐시트에서 제거했습니다.`, `Removed cut ${indexToRemove + 1}.`));
  };

  const handleAddSfxToSelectedCut = (): void => {
    if (!selectedCutInput) return;
    if ((selectedCutInput.sfxMarkers?.length ?? 0) >= MAX_SFX_PER_CUT) { setStatusMessage(pick("컷별 SFX 상한은 32개입니다.", "The per-cut SFX limit is 32.")); return; }
    const seq = sfxSeq; setSfxSeq((n) => n + 1);
    const cat = SFX_CATEGORY_CATALOG[newSfxCategory];
    const label = newSfxLabel.trim() || (isEn ? cat.labelEn : cat.labelKo);
    if (!handleUpdateSelectedCut({
      sfxMarkers: [...(selectedCutInput.sfxMarkers ?? []), { id: `sfx-custom-${seq}`, category: newSfxCategory, label, offsetRatio01: Math.round(Math.min(100, Math.max(0, newSfxOffsetPct))) / 100, gainDb: cat.defaultGainDb, pan: 0 }],
    })) return;
    setNewSfxLabel("");
    setStatusMessage(pick(`'${label}' SFX 마커를 ${safeSelectedIndex + 1}컷에 추가했습니다.`, `Added SFX '${label}' to cut ${safeSelectedIndex + 1}.`));
  };

  const handleRemoveSfxFromSelectedCut = (sfxId: string): void => {
    if (!selectedCutInput) return;
    handleUpdateSelectedCut({ sfxMarkers: (selectedCutInput.sfxMarkers ?? []).filter((m) => m.id !== sfxId) });
    setStatusMessage(pick("선택한 SFX 마커를 제거했습니다.", "Removed SFX hit marker."));
  };

  const handleCopyWebVtt = (): void => {
    if (channels.some((channel) => channel.isPending())) return;
    vttNotification.notify(webVttOutput); clipboard.notify(webVttOutput); setExportFormat("webvtt");
    setStatusMessage(pick("WebVTT 출력 준비. 복사·알림 응답은 아래에서 확인하세요.", "WebVTT ready. Check copy and notification responses below."));
  };

  const handleCopyJson = (): void => {
    if (channels.some((channel) => channel.isPending())) return;
    jsonNotification.notify(jsonOutput); clipboard.notify(jsonOutput); setExportFormat("json");
    setStatusMessage(pick("JSON 출력 준비. 복사·알림 응답은 아래에서 확인하세요.", "JSON ready. Check copy and notification responses below."));
  };

  return (
    <section
      data-testid="studio-webtoon-audio-cue-panel"
      aria-label={pick("웹툰 오디오 큐 디렉터", "Webtoon Audio Cue Director")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      <fieldset disabled={busy} className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <AudioWaveform className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("웹툰 오디오 큐 디렉터", "Webtoon Audio Cue Director")}
            </span>
            <span data-testid="audio-cue-estimate-badge" className="inline-flex items-center gap-1 rounded-full border border-warn bg-warning-soft px-2.5 py-0.5 text-[11px] font-semibold text-warn [word-break:keep-all]">
              <Waves className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("추정 타이밍 · 규칙 기반", "Estimate · Rule-Based")}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">{pick("한국어 립싱크 비젬 · 스크롤 BGM 크로스페이드 · SFX 큐시트", "Korean Lip-Sync Visemes, Scroll BGM Crossfade & SFX Cue Sheet")}</h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">{isEn ? cueSheet.estimateNoticeEn : cueSheet.estimateNoticeKo}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="audio-cue-copy-vtt-btn" onClick={handleCopyWebVtt} className={BTN_SOLID}>
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("WebVTT 복사", "Copy WebVTT")}
          </button>
          <button type="button" data-testid="audio-cue-copy-json-btn" onClick={handleCopyJson} className={BTN_OUTLINE}>
            <FileCode2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("EDL/JSON 복사", "Copy EDL/JSON")}
          </button>
          <button type="button" data-testid="audio-cue-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("기본값", "Reset")}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised p-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={pick("회차 프리셋 선택", "Episode presets")}>
          {AUDIO_CUE_EPISODE_PRESETS.map((preset) => (
            <button key={preset.id} type="button" data-testid={`audio-cue-preset-${preset.id}`} onClick={() => handleLoadPreset(preset.id)} className={presetId === preset.id ? BTN_ACTIVE : BTN_OUTLINE}>
              {isEn ? preset.labelEn : preset.labelKo}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1" role="group" aria-label={pick("립싱크 FPS", "Lip-sync FPS")}>
            {FPS_CHOICES.map((choice) => (
              <button key={choice} type="button" data-testid={`audio-cue-fps-${choice}`} onClick={() => setFps(choice)} className={fps === choice ? BTN_ACTIVE : BTN_OUTLINE}>
                <span className="tabular-nums">{`${choice} fps`}</span>
              </button>
            ))}
          </div>
          <label htmlFor={`${uid}-sps`} className="flex items-center gap-2 text-xs text-fg-2 [word-break:keep-all]">
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden="true" />
            <span>{pick("발화 속도", "Rate")}</span>
            <input id={`${uid}-sps`} data-testid="audio-cue-sps-slider" type="range" min={2.5} max={8.0} step={0.1} value={syllablesPerSecond} onChange={(e) => setSyllablesPerSecond(Number(e.target.value))} className={`w-24 cursor-pointer accent-accent ${FOCUS_RING}`} />
            <span data-testid="audio-cue-sps-value" className="w-16 font-mono font-semibold text-fg tabular-nums">{`${syllablesPerSecond.toFixed(1)}/s`}</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard testId="audio-cue-kpi-duration" label={pick("추정 러닝타임 · 립싱크", "Est. Duration & Frames")} value={formatWebVttTimestamp(cueSheet.totalDurationMs)} sub={pick(`${cueSheet.summary.totalLipSyncFrames}프레임 · ${cueSheet.fps}fps`, `${cueSheet.summary.totalLipSyncFrames} frames · ${cueSheet.fps}fps`)} toneClass="text-accent" />
        <KpiCard testId="audio-cue-kpi-bgm" label={pick("BGM 전환 · 목표 음압", "BGM Shifts & Target")} value={`${cueSheet.targetLufs.toFixed(1)} LUFS`} sub={pick(`무드 전환 ${cueSheet.summary.bgmTransitionCount}회 · ${cueSheet.summary.cutCount}컷`, `${cueSheet.summary.bgmTransitionCount} shifts · ${cueSheet.summary.cutCount} cuts`)} toneClass="text-cool" />
        <KpiCard testId="audio-cue-kpi-ducking" label={pick("대사 구간 자동 덕킹", "Dialogue Auto-Ducking")} value={`${cueSheet.dialogueDuckingDb.toFixed(1)} dB`} sub={pick(`${cueSheet.summary.duckingWindowCount}구간 · 최저 ${cueSheet.summary.duckedFloorLufs.toFixed(1)} LUFS`, `${cueSheet.summary.duckingWindowCount} windows · ${cueSheet.summary.duckedFloorLufs.toFixed(1)} LUFS`)} toneClass="text-warn" />
        <KpiCard testId="audio-cue-kpi-sfx" label={pick("SFX 히트 · 한글 음절", "SFX Hits & Syllables")} value={pick(`${cueSheet.summary.sfxEventCount}건`, `${cueSheet.summary.sfxEventCount} hits`)} sub={pick(`한글 ${cueSheet.summary.totalHangulSyllables}음절 · 대표 ${cueSheet.summary.dominantViseme}`, `${cueSheet.summary.totalHangulSyllables} Hangul · top ${cueSheet.summary.dominantViseme}`)} toneClass="text-good" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-line bg-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Headphones className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("컷 시퀀스 목록", "Episode Cut Sequence")}</h3>
              </div>
              <button type="button" data-testid="audio-cue-add-cut-btn" onClick={handleAddCut} className={BTN_OUTLINE}>
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("컷 추가", "Add Cut")}
              </button>
            </div>

            <div className="space-y-2" role="listbox" aria-label={pick("편집할 컷 선택", "Select cut to edit")}>
              {cueSheet.cuts.map((cut) => {
                const isSelected = cut.cutIndex === safeSelectedIndex;
                const toneMeta = EMOTION_TONE_PROFILES[cut.emotionTone];
                return (
                  <div key={cut.cutId} className={`flex items-center gap-2 rounded-xl border p-2 ${isSelected ? "border-accent bg-accent-soft" : "border-line bg-card"}`}>
                    <button
                      type="button" role="option" aria-selected={isSelected} data-testid={`audio-cue-cut-item-${cut.cutIndex}`}
                      onClick={() => { setSelectedCutIndex(cut.cutIndex); setScrubFrameIndex(0); }}
                      className={`flex min-h-11 flex-1 flex-col items-start justify-center rounded-lg px-2 py-1 text-left ${FOCUS_RING}`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-xs font-bold text-fg [word-break:keep-all]">{cut.label}</span>
                        <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${cut.scrollStartPct.toFixed(0)}–${cut.scrollEndPct.toFixed(0)}%`}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className={`rounded-full border px-1.5 py-0.5 font-semibold ${semanticBadgeClass(toneMeta.semanticTone)}`}>{isEn ? toneMeta.labelEn : toneMeta.labelKo}</span>
                        <span className="text-fg-2 [word-break:keep-all]">
                          {cut.dialogue ? `${cut.speaker || pick("화자", "Voice")}: ${cut.dialogue.slice(0, 22)}${cut.dialogue.length > 22 ? "…" : ""}` : pick("무대사 정적 컷", "Silent beat cut")}
                        </span>
                      </div>
                    </button>
                    {cuts.length > 1 ? (
                      <button type="button" data-testid={`audio-cue-remove-cut-${cut.cutIndex}`} aria-label={pick(`${cut.cutIndex + 1}컷 삭제`, `Remove cut ${cut.cutIndex + 1}`)} onClick={() => handleRemoveCut(cut.cutIndex)} className={`${BTN_OUTLINE} px-2.5 text-bad`}>
                        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedCutInput && selectedScheduledCut ? (
            <div data-testid="audio-cue-cut-editor" className="space-y-3 rounded-xl border border-line bg-panel p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick(`${selectedScheduledCut.cutIndex + 1}컷 대사 · 톤 · BGM 편집`, `Edit Cut ${selectedScheduledCut.cutIndex + 1}`)}</h3>
                </div>
                <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${selectedScheduledCut.scrollStartPct.toFixed(1)}%–${selectedScheduledCut.scrollEndPct.toFixed(1)}%`}</span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${uid}-speaker`} className="mb-1 block text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("화자(캐릭터)", "Speaker")}</label>
                  <input id={`${uid}-speaker`} data-testid="audio-cue-speaker-input" type="text" maxLength={2048} value={selectedCutInput.speaker} onChange={(e) => handleUpdateSelectedCut({ speaker: e.target.value })} placeholder={pick("예: 서진", "e.g. Seojin")} className={INPUT_BASE} />
                </div>
                <div>
                  <label htmlFor={`${uid}-bgm`} className="mb-1 block text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("BGM 무드", "BGM Mood")}</label>
                  <select id={`${uid}-bgm`} data-testid="audio-cue-bgm-select" value={selectedCutInput.bgmMood} onChange={(e) => handleUpdateSelectedCut({ bgmMood: e.target.value as BgmMoodId })} className={INPUT_BASE}>
                    {BGM_MOOD_IDS.map((moodId) => (
                      <option key={moodId} value={moodId}>{isEn ? `${BGM_MOOD_CATALOG[moodId].labelEn} (${BGM_MOOD_CATALOG[moodId].bpm} BPM)` : `${BGM_MOOD_CATALOG[moodId].labelKo} (${BGM_MOOD_CATALOG[moodId].bpm} BPM)`}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor={`${uid}-dialogue`} className="mb-1 block text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("한국어 대사 (실시간 자모 분해 · 립싱크 갱신)", "Korean Dialogue (Live Jamo Lip-Sync)")}</label>
                <textarea id={`${uid}-dialogue`} data-testid="audio-cue-dialogue-input" maxLength={MAX_DIALOGUE_LENGTH} rows={2} value={selectedCutInput.dialogue} onChange={(e) => { handleUpdateSelectedCut({ dialogue: e.target.value }); setScrubFrameIndex(0); }} placeholder={pick("대사를 비우면 무대사 컷으로 처리되어 BGM 덕킹이 해제됩니다.", "Leave blank for a silent cut without ducking.")} className={INPUT_BASE} />
              </div>

              <div>
                <div className="mb-1 text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("감정 발화 톤 (속도·개구 폭 반영)", "Emotion Speech Tone")}</div>
                <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={pick("감정 발화 톤", "Emotion Speech Tone")}>
                  {SPEECH_EMOTION_TONES.map((tone) => (
                    <button key={tone} type="button" data-testid={`audio-cue-tone-${tone}`} onClick={() => handleUpdateSelectedCut({ emotionTone: tone })} className={selectedCutInput.emotionTone === tone ? BTN_ACTIVE : BTN_OUTLINE}>
                      {isEn ? EMOTION_TONE_PROFILES[tone].labelEn : EMOTION_TONE_PROFILES[tone].labelKo}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div>
                  <label htmlFor={`${uid}-cf`} className="mb-1 block text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("크로스페이드 (ms)", "Crossfade (ms)")}</label>
                  <input id={`${uid}-cf`} data-testid="audio-cue-crossfade-input" type="number" min={0} max={5000} step={50} value={selectedCutInput.crossfadeMs ?? BGM_MOOD_CATALOG[selectedCutInput.bgmMood].defaultCrossfadeMs} onChange={(e) => handleUpdateSelectedCut({ crossfadeMs: Number(e.target.value) })} className={`${INPUT_BASE} font-mono tabular-nums`} />
                </div>
                <div>
                  <label htmlFor={`${uid}-lufs`} className="mb-1 block text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("BGM 기준 (LUFS)", "BGM Target (LUFS)")}</label>
                  <input id={`${uid}-lufs`} data-testid="audio-cue-lufs-input" type="number" min={-24} max={-8} step={1} value={targetLufs} onChange={(e) => setTargetLufs(Number(e.target.value))} className={`${INPUT_BASE} font-mono tabular-nums`} />
                </div>
                <div>
                  <label htmlFor={`${uid}-duck`} className="mb-1 block text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("대사 덕킹 (dB)", "Ducking (dB)")}</label>
                  <input id={`${uid}-duck`} data-testid="audio-cue-ducking-input" type="number" min={-24} max={-3} step={1} value={dialogueDuckingDb} onChange={(e) => setDialogueDuckingDb(Number(e.target.value))} className={`${INPUT_BASE} font-mono tabular-nums`} />
                </div>
              </div>

              <div className="space-y-2 border-t border-line pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-fg [word-break:keep-all]">{pick("SFX 히트 마커", "SFX Hit Markers")}</span>
                  <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${(selectedCutInput.sfxMarkers ?? []).length} SFX`}</span>
                </div>
                {(selectedCutInput.sfxMarkers ?? []).length > 0 ? (
                  <ul className="space-y-1.5">
                    {(selectedCutInput.sfxMarkers ?? []).map((marker) => (
                      <li key={marker.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs">
                        <span className="truncate text-fg [word-break:keep-all]">{`${marker.label} · ${Math.round(marker.offsetRatio01 * 100)}%`}</span>
                        <button type="button" onClick={() => handleRemoveSfxFromSelectedCut(marker.id)} aria-label={pick(`${marker.label} 삭제`, `Remove ${marker.label}`)} className={`${BTN_OUTLINE} px-2 text-bad`}>
                          <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <select aria-label={pick("SFX 종류", "SFX category")} data-testid="audio-cue-sfx-category-select" value={newSfxCategory} onChange={(e) => setNewSfxCategory(e.target.value as SfxCategoryId)} className={`${INPUT_BASE} sm:col-span-4`}>
                    {SFX_CATEGORY_IDS.map((catId) => <option key={catId} value={catId}>{isEn ? SFX_CATEGORY_CATALOG[catId].labelEn : SFX_CATEGORY_CATALOG[catId].labelKo}</option>)}
                  </select>
                  <input aria-label={pick("SFX 이름", "SFX label")} maxLength={2048} data-testid="audio-cue-sfx-label-input" type="text" value={newSfxLabel} onChange={(e) => setNewSfxLabel(e.target.value)} placeholder={pick("SFX 설명", "SFX label")} className={`${INPUT_BASE} sm:col-span-4`} />
                  <input aria-label={pick("컷 내 위치(%)", "Cut offset %")} data-testid="audio-cue-sfx-offset-input" type="number" min={0} max={100} value={newSfxOffsetPct} onChange={(e) => setNewSfxOffsetPct(Number(e.target.value))} className={`${INPUT_BASE} font-mono tabular-nums sm:col-span-2`} />
                  <button type="button" data-testid="audio-cue-add-sfx-btn" aria-label={pick("SFX 추가", "Add SFX")} onClick={handleAddSfxToSelectedCut} className={`${BTN_OUTLINE} sm:col-span-2`}>
                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-7">
          <div data-testid="audio-cue-viseme-timeline" className="space-y-3 rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("실시간 한국어 립싱크 비젬 타임라인", "Live Korean Lip-Sync Viseme Timeline")}</h3>
              </div>
              <span data-testid="audio-cue-viseme-meta" className="font-mono text-[11px] text-fg-3 tabular-nums">
                {selectedScheduledCut ? `${selectedScheduledCut.lipSync.hangulSyllableCount}음절 · ${selectedScheduledCut.lipSync.totalFrames}f · ${selectedScheduledCut.lipSync.effectiveSyllablesPerSecond.toFixed(1)}/s · ${selectedScheduledCut.lipSync.dataSourceKind}` : "0f"}
              </span>
            </div>

            {selectedScheduledCut && selectedScheduledCut.lipSync.segments.length > 0 ? (
              <>
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-3">
                  <MouthShapePreviewSvg frame={activeFrame} isEn={isEn} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span data-testid="audio-cue-active-frame-readout" className="font-bold text-fg tabular-nums [word-break:keep-all]">
                        {activeFrame ? pick(`프레임 #${activeFrame.frameIndex + 1}/${activeFrames.length} · ${activeFrame.viseme} (${formatSmpteTimecode(activeFrame.timeMs, cueSheet.fps)})`, `Frame #${activeFrame.frameIndex + 1}/${activeFrames.length} · ${activeFrame.viseme} (${formatSmpteTimecode(activeFrame.timeMs, cueSheet.fps)})`) : "REST"}
                      </span>
                      {activeDecomposed ? (
                        <span data-testid="audio-cue-jamo-breakdown" className="rounded-md border border-accent bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
                          {`${activeDecomposed.char} = ${activeDecomposed.choseong}+${activeDecomposed.jungseong}${activeDecomposed.jongseong ? `+${activeDecomposed.jongseong}` : ""}`}
                        </span>
                      ) : (
                        <span data-testid="audio-cue-jamo-breakdown" className="rounded-md border border-line bg-raised px-2 py-0.5 text-[11px] text-fg-3 [word-break:keep-all]">{pick("휴지·비한글 구간", "Rest / Non-Hangul")}</span>
                      )}
                    </div>
                    <label htmlFor={`${uid}-scrub`} className="block text-[11px] text-fg-3 [word-break:keep-all]">{pick("프레임 스크러버 (입모양 개구·원순 확인)", "Frame scrubber")}</label>
                    <input id={`${uid}-scrub`} data-testid="audio-cue-frame-scrubber" type="range" min={0} max={Math.max(0, activeFrames.length - 1)} step={1} value={safeFrameIndex} onChange={(e) => setScrubFrameIndex(Number(e.target.value))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
                    <div className="flex flex-wrap gap-3 font-mono text-[11px] text-fg-2 tabular-nums">
                      <span>{`${pick("개구", "Open")} ${Math.round((activeFrame?.openness01 ?? 0) * 100)}%`}</span>
                      <span>{`${pick("너비", "Width")} ${Math.round((activeFrame?.width01 ?? 0) * 100)}%`}</span>
                      <span>{`${pick("원순", "Round")} ${Math.round((activeFrame?.roundness01 ?? 0) * 100)}%`}</span>
                    </div>
                  </div>
                </div>

                <div data-testid="audio-cue-viseme-bar" className="flex min-h-12 w-full items-stretch gap-0.5 overflow-x-auto rounded-xl border border-line bg-canvas p-1.5" role="img" aria-label={pick("시맨틱 토큰 기반 립싱크 비젬 타임라인 바", "Semantic lip-sync viseme timeline bar")}>
                  {selectedScheduledCut.lipSync.segments.map((seg) => {
                    const ratioPct = selectedScheduledCut.lipSync.durationMs > 0 ? Math.max(3, (seg.durationMs / selectedScheduledCut.lipSync.durationMs) * 100) : 10;
                    return (
                      <div key={seg.segmentIndex} data-testid={`audio-cue-viseme-seg-${seg.segmentIndex}`} data-viseme={seg.viseme} style={{ flexGrow: Math.max(1, Math.round(ratioPct * 10)) }} title={`${seg.sourceChar || "REST"} → ${seg.viseme} (${seg.durationMs}ms)`} className={`flex min-w-7 flex-col items-center justify-center rounded-md border px-1 py-1 text-[10px] font-bold leading-tight tabular-nums ${visemeSegmentClass(seg.viseme)}`}>
                        <span>{seg.viseme}</span>
                        <span className="font-normal opacity-80">{seg.sourceChar || "·"}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {LIP_SYNC_VISEMES.map((viseme) => (
                    <span key={viseme} data-testid={`audio-cue-viseme-count-${viseme}`} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums [word-break:keep-all] ${visemeSegmentClass(viseme)}`}>
                      <span>{isEn ? VISEME_PROFILES[viseme].labelEn : VISEME_PROFILES[viseme].labelKo}</span>
                      <span>{`${selectedScheduledCut.lipSync.visemeDistribution[viseme]}f`}</span>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div data-testid="audio-cue-silent-cut-notice" className="rounded-xl border border-line bg-card p-4 text-xs text-fg-2 [word-break:keep-all]">
                {pick("현재 컷은 대사가 없는 무대사 정적 컷입니다. BGM 자동 덕킹이 해제되며 SFX 마커와 스크롤 호흡만 스케줄링됩니다.", "This cut has no spoken dialogue. BGM ducking stays inactive while scroll pacing and SFX markers remain scheduled.")}
              </div>
            )}
          </div>

          <BgmDuckingMatrixTable cueSheet={cueSheet} selectedCutIndex={safeSelectedIndex} isEn={isEn} onSelectCut={(cutIndex) => { setSelectedCutIndex(cutIndex); setScrubFrameIndex(0); }} />

          <div data-testid="audio-cue-export-section" className="space-y-3 rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2" role="tablist" aria-label={pick("큐시트 내보내기 형식", "Export format")}>
                <button type="button" role="tab" aria-selected={exportFormat === "webvtt"} data-testid="audio-cue-export-tab-webvtt" onClick={() => setExportFormat("webvtt")} className={exportFormat === "webvtt" ? BTN_ACTIVE : BTN_OUTLINE}>
                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{"WebVTT (.vtt)"}
                </button>
                <button type="button" role="tab" aria-selected={exportFormat === "json"} data-testid="audio-cue-export-tab-json" onClick={() => setExportFormat("json")} className={exportFormat === "json" ? BTN_ACTIVE : BTN_OUTLINE}>
                  <FileCode2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{"EDL · JSON (.json)"}
                </button>
              </div>
              <button type="button" data-testid="audio-cue-copy-active-export-btn" onClick={exportFormat === "webvtt" ? handleCopyWebVtt : handleCopyJson} className={BTN_OUTLINE}>
                <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {exportFormat === "webvtt" ? pick("현재 WebVTT 복사", "Copy Current WebVTT") : pick("현재 JSON 복사", "Copy Current JSON")}
              </button>
            </div>
            <pre data-testid="audio-cue-export-preview" className="max-h-52 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-fg-2 tabular-nums">
              {exportFormat === "webvtt" ? webVttOutput : jsonOutput}
            </pre>
          </div>
        </div>
      </div>

      </fieldset>
      <OperationStatus channel="cue" status={cueNotification.status} retry={cueNotification.retry} pending={busy} isEn={isEn} />
      <OperationStatus channel="vtt" status={vttNotification.status} retry={vttNotification.retry} pending={busy} isEn={isEn} />
      <OperationStatus channel="json" status={jsonNotification.status} retry={jsonNotification.retry} pending={busy} isEn={isEn} />
      <OperationStatus channel="clipboard" status={clipboard.status} retry={clipboard.retry} pending={busy} isEn={isEn} />
      {statusMessage ? (
        <div role="status" aria-live="polite" data-testid="audio-cue-status-banner" className="flex items-center gap-2 rounded-xl border border-good bg-good-soft px-3.5 py-2.5 text-xs font-semibold text-good [word-break:keep-all]">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      ) : null}
    </section>
  );
}
