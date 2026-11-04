import type { StudioBg3dSixPassBundleManifest, StudioBg3dSixPassBundleState } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import type { PageState } from "../../../studio-page-state";

type Bundle = StudioBg3dSixPassBundleState["bundles"][number];
/** 정본으로 입장한 내부 history만 병합한다. 새 문서/open의 완전 교체에는 이전 원본을 섞지 않는다. */
export function retainStudioBg3dSixPassHistory(previous: PageState[][], next: PageState[][]): PageState[][] {
  const existingSnapshots = new Set(previous);
  if (!next.some((snapshot) => existingSnapshots.has(snapshot))) return next;
  const byPage = new Map<string, Map<string, Map<string, StudioBg3dSixPassBundleManifest>>>();
  for (const snapshot of [...previous, ...next]) for (const page of snapshot) {
    for (const bundle of page.bg3dLtBundles?.bundles ?? []) {
      const pageBundles = byPage.get(page.id) ?? new Map<string, Map<string, StudioBg3dSixPassBundleManifest>>();
      byPage.set(page.id, pageBundles);
      const revisions = pageBundles.get(bundle.bundleId) ?? new Map<string, StudioBg3dSixPassBundleManifest>();
      pageBundles.set(bundle.bundleId, revisions);
      for (const manifest of bundle.revisions) {
        const before = revisions.get(manifest.renderRevisionId);
        if (manifest.pageId !== page.id || manifest.bundleId !== bundle.bundleId
          || (before && before !== manifest && JSON.stringify(before) !== JSON.stringify(manifest))) {
          throw new Error("history에 보존된 6패스 원본의 페이지·묶음·revision이 다릅니다.");
        }
        revisions.set(manifest.renderRevisionId, before ?? manifest);
      }
    }
  }
  if (!byPage.size) return next;
  let changed = false;
  const retained = next.map((snapshot) => {
    let snapshotChanged = false;
    const pages = snapshot.map((page) => {
      const pageBundles = byPage.get(page.id);
      if (!pageBundles) return page;
      const current = page.bg3dLtBundles;
      const bundles: Bundle[] = [...pageBundles].map(([bundleId, revisions]) => {
        const before = current?.bundles.find((bundle) => bundle.bundleId === bundleId);
        if (before && before.revisions.length === revisions.size && before.revisions.every((manifest) => revisions.get(manifest.renderRevisionId) === manifest)) return before;
        return { bundleId, activeRevisionId: before?.activeRevisionId ?? null, revisions: [...revisions.values()] };
      });
      if (current && current.bundles.length === bundles.length && current.bundles.every((bundle, index) => bundle === bundles[index])) return page;
      changed = true; snapshotChanged = true;
      return { ...page, bg3dLtBundles: { contract: "toonstudio.bg3d-sixpass-bundles.v1" as const, version: 1 as const,
        minimumReaderCapability: "bg3d-sixpass-bundle.v1" as const, minimumProjectVersion: 5 as const, bundles } };
    });
    return snapshotChanged ? pages : snapshot;
  });
  return changed ? retained : next;
}
