/**
 * Wave 162: 600DPI 1비트 흑백 인쇄용 만화 펜선 이진화 및 머리카락 선 끊김 방지 도메인 계약.
 *
 * 안티앨리어싱된 그레이스케일 원고(0=흑색 잉크, 255=백색 종이)를 1비트 인쇄 판하(1=잉크, 0=여백)로
 * 변환할 때 발생하는 머리카락 세선 유실(hairline dropout), 인접 평행선 유착, 미세 먼지 잔여를
 * 정량 검증하기 위한 불변 타입과 인쇄 프로파일 사양을 정의한다.
 */

export type PrintMonochromeProfileId =
  | '600dpi-tankobon-offset'
  | '1200dpi-magazine-litho'
  | '300dpi-pod-digital';

export type MonochromeInkAuditStatus = 'PASS' | 'WARN' | 'FAIL';

export type GlobalThresholdMode = 'fixed' | 'otsu';

/**
 * 4방향 능선 방향 인덱스.
 * 0 = 수평(0°), 1 = 우하향 대각선(45°), 2 = 수직(90°), 3 = 우상향 대각선(135°), 255 = 능선 없음.
 */
export type RidgeOrientationCode = 0 | 1 | 2 | 3 | 255;

export interface PrintMonochromeProfileSpec {
  readonly id: PrintMonochromeProfileId;
  readonly labelKo: string;
  readonly dpi: number;
  /** 제판·옵셋 인쇄에서 끊김 없이 재현되는 최소 물리 선폭(mm). */
  readonly minSafeStrokeWidthMm: number;
  /** 최소 안전 물리 선폭에 대응하는 권장 최소 픽셀 폭. */
  readonly minRecommendedStrokePx: number;
  /** 인접 평행 세선이 유착되지 않기 위한 권장 최소 여백(mm). */
  readonly minParallelGapMm: number;
  /** 단독 먼지 노이즈로 판정해 제거할 최대 연결 픽셀 면적. */
  readonly maxSpeckleAreaPx: number;
}

/** 8비트 그레이스케일 펜선 래스터 버퍼 (0 = 진한 먹선, 255 = 순백 원고지). */
export interface GrayscaleInkBuffer {
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
  readonly pixels: Uint8Array;
}

/** 1비트 흑백 인쇄용 이진 잉크 버퍼 (1 = 잉크 도포, 0 = 종이 여백). */
export interface BinaryInkBuffer {
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
  readonly bits: Uint8Array;
}

export interface GlobalThresholdOptions {
  readonly mode?: GlobalThresholdMode;
  /** mode='fixed'일 때 사용할 기준 임계값 (0~255, 기본 128). */
  readonly threshold?: number;
}

export interface GlobalThresholdResult {
  readonly binary: BinaryInkBuffer;
  readonly thresholdUsed: number;
  readonly mode: GlobalThresholdMode;
  readonly inkPixelCount: number;
}

export interface DirectionalDarkRidgeOptions {
  /** 능선 후보로 인정할 최소 어두움 (255 - gray, 기본 18). */
  readonly minCenterDarkness?: number;
  /** 접선 방향 연속성 최소치 (고립 먼지 차단, 기본 14). */
  readonly minTangentSupport?: number;
  /** 법선 방향 국소 최소값 허용 편차 (2px 평탄 코어 허용, 기본 4). */
  readonly localMinTolerance?: number;
  /** 정규화 기준 대비 폭 (기본 128). */
  readonly contrastNormalization?: number;
}

export interface DirectionalDarkRidgeMap {
  readonly width: number;
  readonly height: number;
  /** 0..1 정규화 어두운 능선 응답 강도. */
  readonly responses: Float32Array;
  /** 픽셀별 주 능선 방향 코드 (0|1|2|3|255). */
  readonly orientations: Uint8Array;
  readonly peakResponse: number;
  readonly activeRidgePixels: number;
}

export interface CollinearGapBridgeOptions {
  /** 접선 축으로 보간할 최대 끊김 폭 (1 또는 2px, 기본 2). */
  readonly maxGapPx?: 1 | 2;
  /** 그레이스케일 참조가 있을 때 간극 픽셀에 허용할 최대 밝기 (기본 255). */
  readonly maxGapPaperGray?: number;
}

export interface CollinearGapBridgeResult {
  readonly binary: BinaryInkBuffer;
  readonly bridgedPixelCount: number;
  readonly bridgedGapCount: number;
  readonly rejectedParallelBridgeCount: number;
}

export interface SpeckleCleanupOptions {
  /** 제거할 고립 잉크 섬의 최대 픽셀 수 (기본 1). */
  readonly maxSpeckleAreaPx?: number;
}

export interface SpeckleCleanupResult {
  readonly binary: BinaryInkBuffer;
  readonly removedSpeckleCount: number;
  readonly removedPixelCount: number;
}

export interface HairlinePreservationConfig {
  /** 기본 기준 임계값 (0~255, 기본 128). */
  readonly baseThreshold?: number;
  /** 확실한 진한 먹선 영역 보호 하한 (이 이하는 항상 잉크, 기본 96). */
  readonly solidInkFloor?: number;
  /** 순백 종이 보호 상한 (이 이상은 절대 잉크로 올리지 않음, 기본 232). */
  readonly paperWhiteCeiling?: number;
  /** Sauvola 국소 적응 창 반경(px, 기본 7 -> 15x15). */
  readonly sauvolaWindowRadius?: number;
  /** Sauvola 민감도 계수 k (기본 0.22). */
  readonly sauvolaK?: number;
  /** Sauvola 동적 범위 R (기본 128). */
  readonly sauvolaDynamicRange?: number;
  /** 방향성 어두운 능선 보강이 개입하는 최소 응답 (0..1, 기본 0.20). */
  readonly ridgeMinResponse?: number;
  /** 능선 응답에 비례해 임계값을 끌어올리는 보강 강도 (기본 520). */
  readonly ridgeBoostStrength?: number;
  /** 접선 정렬 끊김 보간 최대 폭 (1 또는 2px, 기본 2). */
  readonly maxGapBridgePx?: 1 | 2;
  /** 단독 먼지 노이즈 제거 최대 면적 (기본 1). */
  readonly maxSpeckleAreaPx?: number;
  /** 능선 검출 세부 파라미터. */
  readonly ridgeOptions?: DirectionalDarkRidgeOptions;
}

export interface HairlinePreservationResult {
  readonly binary: BinaryInkBuffer;
  readonly ridgeMap: DirectionalDarkRidgeMap;
  readonly ridgePromotedPixelCount: number;
  readonly bridgedPixelCount: number;
  readonly bridgedGapCount: number;
  readonly rejectedParallelBridgeCount: number;
  readonly removedSpeckleCount: number;
  readonly removedSpecklePixelCount: number;
  readonly inkPixelCount: number;
}

export interface InkBoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface BinaryInkComponent {
  readonly id: number;
  readonly pixelCount: number;
  readonly bounds: InkBoundingBox;
  readonly centroidX: number;
  readonly centroidY: number;
  readonly endpointCount: number;
  readonly minLocalWidthPx: number;
  readonly meanLocalWidthPx: number;
  readonly isSpeckle: boolean;
  readonly isHairlineLike: boolean;
}

export interface BinaryInkComponentAnalysis {
  readonly width: number;
  readonly height: number;
  readonly labels: Int32Array;
  readonly componentCount: number;
  readonly totalInkPixels: number;
  readonly components: readonly BinaryInkComponent[];
}

export interface BinaryInkQualityAuditOptions {
  readonly profileId?: PrintMonochromeProfileId;
  readonly minSafeStrokeWidthMm?: number;
  readonly maxSpeckleAreaPx?: number;
  readonly sourceGrayscale?: GrayscaleInkBuffer;
  readonly ridgeMap?: DirectionalDarkRidgeMap;
}

export interface BinaryInkTopologyAudit {
  readonly status: MonochromeInkAuditStatus;
  readonly dpi: number;
  readonly profileId: PrintMonochromeProfileId;
  readonly totalInkPixels: number;
  readonly connectedComponents: number;
  readonly nonSpeckleComponents: number;
  readonly speckleCount: number;
  readonly hairlineDropoutCount: number;
  readonly binaryBreakCount: number;
  readonly droppedRidgePixelCount: number;
  readonly fusedParallelStrandCount: number;
  readonly minStrokeWidthPx: number;
  readonly meanStrokeWidthPx: number;
  readonly minPhysicalWidthMm: number;
  readonly minStrokeWidthMm: number;
  readonly minSafeStrokeWidthMm: number;
  readonly subThresholdInkPixelCount: number;
  readonly belowPrintMinimum: boolean;
  readonly warningsKo: readonly string[];
}

export interface InkBinarizationComparison {
  readonly baselineAudit: BinaryInkTopologyAudit;
  readonly preservedAudit: BinaryInkTopologyAudit;
  readonly baselineInkPixels: number;
  readonly preservedInkPixels: number;
  readonly recoveredInkPixels: number;
  readonly baselineConnectedComponents: number;
  readonly preservedConnectedComponents: number;
  readonly fragmentationReduction: number;
  readonly baselineDropoutCount: number;
  readonly preservedDropoutCount: number;
  readonly dropoutsEliminated: number;
  readonly dropoutRecovered: boolean;
  readonly parallelStrandsPreserved: boolean;
  readonly specklesRemoved: number;
  readonly continuityScoreBefore: number;
  readonly continuityScoreAfter: number;
}

export interface MonochromeInkPreviewWgslOptions {
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
  readonly minSafeStrokeWidthMm?: number;
  readonly globalThreshold?: number;
  readonly ridgeBoostStrength?: number;
  readonly sauvolaK?: number;
  readonly paperWhiteCeiling?: number;
  readonly showDropoutOverlay?: boolean;
  readonly showWidthHeatmap?: boolean;
  readonly zoomFactor?: number;
  readonly splitPosition?: number;
}

export interface MonochromeInkPreviewWgslBundle {
  readonly wgsl: string;
  readonly entryPoint: 'main';
  readonly workgroupSize: readonly [8, 8, 1];
  readonly uniformStructName: 'InkPreviewUniforms';
  readonly uniformByteSize: number;
  readonly uniformStrideBytes: 16;
  readonly uniformBuffer: Float32Array;
  readonly bindings: readonly {
    readonly group: number;
    readonly binding: number;
    readonly name: string;
    readonly kind: 'uniform' | 'storage-read' | 'storage-read-write';
  }[];
}

export interface MonochromeInkWgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly bindingCount: number;
  readonly uniformByteSize: number;
}

export interface MonochromeInkPipelineInput {
  readonly title?: string;
  readonly grayscale: GrayscaleInkBuffer;
  readonly profileId?: PrintMonochromeProfileId;
  readonly baselineOptions?: GlobalThresholdOptions;
  readonly preservationConfig?: HairlinePreservationConfig;
  readonly previewOptions?: Partial<MonochromeInkPreviewWgslOptions>;
}

export interface MonochromeInkPipelineOutput {
  readonly title: string;
  readonly profile: PrintMonochromeProfileSpec;
  readonly baseline: GlobalThresholdResult;
  readonly preserved: HairlinePreservationResult;
  readonly comparison: InkBinarizationComparison;
  readonly wgslBundle: MonochromeInkPreviewWgslBundle;
  readonly wgslValidation: MonochromeInkWgslValidationResult;
  readonly sourceFingerprintSha256: string;
  readonly binaryFingerprintSha256: string;
  readonly auditSvg: string;
  readonly summaryKo: string;
}

export const OFFSET_PRINT_MIN_STROKE_MM = 0.05;

export const PRINT_MONOCHROME_PROFILES: Readonly<
  Record<PrintMonochromeProfileId, PrintMonochromeProfileSpec>
> = {
  '600dpi-tankobon-offset': {
    id: '600dpi-tankobon-offset',
    labelKo: '600DPI 단행본 옵셋 인쇄 (1비트 먹판)',
    dpi: 600,
    minSafeStrokeWidthMm: OFFSET_PRINT_MIN_STROKE_MM,
    minRecommendedStrokePx: 2,
    minParallelGapMm: 0.08,
    maxSpeckleAreaPx: 1,
  },
  '1200dpi-magazine-litho': {
    id: '1200dpi-magazine-litho',
    labelKo: '1200DPI 잡지·화보 고정밀 제판',
    dpi: 1200,
    minSafeStrokeWidthMm: OFFSET_PRINT_MIN_STROKE_MM,
    minRecommendedStrokePx: 3,
    minParallelGapMm: 0.06,
    maxSpeckleAreaPx: 1,
  },
  '300dpi-pod-digital': {
    id: '300dpi-pod-digital',
    labelKo: '300DPI 소량 디지털 POD 인쇄',
    dpi: 300,
    minSafeStrokeWidthMm: 0.08,
    minRecommendedStrokePx: 1,
    minParallelGapMm: 0.16,
    maxSpeckleAreaPx: 1,
  },
};

export function resolvePrintMonochromeProfile(
  profileId?: PrintMonochromeProfileId,
  fallbackDpi?: number,
): PrintMonochromeProfileSpec {
  if (profileId !== undefined) {
    return PRINT_MONOCHROME_PROFILES[profileId];
  }
  if (fallbackDpi !== undefined) {
    if (fallbackDpi >= 1000) {
      return PRINT_MONOCHROME_PROFILES['1200dpi-magazine-litho'];
    }
    if (fallbackDpi <= 400) {
      return PRINT_MONOCHROME_PROFILES['300dpi-pod-digital'];
    }
  }
  return PRINT_MONOCHROME_PROFILES['600dpi-tankobon-offset'];
}
