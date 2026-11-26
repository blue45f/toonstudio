/**
 * WASM64 제로-카피 IPC · 64바이트 정렬 아레나 · SoA 공유 렌더 상태 트리 · 무손실 타일 Undo 압축기 공개 진입점.
 *
 * 주의: 이 모듈은 Studio 초기 진입 그래프(`main.tsx`, `studio-legacy-editor-adapter.tsx`)에서
 * 정적으로 import하지 않고, 워커·WASM64 런타임 초기화 시점에 지연 로드한다.
 */

export {
  alignUp,
  isPowerOfTwo,
  isSharedArrayBufferSupported,
  isSharedBufferInstance,
  WASM64_CACHE_LINE_BYTES,
  Wasm64ArenaOverflowError,
  Wasm64SharedArena,
  type Wasm64ArenaBackingMode,
  type Wasm64ArenaSlice,
  type Wasm64ArenaStats,
  type Wasm64SharedArenaOptions,
  type Wasm64SlabHandle,
} from "./wasm64-shared-arena";

export {
  computeIpcRingByteLength,
  createIpcScratchCommand,
  WASM64_IPC_DATA_BYTE_OFFSET,
  WASM64_IPC_HEAD_BYTE_OFFSET,
  WASM64_IPC_MAGIC,
  WASM64_IPC_SLOT_STRIDE_BYTES,
  WASM64_IPC_SLOT_WORDS,
  WASM64_IPC_TAIL_BYTE_OFFSET,
  WASM64_IPC_VERSION,
  Wasm64IpcOpcode,
  Wasm64ZeroCopyIpcRing,
  type CameraTransformUpdateCommand,
  type FrameTelemetrySampleCommand,
  type PointerStrokeBatchCommand,
  type TileDirtyCommitCommand,
  type Wasm64IpcCommand,
  type Wasm64IpcOpcodeValue,
  type Wasm64IpcRingStats,
  type Wasm64IpcScratchCommand,
  type Wasm64ZeroCopyIpcRingOptions,
} from "./wasm64-zero-copy-ipc-ring";

export {
  createSoaNodeStateScratch,
  WASM64_SOA_HEADER_INT32_COUNT,
  WASM64_SOA_MAGIC,
  WASM64_SOA_NO_PARENT,
  WASM64_SOA_NO_TILE_OFFSET,
  WASM64_SOA_SEQLOCK_BYTE_OFFSET,
  WASM64_SOA_VERSION,
  Wasm64BlendMode,
  Wasm64NodeFlag,
  Wasm64SoaRenderStateTree,
  type Wasm64SeqlockReadResult,
  type Wasm64SoaColumnOffsets,
  type Wasm64SoaCommitSnapshot,
  type Wasm64SoaNodeInput,
  type Wasm64SoaNodeState,
} from "./wasm64-soa-render-state-tree";

export {
  applyTileXorDeltaInPlace,
  compressTileXorDelta,
  decompressTileXorDelta,
  WASM64_TILE_BYTE_LENGTH,
  WASM64_TILE_CHANNELS,
  WASM64_TILE_DIM,
  WASM64_UNDO_HEADER_BYTES,
  WASM64_UNDO_MAGIC,
  Wasm64TileUndoHistory,
  type Wasm64CompressedTileDelta,
  type Wasm64TileBufferResolver,
  type Wasm64TileUndoEntry,
  type Wasm64TileUndoHistoryOptions,
  type Wasm64TileUndoStats,
} from "./wasm64-tile-undo-compressor";
