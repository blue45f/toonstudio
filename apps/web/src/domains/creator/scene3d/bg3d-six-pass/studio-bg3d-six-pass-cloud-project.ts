import { getStudioBg3dSixPassBundleArtifacts, hashStudioBg3dSixPassBundleManifest,
  type StudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { collectStudioBg3dSixPassProjectBundles } from "./studio-bg3d-six-pass-project-contract";
import { verifyStudioBg3dSixPassProjectNativeBodies } from "./studio-bg3d-six-pass-project-archive";
import { acquireStudioBg3dSixPassBundleProductAuthority, runStudioBg3dSixPassBundleMutationExclusive } from "./studio-bg3d-six-pass-bundle-product-authority";
import { hydrateStudioBg3dSixPassRemoteBundle, sealStudioBg3dSixPassRemoteBundle } from "./studio-bg3d-six-pass-bundle-api";
import { studioBg3dSixPassBundleOwner } from "./studio-bg3d-six-pass-bundle-transaction";
import { acquireStudioLinked3dPassProductAuthority } from "../../studio-linked-3d-pass-product-authority";
import { collectStudioLinked3dPassProjectArchiveReferences } from "../../studio-linked-3d-pass-project-archive";
import { sequenceStudioLinked3dPassOwnerMutation, type StudioLinked3dPassCasAuthority } from "../../studio-linked-3d-pass-transaction";
import { sha256HexPortable } from "../../studio-sha256";
import { studioBg3dSixPassWorkReceiptsCover } from "../../studio-cuttoon-editor/runtime/bg3d-six-pass/studio-bg3d-six-pass-work-receipts";
import type { StudioOpfsAssetStore } from "../../studio-opfs-asset-store";
import type { StudioProjectFile } from "../../studio-project-file";

interface CloudInput { readonly workId: string; readonly project: StudioProjectFile; readonly signal?: AbortSignal }
interface OwnerPlan { readonly authority: StudioLinked3dPassCasAuthority; readonly owner: string; readonly hashes: readonly string[]; readonly native: boolean }

async function orderedManifests(project: StudioProjectFile): Promise<readonly StudioBg3dSixPassBundleManifest[]> {
  const result: StudioBg3dSixPassBundleManifest[] = [];
  for (const { state } of await collectStudioBg3dSixPassProjectBundles(project)) for (const bundle of state.bundles) {
    const pending = new Map(bundle.revisions.map((manifest) => [manifest.renderRevisionId, manifest]));
    let parent: string | null = null;
    while (pending.size) {
      const children = [...pending.values()].filter((manifest) => manifest.parentRevisionId === parent);
      if (children.length !== 1) throw new Error("6패스 작품 저장의 보존 revision 순서가 단일 부모 이력과 다릅니다.");
      const manifest = children[0]; result.push(manifest); pending.delete(manifest.renderRevisionId); parent = manifest.renderRevisionId;
    }
  }
  return result;
}

/** 모든 로컬 본문을 먼저 검증한다. 중간에 봉인한 원격 원본은 불변 이력으로 보존하며 보상 삭제하지 않는다. */
export async function ensureStudioBg3dSixPassCloudProject(input: CloudInput): Promise<void> {
  input.signal?.throwIfAborted();
  const manifests = await orderedManifests(input.project);
  if (!manifests.length) return;
  const authority = await acquireStudioBg3dSixPassBundleProductAuthority();
  await verifyStudioBg3dSixPassProjectNativeBodies(input.project, authority);
  for (const manifest of manifests) {
    input.signal?.throwIfAborted();
    if (studioBg3dSixPassWorkReceiptsCover(input.workId, [hashStudioBg3dSixPassBundleManifest(manifest)])) continue;
    await sealStudioBg3dSixPassRemoteBundle({ workId: input.workId, prepared: { manifest }, authority });
    input.signal?.throwIfAborted();
  }
}

async function copyNativeLines(manifests: readonly StudioBg3dSixPassBundleManifest[], authority: StudioOpfsAssetStore,
  lineAuthority: StudioLinked3dPassCasAuthority, signal?: AbortSignal): Promise<void> {
  for (const manifest of manifests) {
    signal?.throwIfAborted();
    const artifact = manifest.layers.find((layer) => layer.role === "main-line")?.artifact;
    if (!artifact) throw new Error("6패스 주선화의 원본 영수증이 없습니다.");
    const bytes = await authority.get(artifact.contentHash, { verify: true });
    if (!bytes) throw new Error("복원할 6패스 주선화 본문이 없습니다.");
    const stored = await lineAuthority.put(bytes, { mime: "image/png" });
    const restored = await lineAuthority.get(artifact.contentHash, { verify: true });
    if (stored.ref.hash !== artifact.contentHash || stored.ref.bytes !== artifact.byteSize || stored.ref.mime !== "image/png"
      || !restored || restored.byteLength !== artifact.byteSize || `sha256:${sha256HexPortable(restored)}` !== artifact.contentHash) {
      throw new Error("6패스 주선화의 기존 CAS 복원 영수증이 다릅니다.");
    }
  }
}

async function applyWithOwners<T>(plans: readonly OwnerPlan[], apply: () => T | false | Promise<T | false>, signal?: AbortSignal): Promise<T> {
  const lock = async (index: number): Promise<T> => {
    const plan = plans[index];
    if (plan) return plan.native
      ? await runStudioBg3dSixPassBundleMutationExclusive(plan.owner, () => lock(index + 1))
      : await sequenceStudioLinked3dPassOwnerMutation(plan.authority, plan.owner, () => lock(index + 1));
    const previous = new Map<OwnerPlan, readonly string[]>(), attempted: OwnerPlan[] = [];
    try {
      for (const owner of plans) {
        signal?.throwIfAborted();
        const refs = await owner.authority.ownerRefs(owner.owner); previous.set(owner, refs); attempted.push(owner);
        await owner.authority.setOwnerRefs(owner.owner, [...new Set([...refs, ...owner.hashes])].sort());
      }
      signal?.throwIfAborted();
      const result = await apply();
      if (result === false) throw new Error("Studio가 복원된 6패스 작품 원고 적용을 거절했습니다.");
      return result;
    } catch (cause) {
      const failures: unknown[] = [];
      for (const owner of attempted.toReversed()) {
        try { await owner.authority.setOwnerRefs(owner.owner, previous.get(owner) ?? []); } catch (failure) { failures.push(failure); }
      }
      if (failures.length) throw new AggregateError([cause, ...failures], "6패스 작품 복원 후 owner 참조 보상에 실패했습니다.", { cause });
      throw cause;
    }
  };
  return await lock(0);
}

/** 서버 봉인·전체 본문·두 CAS·owner를 확인한 뒤에만 같은 프로젝트를 한 번 적용한다. */
export async function hydrateStudioBg3dSixPassCloudProject<T>(input: CloudInput & {
  readonly apply: (project: StudioProjectFile) => T | false | Promise<T | false>;
}): Promise<T> {
  input.signal?.throwIfAborted();
  const manifests = await orderedManifests(input.project);
  const authority = await acquireStudioBg3dSixPassBundleProductAuthority();
  for (const manifest of manifests) {
    input.signal?.throwIfAborted();
    await hydrateStudioBg3dSixPassRemoteBundle({ workId: input.workId, authority, reference: { version: 1,
      pageId: manifest.pageId, bundleId: manifest.bundleId, renderRevisionId: manifest.renderRevisionId,
      parentRevisionId: manifest.parentRevisionId, manifestHash: hashStudioBg3dSixPassBundleManifest(manifest) } });
  }
  await verifyStudioBg3dSixPassProjectNativeBodies(input.project, authority);
  const lineAuthority = await acquireStudioLinked3dPassProductAuthority();
  if (lineAuthority.kind !== "opfs") throw new Error("6패스 작품 복원에는 기존 주선화의 durable OPFS 권위가 필요합니다.");
  await copyNativeLines(manifests, authority, lineAuthority, input.signal);
  const plans: OwnerPlan[] = manifests.map((manifest) => ({ authority, native: true,
    owner: studioBg3dSixPassBundleOwner(manifest.pageId, manifest.bundleId, manifest.renderRevisionId),
    hashes: [hashStudioBg3dSixPassBundleManifest(manifest), ...getStudioBg3dSixPassBundleArtifacts(manifest).map(({ artifact }) => artifact.contentHash)] }));
  const nativeBundles = new Set(manifests.map((manifest) => JSON.stringify([manifest.pageId, manifest.bundleId])));
  const lines = new Map<string, Set<string>>();
  for (const ref of collectStudioLinked3dPassProjectArchiveReferences(input.project)) {
    if (!nativeBundles.has(JSON.stringify([ref.pageId, ref.bundleId]))) continue;
    const hashes = lines.get(ref.ownerId) ?? new Set<string>(); hashes.add(ref.contentHash); lines.set(ref.ownerId, hashes);
  }
  plans.sort((left, right) => left.owner.localeCompare(right.owner));
  for (const [owner, hashes] of [...lines].sort(([left], [right]) => left.localeCompare(right))) plans.push({ authority: lineAuthority, owner, hashes: [...hashes], native: false });
  return await applyWithOwners(plans, () => input.apply(input.project), input.signal);
}
