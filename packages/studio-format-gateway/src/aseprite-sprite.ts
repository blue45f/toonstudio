/**
 * @file aseprite-sprite.ts
 * @description Aseprite 스프라이트(`.aseprite`/`.ase`) 읽기 코덱: 헤더, 프레임, 청크 14종, 레이어 트리, 셀 픽셀(원본 색
 *              형식), 팔레트, 태그, 슬라이스, 타일셋, 사용자 데이터, 진단.
 *
 * 범위는 읽기다. 프레임 합성, 블렌드 모드 계산, 색 프로파일 적용, 타일맵 래스터화, 쓰기는 하지 않는다. 불투명도와
 * 블렌드 모드는 파일에 적힌 값과 그 값이 유효한지(헤더 플래그에 따라)만 돌려준다. 원본 파일의 바이트는 호출자가
 * 가지고 있고, 결과는 길이와 SHA-256만 담는다.
 *
 * 출처와 이용 조건: 필드 크기와 상수는 Aseprite가 공개한 파일 포맷 문서(`docs/ase-file-specs.md`, 고정 커밋
 * 24086ec0)에서 확인한 사실만 자체 표현으로 옮겼다. 문서에는 라이선스 표기가 없고 저장소의 소스·바이너리는 별도
 * EULA 아래에 있다. 문서의 문구·표를 복사하지 않았고 Aseprite 소스는 읽지 않았다. 문서 자체의 이용 조건은 확인하지
 * 못했으므로 앱에 연결하기 전에 소유자·법무가 확인하는 것이 바람직하다. 이 구현은 법적 결론이 아니다.
 *
 * 이름: `ase-csh.ts`가 Adobe Swatch Exchange(`.ase`)를 이미 구현한다. 확장자만으로 판별하지 않고 오프셋 4의
 * WORD 0xA5E0(Aseprite)과 ASCII `ASEF`(Adobe)로 가른다(`inspectAsepriteSignature`).
 */

import {
  ASEPRITE_CHUNK_TYPE,
  bytesPerPixelForDepth,
  decodeCelChunk,
  decodeCelExtraChunk,
  decodeColorProfileChunk,
  decodeExternalFilesChunk,
  decodeLayerChunk,
  decodeOldPaletteChunk,
  decodePaletteChunk,
  decodeSliceChunk,
  decodeTagsChunk,
  decodeTilesetChunk,
  decodeUserDataChunk,
  type AsepriteChunkContext,
  type AsepriteColorProfileChunk,
  type AsepriteExternalFileEntry,
  type AsepriteUserDataChunk,
} from "./aseprite-sprite-chunks";
import {
  AsepriteChunkReadError,
  AsepriteCursor,
  AsepriteSpriteError,
  ASEPRITE_SPRITE_LIMITS,
  type AsepriteSpriteLimits,
} from "./aseprite-sprite-cursor";
import {
  BLEND_MODE_NAMES,
  attachUserData,
  buildLayerTree,
  issue,
  layerFlags,
  validateCels,
  type Attach,
} from "./aseprite-sprite-model";
import { AsepriteDecodeBudget, AsepritePixelDecodeError, inflateWithinBudget } from "./aseprite-sprite-pixels";
import { openRasterSha256Hex } from "./openraster";

import type {
  AsepriteSpriteCel,
  AsepriteSpriteCelKind,
  AsepriteSpriteFrame,
  AsepriteSpriteHeader,
  AsepriteSpriteImportOptions,
  AsepriteSpriteImportResult,
  AsepriteSpriteLayer,
  AsepriteSpriteSlice,
  AsepriteSpriteTag,
  AsepriteSpriteTileset,
  AsepritePaletteUpdate,
  AsepriteUnknownChunk,
} from "./aseprite-sprite-types";
import type { FormatIssue } from "./format-common";

export type * from "./aseprite-sprite-types";
export { asepritePaletteAtFrame, orderAsepriteFrameCels, resolveAsepriteLinkedCel } from "./aseprite-sprite-model";
export {
  AsepriteSpriteError,
  ASEPRITE_SPRITE_LIMITS,
  type AsepriteSpriteErrorCode,
  type AsepriteSpriteLimits,
} from "./aseprite-sprite-cursor";
export {
  asepriteCelToRgba8,
  asepriteTileFields,
  asepriteTilemapValues,
  type AsepriteInflateAdapter,
  type AsepriteRgba8Conversion,
  type AsepriteTileFields,
} from "./aseprite-sprite-pixels";
export type {
  AsepriteColorProfileChunk as AsepriteSpriteColorProfile,
  AsepriteExternalFileEntry as AsepriteSpriteExternalFile,
  AsepriteRgba,
  AsepriteTagEntry,
  AsepriteUserDataChunk as AsepriteSpriteUserData,
  AsepriteUserProperty,
  AsepriteUserPropertyMap,
  AsepriteUserPropertyValue,
} from "./aseprite-sprite-chunks";

const HEADER_BYTES = 128;
const FRAME_HEADER_BYTES = 16;
const FILE_MAGIC = 0xa5e0;
const FRAME_MAGIC = 0xf1fa;

// ---------------------------------------------------------------------------
// 한도·입력·서명
// ---------------------------------------------------------------------------

function resolveLimits(requested: Partial<AsepriteSpriteLimits> | undefined): AsepriteSpriteLimits {
  if (requested === undefined) return ASEPRITE_SPRITE_LIMITS;
  const resolved: { -readonly [K in keyof AsepriteSpriteLimits]: number } = { ...ASEPRITE_SPRITE_LIMITS };
  for (const key of Object.keys(ASEPRITE_SPRITE_LIMITS) as Array<keyof AsepriteSpriteLimits>) {
    const value = requested[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0 || value > ASEPRITE_SPRITE_LIMITS[key]) {
      throw new AsepriteSpriteError(`${key}는 0 이상 ${ASEPRITE_SPRITE_LIMITS[key]} 이하의 정수여야 한다`, "source-too-large");
    }
    resolved[key] = value;
  }
  return resolved;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new AsepriteSpriteError("Aseprite 가져오기가 중단되었다", "aborted");
}

async function readSourceBytes(
  source: Blob | Uint8Array | ArrayBuffer,
  limits: AsepriteSpriteLimits,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  const size = source instanceof Blob ? source.size : source.byteLength;
  if (size > limits.maxFileBytes) {
    throw new AsepriteSpriteError(`입력 ${size}바이트가 한도 ${limits.maxFileBytes}를 넘는다`, "source-too-large");
  }
  let bytes: Uint8Array;
  if (source instanceof Blob) bytes = new Uint8Array(await source.arrayBuffer());
  else if (source instanceof Uint8Array) bytes = new Uint8Array(source);
  else if (source instanceof ArrayBuffer) bytes = new Uint8Array(source.slice(0));
  else throw new AsepriteSpriteError("지원하지 않는 입력 형식이다", "source-invalid");
  throwIfAborted(signal);
  return bytes;
}

/** Aseprite 스프라이트와 Adobe Swatch Exchange(`ase-csh.ts`)는 둘 다 `.ase` 확장자를 쓴다. */
export function inspectAsepriteSignature(bytes: Uint8Array): "aseprite" | "adobe-swatch-exchange" | "unknown" {
  if (bytes.byteLength >= 4 && bytes[0] === 0x41 && bytes[1] === 0x53 && bytes[2] === 0x45 && bytes[3] === 0x46) {
    return "adobe-swatch-exchange";
  }
  if (bytes.byteLength >= HEADER_BYTES && bytes[4] === (FILE_MAGIC & 0xff) && bytes[5] === FILE_MAGIC >> 8) return "aseprite";
  return "unknown";
}

// ---------------------------------------------------------------------------
// 헤더
// ---------------------------------------------------------------------------

function parseHeader(bytes: Uint8Array, limits: AsepriteSpriteLimits): AsepriteSpriteHeader {
  const cursor = new AsepriteCursor(bytes, 0, HEADER_BYTES);
  const declaredFileSize = cursor.u32();
  cursor.skip(2);
  const frameCount = cursor.u16();
  const width = cursor.u16();
  const height = cursor.u16();
  const colorDepth = cursor.u16();
  const flags = cursor.u32();
  const deprecatedFrameDurationMs = cursor.u16();
  cursor.skip(8);
  const transparentIndex = cursor.u8();
  cursor.skip(3);
  const colorCount = cursor.u16();
  const pixelWidth = cursor.u8();
  const pixelHeight = cursor.u8();
  const gridX = cursor.i16();
  const gridY = cursor.i16();
  const gridWidth = cursor.u16();
  const gridHeight = cursor.u16();

  if (colorDepth !== 8 && colorDepth !== 16 && colorDepth !== 32) {
    throw new AsepriteSpriteError(`색 깊이 ${colorDepth}는 8, 16, 32 중 하나여야 한다`, "header-invalid");
  }
  if (width === 0 || height === 0) throw new AsepriteSpriteError(`캔버스 ${width}x${height}가 비어 있다`, "header-invalid");
  if (frameCount === 0) throw new AsepriteSpriteError("프레임이 하나도 없다", "header-invalid");
  if (width > limits.maxCanvasDimension || height > limits.maxCanvasDimension) {
    throw new AsepriteSpriteError(`캔버스 ${width}x${height}가 한 변 한도 ${limits.maxCanvasDimension}를 넘는다`, "limit-exceeded");
  }
  if (frameCount > limits.maxFrames) {
    throw new AsepriteSpriteError(`프레임 ${frameCount}개가 한도 ${limits.maxFrames}를 넘는다`, "limit-exceeded");
  }
  return {
    declaredFileSize,
    frameCount,
    width,
    height,
    colorDepth,
    flags,
    layerOpacityValid: (flags & 1) !== 0,
    groupBlendOpacityValid: (flags & 2) !== 0,
    layerUuidPresent: (flags & 4) !== 0,
    deprecatedFrameDurationMs,
    transparentIndex,
    colorCount,
    pixelRatio: pixelWidth === 0 || pixelHeight === 0 ? { width: 1, height: 1 } : { width: pixelWidth, height: pixelHeight },
    grid: { x: gridX, y: gridY, width: gridWidth, height: gridHeight },
  };
}

// ---------------------------------------------------------------------------
// 가져오기
// ---------------------------------------------------------------------------

export async function importAsepriteSprite(
  source: Blob | Uint8Array | ArrayBuffer,
  options: AsepriteSpriteImportOptions = {},
): Promise<AsepriteSpriteImportResult> {
  const limits = resolveLimits(options.limits);
  const bytes = await readSourceBytes(source, limits, options.signal);
  const signature = inspectAsepriteSignature(bytes);
  if (signature !== "aseprite") {
    throw new AsepriteSpriteError(
      signature === "adobe-swatch-exchange"
        ? "Adobe Swatch Exchange 파일이다. Aseprite 스프라이트가 아니다"
        : "Aseprite 매직(0xA5E0)이 아니거나 헤더 128바이트보다 짧다",
      "signature-invalid",
    );
  }
  const header = parseHeader(bytes, limits);
  const warnings: FormatIssue[] = [];
  const unsupported: FormatIssue[] = [];
  if (header.declaredFileSize !== bytes.byteLength) {
    warnings.push(
      issue("container", "aseprite-file-size-mismatch", `헤더의 파일 크기 ${header.declaredFileSize}가 실제 ${bytes.byteLength}와 다르다`),
    );
  }

  const decodePixels = options.decodePixels !== false;
  const budget = new AsepriteDecodeBudget(limits.maxTotalDecodedBytes, limits.maxCelDecodedBytes);
  const bytesPerPixel = bytesPerPixelForDepth(header.colorDepth);
  let currentFrame = 0;
  let currentOffset = 0;
  const ctx: AsepriteChunkContext = {
    bytesPerPixel,
    layerUuidPresent: header.layerUuidPresent,
    limits,
    noteInvalidUtf8: (field) => {
      warnings.push(
        issue("metadata", "aseprite-string-utf8-invalid", `${field}에 UTF-8로 해석되지 않는 바이트가 있어 대체 문자로 바꿨다`, `frame[${currentFrame}]@${currentOffset}`),
      );
    },
  };

  const frames: AsepriteSpriteFrame[] = [];
  const layers: AsepriteSpriteLayer[] = [];
  const cels: AsepriteSpriteCel[] = [];
  const tags: AsepriteSpriteTag[] = [];
  const slices: AsepriteSpriteSlice[] = [];
  const tilesets: AsepriteSpriteTileset[] = [];
  const paletteUpdates: AsepritePaletteUpdate[] = [];
  const externalFiles: AsepriteExternalFileEntry[] = [];
  const unknownChunks: AsepriteUnknownChunk[] = [];
  let colorProfile: AsepriteColorProfileChunk | null = null;
  let spriteUserData: AsepriteUserDataChunk | null = null;
  let truncated = false;

  let framePosition = HEADER_BYTES;
  frameLoop: for (let frameIndex = 0; frameIndex < header.frameCount; frameIndex += 1) {
    throwIfAborted(options.signal);
    currentFrame = frameIndex;
    currentOffset = framePosition;
    if (framePosition + FRAME_HEADER_BYTES > bytes.byteLength) {
      warnings.push(issue("container", "aseprite-frame-truncated", `프레임 ${frameIndex}의 헤더가 파일 끝을 넘는다`, `frame[${frameIndex}]@${framePosition}`));
      truncated = true;
      break;
    }
    const head = new AsepriteCursor(bytes, framePosition, framePosition + FRAME_HEADER_BYTES);
    const frameBytes = head.u32();
    const magic = head.u16();
    const oldChunkCount = head.u16();
    const declaredDuration = head.u16();
    head.skip(2);
    const newChunkCount = head.u32();
    if (magic !== FRAME_MAGIC) {
      unsupported.push(issue("container", "aseprite-frame-invalid", `프레임 ${frameIndex}의 매직 0x${magic.toString(16)}가 0xF1FA가 아니다`, `frame[${frameIndex}]@${framePosition}`));
      truncated = true;
      break;
    }
    const frameEnd = framePosition + frameBytes;
    if (frameBytes < FRAME_HEADER_BYTES || frameEnd > bytes.byteLength) {
      unsupported.push(
        issue("container", "aseprite-frame-invalid", `프레임 ${frameIndex}의 크기 ${frameBytes}가 올바르지 않다 (남은 ${bytes.byteLength - framePosition}바이트)`, `frame[${frameIndex}]@${framePosition}`),
      );
      truncated = true;
      break;
    }
    if (oldChunkCount === 0xffff && newChunkCount === 0) {
      unsupported.push(issue("container", "aseprite-frame-invalid", `프레임 ${frameIndex}가 구 청크 수 0xFFFF와 신 청크 수 0을 함께 선언한다`, `frame[${frameIndex}]@${framePosition}`));
      truncated = true;
      break;
    }
    const chunkCount = newChunkCount !== 0 ? newChunkCount : oldChunkCount;
    if (chunkCount > limits.maxChunksPerFrame) {
      throw new AsepriteSpriteError(`프레임 ${frameIndex}의 청크 ${chunkCount}개가 한도 ${limits.maxChunksPerFrame}를 넘는다`, "limit-exceeded");
    }
    frames.push({
      index: frameIndex,
      durationMs: declaredDuration > 0 ? declaredDuration : header.deprecatedFrameDurationMs,
      declaredDurationMs: declaredDuration,
      chunkCount,
      byteOffset: framePosition,
      byteLength: frameBytes,
    });

    let attach: Attach = null;
    let objectChunkSeen = false;
    let chunkPosition = framePosition + FRAME_HEADER_BYTES;
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      throwIfAborted(options.signal);
      currentOffset = chunkPosition;
      const where = `frame[${frameIndex}].chunk[${chunkIndex}]@${chunkPosition}`;
      if (chunkPosition + 6 > frameEnd) {
        unsupported.push(issue("container", "aseprite-chunk-invalid", `청크 헤더가 프레임 끝을 넘는다`, where));
        truncated = true;
        break;
      }
      const chunkHead = new AsepriteCursor(bytes, chunkPosition, chunkPosition + 6);
      const chunkSize = chunkHead.u32();
      const type = chunkHead.u16();
      if (chunkSize < 6 || chunkPosition + chunkSize > frameEnd) {
        unsupported.push(issue("container", "aseprite-chunk-invalid", `청크 크기 ${chunkSize}가 올바르지 않다 (프레임에 남은 ${frameEnd - chunkPosition}바이트)`, where));
        truncated = true;
        break;
      }
      const cursor = new AsepriteCursor(bytes, chunkPosition + 6, chunkPosition + chunkSize);
      chunkPosition += chunkSize;

      try {
        switch (type) {
          case ASEPRITE_CHUNK_TYPE.oldPalette0004:
          case ASEPRITE_CHUNK_TYPE.oldPalette0011:
          case ASEPRITE_CHUNK_TYPE.palette: {
            const chunk =
              type === ASEPRITE_CHUNK_TYPE.palette
                ? decodePaletteChunk(cursor, ctx)
                : decodeOldPaletteChunk(cursor, type === ASEPRITE_CHUNK_TYPE.oldPalette0011);
            if (type === ASEPRITE_CHUNK_TYPE.oldPalette0011) {
              warnings.push(issue("metadata", "aseprite-palette-6bit-expanded", "0~63 값을 8비트로 넓히는 방식이 문서에 없어 상위 비트를 복제했다", where));
            }
            paletteUpdates.push({ frameIndex, source: chunk.source, declaredSize: chunk.declaredSize, entries: chunk.entries });
            attach = frameIndex === 0 && !objectChunkSeen ? { kind: "sprite" } : null;
            break;
          }
          case ASEPRITE_CHUNK_TYPE.layer: {
            const chunk = decodeLayerChunk(cursor, ctx);
            if (layers.length >= limits.maxLayers) {
              throw new AsepriteSpriteError(`레이어가 한도 ${limits.maxLayers}개를 넘는다`, "limit-exceeded");
            }
            if (frameIndex > 0) {
              warnings.push(issue("semantic", "aseprite-layer-in-later-frame", `첫 프레임이 아닌 프레임 ${frameIndex}에 레이어 청크가 있어 뒤에 덧붙였다`, where));
            }
            const flags = layerFlags(chunk.flags);
            const layer: AsepriteSpriteLayer = {
              index: layers.length,
              name: chunk.name,
              kind: chunk.kind,
              typeValue: chunk.typeValue,
              childLevel: chunk.childLevel,
              parentIndex: null,
              depth: 0,
              flags,
              effectiveVisible: flags.visible,
              blendMode: chunk.blendMode,
              blendModeName: BLEND_MODE_NAMES[chunk.blendMode] ?? null,
              opacity: chunk.opacity,
              opacityValid: chunk.kind === "group" ? header.groupBlendOpacityValid : header.layerOpacityValid,
              blendModeValid: chunk.kind === "group" ? header.groupBlendOpacityValid : true,
              tilesetIndex: chunk.tilesetIndex,
              uuid: chunk.uuid,
              firstSeenFrame: frameIndex,
              userData: null,
            };
            if (layer.blendModeName === null) {
              warnings.push(issue("semantic", "aseprite-blend-mode-unknown", `레이어 "${chunk.name}"의 블렌드 모드 ${chunk.blendMode}를 알 수 없다`, where));
            }
            if (layer.kind === "unknown") {
              warnings.push(issue("semantic", "aseprite-layer-type-unknown", `레이어 "${chunk.name}"의 타입 ${chunk.typeValue}를 알 수 없다`, where));
            }
            layers.push(layer);
            objectChunkSeen = true;
            attach = { kind: "layer", layer };
            break;
          }
          case ASEPRITE_CHUNK_TYPE.cel: {
            const chunk = decodeCelChunk(cursor, ctx);
            if (cels.length >= limits.maxCels) {
              throw new AsepriteSpriteError(`셀이 한도 ${limits.maxCels}개를 넘는다`, "limit-exceeded");
            }
            const body = chunk.body;
            const kind: AsepriteSpriteCelKind =
              body.kind === "raw" || body.kind === "compressed-image"
                ? "image"
                : body.kind === "linked"
                  ? "linked"
                  : body.kind === "compressed-tilemap"
                    ? "tilemap"
                    : "unknown";
            const cel: AsepriteSpriteCel = {
              frameIndex,
              layerIndex: chunk.layerIndex,
              x: chunk.x,
              y: chunk.y,
              opacity: chunk.opacity,
              zIndex: chunk.zIndex,
              kind,
              width: body.kind === "raw" || body.kind === "compressed-image" ? body.width : body.kind === "compressed-tilemap" ? body.widthTiles : null,
              height: body.kind === "raw" || body.kind === "compressed-image" ? body.height : body.kind === "compressed-tilemap" ? body.heightTiles : null,
              linkedFrame: body.kind === "linked" ? body.frame : null,
              pixels: null,
              tilemap:
                body.kind === "compressed-tilemap"
                  ? {
                      bitsPerTile: body.bitsPerTile,
                      tileIdMask: body.tileIdMask,
                      xFlipMask: body.xFlipMask,
                      yFlipMask: body.yFlipMask,
                      diagonalFlipMask: body.diagonalFlipMask,
                      bytes: null,
                    }
                  : null,
              preciseBounds: null,
              userData: null,
            };
            if (body.kind === "unknown") {
              unsupported.push(issue("semantic", "aseprite-cel-type-unsupported", `셀 타입 ${body.typeValue}를 해석하지 못했다`, where));
            }
            if (decodePixels) {
              await decodeCelPixels(cel, body, bytesPerPixel, budget, options, unsupported, where);
            }
            cels.push(cel);
            objectChunkSeen = true;
            attach = { kind: "cel", cel };
            break;
          }
          case ASEPRITE_CHUNK_TYPE.celExtra: {
            const chunk = decodeCelExtraChunk(cursor);
            if (attach?.kind === "cel") attach.cel.preciseBounds = chunk.preciseBounds;
            else warnings.push(issue("semantic", "aseprite-cel-extra-orphan", "셀 엑스트라 청크가 셀 청크 바로 뒤에 오지 않았다", where));
            break;
          }
          case ASEPRITE_CHUNK_TYPE.colorProfile:
            colorProfile = decodeColorProfileChunk(cursor);
            attach = null;
            break;
          case ASEPRITE_CHUNK_TYPE.externalFiles:
            externalFiles.push(...decodeExternalFilesChunk(cursor, ctx));
            attach = null;
            break;
          case ASEPRITE_CHUNK_TYPE.tags: {
            const entries = decodeTagsChunk(cursor, ctx);
            const added = entries.map((entry): AsepriteSpriteTag => ({ ...entry, userData: null }));
            tags.push(...added);
            objectChunkSeen = true;
            attach = added.length > 0 ? { kind: "tags", tags: added, next: 0 } : null;
            break;
          }
          case ASEPRITE_CHUNK_TYPE.slice: {
            if (slices.length >= limits.maxSlices) {
              throw new AsepriteSpriteError(`슬라이스가 한도 ${limits.maxSlices}개를 넘는다`, "limit-exceeded");
            }
            const slice: AsepriteSpriteSlice = { ...decodeSliceChunk(cursor, ctx), frameIndex, userData: null };
            slices.push(slice);
            objectChunkSeen = true;
            attach = { kind: "slice", slice };
            break;
          }
          case ASEPRITE_CHUNK_TYPE.tileset: {
            const chunk = decodeTilesetChunk(cursor, ctx);
            const { compressedTiles, ...meta } = chunk;
            const tileset: AsepriteSpriteTileset = { ...meta, frameIndex, tilePixels: null, userData: null, tileUserData: [] };
            if (decodePixels && compressedTiles !== null) {
              await decodeTilesetPixels(tileset, compressedTiles, bytesPerPixel, budget, options, unsupported, where);
            }
            tilesets.push(tileset);
            objectChunkSeen = true;
            attach = { kind: "tileset", tileset, taken: 0 };
            break;
          }
          case ASEPRITE_CHUNK_TYPE.userData: {
            const chunk = decodeUserDataChunk(cursor, ctx);
            if (chunk.propertiesError !== null) {
              unsupported.push(issue("metadata", "aseprite-user-data-properties-invalid", chunk.propertiesError, where));
            }
            attach = attachUserData(attach, chunk, (message) => {
              warnings.push(issue("semantic", "aseprite-user-data-orphan", message, where));
            });
            if (attach?.kind === "sprite") {
              spriteUserData = chunk;
              attach = null;
            }
            break;
          }
          case ASEPRITE_CHUNK_TYPE.mask:
          case ASEPRITE_CHUNK_TYPE.path:
            warnings.push(issue("metadata", "aseprite-chunk-deprecated", `폐기된 청크 0x${type.toString(16)}를 건너뛰었다 (${cursor.remaining}바이트)`, where));
            unknownChunks.push({ frameIndex, typeValue: type, offset: chunkPosition - chunkSize, length: chunkSize });
            attach = null;
            break;
          default:
            unsupported.push(issue("semantic", "aseprite-chunk-type-unknown", `알 수 없는 청크 타입 0x${type.toString(16)} (${chunkSize}바이트)를 보존 목록에만 남겼다`, where));
            unknownChunks.push({ frameIndex, typeValue: type, offset: chunkPosition - chunkSize, length: chunkSize });
            attach = null;
            break;
        }
        if (isDecodedChunkType(type) && type !== ASEPRITE_CHUNK_TYPE.cel && cursor.remaining > 0) {
          warnings.push(issue("container", "aseprite-chunk-trailing-bytes", `청크 0x${type.toString(16)} 뒤에 해석하지 않은 ${cursor.remaining}바이트가 남았다`, where));
        }
      } catch (error) {
        if (error instanceof AsepriteChunkReadError) {
          unsupported.push(issue("container", "aseprite-chunk-invalid", `청크 0x${type.toString(16)}를 읽지 못했다: ${error.message}`, where));
          attach = null;
          continue;
        }
        throw error;
      }
    }
    if (chunkPosition < frameEnd) {
      warnings.push(issue("container", "aseprite-frame-trailing-bytes", `프레임 ${frameIndex}에 청크 밖 ${frameEnd - chunkPosition}바이트가 남았다`, `frame[${frameIndex}]@${chunkPosition}`));
    }
    framePosition = frameEnd;
    if (truncated) break frameLoop;
  }

  if (!truncated && framePosition < bytes.byteLength) {
    warnings.push(issue("container", "aseprite-trailing-bytes", `마지막 프레임 뒤에 ${bytes.byteLength - framePosition}바이트가 더 있다`));
  }
  if (frames.length < header.frameCount) {
    warnings.push(issue("container", "aseprite-frame-count-mismatch", `헤더는 프레임 ${header.frameCount}개를 선언하지만 ${frames.length}개만 읽었다`));
    truncated = true;
  }

  buildLayerTree(layers, warnings);
  validateCels(cels, layers, frames.length, warnings, unsupported);

  return {
    format: "aseprite",
    specProfile: "aseprite-file-format-public-spec",
    header,
    truncated,
    frames,
    layers,
    cels,
    tags,
    slices,
    tilesets,
    paletteUpdates,
    colorProfile,
    externalFiles,
    spriteUserData,
    unknownChunks,
    warnings,
    unsupported,
    source: { byteLength: bytes.byteLength, sha256: openRasterSha256Hex(bytes) },
  };
}

const DECODED_CHUNK_TYPES: ReadonlySet<number> = new Set([
  ASEPRITE_CHUNK_TYPE.oldPalette0004,
  ASEPRITE_CHUNK_TYPE.oldPalette0011,
  ASEPRITE_CHUNK_TYPE.layer,
  ASEPRITE_CHUNK_TYPE.cel,
  ASEPRITE_CHUNK_TYPE.celExtra,
  ASEPRITE_CHUNK_TYPE.colorProfile,
  ASEPRITE_CHUNK_TYPE.externalFiles,
  ASEPRITE_CHUNK_TYPE.tags,
  ASEPRITE_CHUNK_TYPE.palette,
  ASEPRITE_CHUNK_TYPE.userData,
  ASEPRITE_CHUNK_TYPE.slice,
  ASEPRITE_CHUNK_TYPE.tileset,
]);

/** 이 코덱이 값을 읽는 청크 타입(폐기된 0x2016·0x2017과 미지 타입은 제외). */
function isDecodedChunkType(type: number): boolean {
  return DECODED_CHUNK_TYPES.has(type);
}

type CelBody = ReturnType<typeof decodeCelChunk>["body"];

function reportPixelFailure(error: unknown, unsupported: FormatIssue[], where: string, what: string): void {
  if (error instanceof DOMException && error.name === "AbortError") {
    throw new AsepriteSpriteError("Aseprite 가져오기가 중단되었다", "aborted", { cause: error });
  }
  if (error instanceof AsepritePixelDecodeError) {
    const code =
      error.code === "budget-exceeded"
        ? "aseprite-decode-budget-exceeded"
        : error.code === "inflate-unavailable"
          ? "aseprite-inflate-unavailable"
          : "aseprite-pixels-decode-failed";
    unsupported.push(issue("resource", code, `${what}의 픽셀을 해제하지 못했다: ${error.message}`, where));
    return;
  }
  throw error;
}

async function decodeCelPixels(
  cel: AsepriteSpriteCel,
  body: CelBody,
  bytesPerPixel: 1 | 2 | 4,
  budget: AsepriteDecodeBudget,
  options: AsepriteSpriteImportOptions,
  unsupported: FormatIssue[],
  where: string,
): Promise<void> {
  try {
    if (body.kind === "raw") {
      budget.reserve(body.data.byteLength, "원시 셀");
      cel.pixels = body.data.slice();
    } else if (body.kind === "compressed-image") {
      const expected = body.width * body.height * bytesPerPixel;
      cel.pixels = await inflateWithinBudget(body.compressed, expected, budget, "압축 셀", options.inflate, options.signal);
    } else if (body.kind === "compressed-tilemap") {
      const step = body.bitsPerTile / 8;
      if (step !== 1 && step !== 2 && step !== 4) {
        throw new AsepritePixelDecodeError(`지원하지 않는 타일당 비트 수 ${body.bitsPerTile}`, "size-invalid");
      }
      const expected = body.widthTiles * body.heightTiles * step;
      const bytes = await inflateWithinBudget(body.compressed, expected, budget, "타일맵 셀", options.inflate, options.signal);
      if (cel.tilemap !== null) cel.tilemap.bytes = bytes;
    }
  } catch (error) {
    reportPixelFailure(error, unsupported, where, "셀");
  }
}

async function decodeTilesetPixels(
  tileset: AsepriteSpriteTileset,
  compressed: Uint8Array,
  bytesPerPixel: 1 | 2 | 4,
  budget: AsepriteDecodeBudget,
  options: AsepriteSpriteImportOptions,
  unsupported: FormatIssue[],
  where: string,
): Promise<void> {
  try {
    const expected = tileset.tileWidth * tileset.tileHeight * tileset.tileCount * bytesPerPixel;
    tileset.tilePixels = await inflateWithinBudget(compressed, expected, budget, `타일셋 ${tileset.id}`, options.inflate, options.signal);
  } catch (error) {
    reportPixelFailure(error, unsupported, where, `타일셋 ${tileset.id}`);
  }
}
