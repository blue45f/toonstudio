/**
 * 음성 운율(Prosody) & 대사 리듬 -> 웹툰 말풍선 자동 조판 스튜디오 패널.
 *
 * - Props 없이 단독 마운트 가능하며 3종 내장 프리셋(액션 대결·로맨스 속삭임·코미디 반전)과
 *   800px 모바일 세로 스크롤 스트립 SVG 실시간 미리보기를 제공한다.
 * - Calm Atelier 시맨틱 토큰 전용(원시 색상 0건 · 명시적 transition 속성만 사용 · Web Storage 비의존).
 */

import {
  CheckCircle2,
  Copy,
  Download,
  MessageSquareText,
  Mic,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  Zap,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import type {
  BalloonGeometryKind,
  LaidOutSpeechBalloon,
  SpeakerAlignment,
  VoiceEmotionTag,
  VoiceProsodyCue,
} from "./types";
import {
  BALLOON_GEOMETRY_META_KO,
  DEFAULT_MAX_CHARS_PER_LINE,
  DEFAULT_MIN_VERTICAL_GUTTER_PX,
  MAX_CHARS_PER_LINE_LIMIT,
  MIN_CHARS_PER_LINE_LIMIT,
  VOICE_BALLOON_PRESETS,
  VOICE_EMOTION_LABELS_KO,
  buildBalloonSvgPath,
  findVoiceBalloonPresetById,
  layoutVoiceToBalloons,
  serializeVoiceBalloonLayout,
} from "./voice-to-balloon-engine";

export interface StudioVoiceToBalloonPanelProps {
  readonly initialPresetId?: string;
  readonly className?: string;
}

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_CHIP_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

const EMOTION_OPTIONS: readonly VoiceEmotionTag[] = [
  "neutral",
  "anger",
  "urgency",
  "whisper",
  "affection",
  "thought",
  "narration",
  "shock",
  "deadpan",
];

const ALIGNMENT_LABELS_KO: Readonly<Record<SpeakerAlignment, string>> = {
  left: "좌측 화자",
  center: "중앙 배치",
  right: "우측 화자",
};

function balloonSvgClassName(geometry: BalloonGeometryKind, isSelected: boolean): string {
  const strokeTone = isSelected
    ? "stroke-accent"
    : geometry === "shout-spike"
      ? "stroke-bad"
      : geometry === "whisper-dashed"
        ? "stroke-cool"
        : geometry === "narration-rect"
          ? "stroke-line-strong"
          : "stroke-fg";

  const fillTone =
    geometry === "narration-rect"
      ? "fill-raised"
      : geometry === "shout-spike"
        ? "fill-card"
        : "fill-panel";

  return `${fillTone} ${strokeTone}`;
}

function downloadJsonFile(filename: string, content: string): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return;
  }
  const url = URL.createObjectURL(new Blob([`${content}\n`], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function renderBalloonTail(balloon: LaidOutSpeechBalloon, isSelected: boolean): ReactElement | null {
  const strokeClass = isSelected ? "stroke-accent" : "stroke-fg";
  const { x, y, width, height, tailDirection, geometry } = balloon;

  if (tailDirection === "none") return null;

  if (geometry === "thought-cloud") {
    const baseX = tailDirection === "bottom-left" ? x + width * 0.24 : x + width * 0.76;
    const stepX = tailDirection === "bottom-left" ? -12 : 12;
    return (
      <g aria-hidden="true">
        <circle
          cx={baseX}
          cy={y + height + 10}
          r={6}
          className={`fill-panel ${strokeClass}`}
          strokeWidth={2}
        />
        <circle
          cx={baseX + stepX}
          cy={y + height + 21}
          r={3.5}
          className={`fill-panel ${strokeClass}`}
          strokeWidth={1.8}
        />
      </g>
    );
  }

  const tipX = tailDirection === "bottom-left" ? x + width * 0.16 : x + width * 0.84;
  const rootLeft = tailDirection === "bottom-left" ? x + width * 0.24 : x + width * 0.68;
  const rootRight = tailDirection === "bottom-left" ? x + width * 0.34 : x + width * 0.78;
  const rootY = y + height - 6;
  const tipY = y + height + 18;

  return (
    <path
      d={`M ${rootLeft} ${rootY} L ${tipX} ${tipY} L ${rootRight} ${rootY} Z`}
      className={`fill-panel ${strokeClass}`}
      strokeWidth={geometry === "shout-spike" ? 2.6 : 2}
      strokeDasharray={geometry === "whisper-dashed" ? "5 4" : undefined}
      aria-hidden="true"
    />
  );
}

export function StudioVoiceToBalloonPanel({
  initialPresetId,
  className,
}: StudioVoiceToBalloonPanelProps = {}): ReactElement {
  const uid = useId();
  const initialPreset = findVoiceBalloonPresetById(initialPresetId);

  const [selectedPresetId, setSelectedPresetId] = useState<string>(initialPreset.id);
  const [cues, setCues] = useState<readonly VoiceProsodyCue[]>(initialPreset.cues);
  const [selectedCueId, setSelectedCueId] = useState<string>(initialPreset.cues[0]?.id ?? "");
  const [maxCharsPerLine, setMaxCharsPerLine] = useState<number>(DEFAULT_MAX_CHARS_PER_LINE);
  const [minVerticalGutterPx, setMinVerticalGutterPx] = useState<number>(
    DEFAULT_MIN_VERTICAL_GUTTER_PX,
  );
  const [includeSfx, setIncludeSfx] = useState<boolean>(true);
  const [noticeText, setNoticeText] = useState<string>("");

  const activePreset = findVoiceBalloonPresetById(selectedPresetId);

  const layout = useMemo(
    () =>
      layoutVoiceToBalloons(cues, {
        stripWidthPx: activePreset.stripWidthPx,
        maxCharsPerLine,
        minVerticalGutterPx,
        includeSfx,
      }),
    [activePreset.stripWidthPx, cues, includeSfx, maxCharsPerLine, minVerticalGutterPx],
  );

  const selectedCue = useMemo(
    () => cues.find((item) => item.id === selectedCueId) ?? cues[0],
    [cues, selectedCueId],
  );

  const handleSelectPreset = (presetId: string): void => {
    const next = findVoiceBalloonPresetById(presetId);
    setSelectedPresetId(next.id);
    setCues(next.cues);
    setSelectedCueId(next.cues[0]?.id ?? "");
    setNoticeText(`"${next.nameKo}" 프리셋으로 전환했습니다.`);
  };

  const handleResetPreset = (): void => {
    setCues(activePreset.cues);
    setSelectedCueId(activePreset.cues[0]?.id ?? "");
    setMaxCharsPerLine(DEFAULT_MAX_CHARS_PER_LINE);
    setMinVerticalGutterPx(DEFAULT_MIN_VERTICAL_GUTTER_PX);
    setIncludeSfx(true);
    setNoticeText("프리셋 기본 운율과 조판 설정으로 복원했습니다.");
  };

  const updateSelectedCue = (patch: Partial<VoiceProsodyCue>): void => {
    if (!selectedCue) return;
    setCues((prev) =>
      prev.map((item) => (item.id === selectedCue.id ? { ...item, ...patch } : item)),
    );
  };

  const handleAddCue = (): void => {
    const nextIndex = cues.length + 1;
    const nextId = `custom-${nextIndex}`;
    const nextCue: VoiceProsodyCue = {
      id: nextId,
      speaker: nextIndex % 2 === 0 ? "화자 B" : "화자 A",
      alignment: nextIndex % 2 === 0 ? "right" : "left",
      text: "잠깐만요, 방금 한 말 다시 들려줄 수 있어요?",
      pauseBeforeMs: 420,
      durationMs: 1750,
      peakDb: -11.2,
      pitchSlopeSemitones: 1.8,
      emotion: "neutral",
    };
    setCues((prev) => [...prev, nextCue]);
    setSelectedCueId(nextId);
    setNoticeText(`대사 #${nextIndex}을 추가했습니다.`);
  };

  const handleCopyLayoutJson = async (): Promise<void> => {
    const serialized = serializeVoiceBalloonLayout(layout);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(serialized);
        setNoticeText("800px 말풍선 조판 JSON을 클립보드에 복사했습니다.");
        return;
      }
    } catch {
      // 클립보드 권한이 없는 환경에서는 안내 메시지만 표시한다.
    }
    setNoticeText("조판 JSON 생성이 완료되었습니다. 다운로드 버튼으로 저장할 수 있습니다.");
  };

  const handleDownloadLayoutJson = (): void => {
    const serialized = serializeVoiceBalloonLayout(layout);
    downloadJsonFile(`voice-balloon-layout-${activePreset.id}.json`, serialized);
    setNoticeText(`voice-balloon-layout-${activePreset.id}.json 파일을 내보냈습니다.`);
  };

  return (
    <section
      aria-labelledby={`${uid}-heading`}
      className={`rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${className ?? ""}`}
    >
      <header className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-accent">
            <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>음성 운율 → 웹툰 말풍선 자동 조판기</span>
          </div>
          <h2
            id={`${uid}-heading`}
            className="text-base font-bold tracking-tight text-fg [word-break:keep-all] md:text-lg"
          >
            음성 리듬·억양 기반 800px 세로 스크롤 말풍선 레이아웃
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            침묵 간격(ms), 피크 음압(dB), 피치 기울기, 감정 태그를 로컬에서 분석해 모바일 최적
            한 줄 {maxCharsPerLine}자 이내 어절 줄바꿈과 0겹침 여백, 키네틱 SFX 배치를 자동 계산합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void handleCopyLayoutJson();
            }}
            className={BTN_OUTLINE}
          >
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>JSON 복사</span>
          </button>
          <button type="button" onClick={handleDownloadLayoutJson} className={BTN_PRIMARY}>
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>조판 JSON 저장</span>
          </button>
          <button type="button" onClick={handleResetPreset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>초기화</span>
          </button>
        </div>
      </header>

      {/* 프리셋 선택 + KPI 요약 */}
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="음성 대본 시나리오 프리셋" className="flex flex-wrap gap-2">
          {VOICE_BALLOON_PRESETS.map((preset) => {
            const isActive = preset.id === activePreset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleSelectPreset(preset.id)}
                className={isActive ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
              >
                <MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{preset.nameKo}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-card px-3 py-2">
            <div className="text-[11px] text-fg-3">겹침 검사</div>
            <div className="mt-0.5 flex items-center gap-1 text-xs font-bold tabular-nums text-good">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{layout.overlapCheck.overlapCount}건 (0겹침)</span>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2">
            <div className="text-[11px] text-fg-3">생성 말풍선 · SFX</div>
            <div className="mt-0.5 text-xs font-bold tabular-nums text-fg">
              {layout.balloons.length}개 · {layout.sfxCallouts.length}개
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2">
            <div className="text-[11px] text-fg-3">최대 줄 폭</div>
            <div className="mt-0.5 text-xs font-bold tabular-nums text-fg">
              {layout.maxLineVisualCharsObserved} / {layout.maxCharsPerLine}자
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2">
            <div className="text-[11px] text-fg-3">예상 읽기 · 높이</div>
            <div className="mt-0.5 text-xs font-bold tabular-nums text-fg">
              {layout.estimatedReadTimeSec}초 · {layout.stripHeightPx}px
            </div>
          </div>
        </div>
      </div>

      {noticeText ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 [word-break:keep-all]"
        >
          {noticeText}
        </p>
      ) : null}

      {/* 메인 2열 작업대: 좌측 운율·조판 제어 / 우측 800px 웹툰 스트립 SVG 프리뷰 */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,430px)]">
        <div className="space-y-4">
          {/* 전역 조판 규칙 */}
          <div className="rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>모바일 조판 규칙 (800px 스트립)</span>
              </div>
              <button
                type="button"
                aria-pressed={includeSfx}
                onClick={() => setIncludeSfx((prev) => !prev)}
                className={includeSfx ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
              >
                <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>키네틱 SFX {includeSfx ? "켜짐" : "꺼짐"}</span>
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={`${uid}-max-chars`} className="font-medium text-fg-2">
                    줄당 최대 글자수
                  </label>
                  <span className="font-semibold tabular-nums text-fg">{maxCharsPerLine}자</span>
                </div>
                <input
                  id={`${uid}-max-chars`}
                  type="range"
                  min={MIN_CHARS_PER_LINE_LIMIT}
                  max={MAX_CHARS_PER_LINE_LIMIT}
                  step={1}
                  value={maxCharsPerLine}
                  onChange={(event) => setMaxCharsPerLine(Number(event.target.value))}
                  className="w-full accent-accent"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={`${uid}-min-gutter`} className="font-medium text-fg-2">
                    최소 세로 여백
                  </label>
                  <span className="font-semibold tabular-nums text-fg">{minVerticalGutterPx}px</span>
                </div>
                <input
                  id={`${uid}-min-gutter`}
                  type="range"
                  min={22}
                  max={72}
                  step={2}
                  value={minVerticalGutterPx}
                  onChange={(event) => setMinVerticalGutterPx(Number(event.target.value))}
                  className="w-full accent-accent"
                />
              </div>
            </div>
          </div>

          {/* 큐 리스트 */}
          <div className="rounded-xl border border-line bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg">
                음성 트랜스크립트 큐 ({cues.length}건 · {activePreset.genreKo})
              </h3>
              <button type="button" onClick={handleAddCue} className={BTN_OUTLINE}>
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>대사 추가</span>
              </button>
            </div>

            <div className="mt-2.5 grid gap-2">
              {cues.map((cue, idx) => {
                const isSelected = cue.id === selectedCue?.id;
                const matchedBalloons = layout.balloons.filter((b) => b.sourceCueId === cue.id);
                const geometry = matchedBalloons[0]?.geometry ?? "normal-oval";
                return (
                  <button
                    key={cue.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedCueId(cue.id)}
                    className={`flex min-h-11 w-full cursor-pointer flex-col gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                      isSelected
                        ? "border-accent bg-accent-soft"
                        : "border-line bg-panel hover:border-line-strong hover:bg-raised"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="font-bold text-fg">
                        #{idx + 1} {cue.speaker}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 tabular-nums text-fg-2">
                        <span className="rounded-md border border-line bg-card px-1.5 py-0.5 font-medium text-fg">
                          {BALLOON_GEOMETRY_META_KO[geometry].labelKo}
                        </span>
                        <span>{cue.peakDb.toFixed(1)}dB</span>
                        <span>휴지 {cue.pauseBeforeMs}ms</span>
                        {matchedBalloons.length > 1 ? (
                          <span className="font-semibold text-accent">
                            {matchedBalloons.length}분할
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-xs leading-snug text-fg-2 [word-break:keep-all]">{cue.text}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 선택 큐 운율 상세 편집기 */}
          {selectedCue ? (
            <div className="rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Volume2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>선택 대사 운율 조정 — {selectedCue.speaker}</span>
              </div>

              <div className="mt-3 space-y-3">
                <div className="space-y-1">
                  <label htmlFor={`${uid}-cue-text`} className="block text-xs font-medium text-fg-2">
                    대사 내용 (한글 어절 유지 · 자동 분할)
                  </label>
                  <textarea
                    id={`${uid}-cue-text`}
                    rows={2}
                    value={selectedCue.text}
                    onChange={(event) => updateSelectedCue({ text: event.target.value })}
                    className={`w-full rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg ${FOCUS_RING}`}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor={`${uid}-cue-emotion`} className="block text-xs font-medium text-fg-2">
                      감정·발화 태그
                    </label>
                    <select
                      id={`${uid}-cue-emotion`}
                      value={selectedCue.emotion}
                      onChange={(event) =>
                        updateSelectedCue({ emotion: event.target.value as VoiceEmotionTag })
                      }
                      className={`min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg ${FOCUS_RING}`}
                    >
                      {EMOTION_OPTIONS.map((tag) => (
                        <option key={tag} value={tag}>
                          {VOICE_EMOTION_LABELS_KO[tag]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor={`${uid}-cue-align`} className="block text-xs font-medium text-fg-2">
                      화자 가로 정렬
                    </label>
                    <select
                      id={`${uid}-cue-align`}
                      value={selectedCue.alignment}
                      onChange={(event) =>
                        updateSelectedCue({ alignment: event.target.value as SpeakerAlignment })
                      }
                      className={`min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg ${FOCUS_RING}`}
                    >
                      {(["left", "center", "right"] as const).map((align) => (
                        <option key={align} value={align}>
                          {ALIGNMENT_LABELS_KO[align]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={`${uid}-cue-db`} className="text-fg-2">
                        피크 음압
                      </label>
                      <span className="font-semibold tabular-nums text-fg">
                        {selectedCue.peakDb.toFixed(1)}dB
                      </span>
                    </div>
                    <input
                      id={`${uid}-cue-db`}
                      type="range"
                      min={-28}
                      max={0}
                      step={0.5}
                      value={selectedCue.peakDb}
                      onChange={(event) => updateSelectedCue({ peakDb: Number(event.target.value) })}
                      className="w-full accent-accent"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={`${uid}-cue-pause`} className="text-fg-2">
                        선행 침묵
                      </label>
                      <span className="font-semibold tabular-nums text-fg">
                        {selectedCue.pauseBeforeMs}ms
                      </span>
                    </div>
                    <input
                      id={`${uid}-cue-pause`}
                      type="range"
                      min={0}
                      max={1800}
                      step={40}
                      value={selectedCue.pauseBeforeMs}
                      onChange={(event) =>
                        updateSelectedCue({ pauseBeforeMs: Number(event.target.value) })
                      }
                      className="w-full accent-accent"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={`${uid}-cue-pitch`} className="text-fg-2">
                        피치 기울기
                      </label>
                      <span className="font-semibold tabular-nums text-fg">
                        {selectedCue.pitchSlopeSemitones > 0 ? "+" : ""}
                        {selectedCue.pitchSlopeSemitones.toFixed(1)}st
                      </span>
                    </div>
                    <input
                      id={`${uid}-cue-pitch`}
                      type="range"
                      min={-6}
                      max={9}
                      step={0.2}
                      value={selectedCue.pitchSlopeSemitones}
                      onChange={(event) =>
                        updateSelectedCue({ pitchSlopeSemitones: Number(event.target.value) })
                      }
                      className="w-full accent-accent"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* 우측: 800px 세로 웹툰 스트립 SVG 실시간 프리뷰 */}
        <div className="flex flex-col rounded-xl border border-line bg-canvas p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-fg">800px 세로 스트립 실시간 미리보기</span>
            <span className="tabular-nums text-fg-3">
              최소 간격 {layout.overlapCheck.minVerticalGapPx}px · 리듬 {layout.rhythmVarianceScore}점
            </span>
          </div>

          <div className="max-h-[640px] overflow-y-auto rounded-lg border border-line bg-panel p-2">
            <svg
              role="img"
              aria-label="800px 웹툰 세로 스크롤 말풍선 자동 조판 미리보기"
              viewBox={`0 0 ${layout.stripWidthPx} ${layout.stripHeightPx}`}
              className="mx-auto block h-auto w-full max-w-[380px]"
            >
              {/* 800px 캔버스 배경 및 안전 여백 가이드 */}
              <rect
                x={0}
                y={0}
                width={layout.stripWidthPx}
                height={layout.stripHeightPx}
                className="fill-canvas stroke-line"
                strokeWidth={2}
              />
              <line
                x1={44}
                y1={0}
                x2={44}
                y2={layout.stripHeightPx}
                className="stroke-line"
                strokeDasharray="6 6"
                strokeWidth={1.5}
              />
              <line
                x1={layout.stripWidthPx - 44}
                y1={0}
                x2={layout.stripWidthPx - 44}
                y2={layout.stripHeightPx}
                className="stroke-line"
                strokeDasharray="6 6"
                strokeWidth={1.5}
              />

              {/* 말풍선 렌더링 */}
              {layout.balloons.map((balloon) => {
                const isSelected = balloon.sourceCueId === selectedCue?.id;
                const dPath = buildBalloonSvgPath(balloon);
                const centerX = balloon.x + balloon.width / 2;
                const totalTextHeight = balloon.lines.length * balloon.lineHeightPx;
                const startY =
                  balloon.y +
                  (balloon.height - totalTextHeight) / 2 +
                  balloon.fontSizePx * 0.86;

                return (
                  <g key={balloon.id}>
                    {balloon.pauseGutterPx > 0 ? (
                      <text
                        x={layout.stripWidthPx / 2}
                        y={Math.max(18, balloon.y - 10)}
                        textAnchor="middle"
                        className="fill-fg-3 text-[13px] font-medium tabular-nums"
                      >
                        여백 +{balloon.pauseGutterPx}px
                      </text>
                    ) : null}

                    {renderBalloonTail(balloon, isSelected)}

                    <path
                      d={dPath}
                      className={`cursor-pointer ${balloonSvgClassName(balloon.geometry, isSelected)}`}
                      strokeWidth={isSelected ? 4 : balloon.geometry === "shout-spike" ? 3.2 : 2.2}
                      strokeDasharray={balloon.geometry === "whisper-dashed" ? "10 7" : undefined}
                      onClick={() => setSelectedCueId(balloon.sourceCueId)}
                    />

                    {balloon.lines.map((lineText, lineIndex) => (
                      <text
                        key={`${balloon.id}-line-${lineIndex}`}
                        x={centerX}
                        y={startY + lineIndex * balloon.lineHeightPx}
                        textAnchor="middle"
                        fontSize={balloon.fontSizePx}
                        fontWeight={balloon.fontWeight}
                        className="pointer-events-none select-none fill-fg"
                      >
                        {lineText}
                      </text>
                    ))}

                    <text
                      x={balloon.x + 8}
                      y={balloon.y - 6}
                      className="fill-fg-3 text-[12px] font-semibold"
                    >
                      {balloon.speaker} · {BALLOON_GEOMETRY_META_KO[balloon.geometry].labelKo}
                    </text>
                  </g>
                );
              })}

              {/* 키네틱 SFX 콜아웃 렌더링 */}
              {layout.sfxCallouts.map((sfx) => {
                const cx = sfx.x + sfx.width / 2;
                const cy = sfx.y + sfx.height / 2;
                const toneClass =
                  sfx.emphasis === "impact"
                    ? "fill-bad"
                    : sfx.emphasis === "freeze"
                      ? "fill-cool"
                      : "fill-accent";
                return (
                  <g
                    key={sfx.id}
                    transform={`rotate(${sfx.rotationDeg} ${cx} ${cy})`}
                    aria-label={`효과음 ${sfx.text}`}
                  >
                    <rect
                      x={sfx.x}
                      y={sfx.y}
                      width={sfx.width}
                      height={sfx.height}
                      rx={10}
                      className="fill-raised stroke-line-strong"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                    />
                    <text
                      x={cx}
                      y={cy + sfx.fontSizePx * 0.34}
                      textAnchor="middle"
                      fontSize={sfx.fontSizePx}
                      fontWeight={800}
                      className={toneClass}
                    >
                      {sfx.text}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
