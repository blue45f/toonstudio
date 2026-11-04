import * as Y from "yjs";
import { hasStudioBg3dSixPassBundleStateEnvelope, isStudioBg3dSixPassContentHash,
  STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import type { StudioBg3dSixPassBundleState } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import type { StudioCrdtDocumentHost } from "./studio-crdt-document-host";
import { changedPageIdsFor } from "./studio-crdt-document-tracking";
import { studioBg3dSixPassManifestHash as studioCrdtBg3dManifestHash } from "../studio-cuttoon-editor/runtime/bg3d-six-pass/studio-bg3d-six-pass-manifest-hash";

export { studioCrdtBg3dManifestHash };

export const STUDIO_BG3D_BUNDLE_REVISIONS_ROOT = "studio-bg3d-bundle-revisions-v1";
export const STUDIO_BG3D_BUNDLE_ACTIVE_ROOT = "studio-bg3d-bundle-active-v1";
export interface StudioCrdtBg3dBundleRevisionReference {
  readonly version: 1; readonly pageId: string; readonly bundleId: string; readonly renderRevisionId: string;
  readonly parentRevisionId: string | null; readonly manifestHash: `sha256:${string}`;
}
export interface StudioCrdtBg3dBundlePageReferences {
  readonly version: 1; readonly minimumProjectVersion: 5;
  readonly minimumReaderCapability: typeof STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY;
  readonly revisions: readonly StudioCrdtBg3dBundleRevisionReference[];
  readonly active: Readonly<Record<string, string | null>>;
}
const ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const encoder = new TextEncoder();
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function parseStudioCrdtBg3dBundleRevisionReference(value: unknown): StudioCrdtBg3dBundleRevisionReference {
  if (!record(value) || Object.keys(value).sort().join(",") !== "bundleId,manifestHash,pageId,parentRevisionId,renderRevisionId,version"
    || value.version !== 1 || !isStudioBg3dSixPassContentHash(value.manifestHash)
    || ![value.pageId, value.bundleId, value.renderRevisionId].every((id) => typeof id === "string" && ID.test(id))
    || (value.parentRevisionId !== null && (typeof value.parentRevisionId !== "string" || !ID.test(value.parentRevisionId)))) {
    throw new Error("6패스 CRDT revision 참조가 올바르지 않습니다.");
  }
  return value as unknown as StudioCrdtBg3dBundleRevisionReference;
}
function key(...ids: string[]): string { return JSON.stringify(ids); }
function readReference(raw: unknown): StudioCrdtBg3dBundleRevisionReference {
  if (typeof raw !== "string" || encoder.encode(raw).byteLength > 1024) throw new Error("6패스 CRDT 참조 예산을 초과했습니다.");
  return parseStudioCrdtBg3dBundleRevisionReference(JSON.parse(raw));
}
export function readStudioCrdtBg3dBundleReferences(doc: Y.Doc, pageId: string): StudioCrdtBg3dBundlePageReferences | undefined {
  const registry = doc.getMap<string>(STUDIO_BG3D_BUNDLE_REVISIONS_ROOT);
  const revisions = [...registry.entries()].flatMap(([entryKey, raw]) => {
    const ref = readReference(raw);
    if (entryKey !== key(ref.pageId, ref.bundleId, ref.renderRevisionId)) throw new Error("6패스 CRDT 색인이 참조와 다릅니다.");
    return ref.pageId === pageId ? [ref] : [];
  });
  if (!revisions.length) return undefined;
  const active: Record<string, string | null> = {};
  const heads = doc.getMap<string>(STUDIO_BG3D_BUNDLE_ACTIVE_ROOT);
  for (const bundleId of new Set(revisions.map((ref) => ref.bundleId))) {
    const revision = heads.get(key(pageId, bundleId)) ?? "";
    if (revision && !revisions.some((ref) => ref.bundleId === bundleId && ref.renderRevisionId === revision))
      throw new Error("6패스 활성 revision의 봉인 참조가 없습니다.");
    active[bundleId] = revision || null;
  }
  return { version: 1, minimumProjectVersion: 5, minimumReaderCapability: STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY,
    revisions, active };
}
export function planStudioCrdtBg3dBundleDiff(doc: Y.Doc, pages: readonly { readonly id: string;
  readonly bg3dLtBundles?: StudioBg3dSixPassBundleState }[]): () => void {
  const additions = new Map<string, string>(), heads = new Map<string, string>();
  const registry = doc.getMap<string>(STUDIO_BG3D_BUNDLE_REVISIONS_ROOT);
  const active = doc.getMap<string>(STUDIO_BG3D_BUNDLE_ACTIVE_ROOT);
  for (const page of pages) {
    if (!page.bg3dLtBundles) continue;
    if (!hasStudioBg3dSixPassBundleStateEnvelope(page.bg3dLtBundles)) throw new Error("6패스 보존 상태가 올바르지 않습니다.");
    for (const bundle of page.bg3dLtBundles.bundles) {
      for (const manifest of bundle.revisions) {
        if (manifest.pageId !== page.id) throw new Error("6패스 원본 페이지가 다릅니다.");
        const ref: StudioCrdtBg3dBundleRevisionReference = { version: 1, pageId: page.id, bundleId: bundle.bundleId,
          renderRevisionId: manifest.renderRevisionId, parentRevisionId: manifest.parentRevisionId,
          manifestHash: studioCrdtBg3dManifestHash(manifest) };
        const entryKey = key(page.id, bundle.bundleId, manifest.renderRevisionId), value = JSON.stringify(ref);
        const previous = registry.get(entryKey);
        if (previous !== undefined && previous !== value) throw new Error("봉인된 6패스 revision 본문을 교체할 수 없습니다.");
        if (!previous) additions.set(entryKey, value);
      }
      const entryKey = key(page.id, bundle.bundleId), value = bundle.activeRevisionId ?? "";
      if (active.get(entryKey) !== value) heads.set(entryKey, value);
    }
  }
  const pageIds = new Set(pages.map(({ id }) => id));
  const explicitHeads = new Set(heads.keys());
  for (const page of pages) for (const bundle of page.bg3dLtBundles?.bundles ?? []) explicitHeads.add(key(page.id, bundle.bundleId));
  for (const entryKey of active.keys()) {
    const parsed: unknown = JSON.parse(entryKey);
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== "string") throw new Error("6패스 활성 색인이 손상되었습니다.");
    if ((!pageIds.has(parsed[0]) || !explicitHeads.has(entryKey)) && active.get(entryKey) !== "") heads.set(entryKey, "");
  }
  const shadow = new Y.Doc();
  try {
    Y.applyUpdate(shadow, Y.encodeStateAsUpdate(doc));
    const vector = Y.encodeStateVector(shadow);
    shadow.transact(() => {
      for (const [entryKey, value] of additions) shadow.getMap<string>(STUDIO_BG3D_BUNDLE_REVISIONS_ROOT).set(entryKey, value);
      for (const [entryKey, value] of heads) shadow.getMap<string>(STUDIO_BG3D_BUNDLE_ACTIVE_ROOT).set(entryKey, value);
    });
    if (Y.encodeStateAsUpdate(shadow, vector).byteLength > 48 * 1024 - 1024) throw new Error("6패스 revision 전이가 CRDT 메시지 예산을 초과했습니다.");
  } finally { shadow.destroy(); }
  return () => {
    for (const [entryKey, value] of additions) registry.set(entryKey, value);
    for (const [entryKey, value] of heads) active.set(entryKey, value);
  };
}
export function bindStudioCrdtBg3dBundleObservers(host: StudioCrdtDocumentHost): void {
  for (const rootName of [STUDIO_BG3D_BUNDLE_REVISIONS_ROOT, STUDIO_BG3D_BUNDLE_ACTIVE_ROOT]) {
    const root = host.doc.getMap<string>(rootName);
    const observe: Parameters<typeof root.observe>[0] = (event, transaction) => {
      for (const entryKey of event.keysChanged) {
        let parts: unknown;
        try { parts = JSON.parse(entryKey); } catch { continue; }
        if (!Array.isArray(parts) || typeof parts[0] !== "string" || !ID.test(parts[0])) continue;
        host.dirtyPageIds.add(parts[0]); changedPageIdsFor(host, transaction).add(parts[0]);
      }
    };
    root.observe(observe); host.cleanup.add(() => root.unobserve(observe));
  }
}
