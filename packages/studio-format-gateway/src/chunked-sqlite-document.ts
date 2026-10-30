/**
 * @file chunked-sqlite-document.ts
 * @description `CSFCHUNK` 문서(`.clip`) 읽기 코덱: 컨테이너, 임베디드 SQLite 문서 DB(캔버스·레이어 트리), 래스터 레이어 픽셀(RGBA8로 환원),
 *              레이어 마스크 값, 미리보기 PNG 원본, 진단.
 *
 * 범위는 읽기다. 레이어 합성, 블렌드 모드 계산, 텍스트·벡터·필터·3D 레이어의 편집 정보 해석, 색 변환(ICC), 애니메이션, 쓰기는 하지 않는다.
 * 래스터·화상 소재·3D 레이어는 저장된 픽셀을 읽는다(화상 소재·3D는 편집 정보가 아니라 렌더 캐시만 읽는다고 `unsupported`에 남긴다). 텍스트·벡터·
 * 채움 레이어와 색조 보정 레이어는 저장된 픽셀이 있어도 읽지 않고 그 사실을 `unsupported`에 남긴다. SQLite는 번들하지 않는다: 호출자가
 * `openSqlite`로 읽기 전용 판독기를 넘긴다(앱은 sqlite-wasm, 테스트는 `node:sqlite`). 원본 파일의 바이트는 호출자가 가지고 있고, 결과는
 * 길이와 SHA-256만 담는다.
 *
 * 근거 수준(중요): 이 코덱이 따른 포맷 사실은 전부 **제3자가 공개한 명세**에서 왔다. **우리가 실제 `.clip` 파일을 열어 확인한 것은 없고,
 * CSP를 실행하거나 CELSYS 바이너리를 분석하지도 않았다.** 명세들은 자신들이 실제 파일에서 관찰했다고 밝히지만 CELSYS의 공식 문서가 아니며
 * 일부는 서로 어긋난다.
 * - S1 nanikasheila/CLIP_STUDIO_PAINT_Format `docs/spec/` (MIT, 실제 파일 719개로 대조했다고 밝힘, 항목별 확신 수준 표기)
 * - S2 wamsoft/clipparse `docs/CLIP_FORMAT.md` (MIT, 실제 파일 4개 측정, 항목별 측정/추정 표기)
 * - S3 Inochi2D/clip-d `SPEC.md` (BSD-2, 컨테이너 틀만)
 * 두 명세 이상이 같게 적은 사실만 따랐고, 한쪽만 적은 값은 가정으로 표시했다. 어느 쪽의 문장이나 코드도 옮기지 않았다. 항목별 교차 확인 표와
 * 어긋난 항목 목록은 `docs/design/chunked-sqlite-document-reader-secondary-spec-2026-10-29.md`에 있다. 이 구현은 CSP와의 호환을 보증하지
 * 않으며 법적 결론이 아니다. 오류·경고 문구도 이 구분을 따른다.
 *
 * 래스터 경로(S1·S2 일치): `Layer.LayerRenderMipmap` → `Mipmap.BaseMipmapInfo` → `MipmapInfo.Offscreen`(첫 단계, 원본 크기) → `Offscreen.Attribute`
 * (배치 BLOB)와 `Offscreen.BlockData`(외부 ID) → 컨테이너의 `CHNKExta` 외부 블록. 픽셀의 왼쪽 위는 `LayerOffset + LayerRenderOffscrOffset`
 * (S1), 마스크는 `LayerOffset + LayerMaskOffset + LayerMaskOffscrOffset`(S1)이다. S2는 `DrawToRenderOffscreenType`이 있는 레이어에서 렌더
 * 오프셋이 이미 래스터에 반영돼 있을 수 있다고 경고한다(S2 자신의 측정이 아니라 다른 도구의 경고를 옮긴 것). 이 불일치는 풀리지 않았으므로 결과는
 * 위치 계산에 쓴 원본 값을 `placement`에 그대로 남긴다.
 *
 * 레이어 종류별 읽기 정책: 래스터·화상 소재·3D 레이어는 저장된 픽셀을 읽는다. 텍스트·벡터 레이어는 S2가 연결을 따라 닿는 래스터를 저장하지
 * 않는다고 적었고(텍스트의 글자 이미지는 어느 표의 외래 키로도 닿지 않는 경계 상자 오프스크린에 있다) S1은 저장된 화소가 있으면 쓰라고
 * 적어 서로 다르다. 어느 쪽이든 연결을 따라 읽어서는 쓸 만한 픽셀을 얻지 못하므로 읽지 않고 알린다. 채움 레이어의 저장 픽셀은 낡았을 수
 * 있다고 S1이 적어 읽지 않는다. 컷 틀 폴더는 마스크를 저장하지 않는다(S1만 적음, S2에는 컷 틀 폴더 서술이 없다). 데이터 청크가 없는
 * 오프스크린은 저장된 데이터가 없는 것으로 본다(S1·S2 일치): 모든 블록이 초기 색을 따른다. 컨테이너를 끝까지 읽은 경우에만 그렇게 본다.
 */

import {
  CLIP_BLOCK_LIMITS,
  ClipBlockError,
  parseClipOffscreenAttribute,
  resolveClipBlockLayout,
  stepClipOffscreenDecode,
  type ClipOffscreenAttribute,
  type ClipOffscreenPixels,
} from "./chunked-sqlite-blocks";
import { parseClipContainer, type ClipExternalBlock } from "./chunked-sqlite-container";
import {
  CLIP_ATTRIBUTE_MAX_BYTES,
  chunkClipIds,
  createClipOffscreenReader,
  readClipCanvas,
  readClipLayerRows,
  readClipPreviewPng,
  readClipVectorLayerIds,
  resolveClipMipmapChains,
  throwIfClipAborted,
  type ClipChainFailure,
  type ClipOffscreenRef,
  type ClipOffscreenRow,
  type ClipOffscreenRowReader,
  type ClipReaderContext,
} from "./chunked-sqlite-document-reader";
import {
  CLIP_DOCUMENT_LIMITS,
  ClipDocumentError,
  type ClipDocumentImportOptions,
  type ClipDocumentImportResult,
  type ClipDocumentLimits,
  type ClipExtent,
  type ClipLayer,
  type ClipLayerKind,
  type ClipLayerMask,
  type ClipSqliteDatabase,
} from "./chunked-sqlite-document-types";
import { ClipIssueList, clipDiagnosticText } from "./chunked-sqlite-issues";
import {
  CLIP_PASS_THROUGH_COMPOSITE,
  classifyClipLayer,
  clipCompositeModeId,
  flattenClipLayerTree,
  type ClipFlatLayer,
} from "./chunked-sqlite-layer-model";
import { createClipPacer } from "./chunked-sqlite-pacing";
import { openRasterSha256Hex } from "./openraster";

export type * from "./chunked-sqlite-document-types";
export { CLIP_DOCUMENT_LIMITS, CLIP_SQLITE_MAX_IN_VALUES, ClipDocumentError } from "./chunked-sqlite-document-types";
export { clipCompositeModeId } from "./chunked-sqlite-layer-model";

/**
 * 의도적으로 읽지 않거나 해석하지 않는 레이어 종류·형식을 알리는 `unsupported` 진단 코드. 이것 말고 `unsupported`에 남는 항목은 가정이
 * 파일과 어긋났거나 파일이 손상되었다는 신호이므로 실파일 검증은 이 집합을 뺀 나머지가 비어 있는지 본다. 코드별 건수는
 * `diagnosticCounts.unsupported`로 본다(목록은 코드당 50건에서 접힌다).
 */
export const CLIP_BY_DESIGN_UNSUPPORTED_CODES: ReadonlySet<string> = new Set([
  "clip-layer-kind-not-rendered",
  "clip-layer-cache-only",
  "clip-layer-adjustment-not-applied",
  "clip-layer-kind-unsupported",
  "clip-layer-frame-mask-not-stored",
  "clip-offscreen-mono-unsupported",
]);

/** 오프스크린 좌표(레이어 오프셋 + 렌더 오프셋)로 인정하는 절댓값 상한(부호 있는 32비트 정수의 최댓값). */
const MAX_COORDINATE = 2 ** 31 - 1;
/** 한 번에 `Offscreen` 행을 읽는 개수. `Attribute` BLOB가 커질 수 있어 작게 잡는다. */
const OFFSCREEN_BATCH = 16;
/** `LayerLock` 비트(제3자 명세 S2만 적었다): 비트 0 = 편집 잠금, 비트 4 = 투명 픽셀 잠금. */
const LOCK_EDIT_BIT = 1;
const LOCK_TRANSPARENCY_BIT = 16;
/**
 * 첫 단계 `MipmapInfo.ThisScale`이 원본 크기(100)에서 벗어나도 받아들이는 허용 오차. 구현의 선택이다(S1의 0.5% 기준은 미리보기 배율과 단계
 * 배율을 비교하는 문장이라 이 용도의 근거가 아니다).
 */
const FULL_SCALE_TOLERANCE = 0.5;

// ---------------------------------------------------------------------------
// 한도·입력
// ---------------------------------------------------------------------------

function resolveLimits(requested: Partial<ClipDocumentLimits> | null | undefined): ClipDocumentLimits {
  if (requested === undefined || requested === null) return CLIP_DOCUMENT_LIMITS;
  if (typeof requested !== "object") throw new ClipDocumentError("limits는 객체여야 한다", "limit-invalid");
  const resolved = { ...CLIP_DOCUMENT_LIMITS } as { -readonly [K in keyof ClipDocumentLimits]: number };
  for (const key of Object.keys(requested)) {
    if (!Object.hasOwn(CLIP_DOCUMENT_LIMITS, key)) {
      throw new ClipDocumentError(`알 수 없는 한도 이름 ${clipDiagnosticText(key)}`, "limit-invalid");
    }
  }
  for (const key of Object.keys(CLIP_DOCUMENT_LIMITS) as Array<keyof ClipDocumentLimits>) {
    const value = requested[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0 || value > CLIP_DOCUMENT_LIMITS[key]) {
      throw new ClipDocumentError(`${key}는 0 이상 ${CLIP_DOCUMENT_LIMITS[key]} 이하의 정수여야 한다`, "limit-invalid");
    }
    resolved[key] = value;
  }
  return Object.freeze(resolved);
}

async function readSourceBytes(source: Blob | Uint8Array | ArrayBuffer, maxBytes: number, signal: AbortSignal | undefined): Promise<Uint8Array> {
  throwIfClipAborted(signal);
  let size: number;
  if (source instanceof Blob) size = source.size;
  else if (source instanceof Uint8Array || source instanceof ArrayBuffer) size = source.byteLength;
  else throw new ClipDocumentError("지원하지 않는 입력 형식이다", "source-invalid");
  if (size > maxBytes) throw new ClipDocumentError(`입력 ${size}바이트가 한도 ${maxBytes}를 넘는다`, "source-too-large");
  let bytes: Uint8Array;
  try {
    if (source instanceof Blob) bytes = new Uint8Array(await source.arrayBuffer());
    else if (source instanceof Uint8Array) bytes = new Uint8Array(source);
    else bytes = new Uint8Array(source.slice(0));
  } catch (error) {
    throwIfClipAborted(signal);
    if (error instanceof RangeError) throw new ClipDocumentError(`입력 ${size}바이트를 메모리에 올릴 수 없다`, "source-too-large", { cause: error });
    throw new ClipDocumentError(`입력을 읽지 못했다: ${clipDiagnosticText(error instanceof Error ? error.message : String(error), 200)}`, "source-invalid", { cause: error });
  }
  throwIfClipAborted(signal);
  return bytes;
}

/** 가능하면 플랫폼의 SHA-256(비동기, 빠르다)을 쓰고 없으면 순수 구현으로 돌아간다. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle !== undefined) {
    try {
      const digest = new Uint8Array(await subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
      return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      // 지원하지 않는 환경이면 아래의 순수 구현을 쓴다.
    }
  }
  return openRasterSha256Hex(bytes);
}

// ---------------------------------------------------------------------------
// 오프스크린 디코드
// ---------------------------------------------------------------------------

interface DecodeBudget {
  /** 출력 버퍼(레이어 픽셀·마스크 값·공유 복사본)로 잡은 바이트의 합. 버려진 버퍼는 되돌려 준다. */
  decoded: number;
  /** 레코드 순회·출력 버퍼 만들기·압축 블록 풀기에 쓴 작업량의 합(`ClipDocumentLimits.maxWorkBytes`). 되돌려 주지 않는다. */
  work: number;
}

interface DecodeSetup {
  readonly bytes: Uint8Array;
  readonly externals: ReadonlyMap<string, ClipExternalBlock>;
  /** 컨테이너를 끝까지 읽었고 해석하지 못한 외부 블록도 없는지. 아니면 없는 외부 블록을 "저장된 데이터 없음"으로 단정할 수 없다. */
  readonly externalsComplete: boolean;
  readonly limits: ClipDocumentLimits;
  readonly budget: DecodeBudget;
  readonly pace: () => Promise<void>;
}

interface DecodedOffscreen {
  readonly ok: true;
  readonly attribute: ClipOffscreenAttribute;
  readonly pixels: ClipOffscreenPixels;
  /** 데이터 청크가 컨테이너에 없어 초기 색으로 채운 경우의 외부 ID. 청크를 찾았거나 ID가 없으면 null. */
  readonly absentExternalId: string | null;
}

interface FailedOffscreen {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
}

type OffscreenOutcome = DecodedOffscreen | FailedOffscreen;

function failure(code: string, message: string): FailedOffscreen {
  return { ok: false, code, message };
}

function decodedBudgetMessage(limits: ClipDocumentLimits): string {
  return `디코드 예산 ${limits.maxDecodedBytes}바이트를 넘는다`;
}

function workBudgetMessage(limits: ClipDocumentLimits): string {
  return `디코드 작업량 예산 ${limits.maxWorkBytes}바이트를 넘는다`;
}

/** 출력 버퍼가 잡은 바이트 수. */
function outputBytes(pixels: ClipOffscreenPixels): number {
  return (pixels.pixels?.byteLength ?? 0) + (pixels.values?.byteLength ?? 0);
}

/**
 * 오프스크린 하나를 풀어 돌려준다. `expect`가 `mask`면 알파 한 평면 형식만, `image`면 색·회색 형식만 받는다. 어긋나는 데이터는 던지지 않고
 * 실패 결과로 돌려주어 호출자가 레이어 하나만 `unsupported`로 남기게 한다. 중단 신호(`ClipDocumentError`)만 그대로 던진다. 실패한 해독이
 * 잡았던 출력 예산(살아 있는 버퍼의 합)은 되돌려 주고, 레코드를 훑고 버퍼를 만들고 채우고 푸는 데 쓴 작업량은 되돌려 주지 않는다.
 */
async function decodeOffscreen(setup: DecodeSetup, expect: "image" | "mask", row: ClipOffscreenRow): Promise<OffscreenOutcome> {
  if (row.attributeOversized) return failure("clip-offscreen-attribute-oversized", `오프스크린의 Attribute BLOB가 ${CLIP_ATTRIBUTE_MAX_BYTES}바이트를 넘어 읽지 않는다`);
  if (row.attribute === null) return failure("clip-offscreen-attribute-missing", "오프스크린의 Attribute BLOB가 없다");
  let attribute: ClipOffscreenAttribute;
  try {
    attribute = parseClipOffscreenAttribute(row.attribute, { maxBlocks: CLIP_BLOCK_LIMITS.maxBlocks, maxPixels: setup.limits.maxLayerPixels });
  } catch (error) {
    if (error instanceof ClipBlockError) return failure(`clip-offscreen-${error.code}`, error.message);
    throw error;
  }
  const layout = resolveClipBlockLayout(attribute);
  const matches = layout !== null && (expect === "mask" ? layout.kind === "mask8" : layout.kind === "rgba" || layout.kind === "gray8");
  if (!matches) {
    if (layout?.kind === "gray1") return failure("clip-offscreen-mono-unsupported", "1비트 단색 오프스크린은 비트 순서를 확인하지 못해 읽지 않는다");
    return failure("clip-offscreen-format", `${expect === "mask" ? "마스크" : "레이어"}에 맞지 않는 블록 형식이다 (채널 순서 0x${attribute.channelOrder.toString(16)}, 바이트 코드 ${attribute.pixelBytesCode})`);
  }

  // 외부 ID가 없거나 그 데이터 청크가 컨테이너에 없으면 저장된 데이터가 없는 것이다(S1·S2): 모든 블록이 초기 색을 따른다. 컨테이너를 끝까지
  // 읽지 못했거나 해석하지 못한 외부 블록이 있으면 청크가 사라진 것일 수 있어 단정하지 않고 실패로 알린다.
  let payload: Uint8Array | null = null;
  let absentExternalId: string | null = null;
  if (row.externalId !== null) {
    const block = setup.externals.get(externalKey(row.externalId));
    if (block !== undefined) {
      payload = setup.bytes.subarray(block.dataOffset, block.dataOffset + block.dataLength);
    } else if (setup.externalsComplete) {
      absentExternalId = row.externalId;
    } else {
      return failure(
        "clip-offscreen-external-missing",
        `외부 블록 ${clipDiagnosticText(row.externalId)}가 컨테이너에 없다. 컨테이너를 끝까지 읽지 못했거나 해석하지 못한 외부 블록이 있어 저장된 데이터가 없다고 단정할 수 없다`,
      );
    }
  }

  let reserved = 0;
  try {
    const steps = stepClipOffscreenDecode({
      attribute,
      payload,
      reserve: (bytes) => {
        if (setup.budget.decoded + bytes > setup.limits.maxDecodedBytes) throw new ClipBlockError(decodedBudgetMessage(setup.limits), "limit");
        setup.budget.decoded += bytes;
        reserved += bytes;
      },
      chargeWork: (bytes) => {
        if (setup.budget.work + bytes > setup.limits.maxWorkBytes) throw new ClipBlockError(workBudgetMessage(setup.limits), "limit");
        setup.budget.work += bytes;
      },
    });
    for (;;) {
      const step = steps.next();
      if (step.done === true) return { ok: true, attribute, pixels: step.value, absentExternalId };
      await setup.pace();
    }
  } catch (error) {
    if (error instanceof ClipBlockError) {
      setup.budget.decoded -= reserved;
      return failure(`clip-offscreen-${error.code}`, error.message);
    }
    throw error;
  }
}

/**
 * 같은 오프스크린을 가리키는 다른 레이어에 줄 복사본을 만든다. 복사본도 출력 버퍼이므로 만들기 전에 출력 예산을 잡고, 복사하는 비용은 되돌려
 * 주지 않는 작업량에 센다(위치가 범위를 벗어나 버려질 복사본을 되풀이해 만드는 입력을 막는다). 풀기는 다시 하지 않는다.
 */
function copyDecodedOffscreen(setup: DecodeSetup, source: DecodedOffscreen): OffscreenOutcome {
  const bytes = outputBytes(source.pixels);
  if (setup.budget.decoded + bytes > setup.limits.maxDecodedBytes) return failure("clip-offscreen-limit", decodedBudgetMessage(setup.limits));
  if (setup.budget.work + bytes > setup.limits.maxWorkBytes) return failure("clip-offscreen-limit", workBudgetMessage(setup.limits));
  setup.budget.work += bytes;
  setup.budget.decoded += bytes;
  try {
    return { ...source, pixels: { ...source.pixels, pixels: source.pixels.pixels?.slice() ?? null, values: source.pixels.values?.slice() ?? null } };
  } catch (error) {
    setup.budget.decoded -= bytes;
    if (error instanceof RangeError) return failure("clip-offscreen-limit", "복사본을 만들 메모리가 없다");
    throw error;
  }
}

/**
 * 외부 ID로 컨테이너의 데이터 청크를 찾는 열쇠. 청크와 DB의 ID는 같은 40자(`extrnlid` + 16진 32자)지만 16진 글자의 대소문자가 양쪽에서
 * 같다는 근거는 없다(S2는 대문자라고 적었고 S1은 대소문자를 적지 않았다). 대소문자만 달라 짝을 못 찾으면 레이어가 조용히 투명해지므로 소문자로
 * 맞춰 비교한다. 형식을 확인한 ID에만 의미가 있고, 형식이 아닌 문자열도 같은 방식으로 비교될 뿐이다.
 */
function externalKey(externalId: string): string {
  return externalId.toLowerCase();
}

function safeOrigin(base: number, ...offsets: number[]): number | null {
  const sum = offsets.reduce((total, offset) => total + offset, base);
  return Number.isSafeInteger(sum) && Math.abs(sum) <= MAX_COORDINATE ? sum : null;
}

// ---------------------------------------------------------------------------
// 가져오기
// ---------------------------------------------------------------------------

/** 저장된 픽셀을 읽는 레이어 종류. 화상 소재·3D는 편집 정보가 아니라 저장된 렌더 캐시만 읽는다. */
const PIXEL_KINDS: ReadonlySet<ClipLayerKind> = new Set(["raster", "image-material", "model3d"]);
const CACHE_ONLY_KINDS: ReadonlySet<ClipLayerKind> = new Set(["image-material", "model3d"]);
/**
 * 픽셀을 읽지 않는 이유(제3자 명세): 텍스트·벡터 레이어는 S2가 연결을 따라 닿는 래스터를 저장하지 않는다고 적었고(S1은 저장된 화소가 있으면
 * 쓰라고 적어 어긋난다) 채움 레이어의 저장 픽셀은 낡았을 수 있다고 S1이 적었다.
 */
const NOT_RENDERED_REASONS: Readonly<Partial<Record<ClipLayerKind, string>>> = {
  text: "텍스트 레이어: 연결을 따라 닿는 래스터가 없다고 제3자 명세 S2가 적었고(글자 이미지는 경계 상자 오프스크린에 있다. S1은 저장된 화소를 쓰라고 적어 어긋난다) 글자 편집 정보를 해석하지 않아 렌더하지 않는다",
  vector: "벡터 레이어: 연결을 따라 닿는 래스터가 없다고 제3자 명세 S2가 적었고(S1은 저장된 화소를 쓰라고 적어 어긋난다) 벡터 획을 해석하지 않아 렌더하지 않는다",
  fill: "채움(그라데이션·단색) 레이어: 저장된 픽셀이 낡았을 수 있다고 제3자 명세 S1이 적어 읽지 않고 채움 정보도 해석하지 않는다",
};

interface LayerOutcome {
  extent: ClipExtent | null;
  colorMode: "color" | "gray" | null;
  initialPixel: readonly [number, number, number, number] | null;
  pixels: Uint8Array | null;
  storedBlocks: number | null;
  mask: ClipLayerMask | null;
}

function chainFailureMessage(reason: ClipChainFailure): string {
  switch (reason) {
    case "tables-missing":
      return "Mipmap·MipmapInfo·Offscreen 표가 없다";
    case "mipmap-missing":
      return "Layer가 가리키는 Mipmap 행이 없다";
    case "mipmap-info-missing":
      return "Mipmap이 가리키는 첫 MipmapInfo 행이 없다";
    case "offscreen-link-missing":
      return "MipmapInfo가 가리키는 Offscreen이 없다";
  }
}

/**
 * `.clip` 문서를 가져온다. 구조적으로 읽을 수 없는 문서(컨테이너·DB가 아님, 필수 표 없음)는 `ClipDocumentError`로 던지고, 레이어 하나의
 * 픽셀·마스크를 읽지 못한 것은 던지지 않고 `unsupported`에 남긴다.
 */
export async function importChunkedSqliteDocument(
  source: Blob | Uint8Array | ArrayBuffer,
  options: ClipDocumentImportOptions,
): Promise<ClipDocumentImportResult> {
  if (typeof options?.openSqlite !== "function") throw new ClipDocumentError("openSqlite는 함수여야 한다", "options-invalid");
  const limits = resolveLimits(options.limits);
  const signal = options.signal;
  const decodePixels = options.decodePixels !== false;
  const bytes = await readSourceBytes(source, limits.maxSourceBytes, signal);

  const warnings = new ClipIssueList(limits.maxIssues);
  const unsupported = new ClipIssueList(limits.maxIssues);

  const container = parseClipContainer(bytes);
  if (container.kind !== "csfchunk") {
    const detail = container.kind === "lip-sqlite3" ? "`.lip`(SQLite 단독) 파일은 문서가 아니라 가져올 수 없다" : "CSFCHUNK 컨테이너가 아니다";
    throw new ClipDocumentError(detail, "container-invalid");
  }
  for (const issue of container.issues) warnings.add(issue.scope, issue.code, issue.message, issue.path);
  if (container.truncated) warnings.add("container", "clip-container-truncated", "컨테이너가 중간에 끊겨 있다. 읽을 수 있는 부분만 가져온다");
  const section = container.sqlite;
  if (section === null || section.inspection.container !== "sqlite3") {
    throw new ClipDocumentError("문서 DB(CHNKSQLi)를 찾을 수 없다", "container-invalid");
  }
  // 문서 DB 구간은 복사하지 않고 비공개 사본(`bytes`)의 보기로 넘긴다. 판독기는 열기 전에 필요한 만큼 가져가야 하며 이 보기를 고치면 안 된다.
  const databaseBytes = bytes.subarray(section.payloadOffset, section.payloadOffset + section.payloadLength);

  const externals = new Map<string, ClipExternalBlock>();
  for (const block of container.externalBlocks) {
    if (!block.parsed) continue;
    const key = externalKey(block.externalId);
    if (externals.has(key)) {
      warnings.add("container", "clip-external-duplicate-id", `외부 ID ${clipDiagnosticText(block.externalId)}가 둘 이상의 CHNKExta에 있다(대소문자만 다른 것 포함). 처음 것만 쓴다`);
      continue;
    }
    externals.set(key, block);
  }

  // 컨테이너를 끝까지 읽었고 외부 블록을 모두 해석했을 때만 "없는 외부 블록 = 저장된 데이터 없음"으로 본다.
  const externalsComplete =
    !container.truncated && container.externalBlocks.every((block) => block.parsed) && !container.issues.some((issue) => issue.code === "clip-external-count-exceeded");

  const sha256 = await sha256Hex(bytes);
  throwIfClipAborted(signal);

  let db: ClipSqliteDatabase;
  try {
    db = await options.openSqlite(databaseBytes, signal === undefined ? {} : { signal });
  } catch (error) {
    throwIfClipAborted(signal);
    const message = error instanceof Error ? error.message : String(error);
    throw new ClipDocumentError(`문서 DB를 열지 못했다: ${clipDiagnosticText(message, 200)}`, "reader-failed", { cause: error });
  }

  try {
    const ctx: ClipReaderContext = { db, limits, warnings, signal };
    const pace = createClipPacer(signal);

    const canvas = await readClipCanvas(ctx);
    const rows = await readClipLayerRows(ctx, canvas.id);
    if (!rows.has(canvas.rootFolderId)) {
      throw new ClipDocumentError(`루트 폴더 레이어 ${canvas.rootFolderId}가 Layer 표에 없다`, "database-invalid");
    }
    const vectorIds = await readClipVectorLayerIds(ctx);

    const flat = flattenClipLayerTree(rows, canvas.rootFolderId, { maxLayers: limits.maxLayers, maxDepth: limits.maxGroupDepth }, (code, message) => {
      warnings.add("semantic", code, message);
    });
    if (rows.size - 1 > flat.length) {
      warnings.add("semantic", "clip-layer-unreachable", `루트에서 닿지 않는 Layer 행 ${rows.size - 1 - flat.length}개는 읽지 않았다`);
    }

    const kinds = flat.map((entry) => classifyClipLayer(entry.row, vectorIds.has(entry.row.id)));
    const outcomes: LayerOutcome[] = flat.map(() => ({ extent: null, colorMode: null, initialPixel: null, pixels: null, storedBlocks: null, mask: null }));
    reportKinds(flat, kinds, unsupported);

    if (decodePixels) {
      const setup: DecodeSetup = { bytes, externals, externalsComplete, limits, budget: { decoded: 0, work: 0 }, pace };
      const readOffscreens = await createClipOffscreenReader(ctx);
      await decodeLayerPixels(ctx, setup, readOffscreens, flat, kinds, outcomes, unsupported);
      await decodeLayerMasks(ctx, setup, readOffscreens, flat, kinds, outcomes, unsupported);
    }

    const previewPng = await readClipPreviewPng(ctx, canvas.id);

    const layers = flat.map((entry, index) => buildLayer(entry, index, kinds[index]!, outcomes[index]!));
    return {
      format: "clip-document",
      specProfile: "clip-secondary-spec",
      canvas,
      layers,
      previewPng,
      warnings: warnings.toArray(),
      unsupported: unsupported.toArray(),
      diagnosticCounts: { warnings: warnings.totals(), unsupported: unsupported.totals() },
      source: { byteLength: bytes.byteLength, sha256 },
    };
  } finally {
    try {
      await db.close();
    } catch {
      // 닫기 실패는 결과에 영향이 없다.
    }
  }
}

function layerPath(entry: ClipFlatLayer, index: number): string {
  return `layers[${index}] (id ${entry.row.id} ${JSON.stringify(clipDiagnosticText(entry.row.name, 40))})`;
}

function reportKinds(flat: readonly ClipFlatLayer[], kinds: readonly ClipLayerKind[], unsupported: ClipIssueList): void {
  flat.forEach((entry, index) => {
    const kind = kinds[index]!;
    const path = layerPath(entry, index);
    const notRendered = NOT_RENDERED_REASONS[kind];
    if (notRendered !== undefined) {
      unsupported.add("semantic", "clip-layer-kind-not-rendered", notRendered, path);
    } else if (CACHE_ONLY_KINDS.has(kind)) {
      unsupported.add("semantic", "clip-layer-cache-only", `${kind} 레이어: 편집 정보는 해석하지 않고 저장된 렌더 캐시 픽셀만 읽는다`, path);
    } else if (kind === "adjustment") {
      unsupported.add("semantic", "clip-layer-adjustment-not-applied", "색조 보정 레이어: 보정 내용을 해석하지 않으며 픽셀도 읽지 않는다", path);
    } else if (kind === "story-info" || kind === "other") {
      unsupported.add("semantic", "clip-layer-kind-unsupported", `${kind} 레이어: 이 종류는 해석하지 않으며 픽셀도 읽지 않는다 (LayerType ${entry.row.layerType})`, path);
    }
  });
}

async function decodeLayerPixels(
  ctx: ClipReaderContext,
  setup: DecodeSetup,
  readOffscreens: ClipOffscreenRowReader | null,
  flat: readonly ClipFlatLayer[],
  kinds: readonly ClipLayerKind[],
  outcomes: LayerOutcome[],
  unsupported: ClipIssueList,
): Promise<void> {
  const targets = flat.flatMap((entry, index) => (PIXEL_KINDS.has(kinds[index]!) && entry.row.renderMipmap > 0 ? [index] : []));
  const chains = await resolveClipMipmapChains(ctx, targets.map((index) => flat[index]!.row.renderMipmap));
  await decodeTargets(ctx, setup, readOffscreens, flat, targets, chains, "image", unsupported, (index, decoded) => {
    const row = flat[index]!.row;
    const x = safeOrigin(row.offsetX, row.renderOffsetX);
    const y = safeOrigin(row.offsetY, row.renderOffsetY);
    if (x === null || y === null) return "레이어 위치가 허용 범위를 벗어난다";
    const { pixels, attribute } = decoded;
    outcomes[index]!.extent = { x, y, width: attribute.width, height: attribute.height };
    outcomes[index]!.colorMode = pixels.kind === "gray" ? "gray" : "color";
    const [r, g, b, a] = pixels.initial;
    outcomes[index]!.initialPixel = [r!, g!, b!, a!];
    outcomes[index]!.pixels = pixels.pixels;
    outcomes[index]!.storedBlocks = pixels.decodedBlocks;
    return null;
  });
}

async function decodeLayerMasks(
  ctx: ClipReaderContext,
  setup: DecodeSetup,
  readOffscreens: ClipOffscreenRowReader | null,
  flat: readonly ClipFlatLayer[],
  kinds: readonly ClipLayerKind[],
  outcomes: LayerOutcome[],
  unsupported: ClipIssueList,
): Promise<void> {
  const targets: number[] = [];
  flat.forEach((entry, index) => {
    if (entry.row.maskMipmap <= 0) return;
    if (kinds[index] === "frame-folder") {
      // S1: 컷 틀 폴더는 마스크를 저장하지 않는다(S1만 적음). 마스크 연결 값이 있어도 레이어 마스크로 해석하지 않는다.
      unsupported.add("semantic", "clip-layer-frame-mask-not-stored", "컷 틀 폴더: 마스크를 저장하지 않는다고 제3자 명세 S1이 적어(S2에는 컷 틀 폴더 서술이 없다) 마스크 연결을 레이어 마스크로 읽지 않는다", layerPath(entry, index));
      return;
    }
    targets.push(index);
  });
  const chains = await resolveClipMipmapChains(ctx, targets.map((index) => flat[index]!.row.maskMipmap));
  await decodeTargets(ctx, setup, readOffscreens, flat, targets, chains, "mask", unsupported, (index, decoded) => {
    const row = flat[index]!.row;
    const x = safeOrigin(row.offsetX, row.maskOffsetX, row.maskRenderOffsetX);
    const y = safeOrigin(row.offsetY, row.maskOffsetY, row.maskRenderOffsetY);
    if (x === null || y === null) return "마스크 위치가 허용 범위를 벗어난다";
    const { pixels, attribute } = decoded;
    outcomes[index]!.mask = {
      extent: { x, y, width: attribute.width, height: attribute.height },
      defaultValue: pixels.initial[0] ?? 0,
      values: pixels.values,
      storedBlocks: pixels.decodedBlocks,
      enabled: (row.visibility & 2) !== 0,
    };
    return null;
  });
}

/**
 * 대상 레이어마다 연결을 따라 오프스크린을 읽고 풀어 `apply`에 넘긴다. 레이어 하나의 실패는 `unsupported`로 남기고 계속한다. 같은 오프스크린을
 * 가리키는 레이어들은 한 번만 풀고 첫 레이어가 원본 버퍼를, 나머지가 예산을 잡은 복사본을 받는다. `apply`가 문제를 알리면 그 버퍼의 예산을
 * 되돌려 준다.
 */
async function decodeTargets(
  ctx: ClipReaderContext,
  setup: DecodeSetup,
  readOffscreens: ClipOffscreenRowReader | null,
  flat: readonly ClipFlatLayer[],
  targets: readonly number[],
  chains: ReadonlyMap<number, ClipOffscreenRef | ClipChainFailure>,
  expect: "image" | "mask",
  unsupported: ClipIssueList,
  apply: (index: number, decoded: DecodedOffscreen) => string | null,
): Promise<void> {
  const area = expect === "mask" ? "mask" : "pixels";
  const label = expect === "mask" ? "마스크" : "픽셀";
  const unreachable = `clip-layer-${area}-unreachable`;
  const mipmapOf = (index: number): number => (expect === "mask" ? flat[index]!.row.maskMipmap : flat[index]!.row.renderMipmap);
  const layersByOffscreen = new Map<number, number[]>();
  for (const index of targets) {
    const chain = chains.get(mipmapOf(index));
    const path = layerPath(flat[index]!, index);
    if (chain === undefined || typeof chain === "string") {
      unsupported.add("resource", unreachable, `${label} 읽기 실패: ${chainFailureMessage(chain ?? "mipmap-missing")}`, path);
    } else if (chain.scale !== null && Math.abs(chain.scale - 100) > FULL_SCALE_TOLERANCE) {
      unsupported.add("resource", `clip-layer-${area}-scale`, `${label} 읽기 실패: 첫 단계 MipmapInfo의 배율이 ${chain.scale}이다 (원본 크기 100이 아니다)`, path);
    } else if (readOffscreens === null) {
      unsupported.add("resource", unreachable, `${label} 읽기 실패: Offscreen 표가 없다`, path);
    } else {
      const sharing = layersByOffscreen.get(chain.offscreenId);
      if (sharing === undefined) layersByOffscreen.set(chain.offscreenId, [index]);
      else sharing.push(index);
    }
  }

  const fail = (index: number, code: string, message: string): void => {
    unsupported.add("resource", code, `${label} 읽기 실패: ${message}`, layerPath(flat[index]!, index));
  };
  // Offscreen 표가 없어 판독기가 null이면 위에서 모든 대상이 unsupported로 남아 `layersByOffscreen`이 비므로 이 루프는 돌지 않는다. 도는 동안 판독기는 null이 아니다.
  for (const batch of chunkClipIds([...layersByOffscreen.keys()], OFFSCREEN_BATCH)) {
    const rows = await readOffscreens!(batch);
    for (const offscreenId of batch) {
      const sharers = layersByOffscreen.get(offscreenId)!;
      const row = rows.get(offscreenId);
      if (row === undefined) {
        for (const index of sharers) fail(index, unreachable, `Offscreen 행 ${offscreenId}가 없다`);
        continue;
      }
      const outcome = await decodeOffscreen(setup, expect, row);
      // 실패하는 오프스크린이 줄줄이 이어져도 중단 신호를 보고 이벤트 루프에 양보한다(성공 쪽은 레이어마다 아래에서 한 번 더 부른다).
      await setup.pace();
      if (!outcome.ok) {
        for (const index of sharers) fail(index, outcome.code, outcome.message);
        continue;
      }
      let originalAvailable = true;
      for (const index of sharers) {
        let decoded: DecodedOffscreen = outcome;
        if (!originalAvailable) {
          const copy = copyDecodedOffscreen(setup, outcome);
          if (!copy.ok) {
            fail(index, copy.code, copy.message);
            continue;
          }
          decoded = copy;
        }
        const problem = apply(index, decoded);
        if (problem !== null) {
          fail(index, unreachable, problem);
          if (!originalAvailable) setup.budget.decoded -= outputBytes(decoded.pixels);
          continue;
        }
        originalAvailable = false;
        if (decoded.absentExternalId !== null) {
          ctx.warnings.add(
            "resource",
            "clip-offscreen-external-absent",
            `외부 블록 ${clipDiagnosticText(decoded.absentExternalId)}가 컨테이너에 없어 저장된 데이터가 없는 것으로 보고 초기 색을 썼다 (제3자 명세 S1·S2)`,
            layerPath(flat[index]!, index),
          );
        }
        await setup.pace();
      }
      // 어느 레이어도 원본을 받지 못했으면 그 버퍼는 버려진다.
      if (originalAvailable) setup.budget.decoded -= outputBytes(outcome.pixels);
    }
  }
}

function buildLayer(entry: ClipFlatLayer, index: number, kind: ClipLayerKind, outcome: LayerOutcome): ClipLayer {
  const { row } = entry;
  const opacityRaw = row.opacity;
  return {
    index,
    id: row.id,
    parentIndex: entry.parentIndex,
    depth: entry.depth,
    kind,
    layerType: row.layerType,
    name: row.name,
    uuid: row.uuid,
    visible: (row.visibility & 1) !== 0,
    effectiveVisible: entry.effectiveVisible,
    visibilityRaw: row.visibility,
    editLocked: (row.lock & LOCK_EDIT_BIT) !== 0,
    transparencyLocked: (row.lock & LOCK_TRANSPARENCY_BIT) !== 0,
    lockRaw: row.lock,
    clipToBelow: row.clip !== 0,
    folderFlags: row.folder,
    opacity: Math.min(1, Math.max(0, opacityRaw / 256)),
    opacityRaw,
    compositeRaw: row.composite,
    compositeMode: clipCompositeModeId(row.composite),
    passThrough: (kind === "folder" || kind === "frame-folder") && row.composite === CLIP_PASS_THROUGH_COMPOSITE,
    placement: {
      layerOffsetX: row.offsetX,
      layerOffsetY: row.offsetY,
      renderOffsetX: row.renderOffsetX,
      renderOffsetY: row.renderOffsetY,
      maskOffsetX: row.maskOffsetX,
      maskOffsetY: row.maskOffsetY,
      maskRenderOffsetX: row.maskRenderOffsetX,
      maskRenderOffsetY: row.maskRenderOffsetY,
      drawToRenderOffscreenType: row.drawToRenderType,
    },
    drawColor: row.drawColor,
    drawColorEnabled: row.drawColorEnabled,
    extent: outcome.extent,
    colorMode: outcome.colorMode,
    initialPixel: outcome.initialPixel,
    pixels: outcome.pixels,
    storedBlocks: outcome.storedBlocks,
    mask: outcome.mask,
  };
}
