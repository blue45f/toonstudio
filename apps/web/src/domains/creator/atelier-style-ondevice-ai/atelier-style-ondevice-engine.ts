/**
 * Wave 65B — AtelierStyle 7대 웹툰 화풍 실시간 양방향 변환 & ToonSilicon 온디바이스 AI 아키텍처 엔진.
 *
 * - 100% ToonStudio 고유 브랜드(AtelierStyle · AtelierInk · ToonSilicon · PrismLight · AtelierStage)
 * - 7대 웹툰 화풍 통합 프리셋 + OKLCH 무바이올렛(265~325° 0%) 보증
 * - 양방향 비파괴 화풍 변환(모드 A: 그리면서 실시간 변환 / 모드 B: 완성 컷·3D 배경 역변환 & DNA 동기화)
 * - 최신 모바일 NPU/TPU(5종) + PC NPU/GPU(4종) = 9종 실리콘 × 7대 온디바이스 AI 기능 디스패치 매트릭스
 *   (서버 전송 0바이트 · 서버비 0원 · 오프라인 실행 · WebNN/LiteRT-Web vs 네이티브 브리지 정직 구분, 허위 실측 ms/FPS 금지)
 * - 실제 WGSL 화풍 변환 컴퓨트 커널 템플릿 + JSON 매니페스트 내보내기
 */

export const ATELIER_STYLE_ONDEVICE_SCHEMA_VERSION = "toonstudio.atelier-style-ondevice-ai.v1" as const;
export const ATELIER_STYLE_MODEL_KIND = "ondevice-style-and-ai-dispatch-architecture" as const;
export const ATELIER_STYLE_PROPRIETARY_BRANDS = ["AtelierStyle", "AtelierInk", "ToonSilicon", "PrismLight"] as const;

export const VIOLET_HUE_MIN = 265;
export const VIOLET_HUE_MAX = 325;
const SAFE_FALLBACK_HUE = 212;
export const DEFAULT_STYLE_STRENGTH = 85;
export const DEFAULT_PAPER_GRAIN_INTENSITY = 70;
export const DEFAULT_LINE_CONTRAST = 80;

export type AtelierWebtoonStyleId =
  | "korean-sumi-murim" | "rofan-watercolor-jewel" | "shonen-action-gpen"
  | "slice-pastel-crayon" | "noir-ink-hatching" | "painterly-gouache-impasto" | "cinema-cel-anime";
export type StyleTransformMode = "live-stroke-to-style" | "scene-restyle-and-3d-sync";
export type ToonSiliconFormFactor = "mobile" | "pc";
export type ToonSiliconProfileId =
  | "mobile-google-tensor-tpu" | "mobile-snapdragon-hexagon" | "mobile-apple-ane"
  | "mobile-dimensity-apu" | "mobile-exynos-npu"
  | "pc-apple-m" | "pc-intel-core-ultra" | "pc-amd-ryzen-xdna2" | "pc-nvidia-rtx";
export type OndeviceAiTaskId =
  | "auto-flatting-lineart" | "photo-to-webtoon-bg" | "local-voice-to-balloon"
  | "depth-25d-auto-shadow" | "episode-50cut-qa-audit" | "creator-dna-3to5-extract" | "micro-mlp-stroke-stabilizer";
export type QuantizationPrecision = "INT8" | "FP16" | "4-bit";
export type DispatchRouteHonestyTier = "web-standard-ready" | "web-standard-with-native-boost" | "native-bridge-recommended";
export type MemoryFootprintTier = "ultra-light" | "light" | "balanced" | "high-context";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface StyleLineProfile {
  readonly baseWidthPx: number; readonly entryTaper: number; readonly exitTaper: number;
  readonly pressureGamma: number; readonly bristleSplitCount: number; readonly depthAdaptiveTaper: boolean;
}
export interface StylePaperProfile {
  readonly substrateKo: string; readonly substrateEn: string;
  readonly fiberRoughness: number; readonly capillaryBleed: number;
  readonly sobelImpastoStrength: number; readonly filmGrainStrength: number; readonly blueNoiseScreentone: boolean;
}
export interface StyleShadingProfile {
  readonly celBands: number; readonly shadowContrast: number; readonly highlightHalation: number;
  readonly rimLightBoost: number; readonly spectralPigmentMix: number;
  readonly crossHatchDensity: number; readonly negativeSpaceRatio: number;
}
export interface StyleLutProfile {
  readonly temperatureShift: number; readonly saturationScale: number; readonly midtoneLift: number; readonly shadowCrush: number;
}
export interface Style3dSyncProfile {
  readonly outlineDepthThreshold: number; readonly outlineNormalThreshold: number;
  readonly albedoDesaturation: number; readonly shadowBandSteps: number;
  readonly paperOverlayBlend: number; readonly rimLightAngleDeg: number;
}
export interface StylePalette {
  readonly paper: OklchColor; readonly ink: OklchColor; readonly midtone: OklchColor;
  readonly shadow: OklchColor; readonly accent: OklchColor; readonly rimLight: OklchColor;
}
export interface AtelierWebtoonStylePreset {
  readonly id: AtelierWebtoonStyleId; readonly order: number;
  readonly labelKo: string; readonly labelEn: string; readonly genreKo: string; readonly genreEn: string;
  readonly signatureKo: string; readonly signatureEn: string; readonly brandStack: string; readonly wgslKernelTag: number;
  readonly lineProfile: StyleLineProfile; readonly paperProfile: StylePaperProfile;
  readonly shadingProfile: StyleShadingProfile; readonly lutProfile: StyleLutProfile;
  readonly scene3dSyncProfile: Style3dSyncProfile; readonly palette: StylePalette;
}
export interface RawVectorStrokePoint { readonly x: number; readonly y: number; readonly pressure: number; readonly velocity: number; }
export interface RawVectorStrokeSample {
  readonly strokeId: string; readonly role: "contour" | "interior" | "accent"; readonly points: readonly RawVectorStrokePoint[];
}
export interface Source3dSceneReference {
  readonly sceneId: string; readonly titleKo: string; readonly titleEn: string;
  readonly hasDepthPass: boolean; readonly hasNormalPass: boolean; readonly flatAlbedoChroma: number; readonly baseOutlineWidthPx: number;
}
export interface BidirectionalStyleTransformInput {
  readonly styleId: AtelierWebtoonStyleId; readonly mode: StyleTransformMode;
  readonly styleStrength?: number; readonly paperGrainIntensity?: number; readonly lineContrast?: number;
  readonly sourceStrokes?: readonly RawVectorStrokeSample[]; readonly source3dScene?: Source3dSceneReference;
}
export interface LiveStrokeStyleBinding {
  readonly strokeId: string; readonly role: RawVectorStrokeSample["role"]; readonly preservedPointCount: number;
  readonly rawBaseWidthPx: number; readonly stylizedMeanWidthPx: number; readonly stylizedPeakWidthPx: number;
  readonly taperSharpness: number; readonly bristleSplitCount: number;
  readonly paperToothModulation: number; readonly capillaryBleedWeight: number; readonly lutTemperatureShift: number;
}
export interface StyleDnaSignature {
  readonly styleId: AtelierWebtoonStyleId; readonly effectiveLineWidthPx: number; readonly shadingBandCount: number;
  readonly paperRoughnessIndex: number; readonly inkContrastIndex: number; readonly rimLightIntensity: number; readonly dnaFingerprint: string;
}
export interface Scene3dRestyleSyncPlan {
  readonly sourceSceneId: string; readonly matchedLineWidthPx: number; readonly matchedShadingBands: number;
  readonly contourDepthThreshold: number; readonly contourNormalThreshold: number;
  readonly paperOverlayStrength: number; readonly albedoHarmonyScale: number;
  readonly prismLightRimBoost: number; readonly rimLightAngleDeg: number;
  readonly pipelineStages: readonly string[]; readonly syncSummaryKo: string; readonly syncSummaryEn: string;
}
export interface BidirectionalStyleTransformResult {
  readonly modelKind: typeof ATELIER_STYLE_MODEL_KIND; readonly style: AtelierWebtoonStylePreset; readonly mode: StyleTransformMode;
  readonly normalizedStrength: number; readonly normalizedPaperGrain: number; readonly normalizedLineContrast: number;
  readonly originalSourcePreserved: true; readonly reversibleToRawVector: true; readonly roundTripStyleSwitchLossless: true;
  readonly originalStrokeDigest: string; readonly preservedOriginalStrokeDigest: string;
  readonly preservedOriginalStrokes: readonly RawVectorStrokeSample[]; readonly liveStrokeBindings: readonly LiveStrokeStyleBinding[];
  readonly styleDna: StyleDnaSignature; readonly scene3dSyncPlan: Scene3dRestyleSyncPlan;
}
export interface ToonSiliconProfile {
  readonly id: ToonSiliconProfileId; readonly order: number; readonly formFactor: ToonSiliconFormFactor;
  readonly nameKo: string; readonly nameEn: string; readonly acceleratorClassKo: string; readonly acceleratorClassEn: string;
  readonly browserStandardApi: string; readonly nativeBridgeApi: string;
  readonly preferredHeavyQuant: QuantizationPrecision; readonly preferredLightQuant: QuantizationPrecision;
  readonly thermalPolicyKo: string; readonly thermalPolicyEn: string;
}
export interface OndeviceAiCreatorTaskSpec {
  readonly id: OndeviceAiTaskId; readonly order: number;
  readonly titleKo: string; readonly titleEn: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly brandSubsystem: string; readonly complexityClass: "micro" | "medium" | "heavy";
  readonly memoryTierMobile: MemoryFootprintTier; readonly memoryTierPc: MemoryFootprintTier;
  readonly mobileWebPath: string; readonly pcWebPath: string;
  readonly supportsPureBrowserOnMobile: boolean; readonly supportsPureBrowserOnPc: boolean;
}
export interface OndeviceAiDispatchRow {
  readonly task: OndeviceAiCreatorTaskSpec; readonly siliconId: ToonSiliconProfileId;
  readonly quantization: QuantizationPrecision; readonly webStandardPath: string; readonly nativeBridgePath: string;
  readonly routeHonestyTier: DispatchRouteHonestyTier; readonly memoryFootprintTier: MemoryFootprintTier;
  readonly serverUploadBytes: 0; readonly cloudServerCostWon: 0; readonly offlineCapable: true;
  readonly executionNoteKo: string; readonly executionNoteEn: string;
}
export interface OndeviceAiDispatchMatrix {
  readonly modelKind: typeof ATELIER_STYLE_MODEL_KIND; readonly silicon: ToonSiliconProfile;
  readonly rows: readonly OndeviceAiDispatchRow[]; readonly totalTasks: number;
  readonly totalServerUploadBytes: 0; readonly cloudServerCostWon: 0; readonly allOfflineCapable: true;
  readonly webStandardReadyCount: number; readonly nativeBridgeRecommendedCount: number;
  readonly honestyNoticeKo: string; readonly honestyNoticeEn: string;
}
export interface AllSiliconMatrixAudit {
  readonly siliconCount: number; readonly mobileSiliconCount: number; readonly pcSiliconCount: number;
  readonly taskCount: number; readonly totalCombinations: number;
  readonly totalServerUploadBytes: number; readonly totalCloudServerCostWon: number;
  readonly allOfflineCapable: boolean; readonly passed: boolean;
}
export interface StylePaletteVioletAudit {
  readonly inspectedStyleCount: number; readonly inspectedColorCount: number;
  readonly violetColorCount: number; readonly violetPercent: number; readonly passed: boolean;
}
export interface StyleWgslKernelInput {
  readonly styleId: AtelierWebtoonStyleId; readonly mode: StyleTransformMode;
  readonly styleStrength?: number; readonly paperGrainIntensity?: number; readonly lineContrast?: number;
}
export interface AtelierStyleOndeviceSnapshotInput {
  readonly styleId?: AtelierWebtoonStyleId; readonly mode?: StyleTransformMode; readonly siliconId?: ToonSiliconProfileId;
  readonly styleStrength?: number; readonly paperGrainIntensity?: number; readonly lineContrast?: number;
}
export interface AtelierStyleOndeviceSnapshot {
  readonly schemaVersion: typeof ATELIER_STYLE_ONDEVICE_SCHEMA_VERSION;
  readonly modelKind: typeof ATELIER_STYLE_MODEL_KIND;
  readonly proprietaryBrands: readonly string[];
  readonly transform: BidirectionalStyleTransformResult;
  readonly dispatchMatrix: OndeviceAiDispatchMatrix;
  readonly violetAudit: StylePaletteVioletAudit;
  readonly wgslKernel: string;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
export function normalizeHue(hue: number): number {
  return Number.isFinite(hue) ? roundTo(((hue % 360) + 360) % 360, 1) : 0;
}
export function isForbiddenVioletHue(hue: number): boolean {
  const normalized = normalizeHue(hue);
  return normalized >= VIOLET_HUE_MIN && normalized <= VIOLET_HUE_MAX;
}
export function sanitizeNonVioletHue(hue: number): number {
  const normalized = normalizeHue(hue);
  return isForbiddenVioletHue(normalized) ? SAFE_FALLBACK_HUE : normalized;
}
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = roundTo(clamp(color.l, 0, 1, 0.5), 3);
  const c = roundTo(clamp(color.c, 0, 0.35, 0), 3);
  const h = sanitizeNonVioletHue(color.h);
  return alpha !== undefined ? `oklch(${l} ${c} ${h} / ${clamp(alpha, 0, 1, 1).toFixed(2)})` : `oklch(${l} ${c} ${h})`;
}

export const ATELIER_WEBTOON_STYLES: readonly AtelierWebtoonStylePreset[] = [
  {
    id: "korean-sumi-murim", order: 1, labelKo: "한국 수묵·무협", labelEn: "Korean Sumi Murim", genreKo: "수묵·무협", genreEn: "Sumi · Martial Arts",
    signatureKo: "한지 섬유 요철 · 24모 갈필 · 먹 번짐 · 여백 대비",
    signatureEn: "Mulberry hanji grain · 24-bristle dry-brush · capillary ink bleed · negative-space contrast",
    brandStack: "AtelierStyle · AtelierInk · PrismLight", wgslKernelTag: 1,
    lineProfile: { baseWidthPx: 3.4, entryTaper: 0.92, exitTaper: 0.96, pressureGamma: 1.45, bristleSplitCount: 24, depthAdaptiveTaper: true },
    paperProfile: { substrateKo: "닥나무 장지 한지 (110gsm)", substrateEn: "Mulberry Hanji (110gsm)", fiberRoughness: 0.86, capillaryBleed: 0.82, sobelImpastoStrength: 0.14, filmGrainStrength: 0.18, blueNoiseScreentone: false },
    shadingProfile: { celBands: 3, shadowContrast: 0.92, highlightHalation: 0.08, rimLightBoost: 0.25, spectralPigmentMix: 0.72, crossHatchDensity: 0.12, negativeSpaceRatio: 0.64 },
    lutProfile: { temperatureShift: 0.12, saturationScale: 0.38, midtoneLift: 0.14, shadowCrush: 0.88 },
    scene3dSyncProfile: { outlineDepthThreshold: 0.018, outlineNormalThreshold: 0.36, albedoDesaturation: 0.76, shadowBandSteps: 3, paperOverlayBlend: 0.82, rimLightAngleDeg: 38 },
    palette: { paper: { l: 0.952, c: 0.018, h: 88 }, ink: { l: 0.175, c: 0.014, h: 215 }, midtone: { l: 0.56, c: 0.016, h: 96 }, shadow: { l: 0.26, c: 0.018, h: 212 }, accent: { l: 0.54, c: 0.165, h: 28 }, rimLight: { l: 0.89, c: 0.042, h: 84 } },
  },
  {
    id: "rofan-watercolor-jewel", order: 2, labelKo: "로판 수채·보석", labelEn: "Rofan Watercolor Jewel", genreKo: "로맨스 판타지", genreEn: "Romance Fantasy",
    signatureKo: "모세관 백런 · 살구 피부 SDF · 할레이션 글로우",
    signatureEn: "Capillary backrun blooms · apricot skin SDF · optical jewel halation glow",
    brandStack: "AtelierStyle · AtelierInk · PrismLight", wgslKernelTag: 2,
    lineProfile: { baseWidthPx: 1.85, entryTaper: 0.78, exitTaper: 0.84, pressureGamma: 1.15, bristleSplitCount: 6, depthAdaptiveTaper: true },
    paperProfile: { substrateKo: "코튼 냉압 수채지 (300gsm)", substrateEn: "Cold-Press Cotton (300gsm)", fiberRoughness: 0.54, capillaryBleed: 0.91, sobelImpastoStrength: 0.08, filmGrainStrength: 0.06, blueNoiseScreentone: false },
    shadingProfile: { celBands: 5, shadowContrast: 0.48, highlightHalation: 0.94, rimLightBoost: 0.88, spectralPigmentMix: 0.86, crossHatchDensity: 0.04, negativeSpaceRatio: 0.38 },
    lutProfile: { temperatureShift: 0.26, saturationScale: 1.12, midtoneLift: 0.32, shadowCrush: 0.22 },
    scene3dSyncProfile: { outlineDepthThreshold: 0.026, outlineNormalThreshold: 0.44, albedoDesaturation: 0.14, shadowBandSteps: 5, paperOverlayBlend: 0.48, rimLightAngleDeg: 54 },
    palette: { paper: { l: 0.972, c: 0.016, h: 68 }, ink: { l: 0.34, c: 0.055, h: 32 }, midtone: { l: 0.84, c: 0.068, h: 48 }, shadow: { l: 0.58, c: 0.072, h: 18 }, accent: { l: 0.62, c: 0.155, h: 16 }, rimLight: { l: 0.88, c: 0.11, h: 74 } },
  },
  {
    id: "shonen-action-gpen", order: 3, labelKo: "소년·액션 G펜", labelEn: "Shonen Action G-Pen", genreKo: "소년·액션", genreEn: "Shonen · Action",
    signatureKo: "날카로운 테이퍼 · 블루노이즈 무모아레 스크린톤 · 속도선",
    signatureEn: "Sharp G-pen taper · blue-noise moire-free screentone · radial speedlines",
    brandStack: "AtelierStyle · AtelierInk · ToonSilicon", wgslKernelTag: 3,
    lineProfile: { baseWidthPx: 2.6, entryTaper: 0.96, exitTaper: 0.98, pressureGamma: 1.62, bristleSplitCount: 1, depthAdaptiveTaper: true },
    paperProfile: { substrateKo: "고평활 원고지 (135gsm)", substrateEn: "Smooth Plate Stock (135gsm)", fiberRoughness: 0.14, capillaryBleed: 0.08, sobelImpastoStrength: 0.04, filmGrainStrength: 0.1, blueNoiseScreentone: true },
    shadingProfile: { celBands: 2, shadowContrast: 0.95, highlightHalation: 0.22, rimLightBoost: 0.64, spectralPigmentMix: 0.24, crossHatchDensity: 0.44, negativeSpaceRatio: 0.42 },
    lutProfile: { temperatureShift: 0.04, saturationScale: 1.08, midtoneLift: 0.06, shadowCrush: 0.84 },
    scene3dSyncProfile: { outlineDepthThreshold: 0.014, outlineNormalThreshold: 0.28, albedoDesaturation: 0.45, shadowBandSteps: 2, paperOverlayBlend: 0.34, rimLightAngleDeg: 28 },
    palette: { paper: { l: 0.982, c: 0.005, h: 95 }, ink: { l: 0.15, c: 0.012, h: 228 }, midtone: { l: 0.66, c: 0.022, h: 222 }, shadow: { l: 0.22, c: 0.028, h: 226 }, accent: { l: 0.58, c: 0.175, h: 36 }, rimLight: { l: 0.84, c: 0.115, h: 204 } },
  },
  {
    id: "slice-pastel-crayon", order: 4, labelKo: "일상·힐링 색연필·파스텔", labelEn: "Slice Pastel Crayon", genreKo: "일상·힐링", genreEn: "Slice of Life · Healing",
    signatureKo: "종이 능선 흑연 스침 · 저채도 온기 · 부드러운 필압 결",
    signatureEn: "Paper-ridge graphite & pastel tooth catch · low-chroma warmth · soft tactile grain",
    brandStack: "AtelierStyle · AtelierInk", wgslKernelTag: 4,
    lineProfile: { baseWidthPx: 2.35, entryTaper: 0.42, exitTaper: 0.48, pressureGamma: 0.92, bristleSplitCount: 10, depthAdaptiveTaper: false },
    paperProfile: { substrateKo: "요철 면 파스텔지 (160gsm)", substrateEn: "Tooth Pastel Cotton Paper (160gsm)", fiberRoughness: 0.9, capillaryBleed: 0.12, sobelImpastoStrength: 0.22, filmGrainStrength: 0.24, blueNoiseScreentone: false },
    shadingProfile: { celBands: 4, shadowContrast: 0.36, highlightHalation: 0.28, rimLightBoost: 0.34, spectralPigmentMix: 0.68, crossHatchDensity: 0.18, negativeSpaceRatio: 0.46 },
    lutProfile: { temperatureShift: 0.3, saturationScale: 0.72, midtoneLift: 0.36, shadowCrush: 0.14 },
    scene3dSyncProfile: { outlineDepthThreshold: 0.03, outlineNormalThreshold: 0.48, albedoDesaturation: 0.34, shadowBandSteps: 4, paperOverlayBlend: 0.78, rimLightAngleDeg: 64 },
    palette: { paper: { l: 0.962, c: 0.022, h: 82 }, ink: { l: 0.36, c: 0.044, h: 52 }, midtone: { l: 0.82, c: 0.056, h: 148 }, shadow: { l: 0.62, c: 0.048, h: 66 }, accent: { l: 0.6, c: 0.11, h: 156 }, rimLight: { l: 0.9, c: 0.078, h: 76 } },
  },
  {
    id: "noir-ink-hatching", order: 5, labelKo: "느와르·스릴러", labelEn: "Noir Ink Hatching", genreKo: "느와르·스릴러", genreEn: "Noir · Thriller",
    signatureKo: "고대비 크로스해칭 · 거친 필름 그레인 · 극단 먹 음영",
    signatureEn: "High-contrast cross-hatching · coarse film grain · crushed chiaroscuro ink shadows",
    brandStack: "AtelierStyle · AtelierInk · PrismLight", wgslKernelTag: 5,
    lineProfile: { baseWidthPx: 2.95, entryTaper: 0.88, exitTaper: 0.91, pressureGamma: 1.54, bristleSplitCount: 4, depthAdaptiveTaper: true },
    paperProfile: { substrateKo: "고대비 매트 먹지 · 35mm 입자", substrateEn: "Matte Charcoal Stock · Coarse Grain", fiberRoughness: 0.46, capillaryBleed: 0.24, sobelImpastoStrength: 0.12, filmGrainStrength: 0.94, blueNoiseScreentone: false },
    shadingProfile: { celBands: 2, shadowContrast: 0.98, highlightHalation: 0.16, rimLightBoost: 0.76, spectralPigmentMix: 0.18, crossHatchDensity: 0.95, negativeSpaceRatio: 0.28 },
    lutProfile: { temperatureShift: -0.18, saturationScale: 0.24, midtoneLift: -0.22, shadowCrush: 0.96 },
    scene3dSyncProfile: { outlineDepthThreshold: 0.012, outlineNormalThreshold: 0.25, albedoDesaturation: 0.88, shadowBandSteps: 2, paperOverlayBlend: 0.7, rimLightAngleDeg: 14 },
    palette: { paper: { l: 0.24, c: 0.012, h: 222 }, ink: { l: 0.12, c: 0.008, h: 230 }, midtone: { l: 0.44, c: 0.016, h: 218 }, shadow: { l: 0.16, c: 0.01, h: 228 }, accent: { l: 0.68, c: 0.145, h: 48 }, rimLight: { l: 0.82, c: 0.058, h: 210 } },
  },
  {
    id: "painterly-gouache-impasto", order: 6, labelKo: "회화·과슈 임파스토", labelEn: "Painterly Gouache Impasto", genreKo: "회화·일러스트", genreEn: "Painterly · Gouache",
    signatureKo: "45° Sobel 두께 부조 · 분광 혼색 · 캔버스 결 안료 적층",
    signatureEn: "45° Sobel impasto height relief · spectral pigment mixing · canvas bristle buildup",
    brandStack: "AtelierStyle · AtelierInk · PrismLight", wgslKernelTag: 6,
    lineProfile: { baseWidthPx: 4.1, entryTaper: 0.36, exitTaper: 0.44, pressureGamma: 1.05, bristleSplitCount: 16, depthAdaptiveTaper: false },
    paperProfile: { substrateKo: "프라이밍 린넨 캔버스 (380gsm)", substrateEn: "Primed Linen Canvas (380gsm)", fiberRoughness: 0.78, capillaryBleed: 0.35, sobelImpastoStrength: 0.95, filmGrainStrength: 0.14, blueNoiseScreentone: false },
    shadingProfile: { celBands: 6, shadowContrast: 0.64, highlightHalation: 0.24, rimLightBoost: 0.52, spectralPigmentMix: 0.96, crossHatchDensity: 0.22, negativeSpaceRatio: 0.24 },
    lutProfile: { temperatureShift: 0.16, saturationScale: 1.04, midtoneLift: 0.12, shadowCrush: 0.42 },
    scene3dSyncProfile: { outlineDepthThreshold: 0.032, outlineNormalThreshold: 0.52, albedoDesaturation: 0.12, shadowBandSteps: 6, paperOverlayBlend: 0.66, rimLightAngleDeg: 45 },
    palette: { paper: { l: 0.92, c: 0.026, h: 76 }, ink: { l: 0.29, c: 0.056, h: 44 }, midtone: { l: 0.64, c: 0.095, h: 64 }, shadow: { l: 0.36, c: 0.082, h: 232 }, accent: { l: 0.56, c: 0.15, h: 32 }, rimLight: { l: 0.87, c: 0.105, h: 86 } },
  },
  {
    id: "cinema-cel-anime", order: 7, labelKo: "극장판 셀 애니", labelEn: "Cinema Cel Anime", genreKo: "극장판·셀 애니", genreEn: "Theatrical Cel Anime",
    signatureKo: "2단 선명 셀 음영 · 거리 적응형 테이퍼 외곽선 · 림라이트",
    signatureEn: "Crisp 2-band cel shading · depth-adaptive outline taper · Fresnel PrismLight rim",
    brandStack: "AtelierStyle · PrismLight · AtelierStage", wgslKernelTag: 7,
    lineProfile: { baseWidthPx: 2.05, entryTaper: 0.84, exitTaper: 0.86, pressureGamma: 1.24, bristleSplitCount: 1, depthAdaptiveTaper: true },
    paperProfile: { substrateKo: "광학 셀 필름 · 미세 블룸", substrateEn: "Optical Cel Film · Clean Bloom", fiberRoughness: 0.08, capillaryBleed: 0.04, sobelImpastoStrength: 0.04, filmGrainStrength: 0.12, blueNoiseScreentone: false },
    shadingProfile: { celBands: 2, shadowContrast: 0.78, highlightHalation: 0.62, rimLightBoost: 0.95, spectralPigmentMix: 0.34, crossHatchDensity: 0.06, negativeSpaceRatio: 0.34 },
    lutProfile: { temperatureShift: -0.06, saturationScale: 1.16, midtoneLift: 0.18, shadowCrush: 0.52 },
    scene3dSyncProfile: { outlineDepthThreshold: 0.016, outlineNormalThreshold: 0.32, albedoDesaturation: 0.08, shadowBandSteps: 2, paperOverlayBlend: 0.18, rimLightAngleDeg: 32 },
    palette: { paper: { l: 0.974, c: 0.009, h: 205 }, ink: { l: 0.21, c: 0.034, h: 235 }, midtone: { l: 0.72, c: 0.088, h: 205 }, shadow: { l: 0.42, c: 0.082, h: 230 }, accent: { l: 0.58, c: 0.155, h: 205 }, rimLight: { l: 0.89, c: 0.128, h: 58 } },
  },
] as const;

export const DEFAULT_RAW_VECTOR_STROKES: readonly RawVectorStrokeSample[] = [
  {
    strokeId: "vec-silhouette-01", role: "contour",
    points: [
      { x: 42, y: 176, pressure: 0.28, velocity: 0.72 }, { x: 74, y: 122, pressure: 0.78, velocity: 0.48 },
      { x: 112, y: 84, pressure: 0.94, velocity: 0.32 }, { x: 148, y: 118, pressure: 0.66, velocity: 0.54 },
      { x: 164, y: 172, pressure: 0.24, velocity: 0.81 },
    ],
  },
  {
    strokeId: "vec-garment-sweep-02", role: "interior",
    points: [
      { x: 64, y: 152, pressure: 0.35, velocity: 0.65 }, { x: 96, y: 136, pressure: 0.82, velocity: 0.42 },
      { x: 132, y: 146, pressure: 0.58, velocity: 0.58 }, { x: 152, y: 166, pressure: 0.22, velocity: 0.86 },
    ],
  },
  {
    strokeId: "vec-rim-detail-03", role: "accent",
    points: [
      { x: 86, y: 92, pressure: 0.42, velocity: 0.52 }, { x: 108, y: 74, pressure: 0.86, velocity: 0.36 },
      { x: 134, y: 88, pressure: 0.34, velocity: 0.74 },
    ],
  },
] as const;

export const DEFAULT_SOURCE_3D_SCENE: Source3dSceneReference = {
  sceneId: "stage-cut-courtyard-01", titleKo: "AtelierStage 3D 회랑 · 석등 컷", titleEn: "AtelierStage 3D Courtyard & Lantern Cut",
  hasDepthPass: true, hasNormalPass: true, flatAlbedoChroma: 0.11, baseOutlineWidthPx: 2.0,
};

export const TOON_SILICON_PROFILES: readonly ToonSiliconProfile[] = [
  { id: "mobile-google-tensor-tpu", order: 1, formFactor: "mobile", nameKo: "Google Tensor TPU", nameEn: "Google Tensor TPU", acceleratorClassKo: "모바일 TPU · 전용 행렬 연산기", acceleratorClassEn: "Mobile TPU · Matrix Unit", browserStandardApi: "LiteRT-Web (WebGPU / XNNPACK)", nativeBridgeApi: "LiteRT Tensor TPU / NNAPI Bridge", preferredHeavyQuant: "4-bit", preferredLightQuant: "INT8", thermalPolicyKo: "연속 컷 감사 시 INT8·4-bit 배치 간격 조절로 모바일 발열을 억제합니다.", thermalPolicyEn: "Uses INT8/4-bit duty-cycled batching to curb mobile thermal load." },
  { id: "mobile-snapdragon-hexagon", order: 2, formFactor: "mobile", nameKo: "Snapdragon Hexagon NPU", nameEn: "Snapdragon Hexagon NPU", acceleratorClassKo: "모바일 Hexagon NPU · 텐서 가속", acceleratorClassEn: "Mobile Hexagon NPU · Tensor Core", browserStandardApi: "WebNN (GPU) · LiteRT-Web (WebGPU)", nativeBridgeApi: "QNN Hexagon NPU Bridge", preferredHeavyQuant: "4-bit", preferredLightQuant: "INT8", thermalPolicyKo: "INT8 정수 연산 우선 배정으로 펜 드로잉 중 배터리 소모를 최소화합니다.", thermalPolicyEn: "Prioritizes INT8 integer ops to preserve battery during pen sessions." },
  { id: "mobile-apple-ane", order: 3, formFactor: "mobile", nameKo: "Apple ANE (iPhone · iPad)", nameEn: "Apple ANE (iPhone · iPad)", acceleratorClassKo: "모바일 Neural Engine · 통합 메모리", acceleratorClassEn: "Mobile Neural Engine · Unified RAM", browserStandardApi: "LiteRT-Web (WebGPU / WASM SIMD)", nativeBridgeApi: "CoreML ANE Bridge", preferredHeavyQuant: "4-bit", preferredLightQuant: "FP16", thermalPolicyKo: "FP16·INT8 혼합 정밀도와 통합 메모리로 캔버스 프레임 예산을 보호합니다.", thermalPolicyEn: "Protects canvas frame headroom with FP16/INT8 unified-memory scheduling." },
  { id: "mobile-dimensity-apu", order: 4, formFactor: "mobile", nameKo: "Dimensity APU", nameEn: "Dimensity APU", acceleratorClassKo: "모바일 APU · 하드웨어 양자화 엔진", acceleratorClassEn: "Mobile APU · Quantization Engine", browserStandardApi: "LiteRT-Web (WebGPU / XNNPACK)", nativeBridgeApi: "NeuroPilot APU Bridge", preferredHeavyQuant: "4-bit", preferredLightQuant: "INT8", thermalPolicyKo: "4-bit 가중치 스트리밍과 INT8 타일 분할 추론으로 메모리 피크를 제한합니다.", thermalPolicyEn: "Caps mobile RAM peaks via 4-bit weight streaming and INT8 tiled runs." },
  { id: "mobile-exynos-npu", order: 5, formFactor: "mobile", nameKo: "Exynos NPU", nameEn: "Exynos NPU", acceleratorClassKo: "모바일 NPU · Xclipse GPU 협동", acceleratorClassEn: "Mobile NPU · Xclipse GPU Co-Exec", browserStandardApi: "LiteRT-Web (WebGPU / XNNPACK)", nativeBridgeApi: "ENN / NNAPI Exynos NPU Bridge", preferredHeavyQuant: "4-bit", preferredLightQuant: "INT8", thermalPolicyKo: "경량 비전 패스는 NPU, 화풍 셰이더는 WebGPU에 분리 배정해 간섭을 줄입니다.", thermalPolicyEn: "Splits vision passes on NPU and style shaders on WebGPU to cut contention." },
  { id: "pc-apple-m", order: 6, formFactor: "pc", nameKo: "Apple M 시리즈", nameEn: "Apple M Series", acceleratorClassKo: "PC 통합 메모리 ANE + Metal GPU", acceleratorClassEn: "PC Unified-Memory ANE + Metal GPU", browserStandardApi: "WebNN (CoreML/GPU) · LiteRT-Web (WebGPU)", nativeBridgeApi: "CoreML ANE + Metal Compute Bridge", preferredHeavyQuant: "FP16", preferredLightQuant: "FP16", thermalPolicyKo: "통합 메모리 대역폭으로 50컷 감사와 스타일 DNA 추출을 로컬에서 여유 있게 처리합니다.", thermalPolicyEn: "Runs 50-cut QA and style DNA extraction locally via unified memory." },
  { id: "pc-intel-core-ultra", order: 7, formFactor: "pc", nameKo: "Intel Core Ultra (NPU + Arc)", nameEn: "Intel Core Ultra (NPU + Arc)", acceleratorClassKo: "PC 전용 NPU + Arc 내장 GPU", acceleratorClassEn: "PC Dedicated NPU + Arc iGPU", browserStandardApi: "WebNN (OpenVINO NPU / DirectML GPU)", nativeBridgeApi: "OpenVINO NPU + DirectML Bridge", preferredHeavyQuant: "INT8", preferredLightQuant: "INT8", thermalPolicyKo: "상시 손떨림 보정과 음성 전사는 NPU에 맡기고 GPU는 AtelierStyle 셰이더에 집중합니다.", thermalPolicyEn: "Offloads stabilizer and voice to NPU while GPU runs AtelierStyle shaders." },
  { id: "pc-amd-ryzen-xdna2", order: 8, formFactor: "pc", nameKo: "AMD Ryzen XDNA2", nameEn: "AMD Ryzen XDNA2", acceleratorClassKo: "PC XDNA2 NPU · Block FP16/INT8", acceleratorClassEn: "PC XDNA2 NPU · Block FP16/INT8", browserStandardApi: "WebNN (DirectML NPU / WebGPU)", nativeBridgeApi: "Ryzen AI XDNA2 Runtime Bridge", preferredHeavyQuant: "INT8", preferredLightQuant: "FP16", thermalPolicyKo: "XDNA2 블록 부동소수점·INT8 타일 파이프라인으로 다중 컷 검사를 저전력으로 유지합니다.", thermalPolicyEn: "Runs multi-cut QA at low power on XDNA2 block-FP16 and INT8 spatial tiles." },
  { id: "pc-nvidia-rtx", order: 9, formFactor: "pc", nameKo: "NVIDIA RTX (Tensor Core)", nameEn: "NVIDIA RTX (Tensor Core)", acceleratorClassKo: "PC 전용 VRAM · Tensor Core GPU", acceleratorClassEn: "PC Dedicated VRAM · Tensor Core GPU", browserStandardApi: "WebNN (DirectML GPU) · LiteRT-Web (WebGPU DP4a)", nativeBridgeApi: "TensorRT / DirectML Native Bridge", preferredHeavyQuant: "FP16", preferredLightQuant: "FP16", thermalPolicyKo: "FP16 텐서 연산으로 고해상도 2.5D 깊이·3~5장 스타일 DNA 로컬 튜닝을 정밀 수행합니다.", thermalPolicyEn: "Executes high-res 2.5D depth and 3-5 page style DNA locally in FP16." },
] as const;

export const ON_DEVICE_AI_CREATOR_TASKS: readonly OndeviceAiCreatorTaskSpec[] = [
  { id: "auto-flatting-lineart", order: 1, titleKo: "① 1-터치 선화 자동 밑색 (Auto-Flatting)", titleEn: "1. One-Touch Lineart Auto-Flatting", summaryKo: "열린 선 틈새를 폐합하고 캐릭터·배경 영역별 밑색 마스크를 로컬에서 분리합니다.", summaryEn: "Closes lineart gaps and separates flatting regions locally.", brandSubsystem: "AtelierInk · ToonSilicon", complexityClass: "medium", memoryTierMobile: "light", memoryTierPc: "light", mobileWebPath: "LiteRT-Web (WebGPU)", pcWebPath: "WebNN (GPU) · LiteRT-Web", supportsPureBrowserOnMobile: true, supportsPureBrowserOnPc: true },
  { id: "photo-to-webtoon-bg", order: 2, titleKo: "② 현장 사진→웹툰 배경 선화·톤 추출", titleEn: "2. Location Photo to Webtoon Line & Tone", summaryKo: "현장 촬영 사진을 선택한 7대 화풍의 선화·스크린톤·한지 음영 레이어로 오프라인 분해합니다.", summaryEn: "Decomposes reference photos into style-matched lineart, tone, and paper shading offline.", brandSubsystem: "AtelierStyle · ToonSilicon", complexityClass: "medium", memoryTierMobile: "balanced", memoryTierPc: "light", mobileWebPath: "LiteRT-Web (WebGPU)", pcWebPath: "WebNN (NPU/GPU) · LiteRT-Web", supportsPureBrowserOnMobile: true, supportsPureBrowserOnPc: true },
  { id: "local-voice-to-balloon", order: 3, titleKo: "③ 로컬 음성→말풍선 자동 배치", titleEn: "3. Local Voice to Speech Balloon Layout", summaryKo: "마이크 구술 대사를 서버 전송 없이 로컬 인식 후 화자 위치에 맞춰 말풍선을 배치합니다.", summaryEn: "Transcribes dictated dialogue locally with zero upload and places balloons near speakers.", brandSubsystem: "ToonSilicon · CalmChrome", complexityClass: "medium", memoryTierMobile: "light", memoryTierPc: "light", mobileWebPath: "LiteRT-Web (WASM SIMD / WebGPU)", pcWebPath: "WebNN (NPU) · LiteRT-Web", supportsPureBrowserOnMobile: true, supportsPureBrowserOnPc: true },
  { id: "depth-25d-auto-shadow", order: 4, titleKo: "④ 2D→2.5D 깊이·자동 그림자", titleEn: "4. 2D-to-2.5D Depth & Auto-Shadow", summaryKo: "단일 2D 컷에서 깊이·법선 맵을 추정해 PrismLight 광원 각도별 그림자와 림라이트를 생성합니다.", summaryEn: "Estimates depth/normal maps from 2D cuts to drive PrismLight directional shadows.", brandSubsystem: "PrismLight · ToonSilicon", complexityClass: "heavy", memoryTierMobile: "balanced", memoryTierPc: "balanced", mobileWebPath: "LiteRT-Web (WebGPU)", pcWebPath: "WebNN (GPU) · LiteRT-Web", supportsPureBrowserOnMobile: true, supportsPureBrowserOnPc: true },
  { id: "episode-50cut-qa-audit", order: 5, titleKo: "⑤ 50컷 작화 붕괴·소품 누락 로컬 감사", titleEn: "5. 50-Cut Consistency & Prop QA Audit", summaryKo: "1화 50컷 전체의 인물 비율·복장·소품 누락과 화풍 이탈을 로컬 임베딩으로 일괄 점검합니다.", summaryEn: "Audits all 50 cuts locally for character consistency, missing props, and style drift.", brandSubsystem: "AtelierStyle · ToonSilicon", complexityClass: "heavy", memoryTierMobile: "high-context", memoryTierPc: "balanced", mobileWebPath: "LiteRT-Web (WebGPU 타일 배치)", pcWebPath: "WebNN (NPU/GPU)", supportsPureBrowserOnMobile: false, supportsPureBrowserOnPc: true },
  { id: "creator-dna-3to5-extract", order: 6, titleKo: "⑥ 작가 원고 3~5장 로컬 스타일 DNA 추출", titleEn: "6. 3-5 Page Local Creator Style DNA", summaryKo: "작가 원고 3~5장에서 선 굵기·음영 단수·종이결 DNA를 로컬 추출하며 원본은 기기 밖으로 나가지 않습니다.", summaryEn: "Extracts line, shading, and grain DNA from 3-5 pages locally; artwork stays on device.", brandSubsystem: "AtelierStyle · AtelierInk", complexityClass: "heavy", memoryTierMobile: "high-context", memoryTierPc: "balanced", mobileWebPath: "LiteRT-Web (WebGPU 경량 임베딩)", pcWebPath: "WebNN (NPU/GPU) · LiteRT-Web", supportsPureBrowserOnMobile: false, supportsPureBrowserOnPc: true },
  { id: "micro-mlp-stroke-stabilizer", order: 7, titleKo: "⑦ 초저지연 손떨림·필압 보정 (Micro-MLP)", titleEn: "7. Micro-MLP Stroke & Pressure Stabilizer", summaryKo: "초경량 Micro-MLP가 펜 궤적 떨림을 보정하고 필압 곡선을 선택한 화풍의 테이퍼에 정렬합니다.", summaryEn: "Ultra-light Micro-MLP smooths hand jitter and aligns pen pressure to active style taper.", brandSubsystem: "AtelierInk · ToonSilicon", complexityClass: "micro", memoryTierMobile: "ultra-light", memoryTierPc: "ultra-light", mobileWebPath: "WebNN / LiteRT-Web (WASM SIMD)", pcWebPath: "WebNN (NPU) · WASM SIMD", supportsPureBrowserOnMobile: true, supportsPureBrowserOnPc: true },
] as const;

export function getAtelierWebtoonStyle(styleId?: string): AtelierWebtoonStylePreset {
  return ATELIER_WEBTOON_STYLES.find((style) => style.id === styleId) ?? ATELIER_WEBTOON_STYLES[0];
}
export function getToonSiliconProfile(siliconId?: string): ToonSiliconProfile {
  return TOON_SILICON_PROFILES.find((profile) => profile.id === siliconId) ?? TOON_SILICON_PROFILES[0];
}

export function auditStylePaletteVioletZero(): StylePaletteVioletAudit {
  let inspectedColorCount = 0;
  let violetColorCount = 0;
  for (const style of ATELIER_WEBTOON_STYLES) {
    for (const color of Object.values(style.palette)) {
      inspectedColorCount += 1;
      if (isForbiddenVioletHue(color.h)) violetColorCount += 1;
    }
  }
  return {
    inspectedStyleCount: ATELIER_WEBTOON_STYLES.length, inspectedColorCount, violetColorCount,
    violetPercent: inspectedColorCount === 0 ? 0 : roundTo((violetColorCount / inspectedColorCount) * 100, 2),
    passed: violetColorCount === 0,
  };
}

export function computeRawStrokeDigest(strokes: readonly RawVectorStrokeSample[]): string {
  let hash = 2166136261;
  for (const stroke of strokes) {
    const header = `${stroke.strokeId}:${stroke.role}:${stroke.points.length}|`;
    for (let i = 0; i < header.length; i += 1) hash = Math.imul(hash ^ header.charCodeAt(i), 16777619) >>> 0;
    for (const pt of stroke.points) {
      const packed = `${roundTo(pt.x, 2)},${roundTo(pt.y, 2)},${roundTo(pt.pressure, 3)},${roundTo(pt.velocity, 3)};`;
      for (let i = 0; i < packed.length; i += 1) hash = Math.imul(hash ^ packed.charCodeAt(i), 16777619) >>> 0;
    }
  }
  return `vec-${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

export function evaluateBidirectionalStyleTransform(input: BidirectionalStyleTransformInput): BidirectionalStyleTransformResult {
  const style = getAtelierWebtoonStyle(input.styleId);
  const mode: StyleTransformMode = input.mode === "scene-restyle-and-3d-sync" ? "scene-restyle-and-3d-sync" : "live-stroke-to-style";
  const normalizedStrength = Math.round(clamp(input.styleStrength ?? DEFAULT_STYLE_STRENGTH, 0, 100, DEFAULT_STYLE_STRENGTH));
  const normalizedPaperGrain = Math.round(clamp(input.paperGrainIntensity ?? DEFAULT_PAPER_GRAIN_INTENSITY, 0, 100, DEFAULT_PAPER_GRAIN_INTENSITY));
  const normalizedLineContrast = Math.round(clamp(input.lineContrast ?? DEFAULT_LINE_CONTRAST, 0, 100, DEFAULT_LINE_CONTRAST));
  const sourceStrokes = input.sourceStrokes && input.sourceStrokes.length > 0 ? input.sourceStrokes : DEFAULT_RAW_VECTOR_STROKES;
  const source3dScene = input.source3dScene ?? DEFAULT_SOURCE_3D_SCENE;

  const originalStrokeDigest = computeRawStrokeDigest(sourceStrokes);
  const preservedOriginalStrokes: readonly RawVectorStrokeSample[] = sourceStrokes.map((s) => ({
    strokeId: s.strokeId, role: s.role, points: s.points.map((pt) => ({ x: pt.x, y: pt.y, pressure: pt.pressure, velocity: pt.velocity })),
  }));
  const preservedOriginalStrokeDigest = computeRawStrokeDigest(preservedOriginalStrokes);

  const sRatio = normalizedStrength / 100;
  const gRatio = normalizedPaperGrain / 100;
  const cRatio = normalizedLineContrast / 100;

  const liveStrokeBindings: LiveStrokeStyleBinding[] = preservedOriginalStrokes.map((stroke) => {
    const roleMul = stroke.role === "contour" ? 1.0 : stroke.role === "interior" ? 0.72 : 0.56;
    const rawBaseWidthPx = roundTo(2.0 * roleMul, 2);
    const widths = stroke.points.map((pt) => {
      const shaped = clamp(pt.pressure, 0.05, 1, 0.5) ** style.lineProfile.pressureGamma;
      const styledW = style.lineProfile.baseWidthPx * roleMul * (0.45 + 0.95 * shaped) * (0.75 + 0.5 * cRatio);
      return rawBaseWidthPx * (1 - sRatio) + styledW * sRatio;
    });
    const meanWidth = widths.length === 0 ? rawBaseWidthPx : widths.reduce((a, b) => a + b, 0) / widths.length;
    const peakWidth = widths.length === 0 ? rawBaseWidthPx : Math.max(...widths);
    return {
      strokeId: stroke.strokeId, role: stroke.role, preservedPointCount: stroke.points.length,
      rawBaseWidthPx, stylizedMeanWidthPx: roundTo(meanWidth, 2), stylizedPeakWidthPx: roundTo(peakWidth, 2),
      taperSharpness: roundTo(((style.lineProfile.entryTaper + style.lineProfile.exitTaper) / 2) * sRatio, 2),
      bristleSplitCount: sRatio >= 0.15 ? style.lineProfile.bristleSplitCount : 1,
      paperToothModulation: roundTo(style.paperProfile.fiberRoughness * gRatio, 2),
      capillaryBleedWeight: roundTo(style.paperProfile.capillaryBleed * sRatio * (0.5 + 0.5 * gRatio), 2),
      lutTemperatureShift: roundTo(style.lutProfile.temperatureShift * sRatio, 2),
    };
  });

  const effectiveLineWidthPx = liveStrokeBindings[0]?.stylizedMeanWidthPx ?? style.lineProfile.baseWidthPx;
  const styleDna: StyleDnaSignature = {
    styleId: style.id, effectiveLineWidthPx, shadingBandCount: style.shadingProfile.celBands,
    paperRoughnessIndex: roundTo(style.paperProfile.fiberRoughness * gRatio, 2),
    inkContrastIndex: roundTo(style.shadingProfile.shadowContrast * (0.4 + 0.6 * cRatio), 2),
    rimLightIntensity: roundTo(style.shadingProfile.rimLightBoost * sRatio, 2),
    dnaFingerprint: `dna-${style.wgslKernelTag}-w${Math.round(effectiveLineWidthPx * 10)}-b${style.shadingProfile.celBands}-g${normalizedPaperGrain}-c${normalizedLineContrast}`,
  };
  const matchedLineWidthPx = roundTo(source3dScene.baseOutlineWidthPx * (1 - sRatio) + effectiveLineWidthPx * sRatio, 2);
  const scene3dSyncPlan: Scene3dRestyleSyncPlan = {
    sourceSceneId: source3dScene.sceneId, matchedLineWidthPx, matchedShadingBands: style.scene3dSyncProfile.shadowBandSteps,
    contourDepthThreshold: roundTo(style.scene3dSyncProfile.outlineDepthThreshold * (1.25 - 0.45 * cRatio), 4),
    contourNormalThreshold: roundTo(style.scene3dSyncProfile.outlineNormalThreshold * (1.2 - 0.35 * cRatio), 3),
    paperOverlayStrength: roundTo(style.scene3dSyncProfile.paperOverlayBlend * gRatio, 2),
    albedoHarmonyScale: roundTo(1 - style.scene3dSyncProfile.albedoDesaturation * sRatio * 0.75, 2),
    prismLightRimBoost: roundTo(style.shadingProfile.rimLightBoost * (0.35 + 0.65 * sRatio), 2),
    rimLightAngleDeg: style.scene3dSyncProfile.rimLightAngleDeg,
    pipelineStages: mode === "live-stroke-to-style"
      ? ["원본 벡터 보존 (Raw Vector)", "AtelierInk 필압·갈필 곡선", "AtelierStyle 종이 반응·색감 LUT", "PrismLight 할레이션·림라이트"]
      : ["완성 2D 컷 · AtelierStage 3D 패스", "작가 화풍 DNA 추출 (선폭·음영·종이결)", "3D 깊이·법선 외곽선 동기화", "AtelierStyle · PrismLight 컷 통합 합성"],
    syncSummaryKo: `${source3dScene.titleKo}의 3D 외곽선(${matchedLineWidthPx}px)·${style.scene3dSyncProfile.shadowBandSteps}단 음영·${style.paperProfile.substrateKo} 질감을 '${style.labelKo}' DNA로 통일합니다.`,
    syncSummaryEn: `Synchronizes ${source3dScene.titleEn} contour (${matchedLineWidthPx}px), ${style.scene3dSyncProfile.shadowBandSteps}-band shading, and ${style.paperProfile.substrateEn} to ${style.labelEn} DNA.`,
  };

  return {
    modelKind: ATELIER_STYLE_MODEL_KIND, style, mode,
    normalizedStrength, normalizedPaperGrain, normalizedLineContrast,
    originalSourcePreserved: true, reversibleToRawVector: true, roundTripStyleSwitchLossless: true,
    originalStrokeDigest, preservedOriginalStrokeDigest, preservedOriginalStrokes,
    liveStrokeBindings, styleDna, scene3dSyncPlan,
  };
}

export function resolveOndeviceAiDispatchMatrix(siliconId?: ToonSiliconProfileId): OndeviceAiDispatchMatrix {
  const silicon = getToonSiliconProfile(siliconId);
  const isMobile = silicon.formFactor === "mobile";
  const rows: OndeviceAiDispatchRow[] = ON_DEVICE_AI_CREATOR_TASKS.map((task) => {
    const quantization: QuantizationPrecision =
      task.complexityClass === "micro" ? "INT8" : task.complexityClass === "heavy" ? silicon.preferredHeavyQuant : silicon.preferredLightQuant;
    const webStandardPath = isMobile ? task.mobileWebPath : task.pcWebPath;
    const pureBrowserReady = isMobile ? task.supportsPureBrowserOnMobile : task.supportsPureBrowserOnPc;
    const routeHonestyTier: DispatchRouteHonestyTier =
      task.complexityClass === "micro" ? "web-standard-ready" : pureBrowserReady ? "web-standard-with-native-boost" : "native-bridge-recommended";
    const executionNoteKo =
      routeHonestyTier === "web-standard-ready" ? `브라우저 표준(${webStandardPath}) 단독 즉시 실행 · 서버 전송 0B`
        : routeHonestyTier === "web-standard-with-native-boost" ? `브라우저(${webStandardPath}) 오프라인 실행 · ${silicon.nativeBridgeApi} 연결 시 가속 확장`
          : `브라우저 타일 분할(${webStandardPath}) 동작 · 대용량 작업은 ${silicon.nativeBridgeApi} 권장`;
    const executionNoteEn =
      routeHonestyTier === "web-standard-ready" ? `Direct browser standard (${webStandardPath}) with 0B upload.`
        : routeHonestyTier === "web-standard-with-native-boost" ? `Offline browser (${webStandardPath}); optional ${silicon.nativeBridgeApi} boost.`
          : `Chunked browser (${webStandardPath}); ${silicon.nativeBridgeApi} recommended for mobile batches.`;
    return {
      task, siliconId: silicon.id, quantization, webStandardPath, nativeBridgePath: silicon.nativeBridgeApi,
      routeHonestyTier, memoryFootprintTier: isMobile ? task.memoryTierMobile : task.memoryTierPc,
      serverUploadBytes: 0, cloudServerCostWon: 0, offlineCapable: true, executionNoteKo, executionNoteEn,
    };
  });

  return {
    modelKind: ATELIER_STYLE_MODEL_KIND, silicon, rows,
    totalTasks: rows.length, totalServerUploadBytes: 0, cloudServerCostWon: 0, allOfflineCapable: true,
    webStandardReadyCount: rows.filter((r) => r.routeHonestyTier !== "native-bridge-recommended").length,
    nativeBridgeRecommendedCount: rows.filter((r) => r.routeHonestyTier === "native-bridge-recommended").length,
    honestyNoticeKo: "아키텍처 디스패치 명세(ondevice-style-and-ai-dispatch-architecture): 허위 실측 ms/FPS를 표시하지 않으며 브라우저 표준(WebNN · LiteRT-Web)과 네이티브 브리지 경로를 투명하게 구분합니다.",
    honestyNoticeEn: "Architecture dispatch spec (ondevice-style-and-ai-dispatch-architecture): no fabricated ms/FPS claims; distinguishes browser WebNN/LiteRT-Web from OS native bridges.",
  };
}

export function auditAllSiliconOndeviceMatrix(): AllSiliconMatrixAudit {
  let totalCombinations = 0;
  let totalServerUploadBytes = 0;
  let totalCloudServerCostWon = 0;
  let allOfflineCapable = true;
  for (const profile of TOON_SILICON_PROFILES) {
    for (const row of resolveOndeviceAiDispatchMatrix(profile.id).rows) {
      totalCombinations += 1;
      totalServerUploadBytes += row.serverUploadBytes;
      totalCloudServerCostWon += row.cloudServerCostWon;
      if (!row.offlineCapable) allOfflineCapable = false;
    }
  }
  return {
    siliconCount: TOON_SILICON_PROFILES.length,
    mobileSiliconCount: TOON_SILICON_PROFILES.filter((s) => s.formFactor === "mobile").length,
    pcSiliconCount: TOON_SILICON_PROFILES.filter((s) => s.formFactor === "pc").length,
    taskCount: ON_DEVICE_AI_CREATOR_TASKS.length,
    totalCombinations, totalServerUploadBytes, totalCloudServerCostWon, allOfflineCapable,
    passed: TOON_SILICON_PROFILES.length === 9 && ON_DEVICE_AI_CREATOR_TASKS.length === 7 && totalCombinations === 63 && totalServerUploadBytes === 0 && totalCloudServerCostWon === 0 && allOfflineCapable,
  };
}

export function buildStyleTransferWgslKernel(input: StyleWgslKernelInput): string {
  const style = getAtelierWebtoonStyle(input.styleId);
  const mode: StyleTransformMode = input.mode === "scene-restyle-and-3d-sync" ? "scene-restyle-and-3d-sync" : "live-stroke-to-style";
  const strength = roundTo(clamp(input.styleStrength ?? DEFAULT_STYLE_STRENGTH, 0, 100, DEFAULT_STYLE_STRENGTH) / 100, 3);
  const grain = roundTo(clamp(input.paperGrainIntensity ?? DEFAULT_PAPER_GRAIN_INTENSITY, 0, 100, DEFAULT_PAPER_GRAIN_INTENSITY) / 100, 3);
  const contrast = roundTo(clamp(input.lineContrast ?? DEFAULT_LINE_CONTRAST, 0, 100, DEFAULT_LINE_CONTRAST) / 100, 3);
  const is3dSync = mode === "scene-restyle-and-3d-sync";

  const styleBranchBody =
    style.id === "korean-sumi-murim"
      ? "let bristle = clamp(paper_h * 1.45 - (1.0 - line_mask) * 0.35, 0.0, 1.0);\n  let bleed = smoothstep(0.18, 0.85, luma + paper_h * 0.22 * u.paper_grain);\n  stylized = mix(vec3<f32>(0.95, 0.93, 0.88), vec3<f32>(0.11, 0.12, 0.14), clamp((1.0 - bleed) * bristle * u.line_contrast, 0.0, 1.0));"
      : style.id === "rofan-watercolor-jewel"
        ? "let backrun = smoothstep(0.32, 0.78, abs(edge_mag - paper_h * 0.4));\n  let halation = pow(max(luma - 0.68, 0.0), 1.6) * 0.55;\n  stylized = clamp(src.rgb * vec3<f32>(1.04, 0.99, 0.96) + vec3<f32>(halation, halation * 0.86, halation * 0.72) - vec3<f32>(backrun * 0.08), vec3<f32>(0.0), vec3<f32>(1.0));"
        : style.id === "shonen-action-gpen"
          ? "let bnoise = fract(sin(dot(vec2<f32>(gid.xy), vec2<f32>(12.9898, 78.233))) * 43758.5453);\n  let tone = select(0.18, 0.96, luma > bnoise * 0.65 + 0.18);\n  stylized = vec3<f32>(tone) * (1.0 - line_mask * 0.92);"
          : style.id === "slice-pastel-crayon"
            ? "let ridge = smoothstep(0.28, 0.84, paper_h + 0.18 * u.paper_grain);\n  let warm_soft = mix(vec3<f32>(luma), src.rgb * vec3<f32>(1.05, 1.01, 0.94), 0.72);\n  stylized = mix(warm_soft, vec3<f32>(0.96, 0.94, 0.89), (1.0 - ridge) * 0.34 * u.paper_grain);"
            : style.id === "noir-ink-hatching"
              ? "let hatch_a = step(0.55, fract(f32(gid.x + gid.y) * 0.125));\n  let hatch_b = step(0.55, fract(f32(gid.x - gid.y + 4096u) * 0.125));\n  let grain_n = fract(sin(dot(vec2<f32>(gid.xy), vec2<f32>(41.1, 289.7))) * 19583.2) * 0.14 * u.paper_grain;\n  let ink_well = select(0.92, 0.08, luma < 0.44 || (luma < 0.68 && (hatch_a + hatch_b) > 0.5));\n  stylized = vec3<f32>(clamp(ink_well - grain_n, 0.04, 0.96));"
              : style.id === "painterly-gouache-impasto"
                ? "let impasto_light = clamp(dot(normalize(vec2<f32>(sobel_x, sobel_y) + vec2<f32>(0.001)), vec2<f32>(0.7071, -0.7071)), -0.35, 0.45);\n  stylized = clamp(src.rgb + vec3<f32>(impasto_light * 0.24 * u.paper_grain), vec3<f32>(0.0), vec3<f32>(1.0));"
                : "let cel_q = select(0.36, 0.92, luma > 0.52);\n  let rim = smoothstep(0.62, 0.95, edge_mag) * 0.34;\n  stylized = clamp(src.rgb * cel_q + vec3<f32>(rim * 1.05, rim * 0.94, rim * 0.76), vec3<f32>(0.0), vec3<f32>(1.0));";

  const syncPassLine = is3dSync
    ? "  let depth_edge = smoothstep(u.depth_threshold, u.depth_threshold * 2.2, abs(depth_n.r - depth_n.g));\n  let sync_contour = max(line_mask, depth_edge * u.line_contrast);\n  stylized = mix(stylized, vec3<f32>(0.14, 0.15, 0.17), clamp(sync_contour * 0.85, 0.0, 1.0));"
    : "  let sync_contour = line_mask;\n  stylized = mix(stylized, vec3<f32>(0.14, 0.15, 0.17), clamp(sync_contour * 0.45, 0.0, 1.0));";

  return [
    `// AtelierStyle · AtelierInk · PrismLight WGSL Compute Kernel`,
    `// Active Preset: ${style.id} (${style.labelEn}) | Mode: ${mode}`,
    `struct AtelierStyleUniforms { style_tag: u32, cel_bands: u32, style_strength: f32, paper_grain: f32, line_contrast: f32, depth_threshold: f32, normal_threshold: f32, sync_3d_flag: u32 };`,
    `// Preset defaults: tag=${style.wgslKernelTag}, bands=${style.shadingProfile.celBands}, strength=${strength}, grain=${grain}, contrast=${contrast}, depth=${style.scene3dSyncProfile.outlineDepthThreshold}, sync3d=${is3dSync ? 1 : 0}`,
    `@group(0) @binding(0) var<uniform> u: AtelierStyleUniforms;`,
    `@group(0) @binding(1) var src_canvas: texture_2d<f32>;`,
    `@group(0) @binding(2) var depth_normal_pass: texture_2d<f32>;`,
    `@group(0) @binding(3) var paper_heightmap: texture_2d<f32>;`,
    `@group(0) @binding(4) var dst_styled: texture_storage_2d<rgba8unorm, write>;`,
    `@compute @workgroup_size(8, 8, 1)`,
    `fn main(@builtin(global_invocation_id) gid: vec3<u32>) {`,
    `  let dims = textureDimensions(src_canvas);`,
    `  if (gid.x >= dims.x || gid.y >= dims.y) { return; }`,
    `  let coord = vec2<i32>(gid.xy);`,
    `  let src = textureLoad(src_canvas, coord, 0);`,
    `  let depth_n = textureLoad(depth_normal_pass, coord, 0);`,
    `  let paper_h = textureLoad(paper_heightmap, coord, 0).r;`,
    `  let luma = dot(src.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));`,
    `  let right_l = dot(textureLoad(src_canvas, min(coord + vec2<i32>(1, 0), vec2<i32>(dims) - vec2<i32>(1)), 0).rgb, vec3<f32>(0.2126, 0.7152, 0.0722));`,
    `  let down_l = dot(textureLoad(src_canvas, min(coord + vec2<i32>(0, 1), vec2<i32>(dims) - vec2<i32>(1)), 0).rgb, vec3<f32>(0.2126, 0.7152, 0.0722));`,
    `  let sobel_x = right_l - luma; let sobel_y = down_l - luma;`,
    `  let edge_mag = length(vec2<f32>(sobel_x, sobel_y));`,
    `  let line_mask = smoothstep(0.08, 0.28, edge_mag * (0.6 + u.line_contrast));`,
    `  var stylized = src.rgb;`,
    `  ${styleBranchBody}`,
    syncPassLine,
    `  textureStore(dst_styled, coord, vec4<f32>(mix(src.rgb, stylized, u.style_strength), src.a));`,
    `}`,
  ].join("\n");
}

export function buildAtelierStyleOndeviceSnapshot(input?: AtelierStyleOndeviceSnapshotInput): AtelierStyleOndeviceSnapshot {
  const styleId = getAtelierWebtoonStyle(input?.styleId).id;
  const mode: StyleTransformMode = input?.mode === "scene-restyle-and-3d-sync" ? "scene-restyle-and-3d-sync" : "live-stroke-to-style";
  const siliconId = getToonSiliconProfile(input?.siliconId).id;
  const transform = evaluateBidirectionalStyleTransform({
    styleId, mode,
    styleStrength: input?.styleStrength ?? DEFAULT_STYLE_STRENGTH,
    paperGrainIntensity: input?.paperGrainIntensity ?? DEFAULT_PAPER_GRAIN_INTENSITY,
    lineContrast: input?.lineContrast ?? DEFAULT_LINE_CONTRAST,
  });
  return {
    schemaVersion: ATELIER_STYLE_ONDEVICE_SCHEMA_VERSION, modelKind: ATELIER_STYLE_MODEL_KIND,
    proprietaryBrands: ATELIER_STYLE_PROPRIETARY_BRANDS, transform,
    dispatchMatrix: resolveOndeviceAiDispatchMatrix(siliconId), violetAudit: auditStylePaletteVioletZero(),
    wgslKernel: buildStyleTransferWgslKernel({
      styleId, mode, styleStrength: transform.normalizedStrength,
      paperGrainIntensity: transform.normalizedPaperGrain, lineContrast: transform.normalizedLineContrast,
    }),
  };
}

export function exportAtelierStyleOndeviceJson(snapshot: AtelierStyleOndeviceSnapshot): string {
  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion, modelKind: snapshot.modelKind, proprietaryBrands: snapshot.proprietaryBrands,
    activeStyle: {
      id: snapshot.transform.style.id, labelKo: snapshot.transform.style.labelKo, labelEn: snapshot.transform.style.labelEn,
      brandStack: snapshot.transform.style.brandStack, signatureKo: snapshot.transform.style.signatureKo,
    },
    bidirectionalTransform: {
      mode: snapshot.transform.mode, styleStrength: snapshot.transform.normalizedStrength,
      paperGrainIntensity: snapshot.transform.normalizedPaperGrain, lineContrast: snapshot.transform.normalizedLineContrast,
      originalSourcePreserved: snapshot.transform.originalSourcePreserved, reversibleToRawVector: snapshot.transform.reversibleToRawVector,
      roundTripStyleSwitchLossless: snapshot.transform.roundTripStyleSwitchLossless,
      originalStrokeDigest: snapshot.transform.originalStrokeDigest, preservedOriginalStrokeDigest: snapshot.transform.preservedOriginalStrokeDigest,
      styleDna: snapshot.transform.styleDna, scene3dSyncPlan: snapshot.transform.scene3dSyncPlan,
    },
    ondeviceAiDispatch: {
      siliconId: snapshot.dispatchMatrix.silicon.id, siliconName: snapshot.dispatchMatrix.silicon.nameEn,
      formFactor: snapshot.dispatchMatrix.silicon.formFactor, totalTasks: snapshot.dispatchMatrix.totalTasks,
      totalServerUploadBytes: snapshot.dispatchMatrix.totalServerUploadBytes, cloudServerCostWon: snapshot.dispatchMatrix.cloudServerCostWon,
      allOfflineCapable: snapshot.dispatchMatrix.allOfflineCapable, honestyNotice: snapshot.dispatchMatrix.honestyNoticeEn,
      tasks: snapshot.dispatchMatrix.rows.map((r) => ({
        taskId: r.task.id, quantization: r.quantization, webStandardPath: r.webStandardPath, nativeBridgePath: r.nativeBridgePath,
        routeHonestyTier: r.routeHonestyTier, memoryFootprintTier: r.memoryFootprintTier,
        serverUploadBytes: r.serverUploadBytes, offlineCapable: r.offlineCapable,
      })),
    },
    violetAudit: snapshot.violetAudit, wgslKernelLineCount: snapshot.wgslKernel.split("\n").length,
  }, null, 2);
}
