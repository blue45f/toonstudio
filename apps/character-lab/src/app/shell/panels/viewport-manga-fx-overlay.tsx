/**
 * 한국형 웹툰 원고 말풍선(대화 타원·외침 가시·독백 사각 박스) 및 효과선(집중선·사선 속도선·로판 에테르 반짝이)
 * 실시간 뷰포트 연출 오버레이 모듈.
 * 소문자 하이픈 파일명(`viewport-manga-fx-overlay.tsx`)으로 `app/composition.ts` 패널 규칙을 준수하며,
 * `Math.random` 없이 결정론적 삼각 수열만으로 선화를 생성한다.
 */
import type { CSSProperties } from "react";

export type MangaBubblePreset = "dialogue-dual" | "lead-left" | "shout-burst" | "monologue-box" | "none";
export type MangaActionLinesPreset = "none" | "focus-radial" | "speed-diagonal" | "romance-sparkle";

export interface ViewportMangaFxState {
  readonly enabled: boolean;
  readonly bubblePreset: MangaBubblePreset;
  readonly linesPreset: MangaActionLinesPreset;
  readonly dialogueText: string;
  readonly intensity: number;
}

export const DEFAULT_MANGA_FX_STATE: ViewportMangaFxState = Object.freeze({
  enabled: false,
  bubblePreset: "dialogue-dual",
  linesPreset: "focus-radial",
  dialogueText: "여기서부터는 내 구역이야.",
  intensity: 0.75,
});

export const MANGA_BUBBLE_PRESET_LABELS: Readonly<Record<MangaBubblePreset, string>> = Object.freeze({
  "dialogue-dual": "양측 대사 교환",
  "lead-left": "좌상단 단독 대사",
  "shout-burst": "외침 가시 말풍선",
  "monologue-box": "독백 내레이션 박스",
  none: "말풍선 숨김",
});

export const MANGA_LINES_PRESET_LABELS: Readonly<Record<MangaActionLinesPreset, string>> = Object.freeze({
  none: "효과선 없음",
  "focus-radial": "집중선 (각성·클라이맥스)",
  "speed-diagonal": "사선 속도선 (액션·질주)",
  "romance-sparkle": "로판 에테르 반짝이",
});

export function clampMangaFxIntensity(value: number): number {
  if (!Number.isFinite(value)) return 0.75;
  return Math.min(1, Math.max(0.2, Number(value.toFixed(2))));
}

function deterministicWave01(index: number, seed: number): number {
  const raw = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

export interface FocusLineSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly strokeWidth: number;
}

/** 캐릭터 상반신·얼굴 중심부(500, 340)를 가리지 않도록 비워둔 방사형 먹물 집중선 생성 */
export function buildDeterministicFocusLines(intensity: number): readonly FocusLineSegment[] {
  const safeIntensity = clampMangaFxIntensity(intensity);
  const count = Math.round(36 + safeIntensity * 48);
  const cx = 500;
  const cy = 340;
  const segments: FocusLineSegment[] = [];
  for (let i = 0; i < count; i += 1) {
    const jitter = (deterministicWave01(i, 1.7) - 0.5) * (Math.PI / count);
    const angle = (i / count) * Math.PI * 2 + jitter;
    const innerRadius = 255 + deterministicWave01(i, 3.1) * 115;
    const outerRadius = 780;
    segments.push({
      x1: Number((cx + Math.cos(angle) * innerRadius).toFixed(1)),
      y1: Number((cy + Math.sin(angle) * innerRadius * 0.92).toFixed(1)),
      x2: Number((cx + Math.cos(angle) * outerRadius).toFixed(1)),
      y2: Number((cy + Math.sin(angle) * outerRadius).toFixed(1)),
      strokeWidth: Number((1.2 + deterministicWave01(i, 5.9) * 2.4 * safeIntensity).toFixed(2)),
    });
  }
  return segments;
}

/** 역동적인 사선 액션 스피드라인 생성 (캐릭터 중심 실루엣 구간은 호흡을 비움) */
export function buildDeterministicSpeedLines(intensity: number): readonly FocusLineSegment[] {
  const safeIntensity = clampMangaFxIntensity(intensity);
  const count = Math.round(28 + safeIntensity * 36);
  const segments: FocusLineSegment[] = [];
  const dirX = 0.88;
  const dirY = -0.475;
  for (let i = 0; i < count; i += 1) {
    const lane = (i / Math.max(1, count - 1)) * 1300 - 150;
    const side = i % 2 === 0 ? -1 : 1;
    const startOffset = side < 0 ? -620 : 210 + deterministicWave01(i, 2.3) * 140;
    const length = 280 + deterministicWave01(i, 4.7) * 260;
    const perpX = -dirY;
    const perpY = dirX;
    const bx = 500 + perpX * (lane - 500);
    const by = 460 + perpY * (lane - 500);
    segments.push({
      x1: Number((bx + dirX * startOffset).toFixed(1)),
      y1: Number((by + dirY * startOffset).toFixed(1)),
      x2: Number((bx + dirX * (startOffset + length)).toFixed(1)),
      y2: Number((by + dirY * (startOffset + length)).toFixed(1)),
      strokeWidth: Number((1.1 + deterministicWave01(i, 8.1) * 2.2 * safeIntensity).toFixed(2)),
    });
  }
  return segments;
}

function buildShoutBurstPolygonPoints(cx: number, cy: number, rx: number, ry: number): string {
  const spikes = 28;
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    const isOuter = i % 2 === 0;
    const amp = isOuter ? 1.16 + deterministicWave01(i, 6.4) * 0.14 : 0.86;
    const x = cx + Math.cos(angle) * rx * amp;
    const y = cy + Math.sin(angle) * ry * amp;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

function splitDialogueTwoLines(text: string): readonly [string, string | null] {
  const trimmed = text.trim() || "…";
  if (trimmed.length <= 16) return [trimmed, null];
  const mid = Math.ceil(trimmed.length / 2);
  const spaceNearMid = trimmed.lastIndexOf(" ", mid + 3);
  if (spaceNearMid >= 4 && spaceNearMid < trimmed.length - 2) {
    return [`${trimmed.slice(0, spaceNearMid).trim()} `, trimmed.slice(spaceNearMid + 1).trim()];
  }
  return [trimmed.slice(0, mid), trimmed.slice(mid)];
}

const OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  pointerEvents: "none",
  overflow: "hidden",
};

const SPARKLE_SPOTS: ReadonlyArray<{ readonly cx: number; readonly cy: number; readonly r: number }> = Object.freeze([
  { cx: 185, cy: 220, r: 26 },
  { cx: 815, cy: 195, r: 30 },
  { cx: 145, cy: 560, r: 20 },
  { cx: 845, cy: 510, r: 24 },
  { cx: 255, cy: 760, r: 18 },
  { cx: 760, cy: 740, r: 22 },
]);

export interface ViewportMangaFxOverlayProps {
  readonly mangaFx: ViewportMangaFxState;
}

export function ViewportMangaFxOverlay({ mangaFx }: ViewportMangaFxOverlayProps) {
  if (!mangaFx.enabled) return null;
  const safeIntensity = clampMangaFxIntensity(mangaFx.intensity);
  const [line1, line2] = splitDialogueTwoLines(mangaFx.dialogueText);
  const focusLines = mangaFx.linesPreset === "focus-radial" ? buildDeterministicFocusLines(safeIntensity) : [];
  const speedLines = mangaFx.linesPreset === "speed-diagonal" ? buildDeterministicSpeedLines(safeIntensity) : [];
  const burstPoints = mangaFx.bubblePreset === "shout-burst" ? buildShoutBurstPolygonPoints(245, 165, 165, 92) : "";

  return (
    <div className="cl-viewport-manga-fx-overlay" data-testid="viewport-manga-fx-overlay" aria-hidden="true" style={OVERLAY_STYLE}>
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
        {/* 1. 웹툰 효과선 레이어 */}
        {mangaFx.linesPreset === "focus-radial" ? (
          <g data-testid="viewport-manga-focus-lines" opacity={0.45 + safeIntensity * 0.45}>
            {focusLines.map((seg, idx) => (
              <line
                key={idx}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke="#16131A"
                strokeWidth={seg.strokeWidth}
                strokeLinecap="round"
              />
            ))}
          </g>
        ) : null}

        {mangaFx.linesPreset === "speed-diagonal" ? (
          <g data-testid="viewport-manga-speed-lines" opacity={0.42 + safeIntensity * 0.46}>
            {speedLines.map((seg, idx) => (
              <line
                key={idx}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke="#18151E"
                strokeWidth={seg.strokeWidth}
                strokeLinecap="round"
              />
            ))}
          </g>
        ) : null}

        {mangaFx.linesPreset === "romance-sparkle" ? (
          <g data-testid="viewport-manga-romance-sparkles" opacity={0.55 + safeIntensity * 0.42}>
            {SPARKLE_SPOTS.map((spot, idx) => {
              const s = spot.r * (0.75 + safeIntensity * 0.4);
              const thin = s * 0.22;
              const d = `M ${spot.cx} ${spot.cy - s} Q ${spot.cx + thin} ${spot.cy - thin} ${spot.cx + s} ${spot.cy} Q ${spot.cx + thin} ${spot.cy + thin} ${spot.cx} ${spot.cy + s} Q ${spot.cx - thin} ${spot.cy + thin} ${spot.cx - s} ${spot.cy} Q ${spot.cx - thin} ${spot.cy - thin} ${spot.cx} ${spot.cy - s} Z`;
              return (
                <g key={idx}>
                  <circle cx={spot.cx + 22} cy={spot.cy + 26} r={s * 0.9} fill="rgba(255, 226, 158, 0.16)" stroke="rgba(255, 236, 186, 0.48)" strokeWidth="1.2" />
                  <path d={d} fill="#FFFDF6" stroke="#F0C978" strokeWidth="1.5" />
                </g>
              );
            })}
          </g>
        ) : null}

        {/* 2. 한국 웹툰 말풍선 배치 레이어 */}
        {mangaFx.bubblePreset === "dialogue-dual" || mangaFx.bubblePreset === "lead-left" ? (
          <g data-testid="viewport-manga-speech-bubble">
            <ellipse cx="225" cy="158" rx="158" ry="84" fill="#FAF8F4" stroke="#18151C" strokeWidth="3.2" />
            <polygon points="315,222 382,262 342,202" fill="#FAF8F4" stroke="#18151C" strokeWidth="3.2" strokeLinejoin="round" />
            <ellipse cx="225" cy="158" rx="155" ry="81" fill="#FAF8F4" />
            <text x="225" y={line2 ? 148 : 164} textAnchor="middle" fill="#18151C" fontSize="22" fontWeight="600">
              {line1}
            </text>
            {line2 ? (
              <text x="225" y="180" textAnchor="middle" fill="#18151C" fontSize="22" fontWeight="600">
                {line2}
              </text>
            ) : null}
            {mangaFx.bubblePreset === "dialogue-dual" ? (
              <g>
                <ellipse cx="790" cy="240" rx="132" ry="70" fill="#FAF8F4" stroke="#18151C" strokeWidth="3" />
                <polygon points="695,286 635,318 672,268" fill="#FAF8F4" stroke="#18151C" strokeWidth="3" strokeLinejoin="round" />
                <ellipse cx="790" cy="240" rx="129" ry="67" fill="#FAF8F4" />
                <text x="790" y="247" textAnchor="middle" fill="#18151C" fontSize="20" fontWeight="500">
                  …기다리고 있었어.
                </text>
              </g>
            ) : null}
          </g>
        ) : null}

        {mangaFx.bubblePreset === "shout-burst" ? (
          <g data-testid="viewport-manga-speech-bubble">
            <polygon points={burstPoints} fill="#FFFDF9" stroke="#18151C" strokeWidth="3.4" strokeLinejoin="miter" />
            <text x="245" y={line2 ? 156 : 172} textAnchor="middle" fill="#18151C" fontSize="24" fontWeight="600">
              {line1}
            </text>
            {line2 ? (
              <text x="245" y="190" textAnchor="middle" fill="#18151C" fontSize="24" fontWeight="600">
                {line2}
              </text>
            ) : null}
          </g>
        ) : null}

        {mangaFx.bubblePreset === "monologue-box" ? (
          <g data-testid="viewport-manga-speech-bubble">
            <rect x="68" y="76" width="330" height="128" rx="4" fill="rgba(250, 247, 240, 0.95)" stroke="#18151C" strokeWidth="2.8" />
            <rect x="76" y="84" width="314" height="112" rx="2" fill="none" stroke="rgba(24, 21, 28, 0.38)" strokeWidth="1.2" />
            <text x="233" y={line2 ? 132 : 147} textAnchor="middle" fill="#18151C" fontSize="20" fontWeight="600">
              {line1}
            </text>
            {line2 ? (
              <text x="233" y="164" textAnchor="middle" fill="#18151C" fontSize="20" fontWeight="600">
                {line2}
              </text>
            ) : null}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

export interface ViewportMangaFxControlsProps {
  readonly mangaFx: ViewportMangaFxState;
  readonly onToggleMangaFx: () => void;
  readonly onChangeBubblePreset: (preset: MangaBubblePreset) => void;
  readonly onChangeLinesPreset: (preset: MangaActionLinesPreset) => void;
  readonly onChangeDialogueText: (text: string) => void;
  readonly onChangeIntensity: (intensity: number) => void;
}

export function ViewportMangaFxControls({
  mangaFx,
  onToggleMangaFx,
  onChangeBubblePreset,
  onChangeLinesPreset,
  onChangeDialogueText,
  onChangeIntensity,
}: ViewportMangaFxControlsProps) {
  return (
    <span className="cl-viewport-group" role="group" aria-label="웹툰 말풍선·효과선 연출 도구" style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      <button
        type="button"
        className="cl-viewport-button"
        data-testid="viewport-toggle-manga-fx"
        aria-pressed={mangaFx.enabled}
        title="말풍선(대화·외침·독백)과 웹툰 효과선(집중선·속도선·반짝이)을 뷰포트 위에 겹쳐 헤어·표정 가림 여부를 즉시 점검합니다"
        onClick={onToggleMangaFx}
      >
        웹툰 연출·말풍선
      </button>
      {mangaFx.enabled ? (
        <>
          <select
            className="cl-viewport-select"
            aria-label="말풍선 스타일"
            data-testid="viewport-manga-bubble-select"
            value={mangaFx.bubblePreset}
            onChange={(event) => onChangeBubblePreset(event.target.value as MangaBubblePreset)}
          >
            {(Object.keys(MANGA_BUBBLE_PRESET_LABELS) as MangaBubblePreset[]).map((key) => (
              <option key={key} value={key}>
                {MANGA_BUBBLE_PRESET_LABELS[key]}
              </option>
            ))}
          </select>
          <select
            className="cl-viewport-select"
            aria-label="웹툰 효과선"
            data-testid="viewport-manga-lines-select"
            value={mangaFx.linesPreset}
            onChange={(event) => onChangeLinesPreset(event.target.value as MangaActionLinesPreset)}
          >
            {(Object.keys(MANGA_LINES_PRESET_LABELS) as MangaActionLinesPreset[]).map((key) => (
              <option key={key} value={key}>
                {MANGA_LINES_PRESET_LABELS[key]}
              </option>
            ))}
          </select>
          {mangaFx.bubblePreset !== "none" ? (
            <input
              type="text"
              className="cl-viewport-select"
              aria-label="대사 미리보기 문구"
              data-testid="viewport-manga-dialogue-input"
              maxLength={48}
              value={mangaFx.dialogueText}
              onChange={(event) => onChangeDialogueText(event.target.value)}
              style={{ width: 156 }}
            />
          ) : null}
          {mangaFx.linesPreset !== "none" ? (
            <label className="cl-viewport-button" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span>밀도</span>
              <input
                type="range"
                aria-label="효과선 밀도"
                data-testid="viewport-manga-intensity-range"
                min={0.2}
                max={1}
                step={0.05}
                value={mangaFx.intensity}
                onChange={(event) => onChangeIntensity(Number(event.target.value))}
                style={{ width: 58 }}
              />
            </label>
          ) : null}
        </>
      ) : null}
    </span>
  );
}
