import type {
  Bg3dModelHashResolution,
  Bg3dVerifiedStoredRecord,
  parseV12ModelManifest,
} from "./bg3d-model-library";
import type { StudioBg3dLibrariesAuthority } from "./studio-bg3d-libraries-sqlite-opfs-authority";

type ModelManifest = ReturnType<typeof parseV12ModelManifest>;
type StoredModel = ModelManifest["records"][number];

/** 로컬 출처는 같은 해시의 번들 대신 저장된 record·삭제 영수증·검증된 CAS로 해석한다. */
export async function resolveStudioBg3dLocalModelHash(
  hash: `sha256:${string}`,
  authority: StudioBg3dLibrariesAuthority,
  parseManifest: typeof parseV12ModelManifest,
  hydrateRecord: (record: StoredModel, authority: StudioBg3dLibrariesAuthority) => Promise<Bg3dVerifiedStoredRecord>,
): Promise<Bg3dModelHashResolution> {
  const manifest = parseManifest(await authority.readManifest("models"));
  const stored = manifest.records.find(({ contentHash }) => contentHash === hash);
  const deletionReceipt = manifest.deletions.find(
    ({ contentHash }) => contentHash === hash,
  ) ?? null;
  return {
    record: stored ? await hydrateRecord(stored, authority) : null,
    deletionReceipt,
  };
}
