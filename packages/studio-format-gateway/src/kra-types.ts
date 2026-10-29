/**
 * @file kra-types.ts
 * @description Krita(`.kra`/`.krz`) 읽기 코덱의 공개 타입, 오류 클래스, 안전 한도.
 *
 * 포맷 사실의 출처는 `kra-document.ts` 머리말에 있다.
 */

import type { FormatZipInflateRawAdapter, FormatZipReaderLimits } from "./bounded-zip";
import type { FormatIssue } from "./format-common";

export type KraErrorCode =
  | "aborted"
  | "source-invalid"
  | "source-too-large"
  | "container-invalid"
  /** 이미지 이름에서 온 ZIP 경로가 안전 검사를 통과하지 못했다(예: `..` 구간, 탭, 큰따옴표, 앞뒤 공백). */
  | "unsafe-archive-path"
  | "maindoc-invalid"
  | "limit-exceeded"
  /** 호출자가 넘긴 한도 값이 올바르지 않거나 고정 한도보다 높다. */
  | "limit-invalid";

export class KraError extends Error {
  constructor(
    message: string,
    readonly code: KraErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "KraError";
  }
}

export interface KraLimits {
  /** `maindoc.xml` 최대 문자 수. */
  readonly maxMaindocCharacters: number;
  /** 레이어·마스크 노드를 합친 최대 개수. */
  readonly maxNodes: number;
  /** 그룹 중첩의 최대 깊이. */
  readonly maxGroupDepth: number;
  /** 캔버스 한 변의 최대 픽셀 수. */
  readonly maxCanvasDimension: number;
  /** 타일 한 변의 최대 픽셀 수(Krita는 64를 쓴다). */
  readonly maxTileSide: number;
  /** 픽셀 하나의 최대 바이트 수(RGBA 32비트 실수가 16이다). */
  readonly maxPixelBytes: number;
  /** 레이어 하나의 최대 타일 수. */
  readonly maxTilesPerLayer: number;
  /** 레이어 하나의 RGBA8 출력 최대 픽셀 수. 넘으면 그 레이어의 픽셀은 디코드하지 않는다. */
  readonly maxLayerPixels: number;
  /** 모든 레이어를 합친 RGBA8 출력의 최대 바이트. 넘으면 이후 레이어의 픽셀은 디코드하지 않는다. */
  readonly maxDecodedBytes: number;
  /** 진단 목록 하나의 최대 길이(적대적 입력이 목록을 부풀리지 못하게 한다). */
  readonly maxIssues: number;
}

export const KRA_LIMITS: KraLimits = Object.freeze({
  maxMaindocCharacters: 8_000_000,
  maxNodes: 20_000,
  maxGroupDepth: 64,
  maxCanvasDimension: 262_144,
  maxTileSide: 1_024,
  maxPixelBytes: 32,
  maxTilesPerLayer: 1_048_576,
  maxLayerPixels: 67_108_864,
  maxDecodedBytes: 1_073_741_824,
  maxIssues: 500,
});

export interface KraImportOptions {
  /** 호출자는 한도를 낮추기만 할 수 있다. */
  readonly limits?: Partial<KraLimits>;
  /** ZIP 읽기 한도(낮추기만 가능). */
  readonly zipLimits?: Partial<FormatZipReaderLimits>;
  /** `DecompressionStream("deflate-raw")`가 없는 환경용 raw DEFLATE 어댑터. */
  readonly inflateRaw?: FormatZipInflateRawAdapter;
  readonly signal?: AbortSignal;
  /** false면 구조만 읽고 픽셀은 디코드하지 않는다. 기본은 true. */
  readonly decodePixels?: boolean;
}

export type KraNodeKind = "raster" | "group" | "other";

export interface KraExtent {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface KraMask {
  /** `transparencymask`, `selectionmask`, `filtermask`, `colorizemask`, `transformmask` 등 파일에 적힌 값. */
  readonly nodeType: string;
  readonly name: string;
  readonly uuid: string | null;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly filename: string | null;
  /** 원본 속성 전부(문서에 없는 키 포함). */
  readonly attributes: Readonly<Record<string, string>>;
}

export interface KraLayer {
  /** 파일에 적힌 순서(깊이 우선, 0이 최상단). */
  readonly index: number;
  /** 부모 그룹 레이어의 `index`. 최상위면 null. */
  readonly parentIndex: number | null;
  readonly depth: number;
  readonly kind: KraNodeKind;
  /** `paintlayer`, `grouplayer`, `clonelayer`, `shapelayer` 등 파일에 적힌 값. */
  readonly nodeType: string;
  readonly name: string;
  readonly uuid: string | null;
  readonly filename: string | null;
  readonly visible: boolean;
  /** 자신과 모든 조상 그룹이 보이는지. */
  readonly effectiveVisible: boolean;
  readonly locked: boolean;
  /** 레이어 패널에서 접혀 있는지(표시 상태일 뿐 합성과 무관하다). */
  readonly collapsed: boolean;
  /** 그룹의 통과(pass-through) 합성 여부. 그룹이 아니면 false. */
  readonly passThrough: boolean;
  /** 0~1. */
  readonly opacity: number;
  /** 파일에 적힌 0~255 정수. */
  readonly opacityRaw: number;
  /** 파일에 적힌 합성 연산 id(예: `normal`, `multiply`). */
  readonly compositeOp: string;
  /** 이 코덱이 실제 파일에서 관찰한 id 목록에 있는지. false여도 id는 그대로 보존한다. */
  readonly compositeOpKnown: boolean;
  readonly colorLabel: number;
  readonly inTimeline: boolean;
  /** 레이어 원점의 이미지 좌표(`x`, `y` 속성). 타일 좌표는 레이어 로컬이다. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** 레이어의 색 공간 이름(`RGBA`, `RGBA16`, `GRAYA` 등). 없으면 null. */
  readonly colorSpace: string | null;
  readonly masks: readonly KraMask[];
  /** 원본 속성 전부(문서에 없는 키 포함). */
  readonly attributes: Readonly<Record<string, string>>;
  /** `pixels`가 덮는 이미지 좌표 사각형. 픽셀이 없으면 null. */
  readonly extent: KraExtent | null;
  /** 타일이 없는 곳의 기본 픽셀(RGBA8, 직선 알파). 디코드하지 않았거나 읽지 못하면 null. */
  readonly defaultPixel: readonly [number, number, number, number] | null;
  /** 타일 파일에 든 타일 수. 래스터가 아니거나 `decodePixels`가 false이거나 파일을 읽지 못했으면 0. */
  readonly tileCount: number;
  /**
   * `extent`를 채운 직선(비 premultiplied) RGBA8, 가로 우선, width * height * 4바이트. 타일이 없는 곳은 기본 픽셀이다.
   * 기본 픽셀이 투명하지 않으면 `extent`는 캔버스 사각형을 포함한다. 래스터가 아니거나 디코드하지 않았거나
   * 실패하면 null.
   */
  readonly pixels: Uint8Array | null;
}

export interface KraImageInfo {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** 문서 색 공간 이름(`RGBA`, `RGBA16`, `GRAYA` 등). */
  readonly colorSpace: string;
  readonly profileName: string | null;
  readonly xRes: number | null;
  readonly yRes: number | null;
  readonly description: string;
}

export interface KraDocumentInfo {
  readonly editor: string | null;
  readonly kritaVersion: string | null;
  readonly syntaxVersion: string | null;
}

export interface KraImportResult {
  readonly format: "krita-kra";
  readonly specProfile: "krita-kra-observed";
  /** `mimetype` 항목의 내용. 항목이 없으면 null. */
  readonly mimetype: string | null;
  readonly document: KraDocumentInfo;
  readonly image: KraImageInfo;
  readonly layers: readonly KraLayer[];
  /** Krita가 저장한 합성 이미지(`mergedimage.png`) 원본 PNG 바이트. `.krz`처럼 없으면 null. */
  readonly mergedImagePng: Uint8Array | null;
  /** 미리보기 PNG 원본 바이트. 없으면 null. */
  readonly previewPng: Uint8Array | null;
  /** 문서에 포함된 ICC 프로파일 원본 바이트. 없으면 null. */
  readonly iccProfile: Uint8Array | null;
  /** 보존되지만 확인이 필요한 사항. */
  readonly warnings: readonly FormatIssue[];
  /** 의미가 손실되는 사항(읽지 않은 노드 종류, 디코드하지 못한 픽셀 등). */
  readonly unsupported: readonly FormatIssue[];
  readonly source: { readonly byteLength: number; readonly sha256: string };
}

export type KraSignature = "kra" | "unknown";
