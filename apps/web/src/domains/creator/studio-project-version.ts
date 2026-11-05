// 작은 버전 청크의 런타임 의존성을 만들지 않는다. 정본 필드와의 일치는 동작 회귀로 검사한다.
const PRESERVED_DRAW_METADATA_KEYS = ["psdGroupId", "psdRasterSourceId", "psdSource", "psdFolderPath", "colorizeMask", "colorizeMaskEnabled", "linked3dCorrection"] as const;
/** 저장된 편집 기능에 필요한 최소 reader. 렌더러를 로드하지 않는다. */
export type StudioProjectFileVersion = 2 | 3 | 4 | 5 | 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiresTaperSpacingReader(element: unknown): boolean {
  return isRecord(element) && element.type === "draw"
    && isRecord(element.brushDynamics)
    && element.brushDynamics.depositPipeline === "causal-deposit-v4-taper-spacing";
}

/** 장면·고정 컷·공유 Stage에 들어 있는 새 설정도 구버전 reader에서 보호한다. */
function requiresSixPassReader(value: unknown): boolean {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (typeof candidate !== "object" || candidate === null || seen.has(candidate)) continue;
    seen.add(candidate);
    if (isRecord(candidate) && (candidate.bg3dLtRole === "shadow" || candidate.bg3dLtRole === "depth"
      || (candidate.kind === "toonstudio.bg3d-scene" && candidate.version === 4))) return true;
    for (const entry of Object.values(candidate)) pending.push(entry);
  }
  return false;
}

/** 삭제된 묶음도 undo가 참조하는 revision이 남아 있으면 새 reader를 요구한다. */
function requiresSixPassBundleReader(value: unknown): boolean {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (typeof candidate !== "object" || candidate === null || seen.has(candidate)) continue;
    seen.add(candidate);
    if (isRecord(candidate) && candidate.contract === "toonstudio.bg3d-sixpass-bundles.v1"
      && Array.isArray(candidate.bundles) && candidate.bundles.some((bundle) =>
        isRecord(bundle) && Array.isArray(bundle.revisions) && bundle.revisions.length > 0)) return true;
    for (const entry of Object.values(candidate)) pending.push(entry);
  }
  return false;
}

export function hasStudioSixPassBundleProjectContent(pages: readonly unknown[], master: unknown): boolean {
  return requiresSixPassBundleReader(pages) || requiresSixPassBundleReader(master);
}

function requiresPreservedDrawMetadataReader(elements: unknown): boolean {
  return Array.isArray(elements) && elements.some((element) => isRecord(element) && (Object.hasOwn(element, "legacyPigmentArchive")
    || (element.type === "draw" && PRESERVED_DRAW_METADATA_KEYS.some((key) => Object.hasOwn(element, key)))));
}

export function minimumStudioProjectFileVersion(
  pages: readonly unknown[],
  master: unknown,
): StudioProjectFileVersion {
  if (pages.some((page) => isRecord(page) && requiresPreservedDrawMetadataReader(page.elements))
    || (isRecord(master) && requiresPreservedDrawMetadataReader(master.elements))) return 6;
  if (hasStudioSixPassBundleProjectContent(pages, master)) return 5;
  if (requiresSixPassReader(pages) || requiresSixPassReader(master)) return 4;
  return pages.some((page) => isRecord(page) && Array.isArray(page.elements)
      && page.elements.some(requiresTaperSpacingReader))
    || (isRecord(master) && Array.isArray(master.elements)
      && master.elements.some(requiresTaperSpacingReader))
    ? 3 : 2;
}

/** 높은 reader 버전을 가진 기존 문서는 설정 제거만으로 조용히 낮추지 않는다. */
export function resolveStudioProjectFileVersion(
  pages: readonly unknown[], master: unknown, storedVersion?: unknown,
): StudioProjectFileVersion {
  const minimum = minimumStudioProjectFileVersion(pages, master);
  if (storedVersion === 6 || minimum === 6) return 6;
  if (storedVersion === 5 || minimum === 5) return 5;
  if (storedVersion === 4 || minimum === 4) return 4;
  return storedVersion === 3 ? 3 : minimum;
}
