/**
 * 웹툰 2인 투샷 구도 · 신장차(cm) 눈금자 · 실제 3D 듀오 스테이지(상대역 표정 MorphTarget + 전용 손소품 동시 장착) · 대화 시선 교환(아이컨택) 모듈.
 * 파일명을 소문자 하이픈(`viewport-duo-shot-guide.tsx`)으로 두어 `app/composition.ts` 최상위 패널 규칙을 지킨다.
 */
import { qNormalize } from "../../../shared/math";

import { WEBTOON_HAND_PROPS, findWebtoonHandPropSpec } from "./viewport-hand-prop-controls";

import type {
  BodyParamKey,
  CharacterRecipe,
  DuoPartnerAttachment,
  DuoPartnerExpressionPreset,
  DuoPartnerStance,
  HandPropId,
  LabCommand,
  ParamValues,
  Pose,
  Quat,
  Vec3,
} from "../../../contracts";
import type { CSSProperties } from "react";

export type DuoPartnerSide = "left" | "right";
export type DuoShotDistanceKey = "close" | "talk" | "wide";

export interface ShaperDuoPartnerProfile {
  readonly id: string;
  readonly labelKo: string;
  readonly genreKo: string;
  readonly heightCm: number;
  readonly eyeHeightCm: number;
  readonly accentHex: string;
  readonly contactSheetUrl: string;
}

export const DUO_SHOT_DISTANCES: Readonly<Record<DuoShotDistanceKey, { readonly meters: number; readonly labelKo: string }>> = Object.freeze({
  close: { meters: 0.65, labelKo: "0.65m 밀착 투샷" },
  talk: { meters: 0.95, labelKo: "0.95m 일상 대화" },
  wide: { meters: 1.35, labelKo: "1.35m 전신 대치" },
});

export const DUO_PARTNER_STANCE_LABELS_KO: Readonly<Record<DuoPartnerStance, string>> = Object.freeze({
  conversational: "자연 대화 스탠스",
  "arms-crossed": "팔짱 대치 스탠스",
  attentive: "경청 에스코트 스탠스",
});

export const DUO_PARTNER_EXPRESSION_LABELS_KO: Readonly<Record<DuoPartnerExpressionPreset, string>> = Object.freeze({
  neutral: "상대역 표정 · 기본",
  "warm-smile": "상대역 표정 · 다정 미소",
  "cold-smirk": "상대역 표정 · 냉소 비웃음",
  shocked: "상대역 표정 · 당황 경악",
  "stern-glare": "상대역 표정 · 단호 노려봄",
});

export const SHAPER_DUO_PARTNER_PROFILES: readonly ShaperDuoPartnerProfile[] = Object.freeze([
  {
    id: "shaper-atelier-male-lead",
    labelKo: "판타지 헌터 남주 (185cm)",
    genreKo: "액션 헌터",
    heightCm: 185,
    eyeHeightCm: 173.5,
    accentHex: "#5cebff",
    contactSheetUrl: "/assets/characters/shaper-atelier-male-lead/contact-sheet.png",
  },
  {
    id: "shaper-atelier-protagonist",
    labelKo: "학원 로맨스 여주 (164cm)",
    genreKo: "학원 로맨스",
    heightCm: 164,
    eyeHeightCm: 152.8,
    accentHex: "#f0c978",
    contactSheetUrl: "/assets/characters/shaper-atelier-protagonist/contact-sheet.png",
  },
  {
    id: "shaper-office-ceo",
    labelKo: "현대 오피스 본부장 (184cm)",
    genreKo: "오피스 로맨스",
    heightCm: 184,
    eyeHeightCm: 172.5,
    accentHex: "#8cc6f2",
    contactSheetUrl: "/assets/characters/shaper-office-ceo/contact-sheet.png",
  },
  {
    id: "shaper-fantasy-saintess",
    labelKo: "판타지 신전 성녀 (166cm)",
    genreKo: "성좌·성녀물",
    heightCm: 166,
    eyeHeightCm: 154.6,
    accentHex: "#ffe082",
    contactSheetUrl: "/assets/characters/shaper-fantasy-saintess/contact-sheet.png",
  },
  {
    id: "shaper-noir-duke",
    labelKo: "북부대공 느와르 (188cm)",
    genreKo: "로판 북부대공",
    heightCm: 188,
    eyeHeightCm: 176.2,
    accentHex: "#ff5470",
    contactSheetUrl: "/assets/characters/shaper-noir-duke/contact-sheet.png",
  },
  {
    id: "shaper-rofan-empress",
    labelKo: "로판 황녀 쿠튀르 (167cm)",
    genreKo: "로맨스 판타지",
    heightCm: 167,
    eyeHeightCm: 155.5,
    accentHex: "#ffe08a",
    contactSheetUrl: "/assets/characters/shaper-rofan-empress/contact-sheet.png",
  },
  {
    id: "shaper-murim-swordmaster",
    labelKo: "무협 청운 검존 (183cm)",
    genreKo: "정통 무협",
    heightCm: 183,
    eyeHeightCm: 171.6,
    accentHex: "#5ce0b8",
    contactSheetUrl: "/assets/characters/shaper-murim-swordmaster/contact-sheet.png",
  },
  {
    id: "shaper-cyber-idol",
    labelKo: "사이버 센터 아이돌 (163cm)",
    genreKo: "아이돌 드라마",
    heightCm: 163,
    eyeHeightCm: 151.8,
    accentHex: "#5cf6ff",
    contactSheetUrl: "/assets/characters/shaper-cyber-idol/contact-sheet.png",
  },
  {
    id: "shaper-academy-council",
    labelKo: "황립 아카데미 학생회장 (168cm)",
    genreKo: "아카데미 판타지",
    heightCm: 168,
    eyeHeightCm: 156.5,
    accentHex: "#d88cff",
    contactSheetUrl: "/assets/characters/shaper-academy-council/contact-sheet.png",
  },
  {
    id: "shaper-apocalypse-sniper",
    labelKo: "아포칼립스 회귀 스나이퍼 (186cm)",
    genreKo: "아포칼립스 회귀",
    heightCm: 186,
    eyeHeightCm: 174.4,
    accentHex: "#64f58d",
    contactSheetUrl: "/assets/characters/shaper-apocalypse-sniper/contact-sheet.png",
  },
  {
    id: "shaper-healing-barista",
    labelKo: "캠퍼스 힐링 아티스트 (162cm)",
    genreKo: "일상 힐링 로맨스",
    heightCm: 162,
    eyeHeightCm: 151.0,
    accentHex: "#ffc978",
    contactSheetUrl: "/assets/characters/shaper-healing-barista/contact-sheet.png",
  },
  {
    id: "shaper-thriller-detective",
    labelKo: "느와르 강력계 형사 (185cm)",
    genreKo: "현대 스릴러 수사물",
    heightCm: 185,
    eyeHeightCm: 173.4,
    accentHex: "#f2b857",
    contactSheetUrl: "/assets/characters/shaper-thriller-detective/contact-sheet.png",
  },
]);

export interface DuoShotState {
  readonly enabled: boolean;
  readonly partnerId: string;
  readonly side: DuoPartnerSide;
  readonly distanceKey: DuoShotDistanceKey;
  readonly render3dPartner: boolean;
  readonly partnerStance: DuoPartnerStance;
  readonly partnerExpression: DuoPartnerExpressionPreset;
  readonly partnerHandPropId: HandPropId | "";
}

export const DEFAULT_DUO_SHOT_STATE: DuoShotState = Object.freeze({
  enabled: false,
  partnerId: "shaper-atelier-male-lead",
  side: "right",
  distanceKey: "talk",
  render3dPartner: false,
  partnerStance: "conversational",
  partnerExpression: "neutral",
  partnerHandPropId: "",
});

export async function toDuoPartnerAttachment(duoShot: DuoShotState, subjectHeightCm: number): Promise<DuoPartnerAttachment | null> {
  if (!duoShot.enabled || !duoShot.render3dPartner) return null;
  const { loadCharacterPackageIndex } = await import("../../../domains/authored/package-index.browser");
  const index = await loadCharacterPackageIndex();
  if (!index.ok) throw index.failure;
  const asset = index.entries.find((entry) => entry.characterId === duoShot.partnerId);
  if (!asset?.glbUrl || !asset.glbSha256) throw new Error("제작 패키지 목록에서 상대역의 GLB 파일과 SHA-256을 찾지 못했습니다.");
  const partner = SHAPER_DUO_PARTNER_PROFILES.find((item) => item.id === duoShot.partnerId) ?? SHAPER_DUO_PARTNER_PROFILES[0]!;
  const safeSubjectCm = Number.isFinite(subjectHeightCm) && subjectHeightCm > 100 ? subjectHeightCm : 166;
  const heightScale = Number((partner.heightCm / safeSubjectCm).toFixed(4));
  const partnerPropSpec = duoShot.partnerHandPropId ? findWebtoonHandPropSpec(duoShot.partnerHandPropId) : null;
  return {
    characterId: partner.id,
    glbUrl: asset.glbUrl,
    sha256: asset.glbSha256,
    side: duoShot.side,
    distanceMeters: DUO_SHOT_DISTANCES[duoShot.distanceKey].meters,
    heightScale,
    stance: duoShot.partnerStance,
    expression: duoShot.partnerExpression,
    ...(partnerPropSpec
      ? {
          handProp: {
            propId: partnerPropSpec.id,
            hand: duoShot.side === "right" ? "leftHand" : "rightHand",
            glbUrl: partnerPropSpec.glbUrl,
            sha256: partnerPropSpec.sha256,
          },
        }
      : { handProp: null }),
  };
}

function eulerDegToQuat(deg: Vec3): Quat {
  const rx = (deg[0] * Math.PI) / 360;
  const ry = (deg[1] * Math.PI) / 360;
  const rz = (deg[2] * Math.PI) / 360;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  return qNormalize([
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ]);
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

export function resolveSubjectHeightMetrics(
  source: CharacterRecipe["source"],
  bodyParams: ParamValues<BodyParamKey>,
): { readonly heightCm: number; readonly eyeHeightCm: number; readonly labelKo: string } {
  const heightSlider = typeof bodyParams.height === "number" && Number.isFinite(bodyParams.height) ? bodyParams.height : 0;
  const sliderDeltaCm = heightSlider * 14;
  if (source.kind === "package") {
    const matched = SHAPER_DUO_PARTNER_PROFILES.find((item) => item.id === source.characterId);
    if (matched) {
      const heightCm = Number((matched.heightCm + sliderDeltaCm * 0.5).toFixed(1));
      return {
        heightCm,
        eyeHeightCm: Number((heightCm - (matched.heightCm - matched.eyeHeightCm)).toFixed(1)),
        labelKo: matched.labelKo.replace(/\s*\(\d+cm\)$/u, ""),
      };
    }
  }
  const baseCm = source.kind === "kit" && source.baseId === "male" ? 179 : 166;
  const heightCm = Number((baseCm + sliderDeltaCm).toFixed(1));
  return {
    heightCm,
    eyeHeightCm: Number((heightCm - 11.4).toFixed(1)),
    labelKo: "현재 캐릭터",
  };
}

export interface WebtoonDuoEyeContactResult {
  readonly heightDeltaCm: number;
  readonly eyeDeltaCm: number;
  readonly elevationDeg: number;
  readonly gazePitchDeg: number;
  readonly gazeYawDeg: number;
  readonly neckQuat: Quat;
  readonly headQuat: Quat;
  readonly summaryKo: string;
}

export function computeWebtoonDuoEyeContact(input: {
  readonly subjectHeightCm: number;
  readonly subjectEyeHeightCm: number;
  readonly partnerHeightCm: number;
  readonly partnerEyeHeightCm: number;
  readonly distanceMeters: number;
  readonly side: DuoPartnerSide;
}): WebtoonDuoEyeContactResult {
  const safeDistM = Math.max(0.35, Number.isFinite(input.distanceMeters) ? input.distanceMeters : 0.95);
  const heightDeltaCm = Number((input.partnerHeightCm - input.subjectHeightCm).toFixed(1));
  const eyeDeltaCm = Number((input.partnerEyeHeightCm - input.subjectEyeHeightCm).toFixed(1));
  const rawElevDeg = (Math.atan2(eyeDeltaCm / 100, safeDistM) * 180) / Math.PI;
  const elevationDeg = Number(clampRange(rawElevDeg, -36, 36).toFixed(1));

  const dirSign = input.side === "right" ? 1 : -1;
  const totalYawDeg = safeDistM <= 0.75 ? 20 : safeDistM <= 1.05 ? 16 : 12;

  const neckPitchDeg = -elevationDeg * 0.28;
  const headPitchDeg = -elevationDeg * 0.37;
  const gazePitchDeg = Number(clampRange(elevationDeg * 0.45, -24, 24).toFixed(1));

  const neckYawDeg = dirSign * totalYawDeg * 0.32;
  const headYawDeg = dirSign * totalYawDeg * 0.42;
  const gazeYawDeg = Number(clampRange(dirSign * totalYawDeg * 0.48, -24, 24).toFixed(1));
  const subtleRollDeg = dirSign * clampRange(elevationDeg * 0.08, -3.5, 3.5);

  const deltaSign = heightDeltaCm > 0 ? `+${heightDeltaCm.toFixed(1)}` : heightDeltaCm.toFixed(1);
  const elevSign =
    elevationDeg > 0 ? `+${elevationDeg.toFixed(1)}° 올려보기` : elevationDeg < 0 ? `${elevationDeg.toFixed(1)}° 내려보기` : "0.0° 수평 아이레벨";

  return {
    heightDeltaCm,
    eyeDeltaCm,
    elevationDeg,
    gazePitchDeg,
    gazeYawDeg,
    neckQuat: eulerDegToQuat([neckPitchDeg, neckYawDeg, subtleRollDeg * 0.5]),
    headQuat: eulerDegToQuat([headPitchDeg, headYawDeg, subtleRollDeg]),
    summaryKo: `신장차 ${deltaSign}cm · 시선각 ${elevSign}`,
  };
}

export function buildDuoEyeContactCommands(
  currentPose: Pose,
  eyeContact: WebtoonDuoEyeContactResult,
  partnerLabelKo: string,
): readonly LabCommand[] {
  const coalesceKey = `duo-eyecontact:${partnerLabelKo}`;
  const nextPose: Pose = {
    ...currentPose,
    neck: eyeContact.neckQuat,
    head: eyeContact.headQuat,
  };
  return [
    {
      type: "pose/set",
      pose: nextPose,
      scope: "full",
      labelKo: `투샷 아이컨택 (${partnerLabelKo})`,
      coalesceKey,
    },
    {
      type: "eye-gaze/set",
      gaze: {
        mode: "manual",
        symmetry: true,
        left: { yawDeg: eyeContact.gazeYawDeg, pitchDeg: eyeContact.gazePitchDeg },
        right: { yawDeg: eyeContact.gazeYawDeg, pitchDeg: eyeContact.gazePitchDeg },
      },
      coalesceKey,
    },
  ];
}

const RULER_TICKS_CM = [190, 180, 170, 160, 150] as const;
const MAX_STAGE_CM = 200;
const MIN_STAGE_CM = 0;

function cmToStageYPercent(cm: number): number {
  const clamped = clampRange(cm, MIN_STAGE_CM, MAX_STAGE_CM);
  return 90 - (clamped / MAX_STAGE_CM) * 82;
}

export interface ViewportDuoShotOverlayProps {
  readonly duoShot: DuoShotState;
  readonly subjectHeightCm: number;
  readonly subjectEyeHeightCm: number;
  readonly subjectLabelKo: string;
}

const OVERLAY_ROOT: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  pointerEvents: "none",
  overflow: "hidden",
};

export function ViewportDuoShotOverlay({
  duoShot,
  subjectHeightCm,
  subjectEyeHeightCm,
  subjectLabelKo,
}: ViewportDuoShotOverlayProps) {
  if (!duoShot.enabled) return null;
  const partner = SHAPER_DUO_PARTNER_PROFILES.find((item) => item.id === duoShot.partnerId) ?? SHAPER_DUO_PARTNER_PROFILES[0]!;
  const distanceInfo = DUO_SHOT_DISTANCES[duoShot.distanceKey];
  const contact = computeWebtoonDuoEyeContact({
    subjectHeightCm,
    subjectEyeHeightCm,
    partnerHeightCm: partner.heightCm,
    partnerEyeHeightCm: partner.eyeHeightCm,
    distanceMeters: distanceInfo.meters,
    side: duoShot.side,
  });

  const subjectTopY = cmToStageYPercent(subjectHeightCm);
  const subjectEyeY = cmToStageYPercent(subjectEyeHeightCm);
  const partnerTopY = cmToStageYPercent(partner.heightCm);
  const partnerEyeY = cmToStageYPercent(partner.eyeHeightCm);
  const floorY = cmToStageYPercent(0);
  const partnerHeightPct = Math.max(20, floorY - partnerTopY);
  const partnerCenterX = duoShot.side === "right" ? 76 : 24;
  const subjectCenterX = 50;

  return (
    <div className="cl-viewport-duo-overlay" data-testid="viewport-duo-shot-overlay" aria-hidden="true" style={OVERLAY_ROOT}>
      {!duoShot.render3dPartner ? (
        <div
          data-testid="viewport-duo-partner-figure"
          data-partner-id={partner.id}
          data-side={duoShot.side}
          style={{
            position: "absolute",
            top: `${partnerTopY}%`,
            height: `${partnerHeightPct}%`,
            left: duoShot.side === "right" ? "63%" : "11%",
            width: "26%",
            borderRadius: 8,
            border: "1px solid rgba(239, 233, 222, 0.14)",
            backgroundColor: "rgba(18, 16, 22, 0.54)",
            backgroundImage: `url(${partner.contactSheetUrl})`,
            backgroundSize: "400% 100%",
            backgroundPosition: "0% 0%",
            backgroundRepeat: "no-repeat",
            boxShadow: "0 12px 28px rgba(0, 0, 0, 0.38)",
            opacity: 0.86,
            transform: duoShot.side === "left" ? "scaleX(-1)" : undefined,
          }}
        />
      ) : null}

      <div
        style={{
          position: "absolute",
          top: `${Math.max(2, partnerTopY - 4.4)}%`,
          left: duoShot.side === "right" ? "63%" : "11%",
          width: "26%",
          textAlign: "center",
          fontSize: 12,
          fontWeight: 500,
          color: "#efe9de",
          textShadow: "0 1px 4px rgba(0,0,0,0.85)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {`${partner.labelKo} · ${duoShot.render3dPartner ? "실제 3D 스테이지" : partner.genreKo}`}
      </div>

      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
        <line x1="40" y1={floorY * 10} x2="960" y2={floorY * 10} stroke="rgba(232, 214, 184, 0.35)" strokeWidth="1.5" />
        <line x1="54" y1={cmToStageYPercent(198) * 10} x2="54" y2={floorY * 10} stroke="rgba(232, 214, 184, 0.5)" strokeWidth="1.5" />
        {RULER_TICKS_CM.map((cm) => {
          const y = cmToStageYPercent(cm) * 10;
          return (
            <g key={cm}>
              <line x1="44" y1={y} x2="68" y2={y} stroke="rgba(232, 214, 184, 0.65)" strokeWidth="1.5" />
              <text x="74" y={y + 4} fill="rgba(239, 233, 222, 0.86)" fontSize="13" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                {`${cm}cm`}
              </text>
            </g>
          );
        })}

        <line x1="360" y1={subjectTopY * 10} x2="640" y2={subjectTopY * 10} stroke="rgba(240, 201, 120, 0.78)" strokeWidth="1.8" strokeDasharray="6 4" />
        <text x="500" y={subjectTopY * 10 - 8} textAnchor="middle" fill="#f0c978" fontSize="13" fontWeight="500">
          {`${subjectLabelKo} ${subjectHeightCm.toFixed(1)}cm`}
        </text>

        <line
          x1={duoShot.side === "right" ? 620 : 100}
          y1={partnerTopY * 10}
          x2={duoShot.side === "right" ? 900 : 380}
          y2={partnerTopY * 10}
          stroke={partner.accentHex}
          strokeWidth="1.8"
          strokeDasharray="6 4"
        />

        <line
          x1={subjectCenterX * 10}
          y1={subjectEyeY * 10}
          x2={partnerCenterX * 10}
          y2={partnerEyeY * 10}
          stroke="rgba(255, 192, 105, 0.92)"
          strokeWidth="2.4"
          strokeDasharray="9 5"
        />
        <circle cx={subjectCenterX * 10} cy={subjectEyeY * 10} r="5.5" fill="#f0c978" />
        <circle cx={partnerCenterX * 10} cy={partnerEyeY * 10} r="5.5" fill={partner.accentHex} />
      </svg>

      <div
        data-testid="viewport-duo-stage-badge"
        style={{
          position: "absolute",
          left: "50%",
          bottom: 12,
          transform: "translateX(-50%)",
          padding: "4px 12px",
          borderRadius: 6,
          backgroundColor: "rgba(22, 21, 19, 0.9)",
          border: "1px solid rgba(239, 233, 222, 0.1)",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.32)",
          color: "#efe9de",
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {`${duoShot.render3dPartner ? "3D 듀오 스테이지" : "투샷"} ${distanceInfo.labelKo} · ${contact.summaryKo}`}
      </div>
    </div>
  );
}

export interface ViewportDuoShotControlsProps {
  readonly duoShot: DuoShotState;
  readonly summaryKo: string;
  readonly duo3dSupported?: boolean;
  readonly duo3dBusy?: boolean;
  readonly onToggleDuoShot: () => void;
  readonly onChangePartner: (partnerId: string) => void;
  readonly onChangeSide: (side: DuoPartnerSide) => void;
  readonly onChangeDistance: (distanceKey: DuoShotDistanceKey) => void;
  readonly onApplyEyeContact: () => void;
  readonly onToggleRender3dPartner?: () => void;
  readonly onChangePartnerStance?: (stance: DuoPartnerStance) => void;
  readonly onChangePartnerExpression?: (expression: DuoPartnerExpressionPreset) => void;
  readonly onChangePartnerHandProp?: (propId: HandPropId | "") => void;
}

export function ViewportDuoShotControls({
  duoShot,
  summaryKo,
  duo3dSupported = false,
  duo3dBusy = false,
  onToggleDuoShot,
  onChangePartner,
  onChangeSide,
  onChangeDistance,
  onApplyEyeContact,
  onToggleRender3dPartner,
  onChangePartnerStance,
  onChangePartnerExpression,
  onChangePartnerHandProp,
}: ViewportDuoShotControlsProps) {
  return (
    <span className="cl-viewport-group" role="group" aria-label="웹툰 2인 투샷·신장차 도구" style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      <button
        type="button"
        className="cl-viewport-button"
        data-testid="viewport-toggle-duo-shot"
        aria-pressed={duoShot.enabled}
        title="상대역 캐릭터와의 신장차(cm) 눈금자·3D 동시 배치·대화 시선각을 뷰포트에 표시합니다"
        onClick={onToggleDuoShot}
      >
        투샷·신장차
      </button>
      {duoShot.enabled ? (
        <>
          <select
            className="cl-viewport-select"
            aria-label="투샷 상대역 캐릭터"
            data-testid="viewport-duo-partner-select"
            value={duoShot.partnerId}
            disabled={duo3dBusy}
            onChange={(event) => onChangePartner(event.target.value)}
          >
            {SHAPER_DUO_PARTNER_PROFILES.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.labelKo}
              </option>
            ))}
          </select>
          <select
            className="cl-viewport-select"
            aria-label="상대역 배치 방향"
            data-testid="viewport-duo-side-select"
            value={duoShot.side}
            disabled={duo3dBusy}
            onChange={(event) => onChangeSide(event.target.value === "left" ? "left" : "right")}
          >
            <option value="right">우측 상대역</option>
            <option value="left">좌측 상대역</option>
          </select>
          <select
            className="cl-viewport-select"
            aria-label="투샷 대화 거리"
            data-testid="viewport-duo-distance-select"
            value={duoShot.distanceKey}
            disabled={duo3dBusy}
            onChange={(event) => {
              const val = event.target.value;
              if (val === "close" || val === "talk" || val === "wide") onChangeDistance(val);
            }}
          >
            {(Object.keys(DUO_SHOT_DISTANCES) as DuoShotDistanceKey[]).map((key) => (
              <option key={key} value={key}>
                {DUO_SHOT_DISTANCES[key].labelKo}
              </option>
            ))}
          </select>
          {onToggleRender3dPartner ? (
            <button
              type="button"
              className="cl-viewport-button"
              data-testid="viewport-duo-3d-toggle"
              aria-pressed={duoShot.render3dPartner}
              disabled={!duo3dSupported || duo3dBusy}
              title="상대역 3D 패키지 GLB를 실제 월드 거리·신장 비율로 뷰포트에 동시 배치해 단일 투샷 PNG 및 GLB로 함께 내보냅니다"
              onClick={onToggleRender3dPartner}
            >
              3D 듀오 동시 배치
            </button>
          ) : null}
          {duoShot.render3dPartner && onChangePartnerStance ? (
            <select
              className="cl-viewport-select"
              aria-label="상대역 3D 스탠스 포즈"
              data-testid="viewport-duo-3d-stance"
              value={duoShot.partnerStance}
              disabled={duo3dBusy}
              onChange={(event) => onChangePartnerStance(event.target.value as DuoPartnerStance)}
            >
              {(Object.keys(DUO_PARTNER_STANCE_LABELS_KO) as DuoPartnerStance[]).map((stance) => (
                <option key={stance} value={stance}>
                  {DUO_PARTNER_STANCE_LABELS_KO[stance]}
                </option>
              ))}
            </select>
          ) : null}
          {duoShot.render3dPartner && onChangePartnerExpression ? (
            <select
              className="cl-viewport-select"
              aria-label="상대역 3D 표정 프리셋"
              data-testid="viewport-duo-3d-expression"
              value={duoShot.partnerExpression}
              disabled={duo3dBusy}
              onChange={(event) => onChangePartnerExpression(event.target.value as DuoPartnerExpressionPreset)}
            >
              {(Object.keys(DUO_PARTNER_EXPRESSION_LABELS_KO) as DuoPartnerExpressionPreset[]).map((expr) => (
                <option key={expr} value={expr}>
                  {DUO_PARTNER_EXPRESSION_LABELS_KO[expr]}
                </option>
              ))}
            </select>
          ) : null}
          {duoShot.render3dPartner && onChangePartnerHandProp ? (
            <select
              className="cl-viewport-select"
              aria-label="상대역 전용 손 소품"
              data-testid="viewport-duo-3d-hand-prop"
              value={duoShot.partnerHandPropId}
              disabled={duo3dBusy}
              title="상대역 3D 캐릭터의 안쪽 손에 전용 웹툰 손 소품을 장착하고 그립 팔 각도를 자동 적용합니다"
              onChange={(event) => onChangePartnerHandProp(event.target.value as HandPropId | "")}
            >
              <option value="">상대역 소품 없음</option>
              {WEBTOON_HAND_PROPS.map((prop) => (
                <option key={prop.id} value={prop.id}>
                  {`상대역 · ${prop.labelKo}`}
                </option>
              ))}
            </select>
          ) : null}
          <span className="cl-viewport-button" data-testid="viewport-duo-delta-readout" style={{ pointerEvents: "none", fontVariantNumeric: "tabular-nums" }}>
            {summaryKo}
          </span>
          <button
            type="button"
            className="cl-viewport-button"
            data-testid="viewport-duo-apply-eyecontact"
            title="상대역 눈높이와 거리에 맞춰 목·머리 각도와 안구 시선(eyeGaze)을 한 번의 실행 취소 단위로 맞춥니다"
            onClick={onApplyEyeContact}
          >
            아이컨택 시선 맞춤
          </button>
        </>
      ) : null}
    </span>
  );
}
