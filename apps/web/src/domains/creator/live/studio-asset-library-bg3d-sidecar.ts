import {
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES,
  type StudioBg3dSceneDocument,
} from "../contracts/studio-bg3d-scene-document";
import type { DecodedStudioAssetDataUrl, StudioAsset, StudioAssetSaveInput } from "../studio-asset-library";
import { asRepositoryError, StudioAssetLibraryRepositoryError } from "../studio-asset-library-repository-error";
import type { StudioLocalDatabase } from "../studio-local-database";
import type { StudioAssetManifestEntry } from "./studio-asset-library-manifest-entry";

export const STUDIO_ASSET_LIBRARY_BG3D_SCENE_NAMESPACE = "studio-asset-library-bg3d-scene-v1";
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const SIDECAR_MAX_BYTES = STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES + 128;
const UTF8 = new TextEncoder();

function serializeSidecar(imageHash: string, canonicalScene: string): string {
  return `{"version":1,"imageHash":${JSON.stringify(imageHash)},"scene":${canonicalScene}}`;
}

export function assertStudioAssetBg3dSceneSave(
  input: StudioAssetSaveInput,
  image: DecodedStudioAssetDataUrl,
): string | undefined {
  if (input.bg3dScene === undefined) return undefined;
  if (input.kind !== "bg3d" || image.mimeType !== "image/png" || input.dataUrl.includes("#")
    || !PNG_SIGNATURE.every((byte, index) => image.bytes[index] === byte)) {
    throw new StudioAssetLibraryRepositoryError("invalid", "entryFields");
  }
  const serialized = serializeStudioBg3dSceneDocument(input.bg3dScene);
  if (!serialized) throw new StudioAssetLibraryRepositoryError("invalid", "entryFields");
  return serialized;
}

function readSidecar(database: StudioLocalDatabase, id: string): Promise<string | null> {
  return database.kvGet(STUDIO_ASSET_LIBRARY_BG3D_SCENE_NAMESPACE, id);
}

/** 삭제가 확인된 소재의 부속 기록을 정리한다. 오류가 나도 이미 완료된 삭제는 유지한다. */
export async function removeStudioAssetBg3dSceneSidecar(database: StudioLocalDatabase, id: string): Promise<void> {
  await database.kvDelete(STUDIO_ASSET_LIBRARY_BG3D_SCENE_NAMESPACE, id).catch(() => undefined);
}

/** 기존 Web Lock 안에서 장면 기록을 먼저 검증한다. 원장이 후보를 게시하기 전에는 읽을 수 없다. */
export async function publishStudioAssetBg3dScene<T>({
  database, entry, scene, commit, canDiscard,
}: {
  database: StudioLocalDatabase;
  entry: StudioAssetManifestEntry;
  scene: string;
  commit: () => Promise<T>;
  canDiscard: () => Promise<boolean>;
}): Promise<T> {
  const raw = serializeSidecar(entry.contentHash, scene);
  const read = () => readSidecar(database, entry.id).catch((error) => {
    throw asRepositoryError(error, "manifestRead");
  });
  if (await read() !== null) throw new StudioAssetLibraryRepositoryError("invalid", "generatedIdConflict");
  try {
    let writeError: unknown;
    try {
      await database.kvSet(STUDIO_ASSET_LIBRARY_BG3D_SCENE_NAMESPACE, entry.id, raw);
    } catch (error) {
      writeError = error;
    }
    if (await read() !== raw) {
      throw asRepositoryError(writeError ?? new Error("3D 장면 저장 내용을 확인하지 못했습니다."), "manifestCommit");
    }
    return await commit();
  } catch (error) {
    // 이전 원장을 확인했을 때만 지운다. 게시 결과가 불명확하면 후보 기록을 남긴다.
    if (await canDiscard().catch(() => false) && await read().catch(() => null) === raw) {
      await removeStudioAssetBg3dSceneSidecar(database, entry.id);
    }
    throw error;
  }
}

/** 원장의 같은 ID·PNG 해시에 귀속된 정본만 반환한다. 일반 소재 목록은 이 기록을 읽지 않는다. */
export async function readStudioAssetBg3dSceneSidecar(
  database: StudioLocalDatabase,
  asset: Pick<StudioAsset, "id" | "kind" | "contentHash">,
  readEntries: () => Promise<readonly StudioAssetManifestEntry[]>,
): Promise<StudioBg3dSceneDocument | null> {
  const { contentHash, id } = asset;
  if (!contentHash) return null;
  const matches = (entries: readonly StudioAssetManifestEntry[]) => entries.some((entry) =>
    entry.id === id && entry.kind === "bg3d" && entry.mimeType === "image/png" && entry.contentHash === contentHash,
  );
  if (!matches(await readEntries())) return null;
  const raw = await readSidecar(database, id);
  if (!raw || raw.length > SIDECAR_MAX_BYTES || UTF8.encode(raw).byteLength > SIDECAR_MAX_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || !("version" in parsed) || parsed.version !== 1
    || !("imageHash" in parsed) || parsed.imageHash !== contentHash
    || !("scene" in parsed)) return null;
  const scene = parseStudioBg3dSceneDocument(JSON.stringify(parsed.scene));
  if (!scene || serializeSidecar(contentHash, JSON.stringify(scene)) !== raw) return null;
  // 잠금 없이 읽는 환경에서도 읽기 도중 먼저 삭제된 소재를 반환하지 않는다.
  return matches(await readEntries()) ? scene : null;
}
