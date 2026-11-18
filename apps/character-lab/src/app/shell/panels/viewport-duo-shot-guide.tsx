/**
 * 웹툰 2인 투샷 구도 · 신장차(cm) 눈금자 · 대화 시선 교환(아이컨택) 프리뷰 및 원클릭 시선 맞춤 모듈.
 * 파일명을 소문자 하이픈(`viewport-duo-shot-guide.tsx`)으로 두어 `app/composition.ts` 최상위 패널 규칙을 지킨다.
 */
import { qNormalize } from "../../../shared/math";

import type { BodyParamKey, CharacterRecipe, LabCommand, ParamValues, Pose, Quat, Vec3 } from "../../../contracts";
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
]);

export interface DuoShotState {
  readonly enabled: boolean;
  readonly partnerId: string;
  readonly side: DuoPartnerSide;
  readonly distanceKey: DuoShotDistanceKey;
}

export const DEFAULT_DUO_SHOT_STATE: DuoShotState = Object.freeze({
  enabled: false,
  partnerId: "shaper-atelier-male-lead",
  side: "right",
  distanceKey: "talk",
});

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

/**
 * 두 인물의 눈높이 차이와 대화 거리(m), 파트너 배치 방향(좌/우)으로부터
 * 목(neck)·머리(head) 미세 기울기와 안구 시선(eyeGaze yaw/pitch)을 자연스러운 비율로 분배한다.
 */
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

  // 모델 공간: 음수 X 회전이 위를 올려다보는 방향, 양수 Y 회전이 캐릭터 좌측(+X, 뷰어 기준 우측)을 향함
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
  const elevSign = elevationDeg > 0 ? `+${elevationDeg.toFixed(1)}° 올려보기` : elevationDeg < 0 ? `${elevationDeg.toFixed(1)}° 내려보기` : "0.0° 수평 아이레벨";

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
  // 바닥선 90%, 200cm 상단선 8%
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
      {/* 파트너 턴어라운드 전신 레퍼런스 스탠디 (contact-sheet 1번 전신 패널 크롭) */}
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
          borderRadius: 10,
          border: `1px solid ${partner.accentHex}66`,
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

      {/* 파트너 메타 캡션 */}
      <div
        style={{
          position: "absolute",
          top: `${Math.max(2, partnerTopY - 4.4)}%`,
          left: duoShot.side === "right" ? "63%" : "11%",
          width: "26%",
          textAlign: "center",
          fontSize: 11,
          fontWeight: 600,
          color: "#f6efe4",
          textShadow: "0 1px 4px rgba(0,0,0,0.85)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {partner.labelKo} · {partner.genreKo}
      </div>

      {/* 신장 눈금자 + 두 인물 정수리/아이레벨 비교선 + 대화 시선 벡터 SVG */}
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
        {/* 바닥 기준선 */}
        <line x1="40" y1={floorY * 10} x2="960" y2={floorY * 10} stroke="rgba(232, 214, 184, 0.35)" strokeWidth="1.5" />

        {/* 좌측 신장 눈금자 (150cm ~ 190cm) */}
        <line x1="54" y1={cmToStageYPercent(198) * 10} x2="54" y2={floorY * 10} stroke="rgba(232, 214, 184, 0.5)" strokeWidth="1.5" />
        {RULER_TICKS_CM.map((cm) => {
          const y = cmToStageYPercent(cm) * 10;
          return (
            <g key={cm}>
              <line x1="44" y1={y} x2="68" y2={y} stroke="rgba(232, 214, 184, 0.65)" strokeWidth="1.5" />
              <text x="74" y={y + 4} fill="rgba(246, 239, 228, 0.86)" fontSize="13" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                {`${cm}cm`}
              </text>
            </g>
          );
        })}

        {/* 현재 캐릭터 정수리 기준선 */}
        <line x1="360" y1={subjectTopY * 10} x2="640" y2={subjectTopY * 10} stroke="rgba(240, 201, 120, 0.78)" strokeWidth="1.8" strokeDasharray="6 4" />
        <text x="500" y={subjectTopY * 10 - 8} textAnchor="middle" fill="#f0c978" fontSize="13" fontWeight="600">
          {`${subjectLabelKo} ${subjectHeightCm.toFixed(1)}cm`}
        </text>

        {/* 파트너 정수리 기준선 */}
        <line
          x1={duoShot.side === "right" ? 620 : 100}
          y1={partnerTopY * 10}
          x2={duoShot.side === "right" ? 900 : 380}
          y2={partnerTopY * 10}
          stroke={partner.accentHex}
          strokeWidth="1.8"
          strokeDasharray="6 4"
        />

        {/* 아이컨택 시선 교환 레이저 벡터 */}
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

      {/* 하단 투샷 신장차·시선각 계측 배지 */}
      <div
        data-testid="viewport-duo-stage-badge"
        style={{
          position: "absolute",
          left: "50%",
          bottom: 14,
          transform: "translateX(-50%)",
          padding: "5px 12px",
          borderRadius: 999,
          backgroundColor: "rgba(20, 17, 24, 0.86)",
          border: "1px solid rgba(240, 201, 120, 0.45)",
          color: "#f6efe4",
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {`투샷 ${distanceInfo.labelKo} · ${contact.summaryKo}`}
      </div>
    </div>
  );
}

export interface ViewportDuoShotControlsProps {
  readonly duoShot: DuoShotState;
  readonly summaryKo: string;
  readonly onToggleDuoShot: () => void;
  readonly onChangePartner: (partnerId: string) => void;
  readonly onChangeSide: (side: DuoPartnerSide) => void;
  readonly onChangeDistance: (distanceKey: DuoShotDistanceKey) => void;
  readonly onApplyEyeContact: () => void;
}

export function ViewportDuoShotControls({
  duoShot,
  summaryKo,
  onToggleDuoShot,
  onChangePartner,
  onChangeSide,
  onChangeDistance,
  onApplyEyeContact,
}: ViewportDuoShotControlsProps) {
  return (
    <span className="cl-viewport-group" role="group" aria-label="웹툰 2인 투샷·신장차 도구" style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      <button
        type="button"
        className="cl-viewport-button"
        data-testid="viewport-toggle-duo-shot"
        aria-pressed={duoShot.enabled}
        title="상대역 캐릭터와의 신장차(cm) 눈금자·전신 스탠디·대화 시선각을 뷰포트에 함께 표시합니다"
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
