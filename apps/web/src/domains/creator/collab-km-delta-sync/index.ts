/**
 * Wave 31 Track C + Wave 32 — Yjs·WebRTC 16파장 Kubelka-Munk 타일 델타 압축 동기화 및
 * 오프라인 세이프존 로컬 싱크 허브 진입점.
 */

export {
  COLLAB_KM_DELTA_FRAME_MAGIC,
  COLLAB_KM_DELTA_PROTOCOL_VERSION,
  DEFAULT_KM_TILE_SIZE,
  EIGHT_ARTIST_PROFILES,
  KM16_BAND_COUNT,
  KM16_BASIS_B,
  KM16_BASIS_G,
  KM16_BASIS_R,
  KM16_WAVELENGTHS_NM,
  LocalPeerMeshBus,
  MIN_REQUIRED_COMPRESSION_RATIO,
  OfflineSafeZoneMeshHub,
  applyXorTileDelta,
  canonicalizeKmStrokeInput,
  compareDeterministicOpId,
  compressXorTileDeltaRleLeb128,
  computeFnv1a32,
  createBlankTileRgba,
  createSafeZoneInteractiveController,
  decodeKmDeltaBinaryFrame,
  decodeSleb128,
  decodeUleb128,
  decompressXorTileDeltaRleLeb128,
  dequantizeKm16Spectrum,
  encodeKmDeltaBinaryFrame,
  encodeSleb128,
  encodeUleb128,
  formatDigestHex,
  formatOpIdKey,
  km16SpectrumToSrgb8,
  mixKm16OpticalRgba,
  quantizeKm16Spectrum,
  rasterizeKm16StrokeOnTile,
  runEightArtistConcurrentBenchmark,
  srgb8ToKm16Spectrum,
} from "./collab-km-delta-codec";

export type {
  ArtistProfile,
  BroadcastChannelLike,
  BroadcastChannelMessageEventLike,
  DecodedKmDeltaFrame,
  DeterministicOpId,
  EightArtistBenchmarkResult,
  EncodedKmDeltaFrame,
  Km16Spectrum,
  KmStrokeCommand,
  KmStrokeInput,
  KmStrokePoint,
  SafeZoneFrameApplyResult,
  SafeZoneHubMetrics,
  SafeZoneHubOptions,
  SafeZoneInteractiveController,
  SafeZoneReconnectReport,
  SafeZoneStateVectorDiffPacket,
  SafeZoneStateVectorPacket,
  SafeZoneUiSnapshot,
} from "./collab-km-delta-codec";

export { StudioCollabKmSafeZonePanel } from "./StudioCollabKmSafeZonePanel";
export type { StudioCollabKmSafeZonePanelProps } from "./StudioCollabKmSafeZonePanel";
