/**
 * AI-Free 60컷 로컬 OKLCH 컬러 스크립트 & 감정 무드 아크 하모나이저 타입 정의.
 *
 * - 12~60컷 에피소드 서사 4막 OKLCH 리본 생성, 인접 컷 지각 색차(`ΔE_OKLCH`) 급변 탐지,
 *   단조 큐빅 스플라인(Fritsch-Carlson) 무드 아크 조화, 컷별 3D 조명 색온도(Kelvin) 및
 *   1D/3D LUT 그레이딩 파라미터 출력을 정의한다.
 */

/** 지각 균등 색공간 OKLCH 좌표 (L: 0..1, C: 0..0.37, H: 0..360°). */
export interface OklchCoord {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

/** 내장 서사 컬러 템플릿 4종 ID. */
export type NarrativeColorTemplateId =
  | "daily-dusk-night-dawn"
  | "romance-pastel-4act"
  | "action-noir-climax"
  | "mystery-cool-suspense";

/** 에피소드 4막 서사 구간. */
export type StoryActKind = "act1-setup" | "act2-conflict" | "act3-climax" | "act4-resolution";

/** 인접 컷 간 색차 급변 등급. */
export type ColorJumpSeverity = "smooth" | "notice" | "jarring";

/** 색차 급변을 주도한 지각 축. */
export type ColorJumpAxis = "luminance" | "chroma" | "hue" | "composite";

/** 단일 컷의 OKLCH 컬러 스크립트 노드. */
export interface CutColorScriptNode {
  readonly cutNumber: number;
  readonly act: StoryActKind;
  readonly labelKo: string;
  /** 배경·장면 주조색(Key/Ambient). */
  readonly primary: OklchCoord;
  /** 그림자·암부 보조색(Shadow). */
  readonly shadow: OklchCoord;
  /** 강조·포인트 조명색(Accent). */
  readonly accent: OklchCoord;
  /** 서사 감정 강도(0..1). */
  readonly emotionIntensity: number;
  /** 막 전환 앵커 컷 여부(스플라인 조화 시 기준점 유지). */
  readonly isAnchorCut?: boolean;
  /** 의도적 플래시백/임팩트 컷 여부(급변 경고 제외). */
  readonly intentionalFlashCut?: boolean;
}

/** 서사 템플릿의 앵커 키프레임 명세. */
export interface NarrativeColorAnchor {
  readonly progress: number;
  readonly act: StoryActKind;
  readonly labelKo: string;
  readonly primary: OklchCoord;
  readonly shadow: OklchCoord;
  readonly accent: OklchCoord;
  readonly emotionIntensity: number;
}

/** 내장 서사 컬러 스크립트 템플릿 정의. */
export interface NarrativeColorTemplate {
  readonly id: NarrativeColorTemplateId;
  readonly nameKo: string;
  readonly subtitleKo: string;
  readonly defaultCutCount: number;
  readonly anchors: readonly NarrativeColorAnchor[];
}

/** 인접 두 컷 사이의 지각 색차 전이 측정값. */
export interface CutColorTransitionMetric {
  readonly fromCut: number;
  readonly toCut: number;
  readonly deltaEOklch: number;
  readonly deltaL: number;
  readonly deltaC: number;
  readonly deltaHueDeg: number;
  readonly dominantAxis: ColorJumpAxis;
  readonly severity: ColorJumpSeverity;
}

/** 색차 급변 불연속성 경고 항목. */
export interface ColorDiscontinuityAlert {
  readonly id: string;
  readonly fromCut: number;
  readonly toCut: number;
  readonly deltaEOklch: number;
  readonly deltaL: number;
  readonly deltaC: number;
  readonly deltaHueDeg: number;
  readonly dominantAxis: ColorJumpAxis;
  readonly severity: Exclude<ColorJumpSeverity, "smooth">;
  readonly messageKo: string;
}

/** 불연속성 감사 임계값 설정. */
export interface ColorScriptAuditThresholds {
  readonly noticeDeltaE: number;
  readonly jarringDeltaE: number;
  readonly maxDeltaL: number;
  readonly maxDeltaC: number;
  readonly maxDeltaHueDeg: number;
}

/** 전체 에피소드 컬러 스크립트 감사 리포트. */
export interface EpisodeColorScriptAudit {
  readonly cutCount: number;
  readonly averageDeltaE: number;
  readonly maxDeltaE: number;
  readonly arcSmoothnessScore: number;
  readonly discontinuityAlerts: readonly ColorDiscontinuityAlert[];
  readonly jarringCount: number;
  readonly noticeCount: number;
  readonly perCutTransitions: readonly CutColorTransitionMetric[];
}

/** 3D LUT 큐브 꼭짓점 샘플 매핑. */
export interface Lut3dCornerSample {
  readonly input: readonly [number, number, number];
  readonly output: readonly [number, number, number];
}

/** 컷별 3D 조명 색온도(Kelvin) + 1D/3D LUT 그레이딩 파라미터. */
export interface CutLightingAndLutGrade {
  readonly cutNumber: number;
  readonly keyLightKelvin: number;
  readonly fillLightKelvin: number;
  readonly exposureEv: number;
  readonly contrastPivot: number;
  readonly saturationGain: number;
  readonly shadowLift: readonly [number, number, number];
  readonly midtoneGamma: readonly [number, number, number];
  readonly highlightGain: readonly [number, number, number];
  /** 0..1 구간 16포인트 단조 1D 톤 커브. */
  readonly lut1dCurve16: readonly number[];
  readonly lut3dCubeSize: 17;
  readonly lut3dCornerSamples: readonly Lut3dCornerSample[];
}

/** 컬러 스크립트 생성/조화 통합 결과. */
export interface EpisodeColorScriptBundle {
  readonly schemaVersion: "toonstudio.color-script.v1";
  readonly templateId: NarrativeColorTemplateId;
  readonly templateNameKo: string;
  readonly cuts: readonly CutColorScriptNode[];
  readonly audit: EpisodeColorScriptAudit;
  readonly lightingGrades: readonly CutLightingAndLutGrade[];
}
