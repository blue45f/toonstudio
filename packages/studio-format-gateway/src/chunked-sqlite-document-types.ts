/**
 * @file chunked-sqlite-document-types.ts
 * @description `CSFCHUNK` 문서(`.clip`) 가져오기의 공개 타입, 오류 클래스, 안전 한도, 주입하는 SQLite 판독기 인터페이스.
 *
 * 읽기 코덱 전체의 근거 수준과 항목별 교차 확인은 `chunked-sqlite-document.ts` 머리말과
 * `docs/design/chunked-sqlite-document-reader-secondary-spec-2026-10-29.md`에 있다. 이 문서의 타입에는 어떤 값이 제3자 명세에서 온
 * 가정인지 필드 설명에 적었다.
 */

import type { FormatIssue } from "./format-common";

export type ClipDocumentErrorCode =
  | "aborted"
  | "source-invalid"
  /** 필수 옵션(`openSqlite`)이 함수가 아니다. */
  | "options-invalid"
  | "source-too-large"
  /** 컨테이너가 `CSFCHUNK`가 아니거나 SQLite 구역을 찾을 수 없다. */
  | "container-invalid"
  /** SQLite 문서 DB의 필수 표(`Canvas`, `Layer`)나 루트 폴더를 찾을 수 없다. */
  | "database-invalid"
  /** 주입한 SQLite 판독기가 열기·조회에 실패했다. 원인은 `cause`에 있다. */
  | "reader-failed"
  | "limit-exceeded"
  /** 호출자가 넘긴 한도 값이 올바르지 않거나 고정 한도보다 높다. */
  | "limit-invalid";

export class ClipDocumentError extends Error {
  constructor(
    message: string,
    readonly code: ClipDocumentErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ClipDocumentError";
  }
}

// ---------------------------------------------------------------------------
// 주입하는 SQLite 판독기
// ---------------------------------------------------------------------------

/** SQLite 셀 값. 정수 열은 `number` 또는 `bigint`로 돌려줘도 된다(가져오기가 안전 정수로 환산한다). */
export type ClipSqliteValue = string | number | bigint | Uint8Array | null;

/**
 * - `value`: 셀 그대로.
 * - `present`: 셀이 NULL이 아니면 1, 아니면 0. 큰 BLOB 열이 있는지만 알고 싶을 때 쓴다(내용을 옮기지 않는다).
 * - `length`: 셀의 길이(TEXT는 글자 수, BLOB은 바이트 수). NULL이면 NULL.
 */
export type ClipSqliteColumnMode = "value" | "present" | "length";

export interface ClipSqliteColumn {
  /** 열 이름. 가져오기가 `tableColumns`로 확인한 이름만 넘기므로 판독기는 식별자로 인용(quote)해 쓰면 된다. */
  readonly name: string;
  readonly mode?: ClipSqliteColumnMode;
  /**
   * `value` 모드에서만: 셀을 앞의 이만큼(TEXT는 글자, BLOB은 바이트)으로 잘라 돌려 달라는 요청. 판독기는 `substr(열, 1, limit)`처럼
   * 데이터베이스 안에서 자르고 잘린 값만 옮겨야 한다. 이 요청이 막는 것은 **큰 셀이 JavaScript 힙으로 옮겨지는 것**이다. SQLite 엔진은
   * `substr`을 계산하려고 셀 전체를 엔진 메모리에 올릴 수 있으므로(2차 독립 검토 측정: 96 MiB BLOB 한 칸에 `substr`을 적용하면 프로세스
   * 메모리가 약 95 MiB 늘었고 `length()`는 늘지 않았다) 엔진 쪽 메모리는 이 요청으로 막히지 않는다. 엔진 메모리가 문제인 환경(32비트 wasm 힙
   * 등)의 판독기는 `length(열)`로 먼저 크기를 보고 `limit`보다 크면 셀을 읽지 않고 `limit`개의 표지 값을 돌려주는 식으로 구현해야 한다.
   * 이 저장소의 테스트용 `node:sqlite` 판독기는 그렇게 하지 않는다. 호출자는 허용 상한보다 1 큰 값을 요청하는 곳(`Offscreen.Attribute`)에서만
   * 돌려받은 길이가 그 값에 이르면 원래 셀이 상한을 넘었다고 판단한다. 이름·UUID·외부 ID는 정확히 허용 길이만 요청하며 넘침을 따로 알리지 않는다.
   * 정수·실수 셀은 그대로 돌려준다.
   */
  readonly limit?: number;
}

export interface ClipSqliteSelect {
  readonly table: string;
  /** 돌려주는 행의 값은 이 순서를 따른다. */
  readonly columns: readonly ClipSqliteColumn[];
  /** 정수 열이 `in`에 든 행만. 값은 최대 `CLIP_SQLITE_MAX_IN_VALUES`개이고 판독기는 매개변수로 바인딩한다. */
  readonly where?: { readonly column: string; readonly in: readonly number[] };
  /** `SELECT DISTINCT`. */
  readonly distinct?: boolean;
  /** 이 열의 오름차순. 생략하면 rowid 순서다. */
  readonly orderBy?: string;
  /** 돌려줄 최대 행 수. 판독기는 이를 넘겨 돌려주면 안 된다. */
  readonly limit: number;
}

/** `where.in`에 담을 수 있는 최대 값 개수(SQLite 매개변수 한도 안쪽). */
export const CLIP_SQLITE_MAX_IN_VALUES = 500;

/**
 * 읽기 전용으로 연 SQLite 문서 DB. 신뢰할 수 없는 파일이므로 판독기는 (가능하면) 읽기 전용 + 방어 모드로 열고,
 * 가져오기가 만든 `SELECT`만 실행해야 한다. 가져오기는 열·표 이름을 상수와 `tableColumns` 결과에서만 만든다.
 */
export interface ClipSqliteDatabase {
  /** 표의 열 이름 목록. 표가 없으면 null. */
  tableColumns(table: string): Promise<readonly string[] | null>;
  select(request: ClipSqliteSelect): Promise<readonly (readonly ClipSqliteValue[])[]>;
  close(): Promise<void> | void;
}

export interface ClipSqliteOpenContext {
  readonly signal?: AbortSignal;
}

/** SQLite 문서 DB 바이트로 판독기를 연다. 가져오기 코덱은 SQLite를 번들하지 않으므로 호출자가 구현을 넘긴다. */
export type ClipSqliteOpener = (
  databaseBytes: Uint8Array,
  context: ClipSqliteOpenContext,
) => Promise<ClipSqliteDatabase> | ClipSqliteDatabase;

// ---------------------------------------------------------------------------
// 한도·옵션
// ---------------------------------------------------------------------------

export interface ClipDocumentLimits {
  /** 입력 파일 최대 바이트. 입력은 비공개 사본으로 한 번 복사되므로 이 값만큼의 연속 메모리가 필요하다. */
  readonly maxSourceBytes: number;
  /** 가져올 레이어(폴더 포함) 최대 개수. */
  readonly maxLayers: number;
  /** 폴더 중첩의 최대 깊이(최상위 레이어의 깊이는 0, 그 폴더의 자식은 1). 더 깊은 레이어는 읽지 않는다. */
  readonly maxGroupDepth: number;
  /** 캔버스 한 변의 최대 픽셀 수. */
  readonly maxCanvasDimension: number;
  /** 오프스크린(레이어 하나 또는 마스크 하나)의 출력 최대 픽셀 수. 넘으면 그 오프스크린은 디코드하지 않는다. */
  readonly maxLayerPixels: number;
  /**
   * 모든 레이어의 RGBA8 출력과 모든 마스크 값(1바이트/픽셀)을 합친 최대 바이트. 레이어를 모두 먼저 풀고 마스크는 그 뒤에 푼다. 같은
   * 오프스크린을 가리키는 레이어마다 따로 복사본을 주므로 복사본도 센다. 풀다가 실패한 버퍼는 버려지므로 센 몫을 되돌려 준다.
   */
  readonly maxDecodedBytes: number;
  /**
   * 디코드 작업량의 합(바이트로 환산, **되돌려 주지 않는 누계**). 오프스크린마다 레코드 수 x 1,024, 출력 버퍼를 만들고 채우는 데 그 크기,
   * 데이터가 있는 블록마다 해제 후 크기와 DEFLATE 블록 수 x 4,096을 더한다. `maxDecodedBytes`는 살아 있는 버퍼의 합이고 실패하면
   * 돌려주므로, 같은 큰 버퍼를 잡았다 버리기를 되풀이하는 입력이나 얇은 띠 하나가 수천 블록을 푸는 입력을 막지 못한다. 이 한도가 적대적 입력이
   * 작은 출력과 작은 파일로 큰 CPU를 쓰는 것을 막는다. 가득 찬 블록은 출력 크기의 약 2.3~2.6배를 쓰므로(Node zlib 수준 1로 만든 327,680바이트
   * 블록 4종의 측정) 기본값(4 GiB)은 `maxDecodedBytes`(1 GiB)를 가득 채운 문서도 받는다.
   */
  readonly maxWorkBytes: number;
  /** 미리보기 PNG 최대 바이트. 넘으면 읽지 않는다. */
  readonly maxPreviewBytes: number;
  /** 레이어 이름·UUID에서 읽는 문자 수 상한. 넘는 부분은 자른다. */
  readonly maxTextCharacters: number;
  /** 진단 목록 하나의 최대 길이(적대적 입력이 목록을 부풀리지 못하게 한다). */
  readonly maxIssues: number;
}

export const CLIP_DOCUMENT_LIMITS: ClipDocumentLimits = Object.freeze({
  maxSourceBytes: 1_073_741_824,
  maxLayers: 20_000,
  maxGroupDepth: 64,
  maxCanvasDimension: 262_144,
  maxLayerPixels: 134_217_728,
  maxDecodedBytes: 1_073_741_824,
  maxWorkBytes: 4_294_967_296,
  maxPreviewBytes: 33_554_432,
  maxTextCharacters: 1_024,
  maxIssues: 500,
});

export interface ClipDocumentImportOptions {
  /** SQLite 문서 DB를 여는 함수. 필수다. */
  readonly openSqlite: ClipSqliteOpener;
  /** 호출자는 한도를 낮추기만 할 수 있다. */
  readonly limits?: Partial<ClipDocumentLimits>;
  readonly signal?: AbortSignal;
  /** false면 구조만 읽고 픽셀·마스크 값은 디코드하지 않는다. 기본은 true. */
  readonly decodePixels?: boolean;
}

// ---------------------------------------------------------------------------
// 결과
// ---------------------------------------------------------------------------

/** 레이어 종류. 판정 순서와 근거는 `chunked-sqlite-layer-model.ts`에 있다(제3자 명세의 순서를 따른다). */
export type ClipLayerKind =
  | "folder"
  /** 폴더이면서 `ComicFrameLineMipmap`이 있는 레이어(컷 틀 폴더). 자식 연결은 일반 폴더와 같다. 표지와 "마스크를 저장하지 않는다"는 제3자 명세 S1만 적었다(S2에는 없다). */
  | "frame-folder"
  | "paper"
  | "raster"
  | "text"
  | "vector"
  | "fill"
  | "adjustment"
  | "model3d"
  | "image-material"
  | "story-info"
  | "other";

export interface ClipExtent {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 위치 계산에 쓴 원본 값. 픽셀의 왼쪽 위 = `layerOffset + renderOffset`, 마스크의 왼쪽 위 = `layerOffset + maskOffset + maskRenderOffset`(제3자 명세 S1). */
export interface ClipLayerPlacement {
  readonly layerOffsetX: number;
  readonly layerOffsetY: number;
  readonly renderOffsetX: number;
  readonly renderOffsetY: number;
  readonly maskOffsetX: number;
  readonly maskOffsetY: number;
  readonly maskRenderOffsetX: number;
  readonly maskRenderOffsetY: number;
  /**
   * `Layer.DrawToRenderOffscreenType` 원본 값(열이 없으면 null). S2는 다른 도구의 경고를 옮겨 "이 값이 NULL이 아니면 렌더 오프셋이 이미 래스터에
   * 반영돼 있어 다시 더하면 안 된다"고 적었으나 S1은 그렇게 적지 않았고 서로 어긋난다. 이 코덱은 S1의 합산을 따르며, 어느 쪽이 맞는지는
   * 실제 파일로 확인할 수 있도록 이 값을 그대로 노출한다.
   */
  readonly drawToRenderOffscreenType: number | null;
}

export interface ClipLayerMask {
  /** 마스크 값이 덮는 이미지 좌표 사각형. */
  readonly extent: ClipExtent;
  /** 저장된 블록이 없는 곳의 값(0 = 가림, 255 = 보임). 제3자 명세는 마스크 바깥이 보통 보임이라고 적었다. */
  readonly defaultValue: number;
  /** `extent`를 채운 값(0~255), 가로 우선, 너비 * 높이 바이트. 디코드하지 않았거나 읽지 못했으면 null. */
  readonly values: Uint8Array | null;
  /** 압축 데이터가 있어 실제로 푼 블록 수. 0이면 마스크 전체가 초기 값이다(저장된 데이터가 없다). */
  readonly storedBlocks: number;
  /** `LayerVisibility`의 비트 1("마스크를 쓴다"). 꺼져 있으면 값이 있어도 합성에 쓰지 않는다. */
  readonly enabled: boolean;
}

export interface ClipLayer {
  /** 결과 배열 안의 순서(깊이 우선, 같은 폴더 안에서는 위쪽 레이어가 먼저). */
  readonly index: number;
  /** `Layer.MainId`. */
  readonly id: number;
  /** 부모 폴더 레이어의 `index`. 최상위면 null. */
  readonly parentIndex: number | null;
  readonly depth: number;
  readonly kind: ClipLayerKind;
  /** `Layer.LayerType` 원본 값. */
  readonly layerType: number;
  readonly name: string;
  readonly uuid: string | null;
  readonly visible: boolean;
  /** 자신과 모든 조상 폴더가 보이는지. */
  readonly effectiveVisible: boolean;
  /** `Layer.LayerVisibility` 원본 값(비트 0 = 표시, 비트 1 = 마스크 사용; 비트 2는 의미를 모른다). */
  readonly visibilityRaw: number;
  /** `LayerLock` 비트 0(편집 잠금). 제3자 명세 S2만 적었고 S1은 비트 의미를 적지 않았다(단일 출처 가정). */
  readonly editLocked: boolean;
  /** `LayerLock` 비트 4(투명 픽셀 잠금). 제3자 명세 S2만 적었다(단일 출처 가정). */
  readonly transparencyLocked: boolean;
  /** `Layer.LayerLock` 원본 값. 나머지 비트의 의미는 모른다. */
  readonly lockRaw: number;
  /** 아래 레이어에 클리핑되는지. */
  readonly clipToBelow: boolean;
  /** `Layer.LayerFolder` 원본 값(비트 0 = 폴더). 비트 4의 의미는 명세들이 서로 다르게 적어 해석하지 않는다. */
  readonly folderFlags: number;
  /** 0~1. 원본은 0~256(256 = 100%)이다. */
  readonly opacity: number;
  readonly opacityRaw: number;
  /** `Layer.LayerComposite` 원본 값. */
  readonly compositeRaw: number;
  /** 알려진 합성 모드의 ID(예: `multiply`). 목록에 없으면 null이며 원본 값은 `compositeRaw`에 남는다. */
  readonly compositeMode: string | null;
  /** 폴더의 통과(pass-through) 합성 여부. */
  readonly passThrough: boolean;
  readonly placement: ClipLayerPlacement;
  /** `DrawColorMain*` 열의 레이어 색(S1: 용지의 색도 여기 든다). 세 채널이 모두 없으면 null. 켜진 색인지는 `drawColorEnabled`가 알려 준다. */
  readonly drawColor: { readonly r: number; readonly g: number; readonly b: number } | null;
  /** `DrawColorEnable`이 0이 아닌지. */
  readonly drawColorEnabled: boolean;
  /** `pixels`가 덮는 이미지 좌표 사각형. 픽셀이 없으면 null. */
  readonly extent: ClipExtent | null;
  /** 오프스크린 형식: 색 또는 회색. 픽셀을 읽지 않았으면 null. */
  readonly colorMode: "color" | "gray" | null;
  /** 저장된 블록이 없는 곳의 픽셀(RGBA8). 읽지 않았으면 null. */
  readonly initialPixel: readonly [number, number, number, number] | null;
  /** `extent`를 채운 직선(비 premultiplied) RGBA8, 가로 우선, 너비 * 높이 * 4바이트. 읽지 않았거나 읽지 못했으면 null. */
  readonly pixels: Uint8Array | null;
  /**
   * 압축 데이터가 있어 실제로 푼 블록 수. 픽셀을 읽지 않았거나 읽지 못했으면 null이고, 0이면 레이어 전체가 초기 색이다(저장된 데이터가 없다).
   * 외부 ID 대조 가정(대소문자 등)이 어긋나면 모든 레이어가 0이 되므로 실제 파일을 검증할 때 먼저 볼 값이다.
   */
  readonly storedBlocks: number | null;
  readonly mask: ClipLayerMask | null;
}

export type ClipCanvasUnit = "px" | "cm" | "mm" | "inch" | "pt";

export interface ClipCanvasInfo {
  /** `Canvas.MainId`. */
  readonly id: number;
  /** 단위 코드(제3자 명세 S1: 0 px, 1 cm, 2 mm, 3 inch, 5 pt). 알 수 없는 코드면 null. */
  readonly unit: ClipCanvasUnit | null;
  readonly unitCode: number;
  /** `CanvasWidth`·`CanvasHeight` 원본 값(단위는 `unit`). */
  readonly widthValue: number;
  readonly heightValue: number;
  /** dpi. `CanvasResolution` 셀이 NULL이면 null이며, 그런 캔버스는 픽셀 단위일 때만 가져온다. */
  readonly resolution: number | null;
  /** 픽셀 크기. `sizeSource`가 `unit-conversion`이면 단위 변환 결과다(짝수 쪽 반올림 규칙은 명세 해설이 모호해 가정이다). */
  readonly width: number;
  readonly height: number;
  readonly sizeSource: "pixel-unit" | "unit-conversion";
  readonly rootFolderId: number;
  /** `CanvasDefaultColorTypeIndex`(0 컬러, 1 회색, 2 단색). 없으면 null. */
  readonly defaultColorType: number | null;
  /** `CanvasChannelBytes`. 8비트 채널은 1이다. 없으면 null. */
  readonly channelBytes: number | null;
}

/** 진단 코드별 건수. 목록(`warnings`·`unsupported`)은 코드마다 일부만 싣지만 이 건수는 줄이지 않는다. */
export interface ClipDiagnosticCounts {
  readonly warnings: Readonly<Record<string, number>>;
  readonly unsupported: Readonly<Record<string, number>>;
}

export interface ClipDocumentImportResult {
  readonly format: "clip-document";
  /** 이 구현이 따른 명세의 성격. 제3자 공개 문서만 근거이며 실제 파일로 검증하지 않았다. */
  readonly specProfile: "clip-secondary-spec";
  readonly canvas: ClipCanvasInfo;
  readonly layers: readonly ClipLayer[];
  /** `CanvasPreview`의 PNG 원본 바이트(합성한 축소 이미지). 없으면 null. */
  readonly previewPng: Uint8Array | null;
  /** 보존되지만 확인이 필요한 사항. */
  readonly warnings: readonly FormatIssue[];
  /** 의미가 손실되는 사항(읽지 않은 레이어 종류, 디코드하지 못한 픽셀 등). */
  readonly unsupported: readonly FormatIssue[];
  /** 접히기 전의 진단 코드별 총 건수(목록은 코드당 50건에서 접히고 `clip-issues-collapsed`로 요약한다). */
  readonly diagnosticCounts: ClipDiagnosticCounts;
  readonly source: { readonly byteLength: number; readonly sha256: string };
}
