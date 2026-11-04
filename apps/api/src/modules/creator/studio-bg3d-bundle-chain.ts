import { ConflictException, PayloadTooLargeException } from "@nestjs/common";
import { assertStudioBg3dSixPassBundleTransition, parseStudioBg3dSixPassBundleManifest, parseStudioBg3dSixPassBundleState,
  STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, STUDIO_BG3D_SIX_PASS_STATE_MAX_BYTES,
  type StudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";

export interface StudioBg3dBundleChainKey { readonly workId: string; readonly bundleId: string }
export interface StudioBg3dBundleSealedChain extends StudioBg3dBundleChainKey {
  readonly version: 1;
  readonly sealedTipRevisionId: string | null;
  readonly revisions: readonly StudioBg3dSixPassBundleManifest[];
}
const encoder = new TextEncoder();
export function studioBg3dBundleChainFailure(message: string): never {
  throw new ConflictException({ code: "studio_bg3d_bundle_chain_invalid", message });
}
export function assertStudioBg3dBundleChainByteCount(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > STUDIO_BG3D_SIX_PASS_STATE_MAX_BYTES)
    throw new PayloadTooLargeException({ code: "studio_bg3d_bundle_chain_too_large", message: "6패스 보존 이력 전체가 16MiB 문서 예산을 초과했습니다. 부분 이력으로 저장하거나 읽지 않았습니다." });
}
export function assertStudioBg3dBundleChainBytes(value: unknown): void {
  assertStudioBg3dBundleChainByteCount(encoder.encode(JSON.stringify(value)).byteLength);
}
/** sealed 전체를 한 genesis→tip 순서로 검증한다. fork·분리된 부분 registry를 반환하지 않는다. */
export function buildStudioBg3dBundleSealedChain(key: StudioBg3dBundleChainKey,
  values: readonly unknown[]): StudioBg3dBundleSealedChain {
  const revisions = values.map((value) => parseStudioBg3dSixPassBundleManifest(value));
  const byId = new Map<string, StudioBg3dSixPassBundleManifest>(), child = new Map<string, StudioBg3dSixPassBundleManifest>();
  const roots: StudioBg3dSixPassBundleManifest[] = [];
  for (const manifest of revisions) {
    if (manifest.bundleId !== key.bundleId || byId.has(manifest.renderRevisionId)) studioBg3dBundleChainFailure("6패스 이력이 요청한 bundle과 다르거나 revision이 중복됩니다.");
    byId.set(manifest.renderRevisionId, manifest);
    if (manifest.parentRevisionId === null) roots.push(manifest);
    else {
      if (child.has(manifest.parentRevisionId)) studioBg3dBundleChainFailure("6패스 봉인 이력이 분기되어 마지막 revision을 확정할 수 없습니다.");
      child.set(manifest.parentRevisionId, manifest);
    }
  }
  if (revisions.length && roots.length !== 1) studioBg3dBundleChainFailure("6패스 이력의 시작 revision이 유일하지 않습니다.");
  for (const manifest of revisions) if (manifest.parentRevisionId !== null && !byId.has(manifest.parentRevisionId))
    studioBg3dBundleChainFailure("6패스 이력에 부모 revision이 누락됐습니다.");
  const ordered: StudioBg3dSixPassBundleManifest[] = [], visited = new Set<string>();
  let previous: StudioBg3dSixPassBundleManifest | null = null;
  let current: StudioBg3dSixPassBundleManifest | undefined = roots[0];
  while (current) {
    if (visited.has(current.renderRevisionId)) studioBg3dBundleChainFailure("6패스 봉인 이력이 순환합니다.");
    try { assertStudioBg3dSixPassBundleTransition(previous, current); }
    catch { studioBg3dBundleChainFailure("6패스 이력의 부모·장면·레이어 식별자가 일치하지 않습니다."); }
    visited.add(current.renderRevisionId); ordered.push(current); previous = current; current = child.get(current.renderRevisionId);
  }
  if (ordered.length !== revisions.length) studioBg3dBundleChainFailure("6패스 이력의 전체 revision을 한 경로로 읽지 못했습니다.");
  const tip = ordered.at(-1)?.renderRevisionId ?? null;
  const state = { contract: STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, version: 1,
    minimumReaderCapability: STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, minimumProjectVersion: 5,
    bundles: ordered.length ? [{ bundleId: key.bundleId, activeRevisionId: tip, revisions: ordered }] : [] };
  assertStudioBg3dBundleChainBytes(state); parseStudioBg3dSixPassBundleState(state);
  const result: StudioBg3dBundleSealedChain = { version: 1, workId: key.workId, bundleId: key.bundleId, sealedTipRevisionId: tip, revisions: ordered };
  assertStudioBg3dBundleChainBytes(result); return result;
}
