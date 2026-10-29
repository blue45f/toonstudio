/**
 * 젖은 종이 정착 베이크(wet-paper settled bake v1) — 레인 프로그램 표와 설정 정규화.
 *
 * 제품 수채/수묵 레인 중 `wetPaperBakeProgramId`를 핀한 레인만 정착(settled) 시점에 종이 위 물·안료
 * 시뮬레이션을 굽는다. 시뮬레이션은 세 갈래 논문 개념을 이 저장소에서 독립 재구현한 것이다.
 * - Chu & Tai, "MoXi: Real-Time Ink Dispersion in Absorbent Paper", SIGGRAPH 2005:
 *   흐름층 D2Q9 격자 볼츠만, 섬유 투과율에 따른 다공성 부분 bounce-back, 젖음 전선 고정(pinning).
 * - Curtis et al., "Computer-Generated Watercolor", SIGGRAPH 1997: 표면·흐름·모세관 3층 물,
 *   흡수(seep)·증발·가장자리 증발로 인한 가장자리 짙어짐, 모세관 흐름 백런, 안료 흡착·탈착·고정.
 * - Chu & Tai, "Real-Time Painting with an Expressive Virtual Chinese Brush", IEEE CG&A 2004:
 *   마르는 붓의 강모 줄무늬(갈필) 마스크. 강모 지도 생성과 문턱 수식은 Sumi(MIT)에서 이식했다
 *   (`third_party/sumi/README.md`, `studio-wet-paper-bristle.ts`).
 *
 * 이 파일은 정적 import 비용이 작은 "표"만 둔다. 무거운 솔버는 `studio-wet-paper-solver.ts`이고
 * Canvas 경로는 사용자 의도(해당 레인으로 그린 획의 정착) 시점에만 동적 import 한다.
 */

import { clampNumber, finiteOr } from "./studio-wet-paper-math";

import type { StudioPaperPresetIdV1 } from "../studio-paper-media-profile-v1";

export const STUDIO_WET_PAPER_BAKE_VERSION = "studio-wet-paper-bake-v1" as const;

export type StudioWetPaperBakeProgramId =
  | "moxi-sumi-dispersion"
  | "curtis-watercolor-backrun"
  | "curtis-granulating-wash"
  | "chu-tai-dry-brush";

export type StudioWetPaperBakePhase = "live" | "settled";

/** 안료 한 종(種)의 물성. 한 베이크는 같은 색의 안료 두 종(굵은 입자 + 고운 염료)까지 섞는다. */
export interface StudioWetPaperPigmentProgram {
  /** dab 안료 중 이 종이 차지하는 비율 0..1(두 종의 합은 정규화 때 1로 맞춘다). */
  readonly share: number;
  /** 이동도 λ 0..1: 물 흐름 대비 안료가 따라가는 비율(1 미만이면 물보다 늦어 옅은 후광이 생긴다). */
  readonly mobility: number;
  /** 입자 침전(그래뉼레이션) 0..1: 종이 골에 더 빨리 가라앉고 골 쪽으로 미끄러진다. */
  readonly granulation: number;
  /** 착색(staining) 0..1: 침착분 중 즉시 섬유에 고정돼 다시 들리지 않는 비율. */
  readonly staining: number;
  /** 흡착률(스텝당 부유 안료 → 침착 비율) 0..0.4. */
  readonly settleRate: number;
  /** 탈착률(젖은 곳의 침착 안료가 다시 떠오르는 비율) 0..0.2. */
  readonly liftRate: number;
}

/** 종이 결(섬유·요철). 요철 높이는 제품 종이 프리셋 샘플러를 문서 좌표 고정으로 그대로 쓴다. */
export interface StudioWetPaperSheetProgram {
  readonly heightPresetId: StudioPaperPresetIdV1;
  /** 종이 낱장 시드(획 시드와 무관 — 같은 레인의 모든 획이 같은 종이를 본다). */
  readonly seed: number;
  /** 섬유 길이·폭(문서 px). */
  readonly fiberLengthPx: number;
  readonly fiberWidthPx: number;
  /** 섬유 밀도 0..1(섬유 줄무늬가 보이는 비율). */
  readonly fiberDensity: number;
  /** MoXi 부분 bounce-back 기준 차단 계수 k0 0..0.9. */
  readonly fiberBlocking: number;
  /** 섬유 방향 이방성 0..1(섬유 방향 링크는 덜, 가로 링크는 더 막는다). */
  readonly fiberAnisotropy: number;
  /** 섬유 줄무늬 투과 변동 0..1(갈라짐·가지치기). */
  readonly fiberRoughness: number;
  /** 흡수율 0..1. */
  readonly absorbency: number;
}

export interface StudioWetPaperBakeProgram {
  readonly sheet: StudioWetPaperSheetProgram;
  /** 고정 솔버 스텝 수(잔차 기반 종료 없음). */
  readonly steps: number;
  /** dab을 획 순서대로 내려놓는 데 쓰는 스텝 비율(뒤쪽 획이 앞쪽 획을 다시 적실 수 있다). */
  readonly depositFraction: number;
  /** core dab 중심의 표면 물 목표치. */
  readonly coreWater: number;
  /** diffuse dab(물 번짐 후광) 중심의 표면 물 목표치. */
  readonly haloWater: number;
  /** 획 끝에 고이는 물(붓을 뗄 때의 물웅덩이 — 마르는 획으로 번지며 백런을 만든다). */
  readonly endPoolWater: number;
  /** 물웅덩이를 내려놓는 시점(전체 스텝 대비 0..1). */
  readonly endPoolAt: number;
  /** dab 광학 밀도 배율. */
  readonly pigmentLoad: number;
  /** diffuse dab(번짐 후광)이 싣는 안료 비율(물 위주 dab이라 낮다). */
  readonly haloPigment: number;
  /** 젖음 전선 고정(pinning) 세기 0..1. */
  readonly pinning: number;
  /** 표면 장력 0..1: 얇은 물막 링크의 투과 비선형성. */
  readonly surfaceTension: number;
  /** 표면 → 종이 흡수율(스텝당) 0..0.5. */
  readonly seepRate: number;
  /** 흡수된 물 중 모세관층으로 가는 비율 β 0..1(나머지는 흐름층). */
  readonly seepSplit: number;
  /** 모세관층 확산 계수 0..0.25. */
  readonly capillaryDiffusion: number;
  /** 모세관 확산이 켜지는 포화 문턱(용량 대비) 0..1. */
  readonly capillaryThreshold: number;
  /** 모세관 흡입 가속(덜 젖은 종이 쪽으로 흐름층을 당긴다) 0..0.2. */
  readonly capillaryForce: number;
  /** 표면 증발(스텝당 절대량) 0..0.05. */
  readonly evaporation: number;
  /** 건조 가속 시작(전체 스텝 대비 0..1)과 세기(증발 배율 증가분) — 정착 = 마른 상태로 끝나게 한다. */
  readonly dryRampStart: number;
  readonly dryRampGain: number;
  /** 가장자리 짙어짐 0..2: 젖음 전선 증발 가중·바깥 흐름·안료 가장자리 이동. */
  readonly edgeDarkening: number;
  /** 경화 뒤에도 다시 들릴 수 있는 침착 비율 0..1(수묵 0: 아교가 굳히면 끝). */
  readonly rewet: number;
  /** 마른 뒤 경화까지의 스텝 수. */
  readonly cureSteps: number;
  readonly pigments: readonly [StudioWetPaperPigmentProgram, StudioWetPaperPigmentProgram];
  /** 갈필(Chu & Tai 강모 마스크) 세기 0..1. 0이면 끈다. */
  readonly dryBrush: number;
  /** 붓이 마르는 거리(붓 폭의 배수). */
  readonly dryLengthWidths: number;
  /**
   * core dab 평균 지름을 가로지르는 목표 셀 수(격자 해상도). 번지는 레인은 10이면 충분하고, 갈필은 강모
   * 줄무늬가 셀보다 가늘어 흐려지지 않게 더 촘촘히 푼다. 격자 상한(`STUDIO_WET_PAPER_GRID_LIMITS`)이 우선한다.
   */
  readonly cellsAcross: number;
  /** Beer–Lambert 합성: 흰 종이 위에서 획 색 그대로 보이는 광학 밀도. */
  readonly referenceDensity: number;
  /** 합성 단계의 고운 종이 결 대비 0..1(격자보다 작은 요철 무늬 — 입자 침전 레인일수록 크다). */
  readonly grainDetail: number;
}

export interface StudioWetPaperBakeSettings {
  /** 획 고정 시드(`watercolorBrushSeedFromKey(element.id)`). 벽시계 값이 아니다. */
  readonly seed: number;
  /** 정착 게이트: `"settled"`가 아니면 베이크하지 않는다(fail-closed). */
  readonly phase: StudioWetPaperBakePhase;
  readonly programId: StudioWetPaperBakeProgramId;
  readonly program: StudioWetPaperBakeProgram;
}

const SUMI_CARBON: StudioWetPaperPigmentProgram = Object.freeze({
  share: 0.65, mobility: 0.25, granulation: 0.12, staining: 0.35, settleRate: 0.08, liftRate: 0.004,
});
const SUMI_GLUE_DYE: StudioWetPaperPigmentProgram = Object.freeze({
  share: 0.35, mobility: 1, granulation: 0, staining: 0.9, settleRate: 0.004, liftRate: 0,
});

/**
 * 네 개의 레인 프로그램.
 * - moxi-sumi-dispersion(수묵 · 먹 번짐): 흡수성 섬유지. 붓 자리의 많은 물이 마른 종이로 번져 나가며 섬유를 따라
 *   빨리, 가로질러 느리게 퍼지고 전선이 고정된다. 탄소 입자(느림·섬유 포집)는 붓 자리 가까이 남고 아교 염료(빠름)가
 *   옅은 번짐 후광과 후광 끝의 진한 선을 만든다. 아교가 굳으면 다시 들리지 않는다. 제품 플래너의 번짐 후광 dab은
 *   쓰지 않는다(haloWater 0) — 후광은 붓 자리 물이 실제로 흘러 나가며 생기고, 셀을 굵게(cellsAcross 7) 풀어
 *   같은 스텝 수로 더 멀리 번진다.
 * - curtis-watercolor-backrun(수채 · 백런): 사이징된 수채지. 흡수가 느려 물이 오래 서 있고, 가장자리 증발이
 *   안료를 테두리로 모으며, 획 끝 물웅덩이가 마르기 시작한 획으로 번져 꽃양배추 백런을 만든다.
 * - curtis-granulating-wash(수채 · 입자 침전): 거친 황목. 무거운 입자 안료가 골에 가라앉고 고운 염료는 고르게
 *   착색된다.
 * - chu-tai-dry-brush(수묵 · 갈필): 물이 적은 붓. 획이 진행할수록 붓이 말라 강모 줄무늬 사이가 비고(비백),
 *   종이 골은 건너뛴다. 물이 적어 번짐은 작다.
 */
export const STUDIO_WET_PAPER_BAKE_PROGRAMS: Readonly<
  Record<StudioWetPaperBakeProgramId, StudioWetPaperBakeProgram>
> = Object.freeze({
  "moxi-sumi-dispersion": Object.freeze({
    sheet: Object.freeze({
      heightPresetId: "watercolor-hot-press", seed: 0x51ad_7e11,
      fiberLengthPx: 70, fiberWidthPx: 4.5, fiberDensity: 0.75,
      fiberBlocking: 0.3, fiberAnisotropy: 0.7, fiberRoughness: 0.65, absorbency: 0.85,
    }),
    steps: 80, depositFraction: 0.3,
    coreWater: 2.2, haloWater: 0, endPoolWater: 0, endPoolAt: 0.4,
    pigmentLoad: 1, haloPigment: 0,
    pinning: 0.35, surfaceTension: 0.35,
    seepRate: 0.22, seepSplit: 0.3, capillaryDiffusion: 0.16, capillaryThreshold: 0.2,
    capillaryForce: 0.04, evaporation: 0.003, dryRampStart: 0.5, dryRampGain: 4, edgeDarkening: 0.8,
    rewet: 0, cureSteps: 6,
    pigments: Object.freeze([SUMI_CARBON, SUMI_GLUE_DYE] as const),
    dryBrush: 0, dryLengthWidths: 8, cellsAcross: 7,
    referenceDensity: 0.95, grainDetail: 0.1,
  }),
  "curtis-watercolor-backrun": Object.freeze({
    sheet: Object.freeze({
      heightPresetId: "watercolor-rough", seed: 0x3c0d_9a17,
      fiberLengthPx: 40, fiberWidthPx: 3, fiberDensity: 0.3,
      fiberBlocking: 0.3, fiberAnisotropy: 0.25, fiberRoughness: 0.3, absorbency: 0.45,
    }),
    steps: 64, depositFraction: 0.4,
    coreWater: 1, haloWater: 0.12, endPoolWater: 1.6, endPoolAt: 0.5,
    pigmentLoad: 1, haloPigment: 0.05,
    pinning: 0.7, surfaceTension: 0.2,
    seepRate: 0.08, seepSplit: 0.5, capillaryDiffusion: 0.12, capillaryThreshold: 0.35,
    capillaryForce: 0.05, evaporation: 0.008, dryRampStart: 0.5, dryRampGain: 4, edgeDarkening: 1.6,
    rewet: 0.5, cureSteps: 10,
    pigments: Object.freeze([
      Object.freeze({
        share: 1, mobility: 0.85, granulation: 0.2, staining: 0.25, settleRate: 0.006, liftRate: 0.04,
      }),
      Object.freeze({
        share: 0, mobility: 0.9, granulation: 0, staining: 0.5, settleRate: 0.01, liftRate: 0,
      }),
    ] as const),
    dryBrush: 0, dryLengthWidths: 8, cellsAcross: 10,
    referenceDensity: 0.9, grainDetail: 0.12,
  }),
  "curtis-granulating-wash": Object.freeze({
    sheet: Object.freeze({
      heightPresetId: "watercolor-rough", seed: 0x6a17_ee03,
      fiberLengthPx: 36, fiberWidthPx: 3, fiberDensity: 0.25,
      fiberBlocking: 0.32, fiberAnisotropy: 0.2, fiberRoughness: 0.3, absorbency: 0.5,
    }),
    steps: 60, depositFraction: 0.35,
    coreWater: 1.1, haloWater: 0.15, endPoolWater: 0, endPoolAt: 0.5,
    pigmentLoad: 1.05, haloPigment: 0.05,
    pinning: 0.6, surfaceTension: 0.2,
    seepRate: 0.1, seepSplit: 0.5, capillaryDiffusion: 0.1, capillaryThreshold: 0.35,
    capillaryForce: 0.04, evaporation: 0.007, dryRampStart: 0.5, dryRampGain: 4, edgeDarkening: 0.7,
    rewet: 0.45, cureSteps: 10,
    pigments: Object.freeze([
      Object.freeze({
        share: 0.7, mobility: 0.75, granulation: 0.55, staining: 0.05, settleRate: 0.02, liftRate: 0.05,
      }),
      Object.freeze({
        share: 0.3, mobility: 0.95, granulation: 0.05, staining: 0.9, settleRate: 0.006, liftRate: 0,
      }),
    ] as const),
    dryBrush: 0, dryLengthWidths: 8, cellsAcross: 10,
    referenceDensity: 0.9, grainDetail: 0.45,
  }),
  "chu-tai-dry-brush": Object.freeze({
    sheet: Object.freeze({
      heightPresetId: "watercolor-rough", seed: 0x0d2b_b005,
      fiberLengthPx: 60, fiberWidthPx: 3.5, fiberDensity: 0.5,
      fiberBlocking: 0.45, fiberAnisotropy: 0.6, fiberRoughness: 0.5, absorbency: 0.8,
    }),
    steps: 40, depositFraction: 0.5,
    coreWater: 0.3, haloWater: 0, endPoolWater: 0, endPoolAt: 0.6,
    pigmentLoad: 1.1, haloPigment: 0,
    pinning: 1, surfaceTension: 0.4,
    seepRate: 0.4, seepSplit: 0.8, capillaryDiffusion: 0, capillaryThreshold: 0.5,
    capillaryForce: 0, evaporation: 0.006, dryRampStart: 0.4, dryRampGain: 4, edgeDarkening: 0.35,
    rewet: 0, cureSteps: 4,
    pigments: Object.freeze([
      Object.freeze({ ...SUMI_CARBON, share: 0.9, mobility: 0.45, settleRate: 0.08 }),
      Object.freeze({ ...SUMI_GLUE_DYE, share: 0.1 }),
    ] as const),
    dryBrush: 0.88, dryLengthWidths: 6, cellsAcross: 20,
    referenceDensity: 0.95, grainDetail: 0.25,
  }),
});

export const STUDIO_WET_PAPER_BAKE_PROGRAM_IDS: readonly StudioWetPaperBakeProgramId[] =
  Object.freeze(Object.keys(STUDIO_WET_PAPER_BAKE_PROGRAMS) as StudioWetPaperBakeProgramId[]);

export function isStudioWetPaperBakeProgramId(value: unknown): value is StudioWetPaperBakeProgramId {
  return typeof value === "string" && Object.hasOwn(STUDIO_WET_PAPER_BAKE_PROGRAMS, value);
}

/** 알 수 없는 id는 null — 다른 렌더러로 조용히 수렴하지 않는다(fail-closed). */
export function resolveStudioWetPaperBakeProgram(
  programId: string | null | undefined,
): StudioWetPaperBakeProgram | null {
  return isStudioWetPaperBakeProgramId(programId)
    ? STUDIO_WET_PAPER_BAKE_PROGRAMS[programId]
    : null;
}

/**
 * 고정 반복 상한. 프로그램 표가 바뀌어도 한 베이크가 이 상한을 넘지 못한다(실행 시간 상한의 근거).
 */
export const STUDIO_WET_PAPER_BAKE_LIMITS = Object.freeze({
  maxSteps: 96,
  minSteps: 8,
});

export interface StudioWetPaperBakeSettingsInput {
  readonly seed?: number;
  readonly phase?: string;
  readonly programId?: string | null;
}

/**
 * 설정 정규화. 알 수 없는 phase는 live(베이크 안 함)로, 알 수 없는 프로그램은 null로 fail-closed 한다.
 */
export function normalizeStudioWetPaperBakeSettings(
  input: StudioWetPaperBakeSettingsInput | null | undefined,
): StudioWetPaperBakeSettings | null {
  const source = input ?? {};
  const program = resolveStudioWetPaperBakeProgram(source.programId);
  if (!program || !isStudioWetPaperBakeProgramId(source.programId)) return null;
  return {
    seed: Math.floor(finiteOr(source.seed, 1)) | 0,
    phase: source.phase === "settled" ? "settled" : "live",
    programId: source.programId,
    program,
  };
}

/** 솔버가 실제로 쓰는 스텝 수(상한 적용). */
export function studioWetPaperProgramSteps(program: StudioWetPaperBakeProgram): number {
  return Math.round(clampNumber(
    finiteOr(program.steps, 48),
    STUDIO_WET_PAPER_BAKE_LIMITS.minSteps,
    STUDIO_WET_PAPER_BAKE_LIMITS.maxSteps,
  ));
}
