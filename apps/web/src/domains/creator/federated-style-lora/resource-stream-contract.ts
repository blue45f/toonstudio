import { requireFinite, requireId, requireInteger } from "./lora-input-contract";
import type { OpfsLruCacheState, ResourceLodTier, SemanticResourceAsset, SemanticVersion, ViewportScrollState } from "./semantic-resource-streamer";

export const MAX_SYNTHETIC_BYTES = 16 * 1024 * 1024;
const TIERS: readonly string[] = ["thumb", "working", "print-4k"];

export function assertTier(tier: ResourceLodTier): void {
  if (!TIERS.includes(tier)) throw new RangeError("지원하지 않는 LOD 예제입니다.");
}

export function assertVersion(version: SemanticVersion): void {
  for (const value of [version.major, version.minor, version.patch]) requireInteger(value, "버전", 0, Number.MAX_SAFE_INTEGER - 1);
}

export function assertBudget(bytes: number): void { requireInteger(bytes, "메모리 모델 예산", 64 * 1024, MAX_SYNTHETIC_BYTES); }

export function assertAsset(asset: SemanticResourceAsset): void {
  requireId(asset.resourceId); requireId(asset.layerId); assertVersion(asset.version);
  requireInteger(asset.cutIndex, "컷 번호", 1, 1000000);
  requireFinite(asset.yOffsetPx, "컷 위치", 0); requireFinite(asset.heightPx, "컷 높이", Number.MIN_VALUE);
  for (const tier of ["thumb", "working", "print-4k"] as const) {
    requireInteger(asset.lodByteSizes[tier], "합성 바이트 수", 64, MAX_SYNTHETIC_BYTES);
    if (!/^[a-f0-9]{64}$/i.test(asset.lodHashes[tier])) throw new RangeError("청크 체크섬 형식이 올바르지 않습니다.");
  }
}

export function assertCache(cache: OpfsLruCacheState): void {
  assertBudget(cache.budgetBytes);
  requireInteger(cache.usedBytes, "모델 사용량", 0, cache.budgetBytes);
  if (new Set(cache.entries.map((entry) => entry.chunkKey)).size !== cache.entries.length || cache.entries.reduce((sum, entry) => sum + entry.byteSize, 0) !== cache.usedBytes) throw new RangeError("중복 캐시 키 또는 사용량 불일치입니다.");
}

export function assertViewport(viewport: ViewportScrollState): void {
  requireFinite(viewport.scrollY, "스크롤 위치", 0);
  requireFinite(viewport.viewportHeight, "뷰포트 높이", Number.MIN_VALUE);
  requireFinite(viewport.scrollVelocityPxPerSec, "스크롤 속도");
  requireFinite(viewport.zoomLevel, "줌", Number.MIN_VALUE, 64);
  if (viewport.preferredLodOverride !== undefined) assertTier(viewport.preferredLodOverride);
}

export function assertCatalog(assets: readonly SemanticResourceAsset[]): void {
  if (new Set(assets.map((asset) => asset.resourceId)).size !== assets.length) throw new RangeError("리소스 ID가 중복되었습니다.");
  for (const asset of assets) assertAsset(asset);
}
