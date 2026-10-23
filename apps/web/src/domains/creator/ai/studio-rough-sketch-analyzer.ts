/**
 * 자유 드로잉 러프 스케치 스트로크 기하 분석기 (Freehand Rough Sketch Geometry Analyzer).
 *
 * 전문·예비 웹툰 작가가 캔버스나 콘티 패드에 그은 간단한 선(인물 실루엣, 지평선,
 * 속도선/시선 화살표, 말풍선 영역)의 2D 좌표 열을 기하학적으로 분석해
 * `StoryboardRoughSketchInput`과 카메라·구도·동선 연출 의도를 결정적으로 추론한다.
 */

import type { StoryboardRoughSketchInput, StoryboardRoughSketchPresetId } from "./studio-ai-storyboard-director";

export type RoughSketchStrokeRole = "subject" | "horizon" | "motion-line" | "speech-zone";

export interface RoughSketchPoint {
  /** 정규화 X 좌표 (0..1) */
  readonly x: number;
  /** 정규화 Y 좌표 (0..1) */
  readonly y: number;
}

export interface RoughSketchStroke {
  readonly id: string;
  readonly role: RoughSketchStrokeRole;
  readonly points: readonly RoughSketchPoint[];
}

export interface RoughSketchStrokeTemplate {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly linkedPresetId: StoryboardRoughSketchPresetId;
  readonly strokes: readonly RoughSketchStroke[];
}

export interface FreehandRoughSketchAnalysis {
  readonly roughSketchInput: StoryboardRoughSketchInput;
  readonly detectedPresetId: StoryboardRoughSketchPresetId;
  readonly subjectBounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
    readonly width: number;
    readonly height: number;
  };
  readonly motionAngleDeg: number | null;
  readonly motionIntensity: number;
  readonly confidenceScore: number;
  readonly geometryNote: string;
}

export const ROUGH_SKETCH_STROKE_TEMPLATES: readonly RoughSketchStrokeTemplate[] = Object.freeze([
  {
    id: "hero-charge",
    label: "대각선 돌진 액션 스케치",
    summary: "좌하단→우상단 속도선과 전경 인물로 강렬한 타격감을 지시하는 러프 콘티",
    linkedPresetId: "diagonal-action",
    strokes: [
      {
        id: "s-sub",
        role: "subject",
        points: [
          { x: 0.36, y: 0.28 },
          { x: 0.68, y: 0.34 },
          { x: 0.64, y: 0.84 },
          { x: 0.34, y: 0.8 },
        ],
      },
      {
        id: "s-mot",
        role: "motion-line",
        points: [
          { x: 0.12, y: 0.88 },
          { x: 0.52, y: 0.52 },
          { x: 0.88, y: 0.16 },
        ],
      },
      {
        id: "s-hor",
        role: "horizon",
        points: [
          { x: 0.05, y: 0.68 },
          { x: 0.95, y: 0.42 },
        ],
      },
    ],
  },
  {
    id: "cliffhanger-eye",
    label: "감정 클로즈업 + 상단 독백 스케치",
    summary: "화면 중앙을 채우는 인물 실루엣과 상단 말풍선 영역으로 감정을 집중시키는 콘티",
    linkedPresetId: "center-focus",
    strokes: [
      {
        id: "s-sub",
        role: "subject",
        points: [
          { x: 0.25, y: 0.24 },
          { x: 0.75, y: 0.24 },
          { x: 0.75, y: 0.86 },
          { x: 0.25, y: 0.86 },
        ],
      },
      {
        id: "s-speech",
        role: "speech-zone",
        points: [
          { x: 0.18, y: 0.06 },
          { x: 0.82, y: 0.06 },
          { x: 0.82, y: 0.2 },
        ],
      },
    ],
  },
  {
    id: "rooftop-standoff",
    label: "로우 호라이즌 영웅 각성 스케치",
    summary: "낮은 지평선과 수직 상승 동선으로 압도적인 존재감을 연출하는 스크롤 컷 콘티",
    linkedPresetId: "low-horizon-hero",
    strokes: [
      {
        id: "s-hor",
        role: "horizon",
        points: [
          { x: 0.05, y: 0.82 },
          { x: 0.95, y: 0.8 },
        ],
      },
      {
        id: "s-sub",
        role: "subject",
        points: [
          { x: 0.34, y: 0.18 },
          { x: 0.66, y: 0.18 },
          { x: 0.64, y: 0.82 },
          { x: 0.36, y: 0.82 },
        ],
      },
      {
        id: "s-mot",
        role: "motion-line",
        points: [
          { x: 0.5, y: 0.85 },
          { x: 0.5, y: 0.12 },
        ],
      },
    ],
  },
  {
    id: "emotional-confession",
    label: "2인 대면 시선 교차 스케치",
    summary: "좌우 인물 배치와 상·하단 대사 영역으로 대화 텐션을 살리는 와이드 콘티",
    linkedPresetId: "two-shot-dialogue",
    strokes: [
      {
        id: "s-sub",
        role: "subject",
        points: [
          { x: 0.18, y: 0.32 },
          { x: 0.82, y: 0.35 },
          { x: 0.8, y: 0.78 },
          { x: 0.2, y: 0.78 },
        ],
      },
      {
        id: "s-hor",
        role: "horizon",
        points: [
          { x: 0.05, y: 0.52 },
          { x: 0.95, y: 0.52 },
        ],
      },
      {
        id: "s-speech",
        role: "speech-zone",
        points: [
          { x: 0.12, y: 0.1 },
          { x: 0.48, y: 0.14 },
        ],
      },
    ],
  },
]);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 자유 드로잉 스트로크 배열을 기하학적으로 분석해 `StoryboardRoughSketchInput`과
 * 구도·카메라·동선 추론 결과를 반환한다.
 */
export function analyzeFreehandRoughSketchStrokes(
  strokes: readonly RoughSketchStroke[],
  sketchNote = "",
): FreehandRoughSketchAnalysis {
  const validStrokes = strokes.filter((s) => s.points.length > 0);
  const subjectPoints = validStrokes
    .filter((s) => s.role === "subject")
    .flatMap((s) => s.points);
  const allPoints = validStrokes.flatMap((s) => s.points);
  const targetPoints = subjectPoints.length > 0 ? subjectPoints : allPoints;

  let minX = 0.35;
  let maxX = 0.65;
  let minY = 0.3;
  let maxY = 0.7;

  if (targetPoints.length > 0) {
    minX = clamp01(Math.min(...targetPoints.map((p) => p.x)));
    maxX = clamp01(Math.max(...targetPoints.map((p) => p.x)));
    minY = clamp01(Math.min(...targetPoints.map((p) => p.y)));
    maxY = clamp01(Math.max(...targetPoints.map((p) => p.y)));
  }

  const width = Math.max(0.08, round2(maxX - minX));
  const height = Math.max(0.08, round2(maxY - minY));
  const focalX = round2(clamp01((minX + maxX) / 2));
  const focalY = round2(clamp01((minY + maxY) / 2));
  const subjectScale = round2(clamp01(Math.max(width * height * 1.45, (width + height) * 0.38)));

  // 지평선 스트로크 분석
  const horizonPoints = validStrokes
    .filter((s) => s.role === "horizon")
    .flatMap((s) => s.points);
  const horizonRatio =
    horizonPoints.length > 0
      ? round2(clamp01(horizonPoints.reduce((acc, p) => acc + p.y, 0) / horizonPoints.length))
      : 0.5;

  // 동선(motion-line) 스트로크 벡터 분석
  const motionStroke = validStrokes.find((s) => s.role === "motion-line" && s.points.length >= 2);
  let motionVector: StoryboardRoughSketchInput["motionVector"] = "none";
  let motionAngleDeg: number | null = null;
  let motionIntensity = 0;

  if (motionStroke) {
    const first = motionStroke.points[0]!;
    const last = motionStroke.points[motionStroke.points.length - 1]!;
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const dist = Math.hypot(dx, dy);
    motionIntensity = round2(clamp01(dist * 1.25));
    if (dist >= 0.08) {
      motionAngleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx > 0.18 && absDy > 0.18) {
        motionVector = "diagonal-slash";
      } else if (absDy >= absDx) {
        motionVector = dy < 0 ? "upward-rise" : "downward-drop";
      } else {
        motionVector = "inward-zoom";
      }
    }
  }

  // 말풍선 영역 스트로크 분석
  const speechPoints = validStrokes
    .filter((s) => s.role === "speech-zone")
    .flatMap((s) => s.points);
  let speechZoneHint: StoryboardRoughSketchInput["speechZoneHint"] = "top";
  if (speechPoints.length > 0) {
    const avgSpeechY = speechPoints.reduce((acc, p) => acc + p.y, 0) / speechPoints.length;
    if (avgSpeechY > 0.65) speechZoneHint = "bottom";
    else if (avgSpeechY >= 0.35 && avgSpeechY <= 0.65) speechZoneHint = "split";
    else speechZoneHint = "top";
  }

  // 가장 가까운 프리셋 추론
  let detectedPresetId: StoryboardRoughSketchPresetId = "center-focus";
  if (motionVector === "diagonal-slash") {
    detectedPresetId = "diagonal-action";
  } else if (horizonRatio >= 0.72) {
    detectedPresetId = "low-horizon-hero";
  } else if (horizonRatio <= 0.28 || subjectScale <= 0.25) {
    detectedPresetId = "high-angle-isolation";
  } else if (width >= 0.58 && height <= 0.5) {
    detectedPresetId = "two-shot-dialogue";
  } else if (speechZoneHint === "split") {
    detectedPresetId = "split-reaction";
  }

  const roleCount = new Set(validStrokes.map((s) => s.role)).size;
  const confidenceScore = Math.min(98, 58 + roleCount * 10 + Math.min(12, allPoints.length * 2));

  const roughSketchInput: StoryboardRoughSketchInput = Object.freeze({
    presetId: detectedPresetId,
    focalX,
    focalY,
    horizonRatio,
    subjectScale,
    motionVector,
    speechZoneHint,
    ...(sketchNote.trim() ? { sketchNote: sketchNote.trim() } : {}),
  });

  const geometryNote =
    `초점(${focalX}, ${focalY}) · 피사체 비중 ${Math.round(subjectScale * 100)}% · ` +
    `지평선 ${Math.round(horizonRatio * 100)}% · 동선 ${motionVector}` +
    (motionAngleDeg !== null ? `(${motionAngleDeg}°)` : "");

  return Object.freeze({
    roughSketchInput,
    detectedPresetId,
    subjectBounds: Object.freeze({ minX, minY, maxX, maxY, width, height }),
    motionAngleDeg,
    motionIntensity,
    confidenceScore,
    geometryNote,
  });
}

/**
 * 러프 스케치 스트로크 배열을 SVG `<polyline>` / `<path>` 렌더링용 `d` 문자열 목록으로 변환한다.
 */
export function renderRoughSketchStrokesSvgPaths(
  strokes: readonly RoughSketchStroke[],
  viewport: { readonly width: number; readonly height: number } = { width: 240, height: 150 },
): readonly { readonly id: string; readonly role: RoughSketchStrokeRole; readonly d: string }[] {
  return Object.freeze(
    strokes
      .filter((stroke) => stroke.points.length > 0)
      .map((stroke) => {
        const commands = stroke.points.map((pt, idx) => {
          const x = Math.round(clamp01(pt.x) * viewport.width * 10) / 10;
          const y = Math.round(clamp01(pt.y) * viewport.height * 10) / 10;
          return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
        });
        return Object.freeze({
          id: stroke.id,
          role: stroke.role,
          d: commands.join(" "),
        });
      }),
  );
}
