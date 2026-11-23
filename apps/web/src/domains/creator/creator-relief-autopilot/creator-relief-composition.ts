/**
 * 작화 오토파일럿 엔진 ①: 빈 캔버스 막힘 해소 (`suggestCutCompositionsFromLine`).
 * 대사 1줄 + 감정(5종)을 입력받아 3종 실전 컷 구도(샷 크기·카메라 각도·3분할 앵커·말풍선 좌표·컷 여백·SVG 와이어프레임)를 생성한다.
 */

import {
  CAMERA_ANGLE_LABELS,
  SHOT_SIZE_LABELS,
  clampInt,
  clampNumber,
  roundTo,
  type BalloonStyleId,
  type BilingualLabel,
  type CameraAngleId,
  type CompositionWireframeData,
  type CutCompositionCard,
  type CutMoodId,
  type NormalizedPoint,
  type NormalizedRect,
  type ShotSizeId,
  type SvgLineSegment,
  type WireframeFigure,
} from "./creator-relief-types";

interface ArchetypeFigureSpec {
  readonly role: "primary" | "secondary";
  readonly cx: number;
  readonly cy: number;
  readonly headR: number;
  readonly shoulderW: number;
  readonly torsoH: number;
  readonly gazeDx: number;
  readonly gazeDy: number;
}

interface CutArchetypeSpec {
  readonly slug: string;
  readonly title: BilingualLabel;
  readonly rationale: BilingualLabel;
  readonly shotSize: ShotSizeId;
  readonly cameraAngle: CameraAngleId;
  readonly thirdsAnchor: NormalizedPoint;
  readonly horizonY: number;
  readonly dutchAngleDeg: number;
  readonly baseGutterPx: number;
  readonly defaultBalloonStyle: BalloonStyleId;
  readonly speedLineMode: "none" | "radial" | "diagonal" | "vertical";
  readonly figures: readonly ArchetypeFigureSpec[];
}

const CUT_VIEWBOX_W = 100;
const CUT_VIEWBOX_H = 140;

const CUT_ARCHETYPES: Readonly<
  Record<CutMoodId, readonly [CutArchetypeSpec, CutArchetypeSpec, CutArchetypeSpec]>
> = {
  shock: [
    {
      slug: "dutch-ecu-impact",
      title: { ko: "기울어진 눈빛 극클로즈업", en: "Dutch-Tilt Eye Impact" },
      rationale: {
        ko: "프레임을 11° 기울이고 시선을 상단 3분할점에 고정해 순간 충격을 극대화합니다.",
        en: "Tilts the frame 11° and locks the eye line on the upper third for immediate jolt.",
      },
      shotSize: "ECU",
      cameraAngle: "dutch-tilt",
      thirdsAnchor: { x: 33.3, y: 38.0 },
      horizonY: 52,
      dutchAngleDeg: -11,
      baseGutterPx: 54,
      defaultBalloonStyle: "shout",
      speedLineMode: "radial",
      figures: [
        { role: "primary", cx: 36, cy: 62, headR: 22, shoulderW: 44, torsoH: 52, gazeDx: 16, gazeDy: -3 },
      ],
    },
    {
      slug: "high-isolation-drop",
      title: { ko: "하이앵글 고립 낙하 컷", en: "High-Angle Isolation Drop" },
      rationale: {
        ko: "상단 여백을 크게 비워 인물이 바닥으로 가라앉는 듯한 충격의 정적을 만듭니다.",
        en: "Opens generous upper negative space so the figure drops into stunned silence.",
      },
      shotSize: "MS",
      cameraAngle: "high-angle",
      thirdsAnchor: { x: 66.7, y: 66.7 },
      horizonY: 30,
      dutchAngleDeg: 0,
      baseGutterPx: 176,
      defaultBalloonStyle: "speech",
      speedLineMode: "vertical",
      figures: [
        { role: "primary", cx: 66, cy: 86, headR: 10, shoulderW: 22, torsoH: 34, gazeDx: -8, gazeDy: -12 },
      ],
    },
    {
      slug: "worm-looming-reveal",
      title: { ko: "극저각 압도 반전 샷", en: "Worm's-Eye Looming Reveal" },
      rationale: {
        ko: "바닥에서 올려다보는 극저각과 여유 있는 컷 간격으로 반전 인물의 존재감을 키웁니다.",
        en: "Shoots upward from floor level so the reveal looms directly over the viewer.",
      },
      shotSize: "CU",
      cameraAngle: "worm-eye",
      thirdsAnchor: { x: 66.7, y: 33.3 },
      horizonY: 112,
      dutchAngleDeg: 6,
      baseGutterPx: 112,
      defaultBalloonStyle: "shout",
      speedLineMode: "radial",
      figures: [
        { role: "primary", cx: 64, cy: 52, headR: 17, shoulderW: 38, torsoH: 64, gazeDx: -14, gazeDy: 9 },
      ],
    },
  ],
  romance: [
    {
      slug: "soft-two-shot",
      title: { ko: "3분할 시선 교차 투샷", en: "Thirds Gaze Two-Shot" },
      rationale: {
        ko: "좌우 3분할선 위 두 인물의 시선이 중앙에서 만나 따뜻한 호흡 여백을 만듭니다.",
        en: "Places both figures on opposing thirds so their gazes meet across calm space.",
      },
      shotSize: "MCU",
      cameraAngle: "eye-level",
      thirdsAnchor: { x: 66.7, y: 36.0 },
      horizonY: 64,
      dutchAngleDeg: 0,
      baseGutterPx: 152,
      defaultBalloonStyle: "speech",
      speedLineMode: "none",
      figures: [
        { role: "secondary", cx: 28, cy: 66, headR: 13, shoulderW: 28, torsoH: 52, gazeDx: 18, gazeDy: -2 },
        { role: "primary", cx: 70, cy: 58, headR: 14, shoulderW: 30, torsoH: 56, gazeDx: -18, gazeDy: 2 },
      ],
    },
    {
      slug: "ots-whisper",
      title: { ko: "어깨 너머 속삭임 OTS", en: "Over-the-Shoulder Whisper" },
      rationale: {
        ko: "전경 어깨 실루엣이 자연스러운 액자를 만들어 상대 표정에 몰입하게 합니다.",
        en: "Uses a soft foreground shoulder to frame the listener's reaction intimately.",
      },
      shotSize: "OTS",
      cameraAngle: "eye-level",
      thirdsAnchor: { x: 66.7, y: 33.3 },
      horizonY: 60,
      dutchAngleDeg: 0,
      baseGutterPx: 136,
      defaultBalloonStyle: "speech",
      speedLineMode: "none",
      figures: [
        { role: "secondary", cx: 20, cy: 88, headR: 18, shoulderW: 40, torsoH: 52, gazeDx: 14, gazeDy: -10 },
        { role: "primary", cx: 68, cy: 52, headR: 13, shoulderW: 28, torsoH: 50, gazeDx: -14, gazeDy: 4 },
      ],
    },
    {
      slug: "breath-eye-close",
      title: { ko: "심박 정지 눈빛 클로즈업", en: "Heartbeat Eye Close-Up" },
      rationale: {
        ko: "하단에 넓은 여백과 긴 컷 간격을 배치해 독자가 숨을 고르는 찰나를 연출합니다.",
        en: "Leaves airy lower negative space with an extended vertical gutter pause.",
      },
      shotSize: "ECU",
      cameraAngle: "low-angle",
      thirdsAnchor: { x: 33.3, y: 33.3 },
      horizonY: 82,
      dutchAngleDeg: 0,
      baseGutterPx: 196,
      defaultBalloonStyle: "thought",
      speedLineMode: "none",
      figures: [
        { role: "primary", cx: 38, cy: 50, headR: 21, shoulderW: 42, torsoH: 54, gazeDx: 14, gazeDy: 2 },
      ],
    },
  ],
  action: [
    {
      slug: "diagonal-thrust",
      title: { ko: "대각선 돌파 다이내믹 샷", en: "Diagonal Thrust Action" },
      rationale: {
        ko: "14° 더치 틸트와 대각 속도선, 짧은 컷 여백으로 스크롤 가속감을 끌어올립니다.",
        en: "Combines a 14° tilt, diagonal motion lines, and tight gutter for rapid pacing.",
      },
      shotSize: "MLS",
      cameraAngle: "dutch-tilt",
      thirdsAnchor: { x: 66.7, y: 33.3 },
      horizonY: 88,
      dutchAngleDeg: -14,
      baseGutterPx: 36,
      defaultBalloonStyle: "shout",
      speedLineMode: "diagonal",
      figures: [
        { role: "primary", cx: 64, cy: 54, headR: 11, shoulderW: 26, torsoH: 52, gazeDx: -20, gazeDy: 12 },
      ],
    },
    {
      slug: "hero-low-leap",
      title: { ko: "로우앵글 도약 전신 샷", en: "Heroic Low-Angle Leap" },
      rationale: {
        ko: "지평선을 하단 80% 아래로 내려 도약 높이와 타격 스케일을 과감히 키웁니다.",
        en: "Drops the horizon low to exaggerate leap height and silhouette power.",
      },
      shotSize: "LS",
      cameraAngle: "low-angle",
      thirdsAnchor: { x: 33.3, y: 33.3 },
      horizonY: 116,
      dutchAngleDeg: 8,
      baseGutterPx: 44,
      defaultBalloonStyle: "shout",
      speedLineMode: "vertical",
      figures: [
        { role: "primary", cx: 38, cy: 48, headR: 9, shoulderW: 22, torsoH: 46, gazeDx: 18, gazeDy: 14 },
      ],
    },
    {
      slug: "impact-burst-cu",
      title: { ko: "타격 집중선 클로즈업", en: "Impact Burst Close-Up" },
      rationale: {
        ko: "집중선이 초점 앵커로 수렴해 한 컷 안에서 폭발적인 타격 에너지를 집중합니다.",
        en: "Converges radial burst lines onto the focal third for explosive impact.",
      },
      shotSize: "CU",
      cameraAngle: "worm-eye",
      thirdsAnchor: { x: 66.7, y: 60.0 },
      horizonY: 102,
      dutchAngleDeg: -8,
      baseGutterPx: 32,
      defaultBalloonStyle: "shout",
      speedLineMode: "radial",
      figures: [
        { role: "primary", cx: 64, cy: 76, headR: 16, shoulderW: 36, torsoH: 50, gazeDx: -18, gazeDy: -8 },
      ],
    },
  ],
  quiet: [
    {
      slug: "negative-space-els",
      title: { ko: "광활한 여백 원경 샷", en: "Negative-Space Long Shot" },
      rationale: {
        ko: "화면 70% 이상을 여백으로 비우고 긴 스크롤 여운으로 침묵의 무게를 전달합니다.",
        en: "Leaves over 70% calm negative space with a deep vertical gutter for quiet resonance.",
      },
      shotSize: "ELS",
      cameraAngle: "eye-level",
      thirdsAnchor: { x: 33.3, y: 66.7 },
      horizonY: 94,
      dutchAngleDeg: 0,
      baseGutterPx: 248,
      defaultBalloonStyle: "narration",
      speedLineMode: "none",
      figures: [
        { role: "primary", cx: 34, cy: 96, headR: 5.5, shoulderW: 13, torsoH: 24, gazeDx: 10, gazeDy: 0 },
      ],
    },
    {
      slug: "window-back-profile",
      title: { ko: "창가 뒷모습 부감 컷", en: "Quiet High-Angle Profile" },
      rationale: {
        ko: "인물을 좌측 하단 3분할선에 두어 상단 공간에 독백 말풍선이 고요히 떠 있게 합니다.",
        en: "Anchors the figure in the lower-left third so quiet monologue floats unhurried above.",
      },
      shotSize: "MS",
      cameraAngle: "high-angle",
      thirdsAnchor: { x: 33.3, y: 66.7 },
      horizonY: 44,
      dutchAngleDeg: 0,
      baseGutterPx: 196,
      defaultBalloonStyle: "thought",
      speedLineMode: "none",
      figures: [
        { role: "primary", cx: 34, cy: 84, headR: 11, shoulderW: 25, torsoH: 40, gazeDx: 14, gazeDy: -6 },
      ],
    },
    {
      slug: "still-object-detail",
      title: { ko: "정물·시선 디테일 컷", en: "Quiet Detail Close-Up" },
      rationale: {
        ko: "표정이나 손끝 디테일에 초점을 맞추어 대사가 없어도 감정이 스며들게 합니다.",
        en: "Focuses on a calm close-up detail so emotion lingers without visual clutter.",
      },
      shotSize: "CU",
      cameraAngle: "eye-level",
      thirdsAnchor: { x: 66.7, y: 66.7 },
      horizonY: 72,
      dutchAngleDeg: 0,
      baseGutterPx: 184,
      defaultBalloonStyle: "thought",
      speedLineMode: "none",
      figures: [
        { role: "primary", cx: 66, cy: 84, headR: 15, shoulderW: 32, torsoH: 42, gazeDx: -10, gazeDy: 4 },
      ],
    },
  ],
  confrontation: [
    {
      slug: "opposing-thirds-standoff",
      title: { ko: "좌우 3분할 팽팽한 대치", en: "Opposing-Thirds Standoff" },
      rationale: {
        ko: "두 인물을 양쪽 3분할선에 갈라 세워 중앙 빈틈에 심리적 긴장선을 만듭니다.",
        en: "Splits both rivals onto opposing thirds so the central gap crackles with tension.",
      },
      shotSize: "MS",
      cameraAngle: "eye-level",
      thirdsAnchor: { x: 33.3, y: 38.0 },
      horizonY: 66,
      dutchAngleDeg: 0,
      baseGutterPx: 108,
      defaultBalloonStyle: "speech",
      speedLineMode: "none",
      figures: [
        { role: "primary", cx: 26, cy: 62, headR: 11, shoulderW: 24, torsoH: 48, gazeDx: 22, gazeDy: 0 },
        { role: "secondary", cx: 74, cy: 62, headR: 11, shoulderW: 24, torsoH: 48, gazeDx: -22, gazeDy: 0 },
      ],
    },
    {
      slug: "looming-pressure-low",
      title: { ko: "압박 로우앵글 대치 샷", en: "Looming Pressure Low-Angle" },
      rationale: {
        ko: "상대방 쪽을 로우앵글로 올려다보게 배치해 힘의 불균형과 긴박감을 드러냅니다.",
        en: "Tilts upward onto the dominant speaker to sharpen power imbalance.",
      },
      shotSize: "MCU",
      cameraAngle: "low-angle",
      thirdsAnchor: { x: 66.7, y: 33.3 },
      horizonY: 104,
      dutchAngleDeg: 5,
      baseGutterPx: 92,
      defaultBalloonStyle: "speech",
      speedLineMode: "vertical",
      figures: [
        { role: "primary", cx: 66, cy: 52, headR: 15, shoulderW: 34, torsoH: 60, gazeDx: -16, gazeDy: 8 },
      ],
    },
    {
      slug: "razor-ots-stare",
      title: { ko: "날 선 어깨 너머 응시", en: "Razor Over-the-Shoulder Stare" },
      rationale: {
        ko: "약한 기울기(7°)와 OTS 프레이밍으로 충돌 직전의 팽팽한 긴장을 유지합니다.",
        en: "Pairs a subtle 7° tilt with OTS foreground framing right before the clash.",
      },
      shotSize: "OTS",
      cameraAngle: "dutch-tilt",
      thirdsAnchor: { x: 66.7, y: 33.3 },
      horizonY: 58,
      dutchAngleDeg: 7,
      baseGutterPx: 80,
      defaultBalloonStyle: "shout",
      speedLineMode: "diagonal",
      figures: [
        { role: "secondary", cx: 22, cy: 90, headR: 18, shoulderW: 40, torsoH: 50, gazeDx: 16, gazeDy: -10 },
        { role: "primary", cx: 68, cy: 50, headR: 13, shoulderW: 28, torsoH: 52, gazeDx: -16, gazeDy: 5 },
      ],
    },
  ],
};

function buildWireframeShoulderPath(fig: ArchetypeFigureSpec): string {
  const neckY = roundTo(fig.cy + fig.headR + 1.5, 1);
  const shoulderY = roundTo(neckY + Math.max(4, fig.headR * 0.45), 1);
  const bottomY = roundTo(Math.min(CUT_VIEWBOX_H, shoulderY + fig.torsoH), 1);
  const halfW = fig.shoulderW / 2;
  const leftX = roundTo(fig.cx - halfW, 1);
  const rightX = roundTo(fig.cx + halfW, 1);
  const neckHalf = roundTo(Math.max(2.5, fig.headR * 0.32), 1);
  return (
    `M ${roundTo(leftX + halfW * 0.14, 1)} ${bottomY} ` +
    `L ${leftX} ${shoulderY} ` +
    `Q ${roundTo(fig.cx - halfW * 0.55, 1)} ${neckY} ${roundTo(fig.cx - neckHalf, 1)} ${neckY} ` +
    `L ${roundTo(fig.cx + neckHalf, 1)} ${neckY} ` +
    `Q ${roundTo(fig.cx + halfW * 0.55, 1)} ${neckY} ${rightX} ${shoulderY} ` +
    `L ${roundTo(rightX - halfW * 0.14, 1)} ${bottomY} Z`
  );
}

function buildSpeedLines(
  mode: "none" | "radial" | "diagonal" | "vertical",
  focal: NormalizedPoint,
  extraIntensity: number,
): readonly SvgLineSegment[] {
  if (mode === "none" && extraIntensity < 2) return [];
  const effectiveMode = mode === "none" ? "radial" : mode;
  const fx = (focal.x / 100) * CUT_VIEWBOX_W;
  const fy = (focal.y / 100) * CUT_VIEWBOX_H;
  const lines: SvgLineSegment[] = [];

  if (effectiveMode === "radial") {
    const count = 12 + Math.min(6, extraIntensity * 2);
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + 0.14;
      const innerR = 26 + (i % 3) * 5;
      lines.push({
        x1: roundTo(fx + Math.cos(angle) * innerR, 1),
        y1: roundTo(fy + Math.sin(angle) * innerR, 1),
        x2: roundTo(fx + Math.cos(angle) * 92, 1),
        y2: roundTo(fy + Math.sin(angle) * 92, 1),
      });
    }
    return lines;
  }

  if (effectiveMode === "diagonal") {
    for (let i = 0; i < 8; i += 1) {
      const yStart = 8 + i * 17;
      lines.push({ x1: 0, y1: roundTo(yStart, 1), x2: CUT_VIEWBOX_W, y2: roundTo(yStart + 28, 1) });
    }
    return lines;
  }

  for (let i = 0; i < 8; i += 1) {
    const xPos = 6 + i * 12.5;
    lines.push({ x1: roundTo(xPos, 1), y1: 4, x2: roundTo(xPos, 1), y2: roundTo(32 + (i % 3) * 18, 1) });
  }
  return lines;
}

function computeAntiCollisionBalloonAnchor(
  thirdsAnchor: NormalizedPoint,
  style: BalloonStyleId,
): NormalizedPoint {
  if (style === "narration") {
    return { x: 50, y: thirdsAnchor.y > 50 ? 16 : 82 };
  }
  return {
    x: roundTo(thirdsAnchor.x < 50 ? 74 : 26, 1),
    y: roundTo(thirdsAnchor.y > 55 ? 20 : 22, 1),
  };
}

function inferBalloonStyleFromLine(dialogue: string, fallback: BalloonStyleId): BalloonStyleId {
  const trimmed = dialogue.trim();
  if (/^\[.+\]$/u.test(trimmed) || /^\[?(?:나레이션|narration)\]?\s*[:：]?/iu.test(trimmed)) {
    return "narration";
  }
  if (/^\(.+\)$/u.test(trimmed) || /^（.+）$/u.test(trimmed)) {
    return "thought";
  }
  if (trimmed.includes("!")) return "shout";
  return fallback;
}

/**
 * 대사 1줄과 감정을 입력받아 3가지 실전 웹툰 구도 카드를 즉시 생성한다.
 */
export function suggestCutCompositionsFromLine(
  dialogue: string,
  mood: CutMoodId,
): readonly [CutCompositionCard, CutCompositionCard, CutCompositionCard] {
  const cleanDialogue = dialogue.replace(/\s+/gu, " ").trim();
  const exclamationCount = (cleanDialogue.match(/!/gu) ?? []).length;
  const hasEllipsis = /\.{2,}|…/u.test(cleanDialogue);
  const charCount = cleanDialogue.length;
  const archetypes = CUT_ARCHETYPES[mood];

  const cards = archetypes.map((spec, idx) => {
    const variantIndex = idx as 0 | 1 | 2;
    const style = inferBalloonStyleFromLine(cleanDialogue, spec.defaultBalloonStyle);
    const balloonAnchor = computeAntiCollisionBalloonAnchor(spec.thirdsAnchor, style);

    let gutterPx = spec.baseGutterPx;
    if (exclamationCount >= 1) gutterPx = Math.round(gutterPx * 0.86);
    if (hasEllipsis) gutterPx += 28;
    if (charCount > 28) gutterPx += 16;
    gutterPx = clampInt(gutterPx, 24, 320);

    const readingSec = charCount > 0 ? charCount / 11.5 : 0.6;
    const visualDwellSec = spec.shotSize === "ELS" || spec.shotSize === "ECU" ? 1.4 : 1.0;
    const pacingBeatSec = roundTo(clampNumber(readingSec + visualDwellSec, 0.8, 6.5), 1);

    const figures: WireframeFigure[] = spec.figures.map((fig) => ({
      role: fig.role,
      headCx: fig.cx,
      headCy: fig.cy,
      headR: fig.headR,
      shoulderPath: buildWireframeShoulderPath(fig),
      gazeDx: fig.gazeDx,
      gazeDy: fig.gazeDy,
    }));

    const primary = spec.figures[0];
    const subjectBounds: NormalizedRect = {
      x: roundTo(clampNumber(primary.cx - primary.shoulderW / 2, 2, 92), 1),
      y: roundTo(clampNumber(primary.cy - primary.headR, 2, 128), 1),
      width: roundTo(clampNumber(primary.shoulderW, 10, 94), 1),
      height: roundTo(clampNumber(primary.headR * 2 + primary.torsoH, 16, 134), 1),
    };

    const wireframe: CompositionWireframeData = {
      viewBoxWidth: CUT_VIEWBOX_W,
      viewBoxHeight: CUT_VIEWBOX_H,
      horizonY: spec.horizonY,
      dutchAngleDeg: spec.dutchAngleDeg,
      ruleOfThirdsX: [33.33, 66.67],
      ruleOfThirdsY: [46.67, 93.33],
      focalPoint: spec.thirdsAnchor,
      subjectBounds,
      figures,
      speedLines: buildSpeedLines(spec.speedLineMode, spec.thirdsAnchor, exclamationCount),
      focalRingRadius: spec.shotSize === "ECU" ? 13 : 9,
    };

    const excerpt =
      cleanDialogue.length > 34 ? `${cleanDialogue.slice(0, 33).trimEnd()}…` : cleanDialogue;

    return {
      id: `${mood}-${spec.slug}`,
      variantIndex,
      mood,
      title: spec.title,
      rationale: spec.rationale,
      shotSize: spec.shotSize,
      shotSizeLabel: SHOT_SIZE_LABELS[spec.shotSize],
      cameraAngle: spec.cameraAngle,
      cameraAngleLabel: CAMERA_ANGLE_LABELS[spec.cameraAngle],
      thirdsAnchor: spec.thirdsAnchor,
      balloonAnchor,
      recommendedBalloonStyle: style,
      gutterPx,
      pacingBeatSec,
      dialogueExcerpt: excerpt,
      wireframe,
    };
  });

  return [cards[0], cards[1], cards[2]];
}
