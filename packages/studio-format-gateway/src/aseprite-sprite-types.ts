/**
 * @file aseprite-sprite-types.ts
 * @description Aseprite 스프라이트 가져오기 결과와 옵션의 공개 타입.
 *
 * 출처와 이용 조건은 `aseprite-sprite-cursor.ts` 머리말과 같다(필드 크기·상수만 자체 표현으로 옮겼다).
 */

import type {
  AsepriteColorProfileChunk,
  AsepriteExternalFileEntry,
  AsepriteLayerKind,
  AsepritePaletteChunk,
  AsepriteSliceChunk,
  AsepriteTagEntry,
  AsepriteTilesetChunk,
  AsepriteUserDataChunk,
} from "./aseprite-sprite-chunks";
import type { AsepriteSpriteLimits } from "./aseprite-sprite-cursor";
import type { AsepriteInflateAdapter } from "./aseprite-sprite-pixels";
import type { FormatIssue } from "./format-common";

export interface AsepriteSpriteImportOptions {
  /** 호출자는 한도를 낮추기만 할 수 있다. */
  readonly limits?: Partial<AsepriteSpriteLimits>;
  readonly signal?: AbortSignal;
  /** false면 구조만 읽고 셀·타일셋 픽셀은 해제하지 않는다. 기본은 true. */
  readonly decodePixels?: boolean;
  /** zlib 해제기. 없으면 `DecompressionStream("deflate")`를 쓴다. */
  readonly inflate?: AsepriteInflateAdapter;
}

export interface AsepriteSpriteHeader {
  /** 헤더에 적힌 파일 크기. 실제 길이와 다르면 경고한다. */
  readonly declaredFileSize: number;
  readonly frameCount: number;
  readonly width: number;
  readonly height: number;
  readonly colorDepth: 8 | 16 | 32;
  readonly flags: number;
  /** 플래그 1: 레이어 불투명도 값이 유효하다. */
  readonly layerOpacityValid: boolean;
  /** 플래그 2: 그룹 레이어의 불투명도·블렌드 모드가 유효하다. */
  readonly groupBlendOpacityValid: boolean;
  /** 플래그 4: 레이어 청크에 UUID가 있다. */
  readonly layerUuidPresent: boolean;
  /** 폐기된 헤더 프레임 속도(ms). 프레임 지속시간이 0이면 이 값을 쓴다. */
  readonly deprecatedFrameDurationMs: number;
  readonly transparentIndex: number;
  /** 0이면 구형 스프라이트의 256색이다. */
  readonly colorCount: number;
  /** 0이 하나라도 있으면 1:1이다. */
  readonly pixelRatio: { readonly width: number; readonly height: number };
  readonly grid: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface AsepriteSpriteFrame {
  readonly index: number;
  readonly durationMs: number;
  /** 프레임 헤더에 적힌 지속시간. 0이면 헤더 속도로 대체했다. */
  readonly declaredDurationMs: number;
  readonly chunkCount: number;
  readonly byteOffset: number;
  readonly byteLength: number;
}

export interface AsepriteSpriteLayerFlags {
  readonly visible: boolean;
  readonly editable: boolean;
  readonly lockMovement: boolean;
  readonly background: boolean;
  readonly preferLinkedCels: boolean;
  readonly collapsed: boolean;
  readonly reference: boolean;
}

export interface AsepriteSpriteLayer {
  /** 첫 프레임의 레이어 청크 순서(0부터). 셀이 이 번호로 레이어를 가리킨다. */
  readonly index: number;
  readonly name: string;
  readonly kind: AsepriteLayerKind;
  readonly typeValue: number;
  readonly childLevel: number;
  readonly parentIndex: number | null;
  readonly depth: number;
  readonly flags: AsepriteSpriteLayerFlags;
  /** 자신과 모든 조상이 보이는가. */
  readonly effectiveVisible: boolean;
  readonly blendMode: number;
  /** 0~18이 아니면 null. */
  readonly blendModeName: string | null;
  readonly opacity: number;
  /** 헤더 플래그에 비춰 `opacity`가 유효한가. 합성에 쓰기 전에 확인한다. */
  readonly opacityValid: boolean;
  /** 그룹 레이어의 블렌드 모드는 헤더 플래그 2일 때만 유효하다. 이미지·타일맵은 항상 유효하다. */
  readonly blendModeValid: boolean;
  readonly tilesetIndex: number | null;
  readonly uuid: string | null;
  readonly firstSeenFrame: number;
  userData: AsepriteUserDataChunk | null;
}

export type AsepriteSpriteCelKind = "image" | "linked" | "tilemap" | "unknown";

export interface AsepriteSpriteCel {
  readonly frameIndex: number;
  readonly layerIndex: number;
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly zIndex: number;
  readonly kind: AsepriteSpriteCelKind;
  /** 이미지는 픽셀, 타일맵은 타일 수. 링크·미지는 null. */
  readonly width: number | null;
  readonly height: number | null;
  /** 연결한 프레임(0 기준). 같은 레이어의 그 프레임 셀을 가리킨다. */
  readonly linkedFrame: number | null;
  /** 원본 색 형식의 픽셀(폭×높이×바이트/픽셀). 해제하지 않았거나 실패했거나 링크·타일맵이면 null. */
  pixels: Uint8Array | null;
  readonly tilemap: {
    readonly bitsPerTile: number;
    readonly tileIdMask: number;
    readonly xFlipMask: number;
    readonly yFlipMask: number;
    readonly diagonalFlipMask: number;
    /** 해제한 타일 값(리틀 엔디언). 해제하지 않았거나 실패했으면 null. */
    bytes: Uint8Array | null;
  } | null;
  /** 정밀 경계(셀 엑스트라 청크, 고정소수점). */
  preciseBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  userData: AsepriteUserDataChunk | null;
}

export interface AsepriteSpriteTag extends AsepriteTagEntry {
  userData: AsepriteUserDataChunk | null;
}

export interface AsepriteSpriteSlice extends AsepriteSliceChunk {
  readonly frameIndex: number;
  userData: AsepriteUserDataChunk | null;
}

export interface AsepriteSpriteTileset extends Omit<AsepriteTilesetChunk, "compressedTiles"> {
  readonly frameIndex: number;
  /** 원본 색 형식의 타일 이미지(타일 폭 × 타일 높이×타일 수 × 바이트/픽셀). 파일 안에 없거나 해제하지 않았으면 null. */
  tilePixels: Uint8Array | null;
  userData: AsepriteUserDataChunk | null;
  /** 타일셋 사용자 데이터 뒤에 이어지는 타일별 사용자 데이터(타일 번호 순). */
  tileUserData: AsepriteUserDataChunk[];
}

export interface AsepritePaletteUpdate {
  readonly frameIndex: number;
  readonly source: AsepritePaletteChunk["source"];
  readonly declaredSize: number | null;
  readonly entries: AsepritePaletteChunk["entries"];
}

export interface AsepriteUnknownChunk {
  readonly frameIndex: number;
  readonly typeValue: number;
  readonly offset: number;
  readonly length: number;
}

export interface AsepriteSpriteImportResult {
  readonly format: "aseprite";
  readonly specProfile: "aseprite-file-format-public-spec";
  readonly header: AsepriteSpriteHeader;
  /** 파일 끝이 잘렸거나 프레임 구조가 깨져 일부 프레임을 읽지 못했다. */
  readonly truncated: boolean;
  readonly frames: readonly AsepriteSpriteFrame[];
  readonly layers: readonly AsepriteSpriteLayer[];
  readonly cels: readonly AsepriteSpriteCel[];
  readonly tags: readonly AsepriteSpriteTag[];
  readonly slices: readonly AsepriteSpriteSlice[];
  readonly tilesets: readonly AsepriteSpriteTileset[];
  /** 프레임 순서대로의 팔레트 청크. 어느 시점의 팔레트는 `asepritePaletteAtFrame`로 얻는다. */
  readonly paletteUpdates: readonly AsepritePaletteUpdate[];
  readonly colorProfile: AsepriteColorProfileChunk | null;
  readonly externalFiles: readonly AsepriteExternalFileEntry[];
  readonly spriteUserData: AsepriteUserDataChunk | null;
  readonly unknownChunks: readonly AsepriteUnknownChunk[];
  /** 복구 가능한 문제와 메타데이터 차이. */
  readonly warnings: readonly FormatIssue[];
  /** 해석하지 못했지만 버리지 않고 표시한 것. */
  readonly unsupported: readonly FormatIssue[];
  readonly source: { readonly byteLength: number; readonly sha256: string };
}
