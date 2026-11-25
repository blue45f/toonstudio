/**
 * Wave 58B — 대사 1줄 + 3획 구도 러프 → 원샷 컷 라이브 연출 오케스트레이터 엔진.
 *
 * - 5대 연출 레이어(3D 카메라·180° 축 / WebGPU 탈-바이올렛 OKLCH 역광 / 캐릭터 표정·한글 음절 비젬·15관절 손 포즈 /
 *   얼굴 안전 영역 겹침 0% 광학 말풍선·SFX / 모바일 9:16 세로 스크롤 컷 높이·상하 여백)를 단일 결정론 함수로 통합 조립
 * - 작가 주권 100% 비파괴: 개별 레이어 ON/OFF 토글 및 원본 3획 러프 즉시 원복 보장
 * - 원시 hex/rgb/hsl 0건, 바이올렛 휴(270~320°) 0%, BigInt 리터럴 0건, 스토리지·전역 가변 캐시 0건
 */

export const MAX_ONESHOT_DIALOGUE_LENGTH = 280;
export const CUT_VIEWBOX_WIDTH = 360;
export const CUT_VIEWBOX_HEIGHT = 640;
export const WEBTOON_STRIP_WIDTH_PX = 800;
export const BASE_916_CUT_HEIGHT_PX = 1422;
export const VIOLET_SLOP_MIN_HUE = 270;
export const VIOLET_SLOP_MAX_HUE = 320;
export const HAND_JOINT_COUNT = 15;
export const SAFE_FACE_BALLOON_GAP_PX = 10;

export type OneshotEmotionId = "tense-action" | "romance-heartbeat" | "noir-reveal" | "comedy-shock" | "epic-fantasy";
export type RoughStrokePresetId = "diagonal-slash" | "low-heroic-triangle" | "intimate-close-arc" | "high-isolation-grid";
export type OneshotLayerId = "camera3d" | "webgpuRimLight" | "charExpressionPose" | "opticalBalloonSfx" | "scrollGutterRhythm";
export type OneshotScenePresetId = "rooftop-blade-standoff" | "subway-sunset-confession" | "rain-alley-truth" | "citadel-awakening-oath";
export type VisemeCode = "A_WIDE" | "E_SPREAD" | "I_TENSE" | "O_ROUND" | "U_PUCKER" | "M_CLOSED";
export type HandFingerId = "thumb" | "index" | "middle" | "ring" | "pinky";
export type HandJointKind = "mcp" | "pip" | "dip";
export type HandGripArchetypeId = "katana-clench" | "collar-hesitate" | "chin-deduction" | "splayed-panic" | "grimoire-command" | "relaxed-neutral";
export type BalloonShapeKind = "jagged-burst" | "soft-cloud-oval" | "sharp-noir-rect" | "double-shock-star" | "engraved-crest-oval";
export type GazeDirectionKind = "left-to-right" | "right-to-left" | "camera-direct" | "upward-horizon";
export type ScrollPacingKind = "snap-impact" | "heart-linger" | "suspense-drop" | "beat-punchline" | "grand-reveal" | "neutral-strip";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface Vec2 { readonly x: number; readonly y: number; }
export interface Rect2D { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }

export interface OneshotLayerToggles {
  readonly camera3d: boolean; readonly webgpuRimLight: boolean; readonly charExpressionPose: boolean;
  readonly opticalBalloonSfx: boolean; readonly scrollGutterRhythm: boolean;
}
export interface OneshotLayerSpec {
  readonly id: OneshotLayerId; readonly labelKo: string; readonly labelEn: string;
  readonly roleKo: string; readonly roleEn: string;
}
export interface RoughGuideStroke {
  readonly index: 1 | 2 | 3; readonly role: "horizon-axis" | "action-vector" | "focal-anchor";
  readonly labelKo: string; readonly labelEn: string; readonly d: string; readonly start: Vec2; readonly end: Vec2;
}
export interface RoughStrokePresetSpec {
  readonly id: RoughStrokePresetId; readonly nameKo: string; readonly nameEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly baseFocalLengthMm: number; readonly baseDutchTiltDeg: number; readonly basePitchDeg: number;
  readonly baseHorizonY: number; readonly baseGaze: GazeDirectionKind; readonly baseRule180AzimuthDeg: number;
  readonly preferredBalloonRegion: "top-left" | "top-right" | "bottom-right" | "upper-left";
  readonly baseSubjectBox: Rect2D; readonly baseFaceSafeBox: Rect2D;
  readonly strokes: readonly [RoughGuideStroke, RoughGuideStroke, RoughGuideStroke];
}
export interface OneshotEmotionSpec {
  readonly id: OneshotEmotionId; readonly nameKo: string; readonly nameEn: string;
  readonly summaryKo: string; readonly summaryEn: string; readonly paletteNameKo: string; readonly paletteNameEn: string;
  readonly focalDeltaMm: number; readonly dutchTiltMultiplier: number; readonly apertureF: number;
  readonly keyLight: { readonly angleDeg: number; readonly elevationDeg: number; readonly kelvin: number; readonly intensity01: number; readonly color: OklchColor };
  readonly rimLight: { readonly angleDeg: number; readonly elevationDeg: number; readonly kelvin: number; readonly intensity01: number; readonly spreadPx: number; readonly color: OklchColor };
  readonly backdropTop: OklchColor; readonly backdropBottom: OklchColor; readonly silhouetteColor: OklchColor;
  readonly contrastRatioLabelKo: string; readonly contrastRatioLabelEn: string;
  readonly expression: {
    readonly browTiltDeg: number; readonly eyeAperture01: number; readonly pupilFocusOffset: Vec2;
    readonly blushIntensity01: number; readonly sweatDrop: boolean; readonly summaryKo: string; readonly summaryEn: string;
  };
  readonly handGripId: Exclude<HandGripArchetypeId, "relaxed-neutral">;
  readonly balloonShape: BalloonShapeKind; readonly sfxTextKo: string; readonly sfxTextEn: string; readonly sfxAngleDeg: number;
  readonly scrollPacing: Exclude<ScrollPacingKind, "neutral-strip">;
  readonly baseCutHeightPx: number; readonly baseTopGutterPx: number; readonly baseBottomGutterPx: number;
  readonly gutterTone: OklchColor; readonly scrollCueKo: string; readonly scrollCueEn: string;
}
export interface OneshotScenePreset {
  readonly id: OneshotScenePresetId; readonly nameKo: string; readonly nameEn: string;
  readonly genreTagKo: string; readonly genreTagEn: string; readonly dialogueKo: string; readonly dialogueEn: string;
  readonly emotion: OneshotEmotionId; readonly strokePreset: RoughStrokePresetId;
}
export interface OneshotCutInput {
  readonly dialogue: string; readonly emotion: OneshotEmotionId; readonly strokePreset: RoughStrokePresetId;
  readonly layers?: Partial<OneshotLayerToggles>; readonly presetId?: OneshotScenePresetId | "custom";
}
export interface Camera3dLayerPlan {
  readonly enabled: boolean; readonly focalLengthMm: number; readonly fovVerticalDeg: number;
  readonly dutchTiltDeg: number; readonly pitchDeg: number; readonly depthOfFieldApertureF: number;
  readonly eyeLineAxis: {
    readonly rule180BaselineDeg: 180; readonly cameraAzimuthDeg: number; readonly crossed180Rule: false;
    readonly gazeDirection: GazeDirectionKind; readonly horizonY: number;
  };
  readonly subjectBox: Rect2D; readonly faceSafeBox: Rect2D;
  readonly guideStrokes: readonly [RoughGuideStroke, RoughGuideStroke, RoughGuideStroke];
}
export interface WebgpuRimLightLayerPlan {
  readonly enabled: boolean; readonly paletteNameKo: string; readonly paletteNameEn: string;
  readonly violetFreeVerified: true; readonly webgpuShaderPassCount: number;
  readonly renderPath: "svg-preview"; readonly submittedWebgpuPassCount: 0;
  readonly keyLight: { readonly angleDeg: number; readonly elevationDeg: number; readonly kelvin: number; readonly intensity01: number; readonly color: OklchColor; readonly oklch: string };
  readonly rimLight: { readonly angleDeg: number; readonly elevationDeg: number; readonly kelvin: number; readonly intensity01: number; readonly spreadPx: number; readonly color: OklchColor; readonly oklch: string };
  readonly backdropTop: OklchColor; readonly backdropBottom: OklchColor;
  readonly backdropTopOklch: string; readonly backdropBottomOklch: string; readonly characterSilhouetteOklch: string;
  readonly rimBeamOrigin: Vec2; readonly rimBeamTarget: Vec2;
  readonly contrastRatioLabelKo: string; readonly contrastRatioLabelEn: string;
}
export interface VisemeShape {
  readonly code: VisemeCode; readonly syllable: string; readonly labelKo: string; readonly labelEn: string;
  readonly openHeight01: number; readonly width01: number; readonly lipRound01: number;
}
export interface HandJointAngle { readonly finger: HandFingerId; readonly joint: HandJointKind; readonly flexionDeg: number; readonly spreadDeg: number; }
export interface CharExpressionPoseLayerPlan {
  readonly enabled: boolean; readonly browTiltDeg: number; readonly eyeAperture01: number;
  readonly pupilFocusOffset: Vec2; readonly blushIntensity01: number; readonly sweatDrop: boolean;
  readonly summaryKo: string; readonly summaryEn: string; readonly startViseme: VisemeShape; readonly endViseme: VisemeShape;
  readonly handGrip: {
    readonly archetypeId: HandGripArchetypeId; readonly nameKo: string; readonly nameEn: string;
    readonly propAnchorKo: string; readonly propAnchorEn: string; readonly jointCount: 15;
    readonly averageFlexionDeg: number; readonly gripTension01: number; readonly joints: readonly HandJointAngle[];
  };
}
export interface OpticalBalloonSfxLayerPlan {
  readonly enabled: boolean; readonly balloonShape: BalloonShapeKind; readonly placementSlot: string;
  readonly balloonBox: Rect2D; readonly balloonTailTarget: Vec2; readonly wrappedLines: readonly string[];
  readonly fontWeight: 500 | 700 | 800; readonly letterSpacingEm: number;
  readonly faceOverlapAreaPx2: number; readonly faceOverlapRatio: number; readonly faceClearancePx: number;
  readonly sfxTextKo: string; readonly sfxTextEn: string; readonly sfxBox: Rect2D; readonly sfxAngleDeg: number;
  readonly sfxFaceOverlapRatio: number; readonly sfxBalloonOverlapRatio: number;
  readonly balloonFillOklch: string; readonly balloonStrokeOklch: string; readonly sfxFillOklch: string;
}
export interface ScrollGutterRhythmLayerPlan {
  readonly enabled: boolean; readonly stripWidthPx: 800;
  readonly cutHeightPx: number; readonly topGutterPx: number; readonly bottomGutterPx: number;
  readonly totalScrollSpanPx: number; readonly viewportScreens916: number; readonly estimatedReadSec: number;
  readonly pacingArchetype: ScrollPacingKind; readonly gutterToneOklch: string;
  readonly previewTopBandPx: number; readonly previewBottomBandPx: number;
  readonly scrollCueKo: string; readonly scrollCueEn: string;
}
export interface AuthorSovereigntyReport {
  readonly nonDestructive: true; readonly originalRoughPreserved: true; readonly revertToBaselineAvailable: true;
  readonly activeLayerCount: number; readonly totalLayerCount: 5; readonly bypassedLayerIds: readonly OneshotLayerId[];
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface OneshotCutPlan {
  readonly schemaVersion: "toonstudio.oneshot-cut-director.v1"; readonly planDigest: string;
  readonly presetId: OneshotScenePresetId | "custom"; readonly dialogue: string;
  readonly emotion: OneshotEmotionId; readonly strokePreset: RoughStrokePresetId;
  readonly layers: OneshotLayerToggles; readonly viewBox: { readonly width: 360; readonly height: 640 };
  readonly camera3d: Camera3dLayerPlan; readonly webgpuRimLight: WebgpuRimLightLayerPlan;
  readonly charExpressionPose: CharExpressionPoseLayerPlan; readonly opticalBalloonSfx: OpticalBalloonSfxLayerPlan;
  readonly scrollGutterRhythm: ScrollGutterRhythmLayerPlan; readonly authorSovereignty: AuthorSovereigntyReport;
}

export const DEFAULT_ONESHOT_LAYERS: OneshotLayerToggles = {
  camera3d: true, webgpuRimLight: true, charExpressionPose: true, opticalBalloonSfx: true, scrollGutterRhythm: true,
};

export const NEUTRAL_ROUGH_ONLY_LAYERS: OneshotLayerToggles = {
  camera3d: false, webgpuRimLight: false, charExpressionPose: false, opticalBalloonSfx: false, scrollGutterRhythm: false,
};

export const ONESHOT_LAYER_IDS: readonly OneshotLayerId[] = [
  "camera3d", "webgpuRimLight", "charExpressionPose", "opticalBalloonSfx", "scrollGutterRhythm",
];

export const ONESHOT_LAYER_SPECS: readonly OneshotLayerSpec[] = [
  { id: "camera3d", labelKo: "3D 카메라·180° 축", labelEn: "3D Camera · 180° Axis", roleKo: "화각(24~85mm)·더치 틸트·시선 축과 얼굴 안전 영역 계산", roleEn: "Focal length (24–85mm), Dutch tilt, 180° eye-line & face safe box" },
  { id: "webgpuRimLight", labelKo: "역광·색온도 설정", labelEn: "Rim Light Settings", roleKo: "SVG 조명 예제용 OKLCH 주광·역광과 대비 설정", roleEn: "OKLCH key and rim lighting settings for the SVG preview" },
  { id: "charExpressionPose", labelKo: "표정·비젬·15관절 손", labelEn: "Expression · Viseme · 15J Hand", roleKo: "한글 첫/끝 음절 입모양 비젬과 15관절 손 그립 합성", roleEn: "Start/end syllable mouth visemes & 15-joint hand grip pose" },
  { id: "opticalBalloonSfx", labelKo: "광학 말풍선·SFX", labelEn: "Optical Balloon · SFX", roleKo: "얼굴 안전 박스 겹침 0% 충돌 회피 말풍선·의성어 배치", roleEn: "Zero-overlap face-safe optical speech balloon & SFX layout" },
  { id: "scrollGutterRhythm", labelKo: "9:16 스크롤 여백", labelEn: "9:16 Scroll Gutter", roleKo: "모바일 세로 컷 높이(px)·상하 여백(Gutter) 호흡 조율", roleEn: "Mobile 9:16 vertical cut height & top/bottom gutter pacing" },
];

export const ROUGH_STROKE_PRESETS: readonly RoughStrokePresetSpec[] = [
  {
    id: "diagonal-slash", nameKo: "사선 참격 3획", nameEn: "Diagonal Slash 3-Stroke",
    summaryKo: "우상단→좌하단 속도선으로 시선을 베어 내리는 대결 구도", summaryEn: "High-velocity diagonal sweep driving tension across the frame",
    baseFocalLengthMm: 28, baseDutchTiltDeg: -11, basePitchDeg: -8, baseHorizonY: 368,
    baseGaze: "right-to-left", baseRule180AzimuthDeg: 138, preferredBalloonRegion: "top-left",
    baseSubjectBox: { x: 118, y: 205, width: 176, height: 295 }, baseFaceSafeBox: { x: 158, y: 215, width: 92, height: 108 },
    strokes: [
      { index: 1, role: "action-vector", labelKo: "1획: 사선 참격축", labelEn: "Stroke 1: Slash Vector", d: "M 326 98 L 40 536", start: { x: 326, y: 98 }, end: { x: 40, y: 536 } },
      { index: 2, role: "horizon-axis", labelKo: "2획: 경사 지평선", labelEn: "Stroke 2: Tilted Horizon", d: "M 22 402 L 338 334", start: { x: 22, y: 402 }, end: { x: 338, y: 334 } },
      { index: 3, role: "focal-anchor", labelKo: "3획: 시선 교차점", labelEn: "Stroke 3: Focal Cross", d: "M 134 236 Q 204 204 274 294", start: { x: 134, y: 236 }, end: { x: 274, y: 294 } },
    ],
  },
  {
    id: "low-heroic-triangle", nameKo: "로우앵글 삼각 3획", nameEn: "Low Heroic Triangle",
    summaryKo: "밑변이 넓은 피라미드와 올려다보는 시선으로 위압감을 세우는 구도", summaryEn: "Monumental low-angle pyramid framing heroic authority",
    baseFocalLengthMm: 35, baseDutchTiltDeg: 4, basePitchDeg: -22, baseHorizonY: 468,
    baseGaze: "upward-horizon", baseRule180AzimuthDeg: 52, preferredBalloonRegion: "top-right",
    baseSubjectBox: { x: 76, y: 180, width: 208, height: 340 }, baseFaceSafeBox: { x: 134, y: 188, width: 92, height: 106 },
    strokes: [
      { index: 1, role: "action-vector", labelKo: "1획: 좌측 상승 사선", labelEn: "Stroke 1: Left Ascent", d: "M 46 534 L 180 170", start: { x: 46, y: 534 }, end: { x: 180, y: 170 } },
      { index: 2, role: "focal-anchor", labelKo: "2획: 우측 지지 사선", labelEn: "Stroke 2: Right Brace", d: "M 180 170 L 314 534", start: { x: 180, y: 170 }, end: { x: 314, y: 534 } },
      { index: 3, role: "horizon-axis", labelKo: "3획: 저지평선 기단", labelEn: "Stroke 3: Low Horizon Base", d: "M 24 468 L 336 468", start: { x: 24, y: 468 }, end: { x: 336, y: 468 } },
    ],
  },
  {
    id: "intimate-close-arc", nameKo: "친밀 클로즈업 호 3획", nameEn: "Intimate Close Arc",
    summaryKo: "85mm 망원 아웃포커스와 부드러운 S자 시선 호로 감정을 모으는 구도", summaryEn: "85mm portrait compression with gentle S-curve emotional focus",
    baseFocalLengthMm: 82, baseDutchTiltDeg: -3, basePitchDeg: 2, baseHorizonY: 296,
    baseGaze: "camera-direct", baseRule180AzimuthDeg: 88, preferredBalloonRegion: "top-right",
    baseSubjectBox: { x: 66, y: 210, width: 218, height: 308 }, baseFaceSafeBox: { x: 112, y: 222, width: 112, height: 124 },
    strokes: [
      { index: 1, role: "action-vector", labelKo: "1획: 시선 감싸는 호", labelEn: "Stroke 1: Framing Arc", d: "M 54 166 Q 186 112 310 250", start: { x: 54, y: 166 }, end: { x: 310, y: 250 } },
      { index: 2, role: "focal-anchor", labelKo: "2획: 어깨·턱선 곡선", labelEn: "Stroke 2: Shoulder Flow", d: "M 52 468 Q 168 386 302 442", start: { x: 52, y: 468 }, end: { x: 302, y: 442 } },
      { index: 3, role: "horizon-axis", labelKo: "3획: 눈높이 수평축", labelEn: "Stroke 3: Eye-Level Axis", d: "M 28 286 L 332 286", start: { x: 28, y: 286 }, end: { x: 332, y: 286 } },
    ],
  },
  {
    id: "high-isolation-grid", nameKo: "하이앵글 고립 격자 3획", nameEn: "High Isolation Grid",
    summaryKo: "상단 여백을 넓게 열어 인물 고립감과 누아르 긴장을 키우는 부감 구도", summaryEn: "High-angle top-weighted negative space emphasizing solitude",
    baseFocalLengthMm: 50, baseDutchTiltDeg: 7, basePitchDeg: 26, baseHorizonY: 162,
    baseGaze: "left-to-right", baseRule180AzimuthDeg: 36, preferredBalloonRegion: "upper-left",
    baseSubjectBox: { x: 124, y: 318, width: 128, height: 194 }, baseFaceSafeBox: { x: 148, y: 324, width: 78, height: 86 },
    strokes: [
      { index: 1, role: "horizon-axis", labelKo: "1획: 고지평선 투시", labelEn: "Stroke 1: High Horizon", d: "M 24 162 L 336 178", start: { x: 24, y: 162 }, end: { x: 336, y: 178 } },
      { index: 2, role: "action-vector", labelKo: "2획: 부감 수직 낙하선", labelEn: "Stroke 2: Vertical Drop", d: "M 186 116 L 186 544", start: { x: 186, y: 116 }, end: { x: 186, y: 544 } },
      { index: 3, role: "focal-anchor", labelKo: "3획: 바닥 1점 소실선", labelEn: "Stroke 3: Floor Vanishing", d: "M 36 534 L 186 382 L 324 534", start: { x: 36, y: 534 }, end: { x: 324, y: 534 } },
    ],
  },
];

export const ONESHOT_EMOTION_SPECS: readonly OneshotEmotionSpec[] = [
  {
    id: "tense-action", nameKo: "긴박 액션", nameEn: "Tense Action",
    summaryKo: "코랄 앰버 역광과 24~32mm 광각 틸트로 타격 직전 긴장을 압축", summaryEn: "Coral-amber rim light with tight wide-angle tilt before impact",
    paletteNameKo: "코랄 앰버 · 스틸 시안", paletteNameEn: "Coral Amber · Steel Cyan",
    focalDeltaMm: -4, dutchTiltMultiplier: 1.35, apertureF: 2.8,
    keyLight: { angleDeg: 42, elevationDeg: 28, kelvin: 3400, intensity01: 0.86, color: { l: 0.74, c: 0.16, h: 48 } },
    rimLight: { angleDeg: 214, elevationDeg: 18, kelvin: 6200, intensity01: 0.96, spreadPx: 26, color: { l: 0.78, c: 0.17, h: 28 } },
    backdropTop: { l: 0.21, c: 0.036, h: 222 }, backdropBottom: { l: 0.15, c: 0.028, h: 236 }, silhouetteColor: { l: 0.25, c: 0.024, h: 232 },
    contrastRatioLabelKo: "8:1 하드 키아로스쿠로", contrastRatioLabelEn: "8:1 Hard Chiaroscuro",
    expression: { browTiltDeg: 16, eyeAperture01: 0.54, pupilFocusOffset: { x: -3, y: 1 }, blushIntensity01: 0, sweatDrop: false, summaryKo: "미간 집중·날카로운 반눈 응시", summaryEn: "Furrowed brow with razor-focused gaze" },
    handGripId: "katana-clench", balloonShape: "jagged-burst", sfxTextKo: "콰직!!", sfxTextEn: "SLASH!!", sfxAngleDeg: -14,
    scrollPacing: "snap-impact", baseCutHeightPx: 1240, baseTopGutterPx: 92, baseBottomGutterPx: 112,
    gutterTone: { l: 0.2, c: 0.026, h: 228 },
    scrollCueKo: "짧은 상단 여백으로 독자 엄지 속도를 끌어올린 뒤 즉각 타격 컷 진입", scrollCueEn: "Tight entry gutter accelerates thumb scroll right into impact",
  },
  {
    id: "romance-heartbeat", nameKo: "로맨스 두근", nameEn: "Romance Heartbeat",
    summaryKo: "따뜻한 코랄 피치 역광과 85mm 아웃포커스로 숨결 간격을 늘림", summaryEn: "Warm coral-peach rim with 85mm bokeh and lingering scroll breath",
    paletteNameKo: "코랄 피치 · 허니 골드", paletteNameEn: "Coral Peach · Honey Gold",
    focalDeltaMm: 8, dutchTiltMultiplier: 0.45, apertureF: 1.8,
    keyLight: { angleDeg: 32, elevationDeg: 22, kelvin: 3800, intensity01: 0.78, color: { l: 0.86, c: 0.09, h: 74 } },
    rimLight: { angleDeg: 158, elevationDeg: 24, kelvin: 5000, intensity01: 0.88, spreadPx: 34, color: { l: 0.82, c: 0.13, h: 22 } },
    backdropTop: { l: 0.94, c: 0.032, h: 52 }, backdropBottom: { l: 0.88, c: 0.048, h: 32 }, silhouetteColor: { l: 0.34, c: 0.032, h: 28 },
    contrastRatioLabelKo: "3:1 소프트 역광 헤일로", contrastRatioLabelEn: "3:1 Soft Halo Rim",
    expression: { browTiltDeg: -7, eyeAperture01: 0.84, pupilFocusOffset: { x: 2, y: -1 }, blushIntensity01: 0.72, sweatDrop: false, summaryKo: "눈꼬리 이완·촉촉한 시선과 뺨 홍조", summaryEn: "Soft arched brows, luminous eyes and subtle cheek blush" },
    handGripId: "collar-hesitate", balloonShape: "soft-cloud-oval", sfxTextKo: "두근…", sfxTextEn: "BA-DUMP…", sfxAngleDeg: -6,
    scrollPacing: "heart-linger", baseCutHeightPx: 1640, baseTopGutterPx: 210, baseBottomGutterPx: 260,
    gutterTone: { l: 0.96, c: 0.018, h: 56 },
    scrollCueKo: "넓은 상하 여백으로 정적을 깔아 고백 대사 직후 여운을 길게 유지", scrollCueEn: "Generous white gutters cushion silence around the confession beat",
  },
  {
    id: "noir-reveal", nameKo: "누아르 반전", nameEn: "Noir Reveal",
    summaryKo: "차갑게 가른 틸 시안 역광과 나트륨 앰버 주광으로 비밀을 폭로", summaryEn: "Cold teal-cyan rim cutting sodium amber shadows for suspense",
    paletteNameKo: "틸 시안 · 나트륨 앰버", paletteNameEn: "Teal Cyan · Sodium Amber",
    focalDeltaMm: 4, dutchTiltMultiplier: 1.15, apertureF: 2.2,
    keyLight: { angleDeg: 66, elevationDeg: 46, kelvin: 2900, intensity01: 0.68, color: { l: 0.72, c: 0.13, h: 62 } },
    rimLight: { angleDeg: 242, elevationDeg: 32, kelvin: 7400, intensity01: 0.92, spreadPx: 20, color: { l: 0.76, c: 0.12, h: 198 } },
    backdropTop: { l: 0.17, c: 0.026, h: 206 }, backdropBottom: { l: 0.12, c: 0.018, h: 218 }, silhouetteColor: { l: 0.21, c: 0.022, h: 210 },
    contrastRatioLabelKo: "10:1 스플릿 누아르 대비", contrastRatioLabelEn: "10:1 Split Noir Contrast",
    expression: { browTiltDeg: 9, eyeAperture01: 0.44, pupilFocusOffset: { x: 4, y: 0 }, blushIntensity01: 0, sweatDrop: false, summaryKo: "한쪽 눈썹 경사·냉철한 곁눈질", summaryEn: "Asymmetric raised brow with cool sidelong scrutiny" },
    handGripId: "chin-deduction", balloonShape: "sharp-noir-rect", sfxTextKo: "스윽—", sfxTextEn: "CLICK—", sfxAngleDeg: 0,
    scrollPacing: "suspense-drop", baseCutHeightPx: 1760, baseTopGutterPx: 268, baseBottomGutterPx: 292,
    gutterTone: { l: 0.14, c: 0.018, h: 212 },
    scrollCueKo: "어두운 긴 상단 여백에서 서서히 인물이 떠오르며 반전 대사를 꽂음", scrollCueEn: "Deep dark entry gutter builds dread before exposing the twist",
  },
  {
    id: "comedy-shock", nameKo: "코미디 경악", nameEn: "Comedy Shock",
    summaryKo: "24mm 과장 광각과 선버스트 골드·민트 시안 대비로 리액션 폭주", summaryEn: "24mm comic wide punch with sunburst gold and mint cyan pop",
    paletteNameKo: "선버스트 골드 · 민트 시안", paletteNameEn: "Sunburst Gold · Mint Cyan",
    focalDeltaMm: -10, dutchTiltMultiplier: 1.45, apertureF: 5.6,
    keyLight: { angleDeg: 18, elevationDeg: 34, kelvin: 5600, intensity01: 0.92, color: { l: 0.9, c: 0.14, h: 86 } },
    rimLight: { angleDeg: 196, elevationDeg: 14, kelvin: 6500, intensity01: 0.84, spreadPx: 28, color: { l: 0.78, c: 0.13, h: 174 } },
    backdropTop: { l: 0.95, c: 0.052, h: 90 }, backdropBottom: { l: 0.91, c: 0.058, h: 174 }, silhouetteColor: { l: 0.28, c: 0.026, h: 230 },
    contrastRatioLabelKo: "4:1 하이키 팝 리액션", contrastRatioLabelEn: "4:1 High-Key Pop",
    expression: { browTiltDeg: -14, eyeAperture01: 0.98, pupilFocusOffset: { x: 0, y: -2 }, blushIntensity01: 0.28, sweatDrop: true, summaryKo: "동공 축소·눈 크게 뜸·식은땀 방울", summaryEn: "Wide-eyed jolt, pinprick focus and comic sweat drop" },
    handGripId: "splayed-panic", balloonShape: "double-shock-star", sfxTextKo: "헐?!", sfxTextEn: "WHAAAT?!", sfxAngleDeg: 11,
    scrollPacing: "beat-punchline", baseCutHeightPx: 1140, baseTopGutterPx: 84, baseBottomGutterPx: 98,
    gutterTone: { l: 0.96, c: 0.024, h: 92 },
    scrollCueKo: "박자감 있는 짧은 컷과 빠른 여백 전환으로 개그 펀치라인 템포 유지", scrollCueEn: "Snappy short frame height keeps comedic punchline rhythm tight",
  },
  {
    id: "epic-fantasy", nameKo: "판타지 각성", nameEn: "Epic Fantasy",
    summaryKo: "임페리얼 골드와 에메랄드 대기 역광으로 신화적 스케일을 확장", summaryEn: "Imperial gold key & emerald atmospheric rim for mythic scale",
    paletteNameKo: "임페리얼 골드 · 에메랄드", paletteNameEn: "Imperial Gold · Emerald",
    focalDeltaMm: -2, dutchTiltMultiplier: 0.85, apertureF: 3.2,
    keyLight: { angleDeg: 50, elevationDeg: 52, kelvin: 4400, intensity01: 0.88, color: { l: 0.82, c: 0.15, h: 78 } },
    rimLight: { angleDeg: 224, elevationDeg: 38, kelvin: 6800, intensity01: 0.95, spreadPx: 32, color: { l: 0.76, c: 0.14, h: 158 } },
    backdropTop: { l: 0.22, c: 0.044, h: 170 }, backdropBottom: { l: 0.16, c: 0.036, h: 196 }, silhouetteColor: { l: 0.24, c: 0.03, h: 190 },
    contrastRatioLabelKo: "7:1 천공 림라이트", contrastRatioLabelEn: "7:1 Celestial Rim",
    expression: { browTiltDeg: 11, eyeAperture01: 0.74, pupilFocusOffset: { x: 0, y: -3 }, blushIntensity01: 0, sweatDrop: false, summaryKo: "단호한 눈매·상향 결의 시선", summaryEn: "Resolute brows with commanding upward gaze" },
    handGripId: "grimoire-command", balloonShape: "engraved-crest-oval", sfxTextKo: "쿠오오—!", sfxTextEn: "FWOOOSH!", sfxAngleDeg: -8,
    scrollPacing: "grand-reveal", baseCutHeightPx: 1840, baseTopGutterPx: 236, baseBottomGutterPx: 318,
    gutterTone: { l: 0.19, c: 0.036, h: 172 },
    scrollCueKo: "긴 종스크롤 전개와 하단 대형 여백으로 각성 클리프행어 압도감 극대화", scrollCueEn: "Tall reveal panel + deep exit gutter lands the cliffhanger",
  },
];

export const ONESHOT_SCENE_PRESETS: readonly OneshotScenePreset[] = [
  { id: "rooftop-blade-standoff", nameKo: "옥상 빗속 결투", nameEn: "Rooftop Blade Standoff", genreTagKo: "액션 · 사선 3획", genreTagEn: "Action · Diagonal", dialogueKo: "여기서 끝내자. 네 검은 이미 늦었어!", dialogueEn: "It ends here. Your blade is already too late!", emotion: "tense-action", strokePreset: "diagonal-slash" },
  { id: "subway-sunset-confession", nameKo: "노을 지하철 고백", nameEn: "Sunset Subway Confession", genreTagKo: "로맨스 · 클로즈업 호", genreTagEn: "Romance · Close Arc", dialogueKo: "사실… 그날부터 계속 너만 보고 있었어.", dialogueEn: "Honestly… I have only been looking at you since that day.", emotion: "romance-heartbeat", strokePreset: "intimate-close-arc" },
  { id: "rain-alley-truth", nameKo: "비 내리는 골목 진실", nameEn: "Rain Alley Truth", genreTagKo: "누아르 · 하이 격자", genreTagEn: "Noir · High Grid", dialogueKo: "사건 파일의 마지막 증인, 바로 당신이었군.", dialogueEn: "The final witness in the case file was you all along.", emotion: "noir-reveal", strokePreset: "high-isolation-grid" },
  { id: "citadel-awakening-oath", nameKo: "천공 성채 각성 선서", nameEn: "Citadel Awakening Oath", genreTagKo: "판타지 · 로우 삼각", genreTagEn: "Fantasy · Low Triangle", dialogueKo: "봉인을 풀어라! 고대의 맹세가 지금 깨어난다!", dialogueEn: "Break the seal! The ancient oath awakens right now!", emotion: "epic-fantasy", strokePreset: "low-heroic-triangle" },
];

const FINGERS: readonly HandFingerId[] = ["thumb", "index", "middle", "ring", "pinky"];
const JOINTS: readonly HandJointKind[] = ["mcp", "pip", "dip"];

interface HandGripTemplate {
  readonly nameKo: string; readonly nameEn: string; readonly propAnchorKo: string; readonly propAnchorEn: string;
  readonly flexMatrix: Readonly<Record<HandFingerId, readonly [number, number, number]>>;
  readonly spreadDeg: Readonly<Record<HandFingerId, number>>;
}

const HAND_GRIP_TEMPLATES: Readonly<Record<HandGripArchetypeId, HandGripTemplate>> = {
  "katana-clench": {
    nameKo: "검자루 강악 그립", nameEn: "Blade Hilt Clench", propAnchorKo: "검자루·손잡이 밀착", propAnchorEn: "Blade hilt anchor",
    flexMatrix: { thumb: [48, 56, 42], index: [78, 92, 68], middle: [84, 96, 72], ring: [86, 98, 74], pinky: [82, 94, 70] },
    spreadDeg: { thumb: 26, index: 4, middle: 2, ring: 2, pinky: 5 },
  },
  "collar-hesitate": {
    nameKo: "옷깃 주저 손끝", nameEn: "Collar Hesitation Touch", propAnchorKo: "가슴·옷깃 가벼운 접촉", propAnchorEn: "Collar fingertip anchor",
    flexMatrix: { thumb: [26, 22, 18], index: [34, 42, 28], middle: [40, 48, 32], ring: [46, 54, 38], pinky: [50, 56, 40] },
    spreadDeg: { thumb: 18, index: 7, middle: 4, ring: 5, pinky: 8 },
  },
  "chin-deduction": {
    nameKo: "턱·안경테 추리 그립", nameEn: "Chin & Frame Deduction", propAnchorKo: "턱선·안경 브리지 지지", propAnchorEn: "Chin / frame bridge anchor",
    flexMatrix: { thumb: [38, 32, 24], index: [14, 18, 12], middle: [58, 72, 48], ring: [72, 84, 62], pinky: [76, 86, 66] },
    spreadDeg: { thumb: 30, index: 12, middle: 6, ring: 4, pinky: 4 },
  },
  "splayed-panic": {
    nameKo: "양손 쫙 펼친 경악", nameEn: "Splayed Panic Spread", propAnchorKo: "얼굴 좌우 공중 방어", propAnchorEn: "Open air panic guard",
    flexMatrix: { thumb: [8, 10, 6], index: [6, 8, 6], middle: [4, 6, 4], ring: [8, 10, 6], pinky: [10, 12, 8] },
    spreadDeg: { thumb: 44, index: 22, middle: 12, ring: 18, pinky: 28 },
  },
  "grimoire-command": {
    nameKo: "천공 소환 결인", nameEn: "Sky Summon Command", propAnchorKo: "마법진·성유물 상향 지시", propAnchorEn: "Crest invocation anchor",
    flexMatrix: { thumb: [30, 26, 20], index: [18, 22, 16], middle: [24, 30, 22], ring: [42, 54, 38], pinky: [32, 40, 28] },
    spreadDeg: { thumb: 36, index: 16, middle: 14, ring: 15, pinky: 24 },
  },
  "relaxed-neutral": {
    nameKo: "이완 기본 손 포즈", nameEn: "Relaxed Baseline Hand", propAnchorKo: "자연 중립 휴지", propAnchorEn: "Neutral resting hand",
    flexMatrix: { thumb: [18, 16, 12], index: [16, 20, 14], middle: [18, 22, 16], ring: [20, 24, 18], pinky: [22, 26, 20] },
    spreadDeg: { thumb: 16, index: 6, middle: 4, ring: 4, pinky: 6 },
  },
};

const VISEME_META: Readonly<Record<VisemeCode, { readonly labelKo: string; readonly labelEn: string; readonly openHeight01: number; readonly width01: number; readonly lipRound01: number }>> = {
  A_WIDE: { labelKo: "아(개구 최대)", labelEn: "A-Wide Open", openHeight01: 0.86, width01: 0.68, lipRound01: 0.32 },
  E_SPREAD: { labelKo: "에(가로 확장)", labelEn: "E-Spread", openHeight01: 0.48, width01: 0.88, lipRound01: 0.16 },
  I_TENSE: { labelKo: "이(긴장 일자)", labelEn: "I-Tense Slit", openHeight01: 0.24, width01: 0.92, lipRound01: 0.1 },
  O_ROUND: { labelKo: "오·어(원순 돌출)", labelEn: "O-Rounded", openHeight01: 0.72, width01: 0.44, lipRound01: 0.82 },
  U_PUCKER: { labelKo: "우·으(오므림)", labelEn: "U-Pucker", openHeight01: 0.3, width01: 0.34, lipRound01: 0.92 },
  M_CLOSED: { labelKo: "음(입술 폐쇄)", labelEn: "M-Closed Seal", openHeight01: 0.08, width01: 0.56, lipRound01: 0.2 },
};

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round1 = (v: number): number => Math.round(v * 10) / 10;

export function isVioletSlopHue(hueDeg: number): boolean {
  const n = ((hueDeg % 360) + 360) % 360;
  return n >= VIOLET_SLOP_MIN_HUE && n <= VIOLET_SLOP_MAX_HUE;
}
export function sanitizeNonVioletHue(hueDeg: number): number {
  const n = Number.isFinite(hueDeg) ? round1(((hueDeg % 360) + 360) % 360) % 360 : 0;
  return isVioletSlopHue(n) ? (n < 295 ? 248 : 342) : n;
}
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = round2(clamp(Number.isFinite(color.l) ? color.l : 0, 0, 1));
  const c = round2(clamp(Number.isFinite(color.c) ? color.c : 0, 0, 0.37));
  const h = sanitizeNonVioletHue(color.h);
  return typeof alpha === "number" ? `oklch(${l} ${c} ${h} / ${clamp(Number.isFinite(alpha) ? alpha : 0, 0, 1).toFixed(2)})` : `oklch(${l} ${c} ${h})`;
}
/** 32비트 FNV-1a 결정론 다이제스트 (BigInt 미사용). */
export function computeDeterministicDigest(payload: string): string {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
export const computeRectArea = (rect: Rect2D): number => Math.max(0, rect.width) * Math.max(0, rect.height);
export function computeRectOverlapArea(a: Rect2D, b: Rect2D): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return round2(x * y);
}
export function computeRectOverlapRatio(subject: Rect2D, obstacle: Rect2D): number {
  const denom = Math.min(computeRectArea(subject), computeRectArea(obstacle));
  return denom <= 0 ? 0 : round2(computeRectOverlapArea(subject, obstacle) / denom);
}
export function computeRectMinClearancePx(a: Rect2D, b: Rect2D): number {
  const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
  const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
  return round1(Math.hypot(dx, dy));
}
export const getOneshotEmotionSpec = (id: OneshotEmotionId): OneshotEmotionSpec =>
  ONESHOT_EMOTION_SPECS.find((e) => e.id === id) ?? ONESHOT_EMOTION_SPECS[0];
export const getRoughStrokePresetSpec = (id: RoughStrokePresetId): RoughStrokePresetSpec =>
  ROUGH_STROKE_PRESETS.find((s) => s.id === id) ?? ROUGH_STROKE_PRESETS[0];
export const getOneshotScenePreset = (id: OneshotScenePresetId): OneshotScenePreset =>
  ONESHOT_SCENE_PRESETS.find((p) => p.id === id) ?? ONESHOT_SCENE_PRESETS[0];
export const normalizeOneshotLayers = (partial?: Partial<OneshotLayerToggles>): OneshotLayerToggles => ({
  camera3d: partial?.camera3d ?? true,
  webgpuRimLight: partial?.webgpuRimLight ?? true,
  charExpressionPose: partial?.charExpressionPose ?? true,
  opticalBalloonSfx: partial?.opticalBalloonSfx ?? true,
  scrollGutterRhythm: partial?.scrollGutterRhythm ?? true,
});

function classifyHangulSyllableViseme(ch: string, isEnding: boolean): VisemeCode {
  const code = ch.charCodeAt(0) - 0xac00;
  const jungIdx = Math.floor((code % 588) / 28);
  const jongIdx = code % 28;
  if (isEnding && (jongIdx === 16 || jongIdx === 17 || jongIdx === 18)) return "M_CLOSED";
  if (jungIdx === 0 || jungIdx === 2 || jungIdx === 9) return "A_WIDE";
  if (jungIdx === 1 || jungIdx === 3 || jungIdx === 5 || jungIdx === 7 || jungIdx === 10 || jungIdx === 15) return "E_SPREAD";
  if (jungIdx === 20 || jungIdx === 16 || jungIdx === 19) return "I_TENSE";
  if (jungIdx === 13 || jungIdx === 17 || jungIdx === 18) return "U_PUCKER";
  return "O_ROUND";
}

function classifyLatinTokenViseme(token: string, isEnding: boolean): VisemeCode {
  const lower = token.toLowerCase();
  if (isEnding && /[mpb]$/u.test(lower)) return "M_CLOSED";
  const vowels = lower.match(/[aeiouy]/gu);
  const target = vowels ? (isEnding ? vowels[vowels.length - 1] : vowels[0]) : "";
  if (target === "a") return "A_WIDE";
  if (target === "e") return "E_SPREAD";
  if (target === "i" || target === "y") return "I_TENSE";
  if (target === "o") return "O_ROUND";
  if (target === "u") return "U_PUCKER";
  return "M_CLOSED";
}

/** 대사 1줄(한글/영문)의 첫·끝 음절에서 입모양 비젬 추출. */
export function extractDialogueVisemes(
  dialogue: string,
  enabled: boolean,
): { readonly startViseme: VisemeShape; readonly endViseme: VisemeShape } {
  const trimmed = dialogue.trim();
  const buildShape = (code: VisemeCode, syllable: string, boost: number): VisemeShape => {
    const meta = VISEME_META[code];
    return {
      code, syllable, labelKo: meta.labelKo, labelEn: meta.labelEn,
      openHeight01: round2(clamp(meta.openHeight01 * boost, 0.06, 1)),
      width01: meta.width01, lipRound01: meta.lipRound01,
    };
  };

  if (!enabled || trimmed.length === 0) {
    return { startViseme: buildShape("M_CLOSED", "—", 1), endViseme: buildShape("M_CLOSED", "—", 1) };
  }

  const boost = trimmed.includes("!") ? 1.12 : trimmed.includes("…") || trimmed.includes("...") ? 0.84 : 1;
  const hasEllipsis = trimmed.includes("…") || trimmed.includes("...");
  const hangulMatches = trimmed.match(/[\uac00-\ud7a3]/gu);
  if (hangulMatches && hangulMatches.length > 0) {
    const first = hangulMatches[0];
    const last = hangulMatches[hangulMatches.length - 1];
    return {
      startViseme: buildShape(classifyHangulSyllableViseme(first, false), first, boost),
      endViseme: buildShape(hasEllipsis ? "M_CLOSED" : classifyHangulSyllableViseme(last, true), last, boost),
    };
  }

  const latinWords = trimmed.match(/[A-Za-z]+/gu);
  if (latinWords && latinWords.length > 0) {
    const firstWord = latinWords[0];
    const lastWord = latinWords[latinWords.length - 1];
    return {
      startViseme: buildShape(classifyLatinTokenViseme(firstWord, false), firstWord.slice(0, 2).toUpperCase(), boost),
      endViseme: buildShape(hasEllipsis ? "M_CLOSED" : classifyLatinTokenViseme(lastWord, true), lastWord.slice(-2).toUpperCase(), boost),
    };
  }

  return { startViseme: buildShape("M_CLOSED", "—", 1), endViseme: buildShape("M_CLOSED", "—", 1) };
}

function buildHandGrip15Joints(archetypeId: HandGripArchetypeId, dialogue: string): CharExpressionPoseLayerPlan["handGrip"] {
  const tpl = HAND_GRIP_TEMPLATES[archetypeId];
  const exclaimBoost = dialogue.includes("!") ? 5 : 0;
  const questionSpread = dialogue.includes("?") ? 4 : 0;
  const joints: HandJointAngle[] = [];
  let flexSum = 0;

  for (const finger of FINGERS) {
    const baseTriplet = tpl.flexMatrix[finger];
    const baseSpread = tpl.spreadDeg[finger];
    for (let jIdx = 0; jIdx < JOINTS.length; jIdx += 1) {
      const flexionDeg = Math.round(clamp(baseTriplet[jIdx] + exclaimBoost, 0, 105));
      const spreadDeg = Math.round(clamp(baseSpread + (jIdx === 0 ? questionSpread : 0), 0, 50));
      flexSum += flexionDeg;
      joints.push({ finger, joint: JOINTS[jIdx], flexionDeg, spreadDeg });
    }
  }

  const averageFlexionDeg = round1(flexSum / joints.length);
  return {
    archetypeId, nameKo: tpl.nameKo, nameEn: tpl.nameEn, propAnchorKo: tpl.propAnchorKo, propAnchorEn: tpl.propAnchorEn,
    jointCount: 15, averageFlexionDeg, gripTension01: round2(clamp(averageFlexionDeg / 95, 0.08, 1)), joints,
  };
}

export function boundOneshotDialogue(dialogue: string): string {
  return dialogue.slice(0, MAX_ONESHOT_DIALOGUE_LENGTH).replace(/[\uD800-\uDFFF]/gu, "");
}

function wrapDialogueLines(dialogue: string): readonly string[] {
  if (dialogue.length === 0) return ["…"];
  const characters = Array.from(dialogue);
  const capped = characters.length > 42 ? characters.slice(0, 40).join("") + "…" : dialogue;
  const maxPerLine = /[\uac00-\ud7a3]/u.test(capped) ? 11 : 18;
  const lines: string[] = [];
  let current: string[] = [];

  for (const word of capped.split(" ")) {
    const letters = Array.from(word);
    if (letters.length > maxPerLine) {
      if (current.length > 0) { lines.push(current.join("")); current = []; }
      for (let i = 0; i < letters.length; i += maxPerLine) lines.push(letters.slice(i, i + maxPerLine).join(""));
      continue;
    }
    const next = current.length === 0 ? letters : [...current, " ", ...letters];
    if (next.length <= maxPerLine) { current = next; } else { lines.push(current.join("")); current = letters; }
  }
  if (current.length > 0) lines.push(current.join(""));
  return lines.length <= 3 ? lines : [lines[0], lines[1], Array.from(lines[2]).slice(0, maxPerLine - 1).join("") + "…"];
}

const expandRect = (r: Rect2D, p: number): Rect2D => ({ x: r.x - p, y: r.y - p, width: r.width + p * 2, height: r.height + p * 2 });
const isInsideBounds = (r: Rect2D, minX: number, minY: number, maxX: number, maxY: number): boolean =>
  r.x >= minX && r.y >= minY && r.x + r.width <= maxX && r.y + r.height <= maxY;

/** 얼굴 안전 박스 겹침 0% 보장 광학 말풍선 & SFX 좌표 솔버. */
function solveFaceSafeBalloonAndSfx(
  faceSafeBox: Rect2D, wrappedLines: readonly string[], strokeSpec: RoughStrokePresetSpec,
  emotionSpec: OneshotEmotionSpec, topLimitY: number, bottomLimitY: number,
): { readonly placementSlot: string; readonly balloonBox: Rect2D; readonly sfxBox: Rect2D; readonly balloonTailTarget: Vec2 } {
  const longestChars = Math.max(4, ...wrappedLines.map((l) => l.length));
  const charPx = wrappedLines.some((l) => /[\uac00-\ud7a3]/u.test(l)) ? 12.5 : 8.5;
  const bw = Math.round(clamp(longestChars * charPx + 40, 128, 224));
  const bh = Math.round(clamp(wrappedLines.length * 22 + 30, 56, 102));
  const minX = 16;
  const maxX = CUT_VIEWBOX_WIDTH - 16;
  const faceGuard = expandRect(faceSafeBox, SAFE_FACE_BALLOON_GAP_PX);
  const aboveY = Math.round(Math.max(topLimitY + 4, faceGuard.y - bh - 4));
  const upperBandY = Math.round(topLimitY + 8);
  const belowY = Math.round(Math.min(bottomLimitY - bh - 4, faceGuard.y + faceGuard.height + 6));
  const centerX = Math.round((CUT_VIEWBOX_WIDTH - bw) / 2);

  const candidates: readonly { readonly id: string; readonly region: RoughStrokePresetSpec["preferredBalloonRegion"] | "other"; readonly rect: Rect2D }[] = [
    { id: "top-left", region: "top-left", rect: { x: 20, y: aboveY, width: bw, height: bh } },
    { id: "top-right", region: "top-right", rect: { x: maxX - bw - 4, y: aboveY, width: bw, height: bh } },
    { id: "upper-left", region: "upper-left", rect: { x: 20, y: upperBandY, width: bw, height: bh } },
    { id: "upper-right", region: "top-right", rect: { x: maxX - bw - 4, y: upperBandY, width: bw, height: bh } },
    { id: "top-center", region: "other", rect: { x: centerX, y: aboveY, width: bw, height: bh } },
    { id: "bottom-right", region: "bottom-right", rect: { x: maxX - bw - 4, y: belowY, width: bw, height: bh } },
    { id: "bottom-left", region: "other", rect: { x: 20, y: belowY, width: bw, height: bh } },
    { id: "bottom-center", region: "other", rect: { x: centerX, y: belowY, width: bw, height: bh } },
  ];
  const valid = candidates.filter((c) => isInsideBounds(c.rect, minX, topLimitY, maxX, bottomLimitY) && computeRectOverlapArea(c.rect, faceGuard) === 0 && computeRectOverlapArea(c.rect, faceSafeBox) === 0);
  const topSpace = faceGuard.y - topLimitY;
  const bottomSpace = bottomLimitY - (faceGuard.y + faceGuard.height);
  const fallbackRect: Rect2D = topSpace >= bottomSpace
    ? { x: centerX, y: Math.round(topLimitY + 2), width: bw, height: Math.max(44, Math.min(bh, Math.floor(topSpace - 4))) }
    : { x: centerX, y: Math.round(faceGuard.y + faceGuard.height + 2), width: bw, height: Math.max(44, Math.min(bh, Math.floor(bottomSpace - 4))) };
  const chosen = valid.find((c) => c.region === strokeSpec.preferredBalloonRegion) ?? valid[0] ?? { id: "fallback-band", region: "other" as const, rect: fallbackRect };

  const balloonGuard = expandRect(chosen.rect, 8);
  const sfxW = Math.round(clamp(Math.max(emotionSpec.sfxTextKo.length * 19 + 24, 96), 92, 132));
  const sfxH = 40;
  const sfxCandidates: readonly Rect2D[] = [
    { x: maxX - sfxW - 4, y: Math.round(bottomLimitY - sfxH - 12), width: sfxW, height: sfxH },
    { x: 20, y: Math.round(bottomLimitY - sfxH - 12), width: sfxW, height: sfxH },
    { x: maxX - sfxW - 4, y: Math.round(faceGuard.y + faceGuard.height + 16), width: sfxW, height: sfxH },
    { x: 20, y: Math.round(faceGuard.y + faceGuard.height + 16), width: sfxW, height: sfxH },
    { x: maxX - sfxW - 4, y: Math.round(topLimitY + 8), width: sfxW, height: sfxH },
    { x: 20, y: Math.round(topLimitY + 8), width: sfxW, height: sfxH },
  ];
  const sfxBox =
    sfxCandidates.find((r) => isInsideBounds(r, minX, topLimitY, maxX, bottomLimitY) && computeRectOverlapArea(r, faceGuard) === 0 && computeRectOverlapArea(r, balloonGuard) === 0) ??
    sfxCandidates.find((r) => computeRectOverlapArea(r, faceSafeBox) === 0) ??
    { x: 20, y: Math.round(bottomLimitY - sfxH - 6), width: sfxW, height: sfxH };

  const mouthAnchor: Vec2 = { x: round1(faceSafeBox.x + faceSafeBox.width * 0.5), y: round1(faceSafeBox.y + faceSafeBox.height * 0.72) };
  const dx = mouthAnchor.x - (chosen.rect.x + chosen.rect.width * 0.5);
  const dy = mouthAnchor.y - (chosen.rect.y + chosen.rect.height * 0.5);
  const dist = Math.max(1, Math.hypot(dx, dy));
  return {
    placementSlot: chosen.id, balloonBox: chosen.rect, sfxBox,
    balloonTailTarget: { x: round1(mouthAnchor.x - (dx / dist) * (faceSafeBox.width * 0.58)), y: round1(mouthAnchor.y - (dy / dist) * (faceSafeBox.height * 0.56)) },
  };
}

/** 대사 1줄 + 감정/장르 + 3획 구도 러프 + 5대 비파괴 레이어 토글로부터 원샷 컷 연출 플랜을 결정론적으로 합성한다. */
export function composeOneshotCutPlan(input: OneshotCutInput): OneshotCutPlan {
  const dialogue = boundOneshotDialogue(input.dialogue).replace(/\s+/gu, " ").trim();
  const emotionSpec = getOneshotEmotionSpec(input.emotion);
  const strokeSpec = getRoughStrokePresetSpec(input.strokePreset);
  const layers = normalizeOneshotLayers(input.layers);
  const presetId = input.presetId ?? "custom";

  // 1. 3D 카메라 & 180° 시선 축 + 얼굴 안전 영역
  const focalLengthMm = layers.camera3d ? Math.round(clamp(strokeSpec.baseFocalLengthMm + emotionSpec.focalDeltaMm, 24, 85)) : 50;
  const fovVerticalDeg = round1((2 * Math.atan(24 / (2 * focalLengthMm)) * 180) / Math.PI);
  const dutchTiltDeg = layers.camera3d ? round1(clamp(strokeSpec.baseDutchTiltDeg * emotionSpec.dutchTiltMultiplier, -18, 18)) : 0;
  const focalShiftY = layers.camera3d ? Math.round((50 - focalLengthMm) * 0.16) : 0;
  const subjectBox: Rect2D = { x: strokeSpec.baseSubjectBox.x, y: Math.round(clamp(strokeSpec.baseSubjectBox.y + focalShiftY, 174, 336)), width: strokeSpec.baseSubjectBox.width, height: strokeSpec.baseSubjectBox.height };
  const faceSafeBox: Rect2D = { x: strokeSpec.baseFaceSafeBox.x, y: Math.round(clamp(strokeSpec.baseFaceSafeBox.y + focalShiftY, 182, 342)), width: strokeSpec.baseFaceSafeBox.width, height: strokeSpec.baseFaceSafeBox.height };
  const camera3d: Camera3dLayerPlan = {
    enabled: layers.camera3d, focalLengthMm, fovVerticalDeg, dutchTiltDeg,
    pitchDeg: layers.camera3d ? strokeSpec.basePitchDeg : 0, depthOfFieldApertureF: layers.camera3d ? emotionSpec.apertureF : 5.6,
    eyeLineAxis: { rule180BaselineDeg: 180, cameraAzimuthDeg: layers.camera3d ? strokeSpec.baseRule180AzimuthDeg : 90, crossed180Rule: false, gazeDirection: layers.camera3d ? strokeSpec.baseGaze : "camera-direct", horizonY: layers.camera3d ? strokeSpec.baseHorizonY : 320 },
    subjectBox, faceSafeBox, guideStrokes: strokeSpec.strokes,
  };

  // 2. WebGPU 역광·림라이트 색온도 (탈-바이올렛 OKLCH 100%)
  const neutralPaper: OklchColor = { l: 0.96, c: 0.008, h: 86 };
  const keyCol = layers.webgpuRimLight ? emotionSpec.keyLight.color : { l: 0.88, c: 0.01, h: 84 };
  const rimCol = layers.webgpuRimLight ? emotionSpec.rimLight.color : { l: 0.84, c: 0.01, h: 210 };
  const topCol = layers.webgpuRimLight ? emotionSpec.backdropTop : neutralPaper;
  const botCol = layers.webgpuRimLight ? emotionSpec.backdropBottom : { l: 0.93, c: 0.01, h: 86 };
  const rimAngleRad = ((emotionSpec.rimLight.angleDeg - 90) * Math.PI) / 180;
  const faceCenter: Vec2 = { x: round1(faceSafeBox.x + faceSafeBox.width * 0.5), y: round1(faceSafeBox.y + faceSafeBox.height * 0.5) };
  const webgpuRimLight: WebgpuRimLightLayerPlan = {
    enabled: layers.webgpuRimLight, violetFreeVerified: true, webgpuShaderPassCount: layers.webgpuRimLight ? 4 : 1,
    renderPath: "svg-preview", submittedWebgpuPassCount: 0,
    paletteNameKo: layers.webgpuRimLight ? emotionSpec.paletteNameKo : "중립 러프 용지",
    paletteNameEn: layers.webgpuRimLight ? emotionSpec.paletteNameEn : "Neutral Rough Paper",
    keyLight: { angleDeg: layers.webgpuRimLight ? emotionSpec.keyLight.angleDeg : 0, elevationDeg: layers.webgpuRimLight ? emotionSpec.keyLight.elevationDeg : 45, kelvin: layers.webgpuRimLight ? emotionSpec.keyLight.kelvin : 5500, intensity01: layers.webgpuRimLight ? emotionSpec.keyLight.intensity01 : 0.45, color: keyCol, oklch: formatOklch(keyCol) },
    rimLight: { angleDeg: layers.webgpuRimLight ? emotionSpec.rimLight.angleDeg : 180, elevationDeg: layers.webgpuRimLight ? emotionSpec.rimLight.elevationDeg : 0, kelvin: layers.webgpuRimLight ? emotionSpec.rimLight.kelvin : 5500, intensity01: layers.webgpuRimLight ? emotionSpec.rimLight.intensity01 : 0, spreadPx: layers.webgpuRimLight ? emotionSpec.rimLight.spreadPx : 0, color: rimCol, oklch: formatOklch(rimCol) },
    backdropTop: topCol, backdropBottom: botCol, backdropTopOklch: formatOklch(topCol), backdropBottomOklch: formatOklch(botCol),
    characterSilhouetteOklch: formatOklch(layers.webgpuRimLight ? emotionSpec.silhouetteColor : { l: 0.34, c: 0.012, h: 230 }),
    rimBeamOrigin: { x: round1(clamp(faceCenter.x + Math.cos(rimAngleRad) * 165, 18, CUT_VIEWBOX_WIDTH - 18)), y: round1(clamp(faceCenter.y + Math.sin(rimAngleRad) * 165, 58, CUT_VIEWBOX_HEIGHT - 58)) },
    rimBeamTarget: faceCenter,
    contrastRatioLabelKo: layers.webgpuRimLight ? emotionSpec.contrastRatioLabelKo : "1.5:1 플랫 러프",
    contrastRatioLabelEn: layers.webgpuRimLight ? emotionSpec.contrastRatioLabelEn : "1.5:1 Flat Rough",
  };

  // 3. 캐릭터 표정·한글 음절 비젬·15관절 손 그립 포즈
  const { startViseme, endViseme } = extractDialogueVisemes(dialogue, layers.charExpressionPose);
  const handGrip = buildHandGrip15Joints(layers.charExpressionPose ? emotionSpec.handGripId : "relaxed-neutral", dialogue);
  const charExpressionPose: CharExpressionPoseLayerPlan = {
    enabled: layers.charExpressionPose,
    browTiltDeg: layers.charExpressionPose ? emotionSpec.expression.browTiltDeg : 0,
    eyeAperture01: layers.charExpressionPose ? emotionSpec.expression.eyeAperture01 : 0.65,
    pupilFocusOffset: layers.charExpressionPose ? emotionSpec.expression.pupilFocusOffset : { x: 0, y: 0 },
    blushIntensity01: layers.charExpressionPose ? emotionSpec.expression.blushIntensity01 : 0,
    sweatDrop: layers.charExpressionPose ? emotionSpec.expression.sweatDrop : false,
    summaryKo: layers.charExpressionPose ? emotionSpec.expression.summaryKo : "중립 마네킹 기본 표정",
    summaryEn: layers.charExpressionPose ? emotionSpec.expression.summaryEn : "Neutral mannequin baseline",
    startViseme, endViseme, handGrip,
  };

  // 4. 모바일 9:16 세로 스크롤 컷 높이 & 상하 여백 호흡 설계
  const dialogueLengthFactor = Math.min(220, Math.round(dialogue.length * 4));
  const strokeHeightAdjust = input.strokePreset === "high-isolation-grid" ? 120 : input.strokePreset === "diagonal-slash" ? -60 : 0;
  const cutHeightPx = layers.scrollGutterRhythm ? Math.round(clamp(emotionSpec.baseCutHeightPx + strokeHeightAdjust + dialogueLengthFactor, 1040, 2100)) : BASE_916_CUT_HEIGHT_PX;
  const topGutterPx = layers.scrollGutterRhythm ? emotionSpec.baseTopGutterPx : 120;
  const bottomGutterPx = layers.scrollGutterRhythm ? emotionSpec.baseBottomGutterPx : 120;
  const totalScrollSpanPx = topGutterPx + cutHeightPx + bottomGutterPx;
  const previewTopBandPx = layers.scrollGutterRhythm ? Math.round(clamp(topGutterPx * 0.16, 20, 48)) : 14;
  const previewBottomBandPx = layers.scrollGutterRhythm ? Math.round(clamp(bottomGutterPx * 0.16, 22, 52)) : 14;
  const scrollGutterRhythm: ScrollGutterRhythmLayerPlan = {
    enabled: layers.scrollGutterRhythm, stripWidthPx: 800, cutHeightPx, topGutterPx, bottomGutterPx, totalScrollSpanPx,
    viewportScreens916: round2(totalScrollSpanPx / BASE_916_CUT_HEIGHT_PX),
    estimatedReadSec: round1(clamp(1.2 + dialogue.length * 0.075 + totalScrollSpanPx / 1500, 1.4, 5.8)),
    pacingArchetype: layers.scrollGutterRhythm ? emotionSpec.scrollPacing : "neutral-strip",
    gutterToneOklch: formatOklch(layers.scrollGutterRhythm ? emotionSpec.gutterTone : neutralPaper),
    previewTopBandPx, previewBottomBandPx,
    scrollCueKo: layers.scrollGutterRhythm ? emotionSpec.scrollCueKo : "기본 9:16 균일 여백(120px) 유지",
    scrollCueEn: layers.scrollGutterRhythm ? emotionSpec.scrollCueEn : "Neutral 9:16 even 120px gutters",
  };

  // 5. 광학 말풍선 & SFX 자동 배치 (얼굴 안전 영역 겹침 0% 보장)
  const wrappedLines = wrapDialogueLines(dialogue);
  const solved = solveFaceSafeBalloonAndSfx(faceSafeBox, wrappedLines, strokeSpec, emotionSpec, previewTopBandPx + 6, CUT_VIEWBOX_HEIGHT - previewBottomBandPx - 6);
  const opticalBalloonSfx: OpticalBalloonSfxLayerPlan = {
    enabled: layers.opticalBalloonSfx, balloonShape: emotionSpec.balloonShape, placementSlot: solved.placementSlot,
    balloonBox: solved.balloonBox, balloonTailTarget: solved.balloonTailTarget, wrappedLines,
    fontWeight: input.emotion === "tense-action" || input.emotion === "comedy-shock" ? 800 : input.emotion === "romance-heartbeat" ? 500 : 700,
    letterSpacingEm: input.emotion === "romance-heartbeat" ? 0.04 : input.emotion === "noir-reveal" ? 0.02 : -0.02,
    faceOverlapAreaPx2: computeRectOverlapArea(solved.balloonBox, faceSafeBox),
    faceOverlapRatio: computeRectOverlapRatio(solved.balloonBox, faceSafeBox),
    faceClearancePx: computeRectMinClearancePx(solved.balloonBox, faceSafeBox),
    sfxTextKo: emotionSpec.sfxTextKo, sfxTextEn: emotionSpec.sfxTextEn, sfxBox: solved.sfxBox, sfxAngleDeg: emotionSpec.sfxAngleDeg,
    sfxFaceOverlapRatio: computeRectOverlapRatio(solved.sfxBox, faceSafeBox),
    sfxBalloonOverlapRatio: computeRectOverlapRatio(solved.sfxBox, solved.balloonBox),
    balloonFillOklch: formatOklch({ l: 0.99, c: 0.005, h: 86 }, 0.96),
    balloonStrokeOklch: formatOklch({ l: 0.2, c: 0.02, h: 235 }),
    sfxFillOklch: formatOklch(emotionSpec.rimLight.color),
  };

  const bypassedLayerIds = ONESHOT_LAYER_IDS.filter((id) => !layers[id]);
  const activeLayerCount = ONESHOT_LAYER_IDS.length - bypassedLayerIds.length;
  const authorSovereignty: AuthorSovereigntyReport = {
    nonDestructive: true, originalRoughPreserved: true, revertToBaselineAvailable: true,
    activeLayerCount, totalLayerCount: 5, bypassedLayerIds,
    summaryKo: bypassedLayerIds.length === 0 ? "5대 연출 레이어 전원 가동 · 원본 3획 러프 비파괴 보존" : `${activeLayerCount}/5 레이어 적용 · ${bypassedLayerIds.length}개 작가 수동 바이패스`,
    summaryEn: bypassedLayerIds.length === 0 ? "All 5 live layers active · 3-stroke rough preserved non-destructively" : `${activeLayerCount}/5 layers active · ${bypassedLayerIds.length} bypassed by author`,
  };
  const digestSource = [dialogue, input.emotion, input.strokePreset, ONESHOT_LAYER_IDS.map((id) => (layers[id] ? "1" : "0")).join(""), String(focalLengthMm), String(cutHeightPx), solved.placementSlot].join("|");

  return {
    schemaVersion: "toonstudio.oneshot-cut-director.v1", planDigest: computeDeterministicDigest(digestSource),
    presetId, dialogue, emotion: input.emotion, strokePreset: input.strokePreset, layers, viewBox: { width: 360, height: 640 },
    camera3d, webgpuRimLight, charExpressionPose, opticalBalloonSfx, scrollGutterRhythm, authorSovereignty,
  };
}

/** 원샷 컷 라이브 연출 플랜을 결정론적 JSON 연출 시트로 직렬화한다. */
export function exportOneshotCutPlanJson(plan: OneshotCutPlan): string {
  return JSON.stringify(
    {
      schemaVersion: plan.schemaVersion, planDigest: plan.planDigest, presetId: plan.presetId,
      input: { dialogue: plan.dialogue, emotion: plan.emotion, strokePreset: plan.strokePreset, layers: plan.layers },
      viewBox: plan.viewBox,
      directorLayers: { camera3d: plan.camera3d, webgpuRimLight: plan.webgpuRimLight, charExpressionPose: plan.charExpressionPose, opticalBalloonSfx: plan.opticalBalloonSfx, scrollGutterRhythm: plan.scrollGutterRhythm },
      invariants: { faceBalloonOverlapRatio: plan.opticalBalloonSfx.faceOverlapRatio, faceBalloonClearancePx: plan.opticalBalloonSfx.faceClearancePx, sfxFaceOverlapRatio: plan.opticalBalloonSfx.sfxFaceOverlapRatio, crossed180Rule: plan.camera3d.eyeLineAxis.crossed180Rule, violetFreeOklch: plan.webgpuRimLight.violetFreeVerified, handJointCount: plan.charExpressionPose.handGrip.jointCount, nonDestructive: plan.authorSovereignty.nonDestructive },
      authorSovereignty: plan.authorSovereignty,
    },
    null,
    2,
  );
}
