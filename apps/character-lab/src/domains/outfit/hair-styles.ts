/**
 * 헤어 스타일 스펙 7종(스펙 §5.4 HAIR_STYLE_SPECS): Blender kit HairStyle 6 + twin-tail(절차 전용).
 * 앞·옆·뒷머리·정수리·묶음 구역별 앵커 배치(두피 구면 좌표)·카드/스트랜드 번들 선택·체인 여부를 데이터로 둔다.
 * 길이·폭은 머리 반경 배수이며 각도는 도(°)다. 생성 자체는 hair-builder.ts가 한다.
 */
import { SLOT_PRESET_IDS } from "../../contracts";

import type { HairStyleId } from "../../contracts";

export type HairZoneKind = "card" | "bundle";

export interface HairZoneSpec {
  readonly id: string;
  readonly kind: HairZoneKind;
  /** 방위각 범위(°). 0 = 앞, 90 = +X(캐릭터 왼쪽), 180 = 뒤 */
  readonly azimuthStart: number;
  readonly azimuthEnd: number;
  /** 고도각(°). 0 = 정수리, 90 = 적도 */
  readonly elevation: number;
  readonly count: number;
  /** 길이(머리 반경 배수) */
  readonly length: number;
  /** 카드 폭 또는 번들 반경(머리 반경 배수) */
  readonly width: number;
  /** 세그먼트 수(입자 수 = segments + 1 ≤ 16) */
  readonly segments: number;
  /** 늘어짐 0..1(끝으로 갈수록 중력 방향으로) */
  readonly droop: number;
  /** 바깥 벌어짐(머리 반경 배수, 끝에서) */
  readonly flare: number;
  /** 끝으로 가는 비틀림 각(°) */
  readonly curl: number;
  /** 결정적 흔들림(길이·방위 비율 0..1) */
  readonly jitter: number;
  /** 체인(물리) 생성 여부 */
  readonly chain: boolean;
  /** 체인 파라미터 덮어쓰기(VRMC_springBone 호환) */
  readonly spring?: { readonly stiffness?: number; readonly damping?: number; readonly gravityScale?: number };
  /** 번들: 모든 스트랜드가 모이는 묶음점(두피 구면 좌표) */
  readonly gather?: { readonly azimuth: number; readonly elevation: number };
}

export interface HairSpec {
  readonly id: HairStyleId;
  readonly labelKo: string;
  /** Blender kit HairStyle과 동일 id */
  readonly blenderKit: boolean;
  /** 캡(두피 덮개) 헤어라인 고도각(°): 앞·뒤 */
  readonly cap: { readonly frontHairline: number; readonly backHairline: number };
  readonly zones: readonly HairZoneSpec[];
}

const BASE_ZONE: Omit<HairZoneSpec, "id" | "kind" | "azimuthStart" | "azimuthEnd" | "elevation" | "count" | "length"> = {
  width: 0.28,
  segments: 3,
  droop: 0.55,
  flare: 0.05,
  curl: 0,
  jitter: 0.08,
  chain: false,
};

function zone(partial: Partial<HairZoneSpec> & Pick<HairZoneSpec, "id" | "azimuthStart" | "azimuthEnd" | "elevation" | "count" | "length">): HairZoneSpec {
  return { ...BASE_ZONE, kind: "card", ...partial };
}

const FRINGE = (count = 10, length = 0.64, extra: Partial<HairZoneSpec> = {}): HairZoneSpec =>
  zone({
    id: "fringe",
    azimuthStart: -44,
    azimuthEnd: 44,
    elevation: 58,
    count,
    length,
    width: 0.18,
    segments: 5,
    droop: 0.66,
    flare: 0.08,
    jitter: 0.1,
    ...extra,
  });

/** 한국 웹툰 시스루·사이드뱅 보조 레이어(이마 위 입체 볼륨 가닥) */
const FRINGE_WISPS = (count = 5, length = 0.52, extra: Partial<HairZoneSpec> = {}): HairZoneSpec =>
  zone({
    id: "fringe-wisps",
    azimuthStart: -34,
    azimuthEnd: 34,
    elevation: 46,
    count,
    length,
    width: 0.14,
    segments: 4,
    droop: 0.58,
    flare: 0.14,
    curl: 8,
    jitter: 0.12,
    ...extra,
  });

/** 얼굴 윤곽(광대·V턱선)을 감싸는 페이스프레이밍 애교머리·옆머리 레이어 */
const FACE_FRAME = (side: "left" | "right", count = 3, length = 1.25, extra: Partial<HairZoneSpec> = {}): HairZoneSpec =>
  zone({
    id: side === "left" ? "face-frame-left" : "face-frame-right",
    azimuthStart: side === "left" ? 36 : 302,
    azimuthEnd: side === "left" ? 58 : 324,
    elevation: 62,
    count,
    length,
    width: 0.17,
    segments: 6,
    droop: 0.84,
    flare: 0.09,
    curl: side === "left" ? -12 : 12,
    jitter: 0.08,
    ...extra,
  });

const CROWN = (count = 10, length = 0.62, extra: Partial<HairZoneSpec> = {}): HairZoneSpec =>
  zone({
    id: "crown",
    azimuthStart: 0,
    azimuthEnd: 360,
    elevation: 20,
    count,
    length,
    width: 0.26,
    segments: 4,
    droop: 0.42,
    flare: 0.15,
    ...extra,
  });

const SIDE = (side: "left" | "right", count: number, length: number, extra: Partial<HairZoneSpec> = {}): HairZoneSpec =>
  zone({
    id: side === "left" ? "side-left" : "side-right",
    azimuthStart: side === "left" ? 52 : 222,
    azimuthEnd: side === "left" ? 138 : 308,
    elevation: 60,
    count,
    length,
    width: 0.25,
    flare: 0.09,
    ...extra,
  });

const BACK = (count: number, length: number, extra: Partial<HairZoneSpec> = {}): HairZoneSpec =>
  zone({
    id: "back",
    azimuthStart: 136,
    azimuthEnd: 224,
    elevation: 52,
    count,
    length,
    width: 0.27,
    flare: 0.1,
    ...extra,
  });

/** 뒤통수 볼륨을 띄워 납작한 뚜껑 실루엣을 없애는 아우터 레이어 */
const BACK_VOLUME = (count: number, length: number, extra: Partial<HairZoneSpec> = {}): HairZoneSpec =>
  zone({
    id: "back-volume",
    azimuthStart: 120,
    azimuthEnd: 240,
    elevation: 36,
    count,
    length,
    width: 0.24,
    segments: 5,
    droop: 0.64,
    flare: 0.18,
    ...extra,
  });

export const HAIR_STYLE_SPECS: Readonly<Record<HairStyleId, HairSpec>> = {
  "short-layered": {
    id: "short-layered",
    labelKo: "숏 레이어드",
    blenderKit: true,
    cap: { frontHairline: 64, backHairline: 100 },
    zones: [
      FRINGE(9, 0.62, { segments: 4, width: 0.17, droop: 0.58, curl: 10 }),
      FRINGE_WISPS(5, 0.5, { flare: 0.16, curl: 12 }),
      FACE_FRAME("left", 2, 0.82, { segments: 4, droop: 0.72 }),
      FACE_FRAME("right", 2, 0.82, { segments: 4, droop: 0.72 }),
      CROWN(12, 0.62, { flare: 0.16 }),
      SIDE("left", 6, 0.74, { elevation: 64, segments: 4, droop: 0.64, width: 0.22 }),
      SIDE("right", 6, 0.74, { elevation: 64, segments: 4, droop: 0.64, width: 0.22 }),
      BACK_VOLUME(7, 0.82, { flare: 0.18 }),
      BACK(9, 0.9, { elevation: 58, segments: 5, droop: 0.72, width: 0.24, chain: true }),
    ],
  },
  "soft-bob": {
    id: "soft-bob",
    labelKo: "소프트 보브",
    blenderKit: true,
    cap: { frontHairline: 64, backHairline: 100 },
    zones: [
      FRINGE(10, 0.68, { width: 0.16, droop: 0.64 }),
      FRINGE_WISPS(5, 0.54, { width: 0.13 }),
      FACE_FRAME("left", 3, 1.32, { segments: 6, droop: 0.84, curl: -14 }),
      FACE_FRAME("right", 3, 1.32, { segments: 6, droop: 0.84, curl: 14 }),
      CROWN(10, 0.64, { flare: 0.15 }),
      SIDE("left", 7, 1.48, { elevation: 58, segments: 6, droop: 0.82, width: 0.26, flare: 0.1, curl: -8, chain: true }),
      SIDE("right", 7, 1.48, { elevation: 58, segments: 6, droop: 0.82, width: 0.26, flare: 0.1, curl: 8, chain: true }),
      BACK_VOLUME(8, 1.28, { flare: 0.18 }),
      BACK(10, 1.52, { segments: 6, droop: 0.86, width: 0.27, chain: true }),
    ],
  },
  "romance-long": {
    id: "romance-long",
    labelKo: "로맨스 롱",
    blenderKit: true,
    cap: { frontHairline: 64, backHairline: 100 },
    zones: [
      FRINGE(10, 0.66, { width: 0.16, curl: 10 }),
      FRINGE_WISPS(6, 0.55, { width: 0.13, flare: 0.16 }),
      FACE_FRAME("left", 3, 1.65, { segments: 7, droop: 0.86, curl: -16 }),
      FACE_FRAME("right", 3, 1.65, { segments: 7, droop: 0.86, curl: 16 }),
      CROWN(10, 0.66, { flare: 0.16 }),
      SIDE("left", 8, 3.25, { elevation: 58, segments: 10, droop: 0.9, width: 0.27, flare: 0.12, curl: 28, chain: true, spring: { damping: 0.45 } }),
      SIDE("right", 8, 3.25, { elevation: 58, segments: 10, droop: 0.9, width: 0.27, flare: 0.12, curl: 28, chain: true, spring: { damping: 0.45 } }),
      BACK_VOLUME(9, 2.15, { segments: 6, flare: 0.2, curl: 18 }),
      BACK(12, 3.45, { elevation: 48, segments: 10, droop: 0.92, width: 0.28, flare: 0.12, curl: 22, chain: true, spring: { damping: 0.45 } }),
    ],
  },
  "action-pony": {
    id: "action-pony",
    labelKo: "액션 포니",
    blenderKit: true,
    cap: { frontHairline: 64, backHairline: 100 },
    zones: [
      FRINGE(9, 0.62, { segments: 4, width: 0.16, curl: 12 }),
      FRINGE_WISPS(5, 0.5, { width: 0.13, flare: 0.16 }),
      FACE_FRAME("left", 3, 1.35, { segments: 6, droop: 0.82, curl: -14 }),
      FACE_FRAME("right", 3, 1.35, { segments: 6, droop: 0.82, curl: 14 }),
      CROWN(10, 0.64, { droop: 0.28, flare: 0.08 }),
      SIDE("left", 6, 0.68, { elevation: 62, width: 0.22 }),
      SIDE("right", 6, 0.68, { elevation: 62, width: 0.22 }),
      BACK(8, 0.84, { droop: 0.42, flare: 0.04 }),
      zone({
        id: "ponytail",
        kind: "bundle",
        azimuthStart: 0,
        azimuthEnd: 360,
        elevation: 48,
        count: 6,
        length: 2.75,
        width: 0.145,
        segments: 9,
        droop: 0.84,
        flare: 0.14,
        curl: 14,
        jitter: 0.06,
        chain: true,
        spring: { stiffness: 0.8, damping: 0.4, gravityScale: 0.08 },
        gather: { azimuth: 180, elevation: 48 },
      }),
    ],
  },
  "hime-cut": {
    id: "hime-cut",
    labelKo: "히메 컷",
    blenderKit: true,
    cap: { frontHairline: 62, backHairline: 100 },
    zones: [
      FRINGE(11, 0.7, { azimuthStart: -48, azimuthEnd: 48, width: 0.19, droop: 0.68, flare: 0.04, jitter: 0.02 }),
      FRINGE_WISPS(5, 0.58, { width: 0.15, flare: 0.09, jitter: 0.02 }),
      CROWN(10, 0.62, { flare: 0.13 }),
      zone({ id: "hime-left", azimuthStart: 62, azimuthEnd: 96, elevation: 74, count: 4, length: 1.56, width: 0.25, segments: 7, droop: 0.94, flare: 0.04, jitter: 0.02, chain: true }),
      zone({ id: "hime-right", azimuthStart: 264, azimuthEnd: 298, elevation: 74, count: 4, length: 1.56, width: 0.25, segments: 7, droop: 0.94, flare: 0.04, jitter: 0.02, chain: true }),
      BACK_VOLUME(8, 2.2, { segments: 6, flare: 0.15 }),
      BACK(12, 3.45, { azimuthStart: 128, azimuthEnd: 232, elevation: 48, segments: 10, droop: 0.92, width: 0.28, chain: true, spring: { damping: 0.45 } }),
    ],
  },
  "wolf-layered": {
    id: "wolf-layered",
    labelKo: "울프 레이어드",
    blenderKit: true,
    cap: { frontHairline: 64, backHairline: 100 },
    zones: [
      FRINGE(10, 0.66, { width: 0.16, curl: 16, flare: 0.12, droop: 0.58 }),
      FRINGE_WISPS(6, 0.54, { width: 0.13, curl: 18, flare: 0.18 }),
      FACE_FRAME("left", 3, 1.38, { segments: 6, droop: 0.78, flare: 0.14, curl: -18 }),
      FACE_FRAME("right", 3, 1.38, { segments: 6, droop: 0.78, flare: 0.14, curl: 18 }),
      zone({ id: "top-layer", azimuthStart: 0, azimuthEnd: 360, elevation: 28, count: 14, length: 0.82, width: 0.22, segments: 5, droop: 0.46, flare: 0.2, curl: 22 }),
      zone({ id: "mid-layer", azimuthStart: 32, azimuthEnd: 328, elevation: 58, count: 12, length: 1.38, width: 0.24, segments: 6, droop: 0.66, flare: 0.24, curl: 26, chain: true }),
      zone({ id: "bottom-long", azimuthStart: 118, azimuthEnd: 242, elevation: 76, count: 9, length: 2.5, width: 0.26, segments: 8, droop: 0.85, flare: 0.18, curl: 18, chain: true }),
    ],
  },
  "twin-tail": {
    id: "twin-tail",
    labelKo: "트윈 테일",
    blenderKit: false,
    cap: { frontHairline: 64, backHairline: 100 },
    zones: [
      FRINGE(10, 0.66, { width: 0.16 }),
      FRINGE_WISPS(5, 0.52, { width: 0.13 }),
      FACE_FRAME("left", 3, 1.22, { segments: 5, droop: 0.84, curl: -14 }),
      FACE_FRAME("right", 3, 1.22, { segments: 5, droop: 0.84, curl: 14 }),
      CROWN(10, 0.62, { flare: 0.14 }),
      SIDE("left", 6, 0.72, { elevation: 62, width: 0.22 }),
      SIDE("right", 6, 0.72, { elevation: 62, width: 0.22 }),
      BACK(8, 0.82, { droop: 0.6, flare: 0.08 }),
      zone({
        id: "tail-left",
        kind: "bundle",
        azimuthStart: 0,
        azimuthEnd: 360,
        elevation: 48,
        count: 4,
        length: 2.85,
        width: 0.13,
        segments: 9,
        droop: 0.88,
        flare: 0.11,
        curl: 14,
        jitter: 0.05,
        chain: true,
        spring: { stiffness: 0.8, damping: 0.4, gravityScale: 0.08 },
        gather: { azimuth: 115, elevation: 48 },
      }),
      zone({
        id: "tail-right",
        kind: "bundle",
        azimuthStart: 0,
        azimuthEnd: 360,
        elevation: 48,
        count: 4,
        length: 2.85,
        width: 0.13,
        segments: 9,
        droop: 0.88,
        flare: 0.11,
        curl: 14,
        jitter: 0.05,
        chain: true,
        spring: { stiffness: 0.8, damping: 0.4, gravityScale: 0.08 },
        gather: { azimuth: 245, elevation: 48 },
      }),
    ],
  },
};

export const HAIR_STYLE_IDS: readonly HairStyleId[] = SLOT_PRESET_IDS.hair;

/** 스펙의 체인 수·입자 수(예산 검증용) */
export function hairChainBudget(spec: HairSpec): { chains: number; particles: number } {
  let chains = 0;
  let particles = 0;
  for (const z of spec.zones) {
    if (!z.chain) continue;
    chains += z.count;
    particles += z.count * (z.segments + 1);
  }
  return { chains, particles };
}
