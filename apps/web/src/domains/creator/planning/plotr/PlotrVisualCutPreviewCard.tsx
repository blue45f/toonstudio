/**
 * Plotr 실시간 SVG/OKLCH 비주얼 컷 스토리보드 프리뷰 카드.
 *
 * - 각 컷의 실제 카메라 구도(클로즈업·바스트·풀샷·하이앵글),
 *   조명 무드(맑음·노을·비·네온밤), 인물 고정 3색 OKLCH 팔레트·표정 락,
 *   원문 대사 말풍선, 효과선·효과음, 180° 시선축 방향 화살표를 실시간으로 렌더링한다.
 * - 클릭 한 번으로 구도와 조명 무드를 전환하면 SVG 프리뷰와 컷 상태에 즉시 반영된다.
 */
import { Camera, SunMedium } from "lucide-react";
import {
  PLOTR_EXPRESSION_LOCK_META,
  type PlotrCharacterBibleProfile,
} from "./plotr-character-sheet-model";
import {
  PLOTR_CAMERA_FRAMING_ORDER,
  PLOTR_CAMERA_FRAMING_PRESETS,
  PLOTR_LIGHTING_MOOD_ORDER,
  PLOTR_LIGHTING_MOOD_PRESETS,
  inferCutCameraFraming,
  inferCutLightingMood,
  type PlotrLightingMoodMeta,
} from "./plotr-visual-cut-renderer";
import type {
  PlotrCameraFramingId,
  PlotrCutCard,
  PlotrLightingMoodId,
} from "./plotr-types";

export interface PlotrVisualCutPreviewCardProps {
  readonly cut: PlotrCutCard;
  readonly worldSettingNote: string;
  readonly docMood: string;
  readonly characterProfiles: readonly PlotrCharacterBibleProfile[];
  readonly hasReverseShotWarning: boolean;
  readonly onChangeFraming: (cutId: string, framing: PlotrCameraFramingId) => void;
  readonly onChangeLightingMood: (cutId: string, mood: PlotrLightingMoodId) => void;
}

const PILL_BTN =
  "plotr-btn-tactile inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function sanitizeSvgId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/gu, "-");
}

function CharacterSilhouetteSvg({
  x,
  y,
  scale,
  profile,
  rimLightOklch,
  fallbackOutfitOklch,
  facingDir,
}: {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly profile: PlotrCharacterBibleProfile | null;
  readonly rimLightOklch: string;
  readonly fallbackOutfitOklch: string;
  readonly facingDir: -1 | 0 | 1;
}) {
  const hair = profile?.palette.hairOklch ?? "oklch(0.3 0.04 255)";
  const eye = profile?.palette.eyeOklch ?? "oklch(0.64 0.17 240)";
  const outfit = profile?.palette.outfitOklch ?? fallbackOutfitOklch;
  const expr = PLOTR_EXPRESSION_LOCK_META[profile?.expressionLock ?? "calm"];
  const skin = "oklch(0.91 0.03 68)";
  const ink = "oklch(0.2 0.03 255)";
  const eyeOffsetX = facingDir * 2.5;
  const mouthY = -56;
  const mouthCtrlY = mouthY + expr.mouthCurve;

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* 의상 / 상반신 실루엣 */}
      <path
        d="M -42 28 C -38 -16, -24 -34, 0 -36 C 24 -34, 38 -16, 42 28 Z"
        fill={outfit}
        stroke={rimLightOklch}
        strokeWidth={1.6}
      />
      {/* 칼라 / 어깨 포인트 */}
      <path
        d="M -14 -34 L 0 -18 L 14 -34"
        fill="none"
        stroke={rimLightOklch}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 목 */}
      <rect x={-7} y={-48} width={14} height={15} rx={5} fill={skin} />
      {/* 뒷머리 실루엣 */}
      <ellipse cx={0} cy={-66} rx={27} ry={29} fill={hair} />
      {/* 얼굴 */}
      <ellipse
        cx={eyeOffsetX * 0.5}
        cy={-64}
        rx={20}
        ry={22}
        fill={skin}
        stroke={ink}
        strokeWidth={1.1}
      />
      {/* 앞머리 */}
      <path
        d="M -23 -68 C -20 -91, 20 -91, 23 -68 C 14 -76, 6 -72, 0 -76 C -7 -71, -15 -76, -23 -68 Z"
        fill={hair}
      />
      {/* 눈썹 (표정 락 반영) */}
      <line
        x1={-12 + eyeOffsetX}
        y1={-70 - expr.browTilt * 0.25}
        x2={-4 + eyeOffsetX}
        y2={-70 + expr.browTilt * 0.35}
        stroke={ink}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <line
        x1={4 + eyeOffsetX}
        y1={-70 + expr.browTilt * 0.35}
        x2={12 + eyeOffsetX}
        y2={-70 - expr.browTilt * 0.25}
        stroke={ink}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      {/* 눈 (고정 눈색 OKLCH) */}
      <ellipse
        cx={-8 + eyeOffsetX}
        cy={-64}
        rx={3.2}
        ry={3.4 * expr.eyeScaleY}
        fill={eye}
      />
      <ellipse
        cx={8 + eyeOffsetX}
        cy={-64}
        rx={3.2}
        ry={3.4 * expr.eyeScaleY}
        fill={eye}
      />
      {/* 눈 하이라이트 */}
      <circle cx={-9 + eyeOffsetX} cy={-65} r={1} fill="var(--plotr-svg-glint)" />
      <circle cx={7 + eyeOffsetX} cy={-65} r={1} fill="var(--plotr-svg-glint)" />
      {/* 입선 (표정 락 반영) */}
      <path
        d={`M ${-5 + eyeOffsetX} ${mouthY} Q ${eyeOffsetX} ${mouthCtrlY} ${5 + eyeOffsetX} ${mouthY}`}
        fill="none"
        stroke={ink}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </g>
  );
}

function MoodBackdropSvg({
  moodId,
  mood,
  gradId,
}: {
  readonly moodId: PlotrLightingMoodId;
  readonly mood: PlotrLightingMoodMeta;
  readonly gradId: string;
}) {
  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={mood.skyTopOklch} />
          <stop offset="68%" stopColor={mood.skyBottomOklch} />
          <stop offset="100%" stopColor={mood.groundOklch} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={360} height={210} fill={`url(#${gradId})`} />

      {moodId === "sunny" ? (
        <g opacity={0.55}>
          <circle cx={292} cy={46} r={24} fill={mood.rimLightOklch} />
          <polygon points="292,46 196,210 248,210" fill={mood.rimLightOklch} opacity={0.22} />
          <polygon points="292,46 116,210 156,210" fill={mood.rimLightOklch} opacity={0.14} />
        </g>
      ) : null}

      {moodId === "sunset" ? (
        <g>
          <circle cx={278} cy={104} r={34} fill={mood.accentOklch} opacity={0.78} />
          <rect x={0} y={132} width={360} height={78} fill={mood.groundOklch} opacity={0.72} />
          <line x1={0} y1={132} x2={360} y2={132} stroke={mood.rimLightOklch} strokeWidth={1.5} opacity={0.8} />
        </g>
      ) : null}

      {moodId === "rain" ? (
        <g>
          <rect x={0} y={142} width={360} height={68} fill={mood.groundOklch} opacity={0.78} />
          {[28, 66, 108, 146, 188, 226, 268, 308, 338].map((rx, i) => (
            <line
              key={rx}
              x1={rx}
              y1={16 + (i % 3) * 26}
              x2={rx - 14}
              y2={56 + (i % 3) * 26}
              stroke={mood.rimLightOklch}
              strokeWidth={1.3}
              strokeLinecap="round"
              opacity={0.62}
            />
          ))}
          <ellipse cx={96} cy={176} rx={26} ry={4} fill="none" stroke={mood.accentOklch} strokeWidth={1} opacity={0.5} />
          <ellipse cx={268} cy={184} rx={32} ry={5} fill="none" stroke={mood.accentOklch} strokeWidth={1} opacity={0.45} />
        </g>
      ) : null}

      {moodId === "neon-night" ? (
        <g>
          <rect x={16} y={56} width={44} height={94} fill="var(--plotr-svg-skyline-a)" opacity={0.82} />
          <rect x={72} y={72} width={36} height={78} fill="var(--plotr-svg-skyline-b)" opacity={0.82} />
          <rect x={256} y={48} width={48} height={102} fill="var(--plotr-svg-skyline-a)" opacity={0.82} />
          <rect x={312} y={68} width={34} height={82} fill="var(--plotr-svg-skyline-b)" opacity={0.82} />
          <line x1={38} y1={68} x2={38} y2={132} stroke={mood.rimLightOklch} strokeWidth={2.5} opacity={0.75} />
          <line x1={280} y1={62} x2={280} y2={136} stroke={mood.accentOklch} strokeWidth={2.5} opacity={0.8} />
          <rect x={0} y={148} width={360} height={62} fill={mood.groundOklch} opacity={0.86} />
        </g>
      ) : null}
    </>
  );
}

function EffectLinesSvg({
  effectLine,
  accentOklch,
}: {
  readonly effectLine: PlotrCutCard["effectLine"];
  readonly accentOklch: string;
}) {
  if (effectLine === "none") return null;
  if (effectLine === "focus") {
    return (
      <g stroke={accentOklch} strokeWidth={1.2} opacity={0.5}>
        {[
          [0, 0, 74, 52],
          [360, 0, 286, 52],
          [0, 210, 78, 154],
          [360, 210, 282, 154],
          [180, 0, 180, 38],
          [0, 105, 58, 105],
          [360, 105, 302, 105],
        ].map(([x1, y1, x2, y2], idx) => (
          <line key={idx} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
    );
  }
  if (effectLine === "speed") {
    return (
      <g stroke={accentOklch} strokeWidth={1.6} opacity={0.55}>
        {[42, 74, 114, 152].map((ly) => (
          <line key={ly} x1={12} y1={ly} x2={348} y2={ly - 6} strokeDasharray="36 18" />
        ))}
      </g>
    );
  }
  if (effectLine === "fall") {
    return (
      <g stroke={accentOklch} strokeWidth={1.5} opacity={0.55}>
        {[46, 110, 248, 312].map((lx) => (
          <line key={lx} x1={lx} y1={14} x2={lx} y2={196} strokeDasharray="24 14" />
        ))}
      </g>
    );
  }
  return (
    <g stroke={accentOklch} strokeWidth={1.8} opacity={0.62}>
      <circle cx={180} cy={104} r={74} fill="none" strokeDasharray="10 12" />
      <circle cx={180} cy={104} r={96} fill="none" strokeDasharray="6 16" />
    </g>
  );
}

export function PlotrVisualCutPreviewCard({
  cut,
  worldSettingNote,
  docMood,
  characterProfiles,
  hasReverseShotWarning,
  onChangeFraming,
  onChangeLightingMood,
}: PlotrVisualCutPreviewCardProps) {
  const framing = inferCutCameraFraming(cut);
  const framingMeta = PLOTR_CAMERA_FRAMING_PRESETS[framing];
  const moodId = inferCutLightingMood(cut, worldSettingNote, docMood);
  const mood = PLOTR_LIGHTING_MOOD_PRESETS[moodId];

  const referencedCharacters = cut.referencedAssetIds
    .map((id) => characterProfiles.find((p) => p.assetId === id))
    .filter((p): p is PlotrCharacterBibleProfile => Boolean(p));

  const castCharacters: readonly (PlotrCharacterBibleProfile | null)[] =
    referencedCharacters.length > 0
      ? referencedCharacters.slice(0, 2)
      : characterProfiles.length > 0
        ? [characterProfiles[0]!]
        : [null];

  const primaryProfile = castCharacters[0] ?? null;
  const secondaryProfile = castCharacters[1] ?? null;
  const primaryExprMeta =
    PLOTR_EXPRESSION_LOCK_META[primaryProfile?.expressionLock ?? "calm"];

  const leadDialogue = cut.dialogues[0] ?? null;
  const clippedDialogue = leadDialogue
    ? `${leadDialogue.kind === "narration" ? "[나레이션] " : leadDialogue.speaker ? `${leadDialogue.speaker}: ` : ""}${leadDialogue.text}`.slice(
        0,
        36,
      )
    : "";

  const silhouetteScale =
    framing === "closeup"
      ? 1.55
      : framing === "bust"
        ? 1.12
        : framing === "high-angle"
          ? 0.86
          : 0.78;
  const silhouetteBaseY =
    framing === "closeup"
      ? 234
      : framing === "bust"
        ? 186
        : framing === "high-angle"
          ? 176
          : 174;

  const anchorX =
    cut.cameraSide === "left" ? 124 : cut.cameraSide === "right" ? 236 : 180;
  const facingDir: -1 | 0 | 1 =
    cut.cameraSide === "left" ? 1 : cut.cameraSide === "right" ? -1 : 0;

  const axisLabelKo =
    cut.cameraSide === "left"
      ? "180° 좌측 축 →"
      : cut.cameraSide === "right"
        ? "← 180° 우측 축"
        : "180° 중앙 정면";

  const gradId = `plotr-mood-grad-${sanitizeSvgId(cut.id)}`;

  return (
    <div
      data-testid={`plotr-visual-preview-${cut.id}`}
      data-framing={framing}
      data-mood={moodId}
      className="space-y-2"
    >
      <div
        className="plotr-visual-frame relative overflow-hidden rounded-xl"
        style={{
          borderWidth: cut.panelBorderEnabled
            ? `${Math.max(1, Math.min(6, cut.panelBorderWidthPx))}px`
            : "1px",
          borderStyle: cut.panelBorderEnabled ? "solid" : "dashed",
        }}
      >
        <svg
          role="img"
          aria-label={`${cut.sceneTitle} 비주얼 스토리보드 프리뷰 — ${framingMeta.labelKo}, ${mood.labelKo} 조명, ${axisLabelKo}`}
          viewBox="0 0 360 210"
          className="block aspect-[12/7] w-full"
        >
          <MoodBackdropSvg moodId={moodId} mood={mood} gradId={gradId} />

          {/* 카메라 구도 원근선 / 뷰파인더 가이드 */}
          {framing === "full" ? (
            <g stroke={mood.rimLightOklch} strokeWidth={0.9} opacity={0.34}>
              <line x1={0} y1={146} x2={360} y2={146} />
              <line x1={180} y1={146} x2={36} y2={210} />
              <line x1={180} y1={146} x2={324} y2={210} />
            </g>
          ) : null}

          {framing === "high-angle" ? (
            <g stroke={mood.rimLightOklch} strokeWidth={1} opacity={0.42}>
              <line x1={28} y1={32} x2={156} y2={198} strokeDasharray="5 5" />
              <line x1={332} y1={32} x2={204} y2={198} strokeDasharray="5 5" />
              <path d="M 180 34 L 180 54 M 174 48 L 180 55 L 186 48" fill="none" strokeWidth={1.6} />
            </g>
          ) : null}

          {framing === "closeup" ? (
            <g stroke={mood.rimLightOklch} strokeWidth={1.6} opacity={0.62} fill="none">
              <path d="M 22 44 L 22 24 L 44 24" />
              <path d="M 338 44 L 338 24 L 316 24" />
              <path d="M 22 166 L 22 186 L 44 186" />
              <path d="M 338 166 L 338 186 L 316 186" />
            </g>
          ) : null}

          {/* 효과선 */}
          <EffectLinesSvg effectLine={cut.effectLine} accentOklch={mood.accentOklch} />

          {/* 인물 실루엣 (고정 3색 팔레트 & 표정 락 연동) */}
          {secondaryProfile ? (
            <>
              <CharacterSilhouetteSvg
                x={124}
                y={silhouetteBaseY}
                scale={silhouetteScale * 0.9}
                profile={primaryProfile}
                rimLightOklch={mood.rimLightOklch}
                fallbackOutfitOklch={mood.accentOklch}
                facingDir={1}
              />
              <CharacterSilhouetteSvg
                x={244}
                y={silhouetteBaseY}
                scale={silhouetteScale * 0.9}
                profile={secondaryProfile}
                rimLightOklch={mood.rimLightOklch}
                fallbackOutfitOklch={mood.rimLightOklch}
                facingDir={-1}
              />
            </>
          ) : (
            <CharacterSilhouetteSvg
              x={anchorX}
              y={silhouetteBaseY}
              scale={silhouetteScale}
              profile={primaryProfile}
              rimLightOklch={mood.rimLightOklch}
              fallbackOutfitOklch={mood.accentOklch}
              facingDir={facingDir}
            />
          )}

          {/* 상단 구도·무드·표정 배지 오버레이 */}
          <g>
            <rect
              x={10}
              y={10}
              width={182}
              height={22}
              rx={7}
              fill="var(--plotr-svg-overlay-bg)"
            />
            <text
              x={18}
              y={25}
              fill="var(--plotr-svg-overlay-fg)"
              fontSize={10.5}
              fontWeight={700}
            >
              {framingMeta.lensTag} · {mood.labelKo} · {primaryProfile ? `${primaryProfile.name}(${primaryExprMeta.labelKo})` : cut.emotionBeat}
            </text>
          </g>

          {/* 180도 시선축 화살표 배지 */}
          <g>
            <rect
              x={236}
              y={10}
              width={114}
              height={22}
              rx={7}
              fill={
                hasReverseShotWarning
                  ? "var(--plotr-svg-overlay-warn)"
                  : "var(--plotr-svg-overlay-bg)"
              }
            />
            <text
              x={293}
              y={25}
              textAnchor="middle"
              fill="var(--plotr-svg-overlay-fg)"
              fontSize={10}
              fontWeight={700}
            >
              {axisLabelKo}
            </text>
          </g>

          {/* 효과음 스탬프 */}
          {cut.sfxText ? (
            <g transform="translate(274 68) rotate(-8)">
              <rect
                x={-4}
                y={-15}
                width={72}
                height={22}
                rx={6}
                fill={mood.accentOklch}
                opacity={0.92}
              />
              <text
                x={32}
                y={0}
                textAnchor="middle"
                fill="var(--plotr-svg-sfx-ink)"
                fontSize={12}
                fontWeight={800}
              >
                {cut.sfxText}
              </text>
            </g>
          ) : null}

          {/* 원문 대사 말풍선 오버레이 */}
          {leadDialogue ? (
            <g>
              <rect
                x={14}
                y={162}
                width={332}
                height={36}
                rx={leadDialogue.kind === "narration" ? 5 : 14}
                fill={mood.bubbleFillOklch}
                fillOpacity={cut.bubblesApplied ? 0.95 : 0.78}
                stroke={mood.bubbleInkOklch}
                strokeWidth={cut.bubblesApplied ? 1.8 : 1.1}
                strokeDasharray={cut.bubblesApplied ? undefined : "4 3"}
              />
              {leadDialogue.kind === "speech" ? (
                <polygon
                  points={
                    cut.cameraSide === "right"
                      ? "252,162 264,151 270,162"
                      : "92,162 98,151 110,162"
                  }
                  fill={mood.bubbleFillOklch}
                  stroke={mood.bubbleInkOklch}
                  strokeWidth={1.3}
                />
              ) : null}
              <text
                x={24}
                y={184}
                fill={mood.bubbleInkOklch}
                fontSize={10.5}
                fontWeight={700}
              >
                {clippedDialogue}
                {clippedDialogue.length >= 36 ? "…" : ""}
              </text>
            </g>
          ) : null}
        </svg>
      </div>

      {/* 원클릭 구도 전환 4종 + 조명 무드 전환 4종 */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div
          role="group"
          aria-label={`${cut.sceneTitle} 카메라 구도 전환`}
          className="flex flex-wrap items-center gap-1"
        >
          <span className="inline-flex items-center gap-1 pr-1 text-[11px] font-semibold text-fg-3">
            <Camera className="size-3.5" aria-hidden="true" />
            <span>구도</span>
          </span>
          {PLOTR_CAMERA_FRAMING_ORDER.map((framingId) => {
            const active = framing === framingId;
            return (
              <button
                key={framingId}
                type="button"
                aria-pressed={active}
                data-testid={`plotr-cut-framing-${cut.id}-${framingId}`}
                onClick={() => onChangeFraming(cut.id, framingId)}
                className={`${PILL_BTN} ${
                  active
                    ? "plotr-pill-active border-accent bg-accent text-on-accent"
                    : "border-line bg-panel text-fg-2 hover:text-fg"
                }`}
              >
                {PLOTR_CAMERA_FRAMING_PRESETS[framingId].labelKo}
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label={`${cut.sceneTitle} 조명 무드 전환`}
          className="flex flex-wrap items-center gap-1"
        >
          <span className="inline-flex items-center gap-1 pr-1 text-[11px] font-semibold text-fg-3">
            <SunMedium className="size-3.5" aria-hidden="true" />
            <span>조명</span>
          </span>
          {PLOTR_LIGHTING_MOOD_ORDER.map((id) => {
            const active = moodId === id;
            const m = PLOTR_LIGHTING_MOOD_PRESETS[id];
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                data-testid={`plotr-cut-mood-${cut.id}-${id}`}
                onClick={() => onChangeLightingMood(cut.id, id)}
                className={`${PILL_BTN} ${
                  active
                    ? "plotr-pill-active border-accent bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2 hover:text-fg"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: m.accentOklch }}
                />
                <span>{m.labelKo}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default PlotrVisualCutPreviewCard;
