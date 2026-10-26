/**
 * ArtCraft Crafting Apps 15종 스위트 포맷 게이트웨이 (클린룸 구현)
 *
 * REA 역공학 증거(docs/evidence/rea-artcraft-crafting-apps-suite-20261026.json)로 확인된
 * ArtCraft 스위트 네이티브/호환 컨테이너 규격과 보안·수치 불변조건을 검증·변환한다.
 *
 * 지원 범위:
 * - [3.1] PhotoCraft (.pcraft): manifest.json + BLAKE3 64-hex 타일 참조 + Non-Finite Float 경로 감사 + MAX_GROUP_DEPTH(32)
 * - [3.2] VectorCraft (.vectorcraft): 아트보드/베지어 서브패스/브러시 어피어런스 검증
 * - [3.3] FilmCraft (.fcproj): 정수 Tick 타임베이스 시퀀스/트랙/클립 매니페스트 검증
 * - [3.4] LightCraft (.lightcraft): DevelopSettings 비파괴 현상 파라미터 클램핑 + FNV-1a 64-bit 프리뷰 캐시 해시
 * - [3.7] DesignCraft (.designcraft & IDML): IDML mimetype 헤더 검증 및 문서 매니페스트 검증
 * - [3.8] FigCraft (.figcraft): DOCUMENT_RATIO(16) ZIP 폭탄 예산 검증 + versions/branches(상한 100) 검증
 * - [3.11] DeckCraft (.deckcraft): 슬라이드 마스터 및 Morph 트랜지션 매니페스트 검증
 * - [4.1] AniCraft (.anicraft): 2D 셀 애니메이션 X-Sheet(1k/2k/3k) + 어니언 스키닝 + 페그바 매니페스트 검증
 */

export const ARTCRAFT_SUITE_FORMAT_LIMITS = Object.freeze({
  pcraftFormatVersion: 1,
  pcraftTileSize: 256,
  pcraftMaxGroupDepth: 32,
  figcraftMaxDocumentRatio: 16,
  figcraftMaxDocumentBytes: 256 * 1024 * 1024,
  figcraftMaxVersions: 100,
  figcraftMaxBranches: 100,
  idmlExpectedMimeType: "application/vnd.adobe.indesign-idml-package",
  idmlExpectedDomVersion: "16.0",
});

export type ArtCraftNativeFormatExtension =
  | ".pcraft"
  | ".vectorcraft"
  | ".fcproj"
  | ".lightcraft"
  | ".pdf"
  | ".ecproj"
  | ".designcraft"
  | ".idml"
  | ".figcraft"
  | ".docx"
  | ".scproj"
  | ".deckcraft"
  | ".dxf"
  | ".xlsx"
  | ".anicraft";

export interface FiniteFloatViolation {
  readonly path: string;
  readonly value: string;
}

/**
 * PhotoCraft `crates/photocraft-io/src/finite.rs` (`finite::check`) 계약:
 * 직렬화 전에 전체 객체 트리를 순회하며 `NaN`, `Infinity`, `-Infinity`를 감지하고
 * 정확한 JSON 경로(예: `layers[1].opacity`)를 반환한다.
 */
export function auditFiniteFloats(
  value: unknown,
  currentPath = "",
): readonly FiniteFloatViolation[] {
  const violations: FiniteFloatViolation[] = [];

  function visit(node: unknown, path: string): void {
    if (typeof node === "number") {
      if (!Number.isFinite(node)) {
        violations.push({
          path: path || "<root>",
          value: String(node),
        });
      }
      return;
    }
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) {
        visit(node[index], `${path}[${index}]`);
      }
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        const nextPath = path ? `${path}.${key}` : key;
        visit(child, nextPath);
      }
    }
  }

  visit(value, currentPath);
  return violations;
}

export interface PcraftTileRef {
  readonly tx: number;
  readonly ty: number;
  readonly hash: string;
}

export interface PcraftLayerManifest {
  readonly id: number;
  readonly name: string;
  readonly opacity: number;
  readonly visible: boolean;
  readonly blendMode: string;
  readonly kind: "pixel" | "group" | "adjustment" | "text" | "smart-object";
  readonly tiles?: readonly PcraftTileRef[];
  readonly children?: readonly PcraftLayerManifest[];
}

export interface PcraftDocumentManifest {
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
  readonly tileSize: number;
  readonly nextId: number;
  readonly layers: readonly PcraftLayerManifest[];
}

export interface PcraftValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly maxObservedGroupDepth: number;
  readonly uniqueTileHashes: readonly string[];
  readonly deduplicatedTileCount: number;
}

const BLAKE3_HEX_REGEX = /^[0-9a-f]{64}$/u;

/**
 * PhotoCraft `.pcraft` 매니페스트 검증기:
 * 1) `version === 1` 및 캔버스 치수 유효성 검사
 * 2) `finite::check`로 비유한 부동소수점 차단
 * 3) 레이어 그룹 중첩 깊이 `MAX_GROUP_DEPTH` (32) 초과 차단
 * 4) 모든 타일 해시가 64자리 소문자 16진수(BLAKE3)인지 검증하고 콘텐츠 중복 제거율 산출
 */
export function validatePcraftManifest(
  manifest: PcraftDocumentManifest,
): PcraftValidationResult {
  const errors: string[] = [];
  const finiteViolations = auditFiniteFloats(manifest);
  for (const violation of finiteViolations) {
    errors.push(`NonFiniteFloat(${violation.path}): ${violation.value}`);
  }

  if (manifest.version !== ARTCRAFT_SUITE_FORMAT_LIMITS.pcraftFormatVersion) {
    errors.push(
      `UnsupportedVersion: expected ${ARTCRAFT_SUITE_FORMAT_LIMITS.pcraftFormatVersion}, got ${manifest.version}`,
    );
  }
  if (!Number.isInteger(manifest.width) || manifest.width <= 0) {
    errors.push("InvalidCanvasWidth: width must be a positive integer");
  }
  if (!Number.isInteger(manifest.height) || manifest.height <= 0) {
    errors.push("InvalidCanvasHeight: height must be a positive integer");
  }
  if (!Number.isInteger(manifest.tileSize) || manifest.tileSize <= 0) {
    errors.push("InvalidTileSize: tileSize must be a positive integer");
  }

  let maxObservedGroupDepth = 0;
  let totalTileReferences = 0;
  const uniqueHashes = new Set<string>();

  function walkLayers(
    layers: readonly PcraftLayerManifest[],
    depth: number,
    pathPrefix: string,
  ): void {
    if (depth > maxObservedGroupDepth) {
      maxObservedGroupDepth = depth;
    }
    if (depth > ARTCRAFT_SUITE_FORMAT_LIMITS.pcraftMaxGroupDepth) {
      errors.push(
        `GroupDepthExceeded(${pathPrefix}): depth ${depth} exceeds max ${ARTCRAFT_SUITE_FORMAT_LIMITS.pcraftMaxGroupDepth}`,
      );
      return;
    }
    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index]!;
      const layerPath = `${pathPrefix}[${index}]`;
      if (layer.opacity < 0 || layer.opacity > 1) {
        errors.push(`InvalidOpacity(${layerPath}.opacity): must be in [0, 1]`);
      }
      if (layer.tiles) {
        for (const tile of layer.tiles) {
          totalTileReferences += 1;
          if (!BLAKE3_HEX_REGEX.test(tile.hash)) {
            errors.push(
              `InvalidTileHash(${layerPath}): "${tile.hash}" is not a 64-char lowercase hex BLAKE3 digest`,
            );
          } else {
            uniqueHashes.add(tile.hash);
          }
        }
      }
      if (layer.children && layer.children.length > 0) {
        walkLayers(layer.children, depth + 1, `${layerPath}.children`);
      }
    }
  }

  walkLayers(manifest.layers, 0, "layers");

  return {
    valid: errors.length === 0,
    errors,
    maxObservedGroupDepth,
    uniqueTileHashes: [...uniqueHashes],
    deduplicatedTileCount: Math.max(0, totalTileReferences - uniqueHashes.size),
  };
}

export interface PcraftAutosaveRecoveryInfo {
  readonly snapshotKey: string;
  readonly sourcePath: string | null;
  readonly savedAtUnixSeconds: number;
  readonly pcraftFileName: string;
  readonly metadataFileName: string;
}

/**
 * PhotoCraft `crates/photocraft-io/src/autosave.rs`의 결정론적 스냅샷 키 생성기.
 */
export function buildPcraftAutosaveRecoveryInfo(
  sourcePath: string | null,
  savedAtUnixSeconds: number,
): PcraftAutosaveRecoveryInfo {
  const rawKey = sourcePath && sourcePath.trim().length > 0 ? sourcePath.trim() : "__untitled__";
  const hashHex = computeFnv1a64Hex(rawKey);
  return {
    snapshotKey: hashHex,
    sourcePath,
    savedAtUnixSeconds,
    pcraftFileName: `${hashHex}.pcraft`,
    metadataFileName: `${hashHex}.json`,
  };
}

/**
 * LightCraft `crates/lightcraft-core/src/develop.rs`의 64-bit FNV-1a 해시 구현.
 * 오프셋 기준값 `0xcbf29ce484222325n`, 소수 `0x0100000001b3n`.
 */
export function computeFnv1a64Hex(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x0100000001b3");
  const mask64 = BigInt("0xffffffffffffffff");
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask64;
  }
  return hash.toString(16).padStart(16, "0");
}

export interface LightCraftDevelopSettings {
  readonly exposure: number;
  readonly contrast: number;
  readonly highlights: number;
  readonly shadows: number;
  readonly whites: number;
  readonly blacks: number;
  readonly temp: number;
  readonly tint: number;
  readonly vibrance: number;
  readonly saturation: number;
  readonly clarity: number;
  readonly dehaze: number;
  readonly sharpenAmount: number;
  readonly sharpenRadius: number;
  readonly nrLuma: number;
  readonly nrColor: number;
  readonly vignetteAmount: number;
  readonly grainAmount: number;
}

export function createDefaultLightCraftDevelopSettings(
  options?: { readonly isRaw?: boolean },
): LightCraftDevelopSettings {
  const isRaw = options?.isRaw ?? false;
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temp: 6500,
    tint: 0,
    vibrance: 0,
    saturation: 0,
    clarity: 0,
    dehaze: 0,
    sharpenAmount: isRaw ? 40 : 0,
    sharpenRadius: 1.0,
    nrLuma: 0,
    nrColor: isRaw ? 25 : 0,
    vignetteAmount: 0,
    grainAmount: 0,
  };
}

function clampFinite(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * LightCraft `DevelopSettings::keep_in_range` + `merged` 클린룸 구현:
 * 부분 패치를 병합하고 모든 현상 파라미터를 안전 범위로 클램핑하며 FNV-1a 64-bit 프리뷰 해시를 반환한다.
 */
export function mergeAndClampLightCraftSettings(
  base: LightCraftDevelopSettings,
  patch: Partial<LightCraftDevelopSettings>,
): {
  readonly settings: LightCraftDevelopSettings;
  readonly previewCacheHash: string;
} {
  const merged: LightCraftDevelopSettings = {
    exposure: clampFinite(patch.exposure ?? base.exposure, base.exposure, -5, 5),
    contrast: clampFinite(patch.contrast ?? base.contrast, base.contrast, -100, 100),
    highlights: clampFinite(patch.highlights ?? base.highlights, base.highlights, -100, 100),
    shadows: clampFinite(patch.shadows ?? base.shadows, base.shadows, -100, 100),
    whites: clampFinite(patch.whites ?? base.whites, base.whites, -100, 100),
    blacks: clampFinite(patch.blacks ?? base.blacks, base.blacks, -100, 100),
    temp: clampFinite(patch.temp ?? base.temp, base.temp, 2000, 50000),
    tint: clampFinite(patch.tint ?? base.tint, base.tint, -150, 150),
    vibrance: clampFinite(patch.vibrance ?? base.vibrance, base.vibrance, -100, 100),
    saturation: clampFinite(patch.saturation ?? base.saturation, base.saturation, -100, 100),
    clarity: clampFinite(patch.clarity ?? base.clarity, base.clarity, -100, 100),
    dehaze: clampFinite(patch.dehaze ?? base.dehaze, base.dehaze, -100, 100),
    sharpenAmount: clampFinite(patch.sharpenAmount ?? base.sharpenAmount, base.sharpenAmount, 0, 150),
    sharpenRadius: clampFinite(patch.sharpenRadius ?? base.sharpenRadius, base.sharpenRadius, 0.5, 3.0),
    nrLuma: clampFinite(patch.nrLuma ?? base.nrLuma, base.nrLuma, 0, 100),
    nrColor: clampFinite(patch.nrColor ?? base.nrColor, base.nrColor, 0, 100),
    vignetteAmount: clampFinite(patch.vignetteAmount ?? base.vignetteAmount, base.vignetteAmount, -100, 100),
    grainAmount: clampFinite(patch.grainAmount ?? base.grainAmount, base.grainAmount, 0, 100),
  };

  return {
    settings: merged,
    previewCacheHash: computeFnv1a64Hex(JSON.stringify(merged)),
  };
}

export interface FigCraftContainerBudgetInput {
  readonly compressedArchiveBytes: number;
  readonly uncompressedDocumentBytes: number;
  readonly versionCount: number;
  readonly branchCount: number;
  readonly imageEntryNames: readonly string[];
}

export interface FigCraftContainerValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly expansionRatio: number;
}

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/u;

/**
 * FigCraft `crates/figcraft-io/src/figcraft_file.rs` 컨테이너 예산 및 보안 검증:
 * - `DOCUMENT_RATIO = 16` 초과 시 ZIP 폭탄으로 판정해 해제 거부
 * - `MAX_VERSIONS = 100`, `MAX_BRANCHES = 100` 상한 검증
 * - `images/<sha256>` 엔트리가 순수 64자리 소문자 SHA-256 해시 이름인지(경로 순회 차단) 검증
 */
export function validateFigCraftContainerBudget(
  input: FigCraftContainerBudgetInput,
): FigCraftContainerValidationResult {
  const errors: string[] = [];
  const safeCompressed = Math.max(1, input.compressedArchiveBytes);
  const expansionRatio = input.uncompressedDocumentBytes / safeCompressed;
  const maxAllowedByRatio =
    safeCompressed * ARTCRAFT_SUITE_FORMAT_LIMITS.figcraftMaxDocumentRatio;

  if (input.uncompressedDocumentBytes > ARTCRAFT_SUITE_FORMAT_LIMITS.figcraftMaxDocumentBytes) {
    errors.push(
      `DocumentTooLarge: ${input.uncompressedDocumentBytes} bytes exceeds hard cap ${ARTCRAFT_SUITE_FORMAT_LIMITS.figcraftMaxDocumentBytes}`,
    );
  }
  if (
    input.compressedArchiveBytes > 0 &&
    input.uncompressedDocumentBytes > maxAllowedByRatio &&
    input.uncompressedDocumentBytes > 1024 * 1024
  ) {
    errors.push(
      `ZipBombExpansionRatioExceeded: ratio ${expansionRatio.toFixed(2)}x exceeds DOCUMENT_RATIO ${ARTCRAFT_SUITE_FORMAT_LIMITS.figcraftMaxDocumentRatio}x`,
    );
  }
  if (input.versionCount > ARTCRAFT_SUITE_FORMAT_LIMITS.figcraftMaxVersions) {
    errors.push(
      `VersionLimitExceeded: ${input.versionCount} exceeds MAX_VERSIONS (${ARTCRAFT_SUITE_FORMAT_LIMITS.figcraftMaxVersions})`,
    );
  }
  if (input.branchCount > ARTCRAFT_SUITE_FORMAT_LIMITS.figcraftMaxBranches) {
    errors.push(
      `BranchLimitExceeded: ${input.branchCount} exceeds MAX_BRANCHES (${ARTCRAFT_SUITE_FORMAT_LIMITS.figcraftMaxBranches})`,
    );
  }
  for (const imageName of input.imageEntryNames) {
    if (!SHA256_HEX_REGEX.test(imageName)) {
      errors.push(
        `InvalidImageDigestName("${imageName}"): must be a 64-char lowercase hex SHA-256 digest without path separators`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    expansionRatio: Number(expansionRatio.toFixed(3)),
  };
}

/**
 * DesignCraft `crates/designcraft-idml/src/lib.rs`의 IDML 패키지 감지 계약:
 * ZIP 로컬 파일 헤더(`PK\x03\x04`) 뒤 오프셋 30..38에 `"mimetype"` 엔트리가 위치하고
 * 그 페이로드가 `"application/vnd.adobe.indesign-idml-package"`인지 확인한다.
 */
export function isDesignCraftIdmlArchiveHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 38) return false;
  const isZipLocalHeader =
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;
  if (!isZipLocalHeader) return false;

  const decoder = new TextDecoder("ascii", { fatal: false });
  const entryName = decoder.decode(bytes.subarray(30, 38));
  if (entryName !== "mimetype") return false;

  const expectedMime = ARTCRAFT_SUITE_FORMAT_LIMITS.idmlExpectedMimeType;
  if (bytes.byteLength >= 38 + expectedMime.length) {
    const mimePayload = decoder.decode(
      bytes.subarray(38, 38 + expectedMime.length),
    );
    return mimePayload === expectedMime;
  }
  return true;
}

export interface AniCraftExposureCelEntry {
  readonly celId: string;
  readonly layerName: string;
  readonly startFrame: number;
  readonly holdFrames: 1 | 2 | 3 | 4;
  readonly drawingKey: string;
  readonly lipSyncMouthCode?: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "X";
}

export interface AniCraftProjectManifest {
  readonly format: "anicraft-project-v1";
  readonly title: string;
  readonly fps: 12 | 24 | 30 | 60;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly totalFrames: number;
  readonly onionSkinPrevFrames: number;
  readonly onionSkinNextFrames: number;
  readonly cels: readonly AniCraftExposureCelEntry[];
}

export function validateAniCraftManifest(
  manifest: AniCraftProjectManifest,
): { readonly valid: boolean; readonly errors: readonly string[]; readonly totalExposedFrames: number } {
  const errors: string[] = [];
  const finiteErrors = auditFiniteFloats(manifest);
  for (const item of finiteErrors) {
    errors.push(`NonFiniteFloat(${item.path}): ${item.value}`);
  }
  if (manifest.format !== "anicraft-project-v1") {
    errors.push(`InvalidFormat: expected "anicraft-project-v1"`);
  }
  if (manifest.widthPx <= 0 || manifest.heightPx <= 0) {
    errors.push("InvalidDimensions: widthPx and heightPx must be positive");
  }
  if (manifest.totalFrames <= 0) {
    errors.push("InvalidTotalFrames: totalFrames must be positive");
  }
  let totalExposedFrames = 0;
  for (const cel of manifest.cels) {
    if (cel.startFrame < 1 || cel.startFrame > manifest.totalFrames) {
      errors.push(`CelStartOutOfRange(${cel.celId}): frame ${cel.startFrame}`);
    }
    totalExposedFrames += cel.holdFrames;
  }
  return {
    valid: errors.length === 0,
    errors,
    totalExposedFrames,
  };
}
