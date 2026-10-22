/**
 * PSD 가져오기 — 결과·교환 명세 타입 계층.
 *
 * `studio-psd-import.ts`의 실행 로직에서 타입 계약만 분리했다(동작 없음).
 * ag-psd의 앞→뒤 순서를 Studio의 뒤→앞 순서로 반전한 결과 형태를 기술한다.
 */

import type { Layer, Psd, ReadOptions } from "ag-psd";

import type { StudioPsdFolder } from "./export/studio-psd-folder-structure";
import type {
  StudioPsdAdjustmentConversion,
  StudioPsdConvertedAdjustment,
} from "./studio-psd-adjustment-import";
import type { PsdAdjustmentImportReport } from "./studio-psd-adjustment-report";
import type { El } from "./studio-element-model";
import type { LayerGroup } from "./studio-layers";
import type {
  PsdLayerMaskRasterInput,
  PsdLayerMaskRasterResult,
} from "./studio-psd-mask-import";

// ── 결과 타입 ────────────────────────────────────────────────────────────────

/** El("image" 변형)과 구조 호환되는 최소 형태 — 호출부가 그대로 El[] 에 스프레드한다. */
export interface PsdImportedElement {
  id: string;
  type: "image";
  /** 원본 래스터 크기를 보존하는 무손실 PNG. 배치 크기와 저장 픽셀은 별개다. */
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0;
  /** 그룹×자신 누적 불투명도(0..1). 1이면 필드 생략(El 관례 — 미설정=불투명). */
  opacity?: number;
  /** studio El.blendMode 문자열. "source-over"(기본)면 필드 생략. */
  blendMode?: string;
  /** PSD 레이어 이름. 없으면 "레이어 N"(N=1부터, Studio z-order 기준 순번). */
  name?: string;
  /** flatten 된 Studio z-order(뒤→앞) 전체 목록에서의 위치 — 조정 레이어와의 상대 순서 복원용. */
  stackIndex?: number;
  /** 자신 또는 조상 그룹이 숨김이면 true. 아니면 필드 자체를 생략(El 관례). */
  hidden?: true;
  /** Photoshop 래스터 마스크를 white-RGB/alpha PNG로 바꾼 편집 가능한 비파괴 마스크. */
  maskSrc?: string;
  /** Photoshop에서 마스크가 비활성 상태면 false. 미설정은 Studio 관례상 활성. */
  maskEnabled?: false;
  groupId?: string;
  psdGroupId?: string;
  psdFolderPath?: readonly StudioPsdFolder[];
  clipBelow?: true;
}

/**
 * PSD 조정 레이어를 버리지 않고 복원한 Studio 조정 레이어 명세.
 * 스택형 조정 레이어 모델(layer/studio-adjustment-layer.ts)의 spec 재료이며,
 * 호스트는 stackIndex 로 래스터 레이어와의 상대 순서를 복원해 문서에 삽입한다.
 */
export interface PsdImportedAdjustmentLayer {
  id: string;
  /** PSD 레이어 이름(flatten 의 "레이어 N" 폴백 포함). */
  name: string;
  /** 변환된 Studio 조정 종류 — StudioAdjustmentKind 와 동일 유니온. */
  kind: StudioPsdConvertedAdjustment["kind"];
  /** 비파괴 조정 파라미터(변환 모듈이 채운 값 그대로). */
  parameters: StudioPsdConvertedAdjustment["parameters"];
  /** 변환 과정의 근사·생략 메모(없으면 빈 배열). */
  notes: readonly string[];
  /** flatten 된 Studio z-order(뒤→앞) 전체 목록에서의 위치. */
  stackIndex: number;
  /** 그룹×자신 누적 불투명도(0..1). 1이면 필드 생략(PsdImportedElement 관례). */
  opacity?: number;
  /** studio El.blendMode 문자열. "source-over"(기본)면 필드 생략. */
  blendMode?: string;
  /** 자신 또는 조상 그룹이 숨김이면 true. 아니면 필드 자체를 생략. */
  hidden?: true;
  /** PSD에서 아래 레이어에 클리핑된 조정 레이어면 true. */
  clipBelow?: true;
  /** Photoshop 래스터 마스크를 white-RGB/alpha PNG로 바꾼 비파괴 마스크(래스터 레이어와 같은 규약). */
  maskSrc?: string;
  /** Photoshop에서 마스크가 비활성 상태면 false. 미설정은 Studio 관례상 활성. */
  maskEnabled?: false;
  psdFolderPath?: readonly StudioPsdFolder[];
}

export interface PsdImportResult {
  /** Original decoded layer pixels, not preservation of every PSD editing feature. */
  layerPixelStorage?: "native-png";
  /** Studio z-order(뒤→앞, elements[0]=맨 뒤)로 이미 정렬된 상태. */
  elements: PsdImportedElement[];
  groups?: LayerGroup[];
  /** 원본 이미지 대신 사용자가 켜서 편집할 수 있는 숨겨진 문자 복사본. */
  editableTextElements?: El[];
  /** PSD에 저장된 합성 이미지. 임의 효과 엔진으로 재구성하지 않는다. */
  compositeElement?: PsdImportedElement;
  /** 변환 가능한 PSD 조정 레이어를 복원한 명세(Studio z-order). 변환 불가 종류는
   *  여기에 없고 skipped·lossManifest 에 종류별 사유와 함께 기록된다. */
  adjustmentLayers?: PsdImportedAdjustmentLayer[];
  /** 조정 레이어 대응표 기준 충실도 리포트(정확/근사/파라미터만 보존/제외) — 조정 레이어가
   *  하나라도 발견됐을 때만 실린다. 복원분을 전부 "복원됨"으로 뭉뚱그리지 않는다. */
  adjustmentReport?: PsdAdjustmentImportReport;
  /** 원본 파일 바이트는 적용 시 CAS에 보존하고 프로젝트에는 참조만 넣는다. */
  originalFile?: File;
  /** 원본 PSD 캔버스 크기(스케일 반영 전) — 새 페이지 생성 시 canvasH 계산에 필요. */
  sourceWidth: number;
  sourceHeight: number;
  /** 실제 적용된 배치 스케일(targetWidth / sourceWidth, 확대는 하지 않음 — 상한 1). */
  scale: number;
  /** 재현 불가/제외 항목 고지 — studio-psd-export.ts 의 skipped 와 동일한 정직성 규약. */
  skipped: string[];
  /** PSD 전용 구조화 손실 명세. skipped의 사람용 상세와 달리 기능별 보존 수준을 집계한다. */
  lossManifest?: PsdInterchangeLossManifest;
  /** 인코딩된 PNG data URL(레이어·마스크·합성본)이 결과에 상주하는 메모리 회계.
   * 피크(가장 큰 단일 레이어)와 누적 합계를 예산 상한과 함께 기록한다. */
  encodedPngMemory?: PsdImportEncodedPngMemory;
}

/**
 * 가져오기가 끝난 뒤 결과 객체에 그대로 상주하는 PNG data URL 메모리 회계.
 * 바이트 수는 data URL payload를 디코딩한 PNG 바이트 추정치(estimatePsdDataUrlDecodedBytes)다.
 */
export interface PsdImportEncodedPngMemory {
  /** 상주 상한(PSD_IMPORT_MAX_ENCODED_PNG_BYTES) — 이 값을 넘는 항목은 상주시키지 않는다. */
  readonly budgetBytes: number;
  /** 상주 중인 레이어 PNG 합계. */
  readonly layerBytes: number;
  /** 상주 중인 마스크 PNG 합계. */
  readonly maskBytes: number;
  /** 상주 중인 합성본 PNG(없으면 0). */
  readonly compositeBytes: number;
  /** layerBytes + maskBytes + compositeBytes. 항상 budgetBytes 이하다. */
  readonly totalBytes: number;
  /** 가장 큰 단일 레이어 PNG 바이트 — 메모리 피크의 하한 지표. */
  readonly peakLayerBytes: number;
  /** 상주 중인 레이어 수. */
  readonly layerCount: number;
  /** 상한 초과로 상주시키지 않은 레이어 수. */
  readonly skippedLayerCount: number;
  /** 상한 초과로 버린 마스크 수. */
  readonly droppedMaskCount: number;
  /** 상한 초과로 생략한 합성본이면 true. */
  readonly compositeSkipped: boolean;
}

export type PsdInterchangeContainer = "psd" | "psb" | "studio";
export type PsdInterchangeDisposition = "preserved" | "rasterized" | "dropped" | "blocked";
export type PsdInterchangeFeature =
  | "adjustment-layer"
  | "bit-depth"
  | "blend-mode"
  | "color-space"
  | "groups"
  | "clipping"
  | "layer-effects"
  | "layer-mask"
  | "layers"
  | "resolution"
  | "smart-object"
  | "text";

export interface PsdInterchangeProfile {
  readonly container: PsdInterchangeContainer;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly bitsPerChannel: number;
  readonly colorMode: string;
}

export interface PsdInterchangeLossDecision {
  readonly feature: PsdInterchangeFeature;
  readonly disposition: PsdInterchangeDisposition;
  readonly count: number;
  readonly message: string;
  readonly alternative?: string;
}

/**
 * PSD/PSB 교환에서 기능별로 무엇을 보존하고, 픽셀로 굽고, 제외하거나 차단했는지 나타낸다.
 * `skipped: string[]`은 개별 레이어 이름을 포함한 상세 로그로 유지하고, 이 명세는 UI/보고서가
 * 문자열을 다시 파싱하지 않아도 되는 집계 계약이다.
 */
export interface PsdInterchangeLossManifest {
  readonly direction: "import" | "export";
  readonly source: PsdInterchangeProfile;
  readonly target: PsdInterchangeProfile;
  readonly decisions: readonly PsdInterchangeLossDecision[];
  readonly budgets: {
    readonly maxFileBytes: number;
    readonly maxDecodedBytes: number;
    readonly maxDimensionPx: number;
    /** 인코딩된 PNG data URL 상주 상한. 구형 명세에는 없을 수 있어 선택 필드다. */
    readonly maxEncodedPngBytes?: number;
  };
  readonly alternatives: readonly string[];
}

export interface PsdHeaderInfo extends PsdInterchangeProfile {
  readonly container: "psd" | "psb";
  readonly version: 1 | 2;
  readonly colorModeCode: number;
}

export interface PsdImportPreflight {
  readonly canImport: boolean;
  readonly header: PsdHeaderInfo;
  readonly lossManifest: PsdInterchangeLossManifest;
  readonly blockingReasons: readonly string[];
}

// ── 테스트 주입 지점 — studio-brand-kit.ts 류 DI 패턴 ────────────────────────

export interface PsdImportDeps {
  /** 기본 ag-psd readPsd(skipCompositeImageData:false). 테스트에서 손으로 만든 Psd 픽스처를
   *  즉시 반환하도록 모킹. */
  readPsdImpl?: (buffer: ArrayBuffer, options?: ReadOptions) => Psd;
  /** @deprecated Kept for adapter compatibility; original layer pixels are never downscaled. */
  downscaleImpl?: (dataUrl: string, maxW: number) => Promise<string>;
  /** 기본 Canvas2D 마스크 래스터화. 테스트에서는 DOM 없이 결과를 주입한다. */
  rasterizeMaskImpl?: (
    input: PsdLayerMaskRasterInput,
  ) => PsdLayerMaskRasterResult | Promise<PsdLayerMaskRasterResult>;
  /**
   * 테스트/검증용 헤더 검사 주입점. readPsdImpl만 주입한 기존 DOM-free 픽스처는 헤더가 없는
   * 가상 파일이므로 검사를 생략한다. 실제 런타임 경로는 항상 inspectPsdHeader를 사용한다.
   */
  inspectHeaderImpl?: (buffer: ArrayBuffer, fileName: string) => PsdImportPreflight;
}

// ── 평탄화 ──────────────────────────────────────────────────────────────────

export interface FlattenedPsdLayer {
  /** canvas/imageData 원본 참조(래스터화는 importPsdFile 이 처리) + mask/effects/text/placedLayer
   *  등 부가 필드 검사에도 그대로 쓰인다. */
  layer: Layer;
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** 그룹 체인을 따라 곱연산으로 누적된 불투명도(0..1). */
  opacity: number;
  /** 그룹 체인을 따라 OR 로 누적된 숨김 여부. */
  hidden: boolean;
  folderPath: readonly StudioPsdFolder[];
  /** 이 레이어를 건너뛰어야 하는 이유(있으면 canvas 를 읽지 않고 skipped 에만 기록). */
  skipReason?: "adjustment" | "no-canvas" | "empty-bounds";
  /** layer.adjustment 가 있으면 그 파라미터의 변환 결과 — 변환 가능하면 importPsdFile 이
   *  조정 레이어로 복원하고, 불가하면 종류별 미지원 사유를 리포트에 쓴다. */
  adjustmentConversion?: StudioPsdAdjustmentConversion;
}

export interface RawFlattenedLeaf {
  layer: Layer;
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
  hidden: boolean;
  folderPath: readonly StudioPsdFolder[];
  skipReason?: FlattenedPsdLayer["skipReason"];
  adjustmentConversion?: StudioPsdAdjustmentConversion;
}

