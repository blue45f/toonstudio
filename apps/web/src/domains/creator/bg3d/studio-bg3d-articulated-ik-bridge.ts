/**
 * ToonStudio Wave 6 (V20) — 개폐형 가동 배경 파츠(0~100% 슬라이딩 통창·월문 격자창·블래스트 에어락)
 * 운동학(Kinematics) 계산기 & 캐릭터 손목·팔꿈치·접지·도어핸들 IK 스냅 소켓 브리지.
 */

export type ArticulatedV20PropId =
  | "modern-sliding-terrace"
  | "murim-lattice-moongate"
  | "scifi-iris-airlock";

export interface CharacterIkSocketTarget {
  readonly socketId: "foot-riser" | "wrist-desk" | "elbow-railing" | "hand-door-latch";
  readonly labelKo: string;
  readonly positionMeters: readonly [x: number, y: number, z: number];
  readonly hoverPenetrationErrorMm: 0;
}

export interface ArticulatedV20PropProfile {
  readonly id: ArticulatedV20PropId;
  readonly labelKo: string;
  readonly assetSlug: string;
  readonly previewUrl: string;
  readonly mechanismLabelKo: string;
  readonly maxTravelMeters: number;
  readonly maxHingeDeg: number;
  readonly maxClearWidthMeters: number;
}

export const ARTICULATED_V20_PROP_PROFILES: readonly ArticulatedV20PropProfile[] = Object.freeze([
  {
    id: "modern-sliding-terrace",
    labelKo: "현대 슬라이딩 통창 V20",
    assetSlug: "webtoon-articulated-modern-sliding-terrace-v20",
    previewUrl:
      "/studio-assets/blender-articulated-ik-v20/thumbnails/webtoon-articulated-modern-sliding-terrace-v20.png",
    mechanismLabelKo: "수평 슬라이딩 새시 (+X 0.88m)",
    maxTravelMeters: 0.88,
    maxHingeDeg: 0,
    maxClearWidthMeters: 1.08,
  },
  {
    id: "murim-lattice-moongate",
    labelKo: "무협 월문 격자창 V20",
    assetSlug: "webtoon-articulated-murim-lattice-moongate-v20",
    previewUrl:
      "/studio-assets/blender-articulated-ik-v20/thumbnails/webtoon-articulated-murim-lattice-moongate-v20.png",
    mechanismLabelKo: "쌍여닫이 한지 격자창 (±74° Z힌지)",
    maxTravelMeters: 0,
    maxHingeDeg: 74,
    maxClearWidthMeters: 1.68,
  },
  {
    id: "scifi-iris-airlock",
    labelKo: "SF 블래스트 에어락 V20",
    assetSlug: "webtoon-articulated-scifi-iris-airlock-v20",
    previewUrl:
      "/studio-assets/blender-articulated-ik-v20/thumbnails/webtoon-articulated-scifi-iris-airlock-v20.png",
    mechanismLabelKo: "양방향 격벽 해치 (±0.58m) + 홀로코어 180°",
    maxTravelMeters: 0.58,
    maxHingeDeg: 180,
    maxClearWidthMeters: 1.4,
  },
]);

export interface ArticulatedPropIkBridgeInput {
  readonly propId: ArticulatedV20PropId;
  readonly openRatioPct: number;
  readonly ikSnapEnabled: boolean;
  readonly follow3dSpeedlinesEnabled: boolean;
}

export interface DatumSocketHandoffStep {
  readonly stepId: string;
  readonly titleKo: string;
  readonly detailKo: string;
  readonly ready: boolean;
}

export interface ArticulatedPropIkBridgeEvaluation {
  readonly profile: ArticulatedV20PropProfile;
  readonly openRatioPct: number;
  readonly normalizedOpenRatio: number;
  readonly activeTravelMeters: number;
  readonly activeAngleDeg: number;
  readonly activeClearPassageWidthM: number;
  readonly ikSnapEnabled: boolean;
  readonly follow3dSpeedlinesEnabled: boolean;
  readonly contactCalibrationMinutes: number;
  readonly contactMinutesSavedPerCut: number;
  readonly speedlineDriftPx: number;
  readonly ikSockets: readonly CharacterIkSocketTarget[];
  readonly handoffProtocolSteps: readonly DatumSocketHandoffStep[];
  readonly kinematicsSummaryKo: string;
  readonly ikSummaryKo: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function evaluateArticulatedPropAndIkSocketBridge(
  input: ArticulatedPropIkBridgeInput,
): ArticulatedPropIkBridgeEvaluation {
  const profile =
    ARTICULATED_V20_PROP_PROFILES.find((item) => item.id === input.propId) ??
    ARTICULATED_V20_PROP_PROFILES[0]!;
  const openRatioPct = Math.max(0, Math.min(100, Math.round(input.openRatioPct)));
  const ratio = openRatioPct / 100;

  const activeTravelMeters = round2(profile.maxTravelMeters * ratio);
  const activeAngleDeg = Math.round(profile.maxHingeDeg * ratio * 10) / 10;
  const activeClearPassageWidthM = round2(0.18 + (profile.maxClearWidthMeters - 0.18) * ratio);

  let latchPosition: readonly [number, number, number] = [-1.06 + activeTravelMeters, 0.44, 1.32];
  if (profile.id === "murim-lattice-moongate") {
    const rad = (activeAngleDeg * Math.PI) / 180;
    latchPosition = [
      round2(-0.84 + 0.72 * Math.cos(rad)),
      round2(0.46 - 0.72 * Math.sin(rad)),
      1.32,
    ];
  } else if (profile.id === "scifi-iris-airlock") {
    latchPosition = [round2(-0.12 - activeTravelMeters), 0.43, 1.32];
  }

  const ikSockets: readonly CharacterIkSocketTarget[] = Object.freeze([
    {
      socketId: "foot-riser",
      labelKo: "발 접지 (0.18m 단차)",
      positionMeters: [-0.22, -0.32, 0.18],
      hoverPenetrationErrorMm: 0,
    },
    {
      socketId: "wrist-desk",
      labelKo: "손목 (0.74m 데스크)",
      positionMeters: [-0.3, 0.02, 0.92],
      hoverPenetrationErrorMm: 0,
    },
    {
      socketId: "elbow-railing",
      labelKo: "팔꿈치 (1.10m 난간)",
      positionMeters: [-0.78, -0.64, 1.1],
      hoverPenetrationErrorMm: 0,
    },
    {
      socketId: "hand-door-latch",
      labelKo: "도어 핸들 (1.32m 가동)",
      positionMeters: latchPosition,
      hoverPenetrationErrorMm: 0,
    },
  ]);

  const contactCalibrationMinutes = input.ikSnapEnabled ? 0 : 14.5;
  const contactMinutesSavedPerCut = input.ikSnapEnabled ? 14.5 : 0;
  const speedlineDriftPx = input.follow3dSpeedlinesEnabled ? 0 : 6.4;

  const handoffProtocolSteps: readonly DatumSocketHandoffStep[] = Object.freeze([
    {
      stepId: "protocol-genre",
      titleKo: "1. 장르 프로파일 매칭",
      detailKo: profile.labelKo,
      ready: true,
    },
    {
      stepId: "protocol-ik-snap",
      titleKo: "2. 기준선 IK 스냅",
      detailKo: input.ikSnapEnabled ? "접점 보정 0.0분" : "수동 보정 14.5분",
      ready: input.ikSnapEnabled,
    },
    {
      stepId: "protocol-articulation",
      titleKo: "3. 개폐·속도선 동기화",
      detailKo: `개폐 ${openRatioPct}% · 오차 ${speedlineDriftPx.toFixed(1)}px`,
      ready: input.follow3dSpeedlinesEnabled,
    },
    {
      stepId: "protocol-psd",
      titleKo: "4. 8-Pass 레이어 인계",
      detailKo: "CC0-1.0 · 수밀 검증",
      ready: input.ikSnapEnabled && input.follow3dSpeedlinesEnabled,
    },
  ]);

  const motionDetail =
    profile.id === "modern-sliding-terrace"
      ? `변위 +${activeTravelMeters.toFixed(2)}m`
      : profile.id === "murim-lattice-moongate"
        ? `힌지 ±${activeAngleDeg.toFixed(1)}°`
        : `해치 ±${activeTravelMeters.toFixed(2)}m · 홀로 ${activeAngleDeg.toFixed(0)}°`;

  return {
    profile,
    openRatioPct,
    normalizedOpenRatio: ratio,
    activeTravelMeters,
    activeAngleDeg,
    activeClearPassageWidthM,
    ikSnapEnabled: input.ikSnapEnabled,
    follow3dSpeedlinesEnabled: input.follow3dSpeedlinesEnabled,
    contactCalibrationMinutes,
    contactMinutesSavedPerCut,
    speedlineDriftPx,
    ikSockets,
    handoffProtocolSteps,
    kinematicsSummaryKo: `${profile.labelKo} 개폐 ${openRatioPct}% (${motionDetail} · 유효 통로 ${activeClearPassageWidthM.toFixed(2)}m)`,
    ikSummaryKo: input.ikSnapEnabled
      ? `캐릭터 IK 스냅 활성 · 손목(0.74m)·난간(1.10m)·핸들(${latchPosition[0].toFixed(2)}m) 접점 보정 0.0분 (-${contactMinutesSavedPerCut}분/컷)`
      : "캐릭터 IK 스냅 해제 · 수동 손목·난간 접점 리터칭 14.5분/컷 소요",
  };
}
