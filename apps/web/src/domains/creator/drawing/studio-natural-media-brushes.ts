/**
 * studio-natural-media-brushes.ts
 *
 * p5.brush (MIT) 내추럴 미디어 브러시 통합 모듈.
 *
 * p5.brush 고유의 강점 — 실제 내추럴 미디어 질감(연필 입자·목탄 번짐·마커
 * 겹침·수채화 번짐·해칭)에만 집중한다. 기존 자체 스탬프 엔진의 클린룸 커널과
 * 중복되는 영역은 건드리지 않는다.
 *
 * 설계:
 * - `p5.brush/standalone` 을 dynamic import 로 lazy-load (p5.js 불필요).
 * - WebGL2 캔버스가 필요하므로 세션은 명시적 생성/해제.
 * - 프리셋 정의·설정 검증은 순수 함수 (테스트 가능).
 * - 실제 WebGL 렌더링은 브라우저에서만 동작하므로 테스트에서 제외.
 */

export type StudioNaturalMediaBrushId =
  | "pencil-2b"
  | "pencil-hb"
  | "pencil-2h"
  | "color-pencil"
  | "crayon"
  | "pastel"
  | "pen"
  | "rotring"
  | "charcoal"
  | "marker"
  | "spray";

export interface StudioNaturalMediaPreset {
  readonly id: StudioNaturalMediaBrushId;
  /** p5.brush 내장 브러시 이름. */
  readonly brushName: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  /** 권장 굵기(px). */
  readonly defaultWeight: number;
  /** 웹툰 공정 태그. */
  readonly crafts: ReadonlyArray<"sketch" | "lineart" | "coloring" | "tone" | "effect">;
}

/** p5.brush 2.2.1 표준 11종 전수 매핑 (src/stroke/stroke.js _standard_brushes 기준). */
export const STUDIO_NATURAL_MEDIA_PRESETS: ReadonlyArray<StudioNaturalMediaPreset> =
  Object.freeze([
    {
      id: "pencil-2b",
      brushName: "2B",
      labelKo: "연필 2B",
      labelEn: "Pencil 2B",
      descriptionKo: "부드러운 스케치용. 입자감이 살아있는 연필 질감.",
      defaultWeight: 2,
      crafts: ["sketch"],
    },
    {
      id: "pencil-hb",
      brushName: "HB",
      labelKo: "연필 HB",
      labelEn: "Pencil HB",
      descriptionKo: "밑그림용 표준 연필. 2B보다 단단하고 정밀.",
      defaultWeight: 1.5,
      crafts: ["sketch"],
    },
    {
      id: "pencil-2h",
      brushName: "2H",
      labelKo: "연필 2H",
      labelEn: "Pencil 2H",
      descriptionKo: "단단한 정밀 연필. 가이드선·해칭 밑선에.",
      defaultWeight: 1.2,
      crafts: ["sketch", "lineart"],
    },
    {
      id: "color-pencil",
      brushName: "cpencil",
      labelKo: "색연필",
      labelEn: "Color Pencil",
      descriptionKo: "색연필 질감. 가벼운 채색·톤 작업에.",
      defaultWeight: 3,
      crafts: ["sketch", "coloring"],
    },
    {
      id: "crayon",
      brushName: "crayon",
      labelKo: "크레용",
      labelEn: "Crayon",
      descriptionKo: "필압에 따라 굵기가 변하는 크레용 질감. 채색에.",
      defaultWeight: 6,
      crafts: ["coloring"],
    },
    {
      id: "pastel",
      brushName: "pastel",
      labelKo: "파스텔",
      labelEn: "Pastel",
      descriptionKo: "부드럽게 번지는 파스텔. 넓은 명암·배경 톤에.",
      defaultWeight: 14,
      crafts: ["sketch", "tone"],
    },
    {
      id: "pen",
      brushName: "pen",
      labelKo: "펜",
      labelEn: "Pen",
      descriptionKo: "깔끔한 선화용 펜.",
      defaultWeight: 2,
      crafts: ["lineart"],
    },
    {
      id: "rotring",
      brushName: "rotring",
      labelKo: "로트링",
      labelEn: "Rotring",
      descriptionKo: "일정한 굵기의 제도 펜. 정밀한 선화에.",
      defaultWeight: 1.5,
      crafts: ["lineart"],
    },
    {
      id: "charcoal",
      brushName: "charcoal",
      labelKo: "목탄",
      labelEn: "Charcoal",
      descriptionKo: "번짐이 풍부한 목탄. 명암·배경 질감에.",
      defaultWeight: 8,
      crafts: ["sketch", "tone"],
    },
    {
      id: "marker",
      brushName: "marker",
      labelKo: "마커",
      labelEn: "Marker",
      descriptionKo: "겹칠수록 진해지는 마커. 채색용.",
      defaultWeight: 12,
      crafts: ["coloring"],
    },
    {
      id: "spray",
      brushName: "spray",
      labelKo: "스프레이",
      labelEn: "Spray",
      descriptionKo: "에어브러시 스프레이. 톤·그라데이션·효과에.",
      defaultWeight: 20,
      crafts: ["tone", "effect"],
    },
  ]);

export function getNaturalMediaPreset(
  id: StudioNaturalMediaBrushId,
): StudioNaturalMediaPreset | undefined {
  return STUDIO_NATURAL_MEDIA_PRESETS.find((p) => p.id === id);
}

export function getNaturalMediaPresetsByCraft(
  craft: StudioNaturalMediaPreset["crafts"][number],
): StudioNaturalMediaPreset[] {
  return STUDIO_NATURAL_MEDIA_PRESETS.filter((p) => p.crafts.includes(craft));
}

export interface StudioNaturalMediaStrokeStyle {
  /** 0..1, 0..1, 0..1 RGB. */
  readonly color: readonly [number, number, number];
  /** 굵기(px). 0.5..100. */
  readonly weight: number;
}

export interface StudioNaturalMediaSessionConfig {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** WebGL2 미지원 시 에러. 기본 true. */
  readonly requireWebGL2?: boolean;
}

export type StudioNaturalMediaLoadError =
  | "load-failed"
  | "invalid-config"
  | "webgl2-unavailable";

export interface StudioNaturalMediaSession {
  readonly config: StudioNaturalMediaSessionConfig;
  /** p5.brush standalone 모듈 네임스페이스 (불투명). */
  readonly runtime: unknown;
  dispose(): void;
}

type P5BrushStandalone = typeof import("p5.brush/standalone");

let cachedRuntime: P5BrushStandalone | null = null;
let runtimePromise: Promise<P5BrushStandalone | null> | null = null;

/** p5.brush standalone 런타임을 lazy-load. 실패 시 null. */
export async function loadNaturalMediaRuntime(): Promise<P5BrushStandalone | null> {
  if (cachedRuntime) return cachedRuntime;
  if (runtimePromise) return runtimePromise;
  runtimePromise = import("p5.brush/standalone")
    .then((mod) => {
      cachedRuntime = mod;
      return mod;
    })
    .catch(() => {
      runtimePromise = null;
      return null;
    });
  return runtimePromise;
}

/** 테스트용 런타임 주입. */
export function injectNaturalMediaRuntimeForTest(
  runtime: P5BrushStandalone | null,
): void {
  cachedRuntime = runtime;
  runtimePromise = runtime ? Promise.resolve(runtime) : null;
}

export function validateNaturalMediaSessionConfig(
  config: StudioNaturalMediaSessionConfig,
): StudioNaturalMediaLoadError | null {
  if (
    !Number.isFinite(config.canvasWidth) ||
    config.canvasWidth <= 0 ||
    config.canvasWidth > 8192
  ) {
    return "invalid-config";
  }
  if (
    !Number.isFinite(config.canvasHeight) ||
    config.canvasHeight <= 0 ||
    config.canvasHeight > 8192
  ) {
    return "invalid-config";
  }
  return null;
}

export function validateNaturalMediaStrokeStyle(
  style: StudioNaturalMediaStrokeStyle,
): boolean {
  const [r, g, b] = style.color;
  if (
    ![r, g, b].every((c) => Number.isFinite(c) && c >= 0 && c <= 1) ||
    !Number.isFinite(style.weight) ||
    style.weight < 0.5 ||
    style.weight > 100
  ) {
    return false;
  }
  return true;
}

/**
 * 해칭 패턴 설정값 검증 (p5.brush hatch API용).
 * @param spacing 빗금 간격(px), 2..100
 * @param angle 빗금 각도(도), 0..180
 */
export function validateHatchSettings(
  spacing: number,
  angle: number,
): boolean {
  return (
    Number.isFinite(spacing) &&
    spacing >= 2 &&
    spacing <= 100 &&
    Number.isFinite(angle) &&
    angle >= 0 &&
    angle <= 180
  );
}

/* ------------------------------------------------------------------ */
/* 내추럴 미디어 물리 프로파일 & 다중 패스 크로스해칭(Cross-Hatch) 플래너 */
/* ------------------------------------------------------------------ */

export interface NaturalMediaPhysicsProfile {
  readonly id: StudioNaturalMediaBrushId;
  /** 종이 요철 산(peak) 마찰 걸림 강도 (0..1). */
  readonly grainBite01: number;
  /** 문지름·스머지 번짐 민감도 (0..1). */
  readonly smudgeSusceptibility01: number;
  /** 섬유 모세관 잉크·알코올 마커 번짐 (0..1). */
  readonly inkBleed01: number;
  /** 필압 감마 곡선 지수 (< 1 부드러운 흑연, > 1 단단한 제도샤프). */
  readonly pressureGamma: number;
  /** 다중 중첩 칠하기 농도 누적률 (0..1, 마커·연필 레이어링). */
  readonly multiPassBuildUp01: number;
}

const NATURAL_MEDIA_PHYSICS_MAP: Readonly<Record<StudioNaturalMediaBrushId, NaturalMediaPhysicsProfile>> =
  Object.freeze({
    "pencil-2b": {
      id: "pencil-2b",
      grainBite01: 0.72,
      smudgeSusceptibility01: 0.58,
      inkBleed01: 0.02,
      pressureGamma: 0.78,
      multiPassBuildUp01: 0.68,
    },
    "pencil-hb": {
      id: "pencil-hb",
      grainBite01: 0.62,
      smudgeSusceptibility01: 0.42,
      inkBleed01: 0.01,
      pressureGamma: 1.0,
      multiPassBuildUp01: 0.56,
    },
    "pencil-2h": {
      id: "pencil-2h",
      grainBite01: 0.48,
      smudgeSusceptibility01: 0.22,
      inkBleed01: 0.0,
      pressureGamma: 1.38,
      multiPassBuildUp01: 0.42,
    },
    "color-pencil": {
      id: "color-pencil",
      grainBite01: 0.78,
      smudgeSusceptibility01: 0.32,
      inkBleed01: 0.02,
      pressureGamma: 0.92,
      multiPassBuildUp01: 0.64,
    },
    crayon: {
      id: "crayon",
      grainBite01: 0.88,
      smudgeSusceptibility01: 0.48,
      inkBleed01: 0.0,
      pressureGamma: 0.85,
      multiPassBuildUp01: 0.72,
    },
    pastel: {
      id: "pastel",
      grainBite01: 0.94,
      smudgeSusceptibility01: 0.9,
      inkBleed01: 0.04,
      pressureGamma: 0.72,
      multiPassBuildUp01: 0.76,
    },
    pen: {
      id: "pen",
      grainBite01: 0.18,
      smudgeSusceptibility01: 0.08,
      inkBleed01: 0.16,
      pressureGamma: 0.9,
      multiPassBuildUp01: 0.25,
    },
    rotring: {
      id: "rotring",
      grainBite01: 0.06,
      smudgeSusceptibility01: 0.04,
      inkBleed01: 0.08,
      pressureGamma: 1.45,
      multiPassBuildUp01: 0.15,
    },
    charcoal: {
      id: "charcoal",
      grainBite01: 0.92,
      smudgeSusceptibility01: 0.88,
      inkBleed01: 0.05,
      pressureGamma: 0.68,
      multiPassBuildUp01: 0.82,
    },
    marker: {
      id: "marker",
      grainBite01: 0.24,
      smudgeSusceptibility01: 0.35,
      inkBleed01: 0.74,
      pressureGamma: 0.82,
      multiPassBuildUp01: 0.86,
    },
    spray: {
      id: "spray",
      grainBite01: 0.35,
      smudgeSusceptibility01: 0.28,
      inkBleed01: 0.32,
      pressureGamma: 0.95,
      multiPassBuildUp01: 0.78,
    },
  });

/**
 * 11종 내추럴 미디어 프리셋별 물리 마찰·번짐·필압 감마·중첩 누적 프로파일을 반환한다.
 */
export function resolveNaturalMediaPhysicsProfile(
  id: StudioNaturalMediaBrushId,
): NaturalMediaPhysicsProfile {
  return NATURAL_MEDIA_PHYSICS_MAP[id] ?? NATURAL_MEDIA_PHYSICS_MAP["pencil-hb"];
}

export interface NaturalMediaHatchLine {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly entryPressure: number;
  readonly midPressure: number;
  readonly exitPressure: number;
}

export interface NaturalMediaHatchPass {
  readonly passIndex: number;
  readonly angleDeg: number;
  readonly spacingPx: number;
  readonly lines: ReadonlyArray<NaturalMediaHatchLine>;
}

export interface NaturalMediaHatchConfig {
  /** 기본 빗금 간격(px), 2..100. */
  readonly spacingPx: number;
  /** 1차 해칭 각도(도), 0..180. */
  readonly angleDeg: number;
  /** 교차 해칭 패스 수 (1: 단일 사선, 2: 2중 크로스해칭, 3: 3중 심부 명암). 미지정 시 toneValue01 기반 자동 결정. */
  readonly crossPasses?: 1 | 2 | 3;
  /** 목표 명암 농도 (0..1). 높을수록 패스 수 증가 및 간격 조밀화. 기본 0.35. */
  readonly toneValue01?: number;
  /** 패스 간 교차 각도 오프셋(도). 기본 55도. */
  readonly crossAngleSpreadDeg?: number;
  /** 손그림 미세 흔들림 강도 (0..1). 기본 0.15. */
  readonly handJitter01?: number;
  /** 결정론적 시드. 기본 42. */
  readonly seed?: number;
}

function hashHatch(index: number, pass: number, seed: number): number {
  let h = (index * 374761393 + pass * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function clipInfiniteLineToRect(
  px: number,
  py: number,
  dx: number,
  dy: number,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
): readonly [number, number, number, number] | null {
  let t0 = -1e9;
  let t1 = 1e9;
  const p = [-dx, dx, -dy, dy];
  const q = [px - xMin, xMax - px, py - yMin, yMax - py];

  for (let i = 0; i < 4; i += 1) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (Math.abs(pi) < 1e-9) {
      if (qi < 0) return null;
    } else {
      const r = qi / pi;
      if (pi < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  if (t0 >= t1) return null;
  return [px + t0 * dx, py + t0 * dy, px + t1 * dx, py + t1 * dy] as const;
}

/**
 * 만화·일러스트 명암용 다중 패스 크로스해칭(Cross-Hatching) 선분 플래너.
 * Liang-Barsky 클리핑으로 지정된 직사각형 영역 내부에 정확히 재단된 해칭 획과 입·발필 필압 테이퍼를 생성한다.
 */
export function planNaturalMediaCrossHatch(
  bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  config: NaturalMediaHatchConfig,
): ReadonlyArray<NaturalMediaHatchPass> {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return Object.freeze([]);
  }

  const baseSpacing = Math.max(
    2,
    Math.min(100, Number.isFinite(config.spacingPx) ? config.spacingPx : 8),
  );
  const baseAngle = ((Number.isFinite(config.angleDeg) ? config.angleDeg : 45) % 180 + 180) % 180;
  const tone = Math.max(0, Math.min(1, Number.isFinite(config.toneValue01) ? (config.toneValue01 ?? 0.35) : 0.35));
  const passCount: 1 | 2 | 3 =
    config.crossPasses ?? (tone >= 0.7 ? 3 : tone >= 0.42 ? 2 : 1);
  const spreadDeg = Number.isFinite(config.crossAngleSpreadDeg)
    ? (config.crossAngleSpreadDeg ?? 55)
    : 55;
  const jitter01 = Math.max(
    0,
    Math.min(1, Number.isFinite(config.handJitter01) ? (config.handJitter01 ?? 0.15) : 0.15),
  );
  const seed = Math.floor(Number.isFinite(config.seed) ? (config.seed ?? 42) : 42);

  const cx = bounds.x + bounds.width * 0.5;
  const cy = bounds.y + bounds.height * 0.5;
  const halfDiag = Math.hypot(bounds.width, bounds.height) * 0.52;
  const xMin = bounds.x;
  const yMin = bounds.y;
  const xMax = bounds.x + bounds.width;
  const yMax = bounds.y + bounds.height;

  const passes: NaturalMediaHatchPass[] = [];
  for (let pIdx = 0; pIdx < passCount; pIdx += 1) {
    const passAngle = (baseAngle + pIdx * spreadDeg) % 180;
    const rad = (passAngle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const nx = -dy;
    const ny = dx;

    const passSpacing = Math.max(2, baseSpacing * (1 + pIdx * 0.12));
    const steps = Math.min(256, Math.floor((halfDiag * 2) / passSpacing));
    const lines: NaturalMediaHatchLine[] = [];

    for (let s = -steps; s <= steps; s += 1) {
      const offset = s * passSpacing;
      const ox = cx + nx * offset;
      const oy = cy + ny * offset;
      const clipped = clipInfiniteLineToRect(ox, oy, dx, dy, xMin, yMin, xMax, yMax);
      if (!clipped) continue;
      const [x0, y0, x1, y1] = clipped;
      if (Math.hypot(x1 - x0, y1 - y0) < 1) continue;

      const j0 = (hashHatch(s, pIdx * 2, seed) - 0.5) * passSpacing * 0.35 * jitter01;
      const j1 = (hashHatch(s, pIdx * 2 + 1, seed) - 0.5) * passSpacing * 0.35 * jitter01;
      const pVar = (hashHatch(s + 99, pIdx, seed) - 0.5) * 0.12;
      const midPressure = Math.max(0.2, Math.min(0.95, 0.45 + tone * 0.4 + pVar));

      lines.push({
        x0: Math.round((x0 + nx * j0) * 100) / 100,
        y0: Math.round((y0 + ny * j0) * 100) / 100,
        x1: Math.round((x1 + nx * j1) * 100) / 100,
        y1: Math.round((y1 + ny * j1) * 100) / 100,
        entryPressure: Math.round(midPressure * 0.38 * 1000) / 1000,
        midPressure: Math.round(midPressure * 1000) / 1000,
        exitPressure: Math.round(midPressure * 0.32 * 1000) / 1000,
      });
    }

    passes.push({
      passIndex: pIdx,
      angleDeg: Math.round(passAngle * 100) / 100,
      spacingPx: Math.round(passSpacing * 100) / 100,
      lines: Object.freeze(lines),
    });
  }

  return Object.freeze(passes);
}
