import { getCharacterDocumentV3Repository } from "../character-platform/document/character-document-v3-repository";

import type { CharacterDocumentV3 } from "../character-platform/document/character-document-v3";
import type { StudioAsyncKeyValueStore } from "../studio-local-database";
import type { StudioVrmSceneModel } from "../vrm/studio-vrm-scene-document";
import type { VrmLibraryEntry } from "../vrm/vrm-library";

export interface StudioCharacterAsset {
  readonly documentId: string;
  readonly modelId: string;
  readonly name: string;
}

const NAMESPACE = "studio-character-asset-list-v1";
const INDEX = "characters";

async function storage(): Promise<StudioAsyncKeyValueStore> {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  return (await acquireStudioLocalDatabase()).asAsyncKeyValueStore(NAMESPACE);
}

function isEntry(value: unknown): value is StudioCharacterAsset {
  if (!value || typeof value !== "object") return false;
  return "documentId" in value && typeof value.documentId === "string" && /^character:[0-9a-f-]{36}$/u.test(value.documentId)
    && "modelId" in value && typeof value.modelId === "string" && value.modelId.length > 0
    && "name" in value && typeof value.name === "string" && value.name.trim().length > 0;
}

export async function readStudioCharacterAssets(store?: StudioAsyncKeyValueStore): Promise<StudioCharacterAsset[]> {
  const raw = await (store ?? await storage()).get(INDEX);
  if (raw === null) return [];
  const entries: unknown = JSON.parse(raw);
  if (!Array.isArray(entries) || !entries.every(isEntry)) throw new Error("캐릭터 목록을 읽지 못했습니다.");
  return entries;
}

export function sceneUsesCharacterModel(model: StudioVrmSceneModel, entry?: VrmLibraryEntry): boolean {
  return model.source === "bundled"
    ? entry?.source === "sample" && entry.id === model.id
    : entry?.contentHash === model.hash;
}

export function forkStudioCharacterDocument(source: CharacterDocumentV3, documentId: string, now: string): CharacterDocumentV3 {
  return { ...source, documentId, revision: 0, linkedLayers: [], createdAt: now, updatedAt: now };
}

interface AssetOperations {
  readonly store: StudioAsyncKeyValueStore;
  readonly save: (document: CharacterDocumentV3) => Promise<unknown>;
  readonly remove: (id: string) => Promise<void>;
}

let pending: Promise<unknown> = Promise.resolve();

export async function createStudioCharacterAsset(source: CharacterDocumentV3, name: string, ops?: AssetOperations): Promise<{
  readonly asset: StudioCharacterAsset;
  readonly entries: readonly StudioCharacterAsset[];
}> {
  const baseName = Array.from(name.trim()).slice(0, 80).join("");
  if (!baseName) throw new Error("캐릭터 이름을 입력하세요.");
  const write = async () => {
    const repository = getCharacterDocumentV3Repository();
    const store = ops?.store ?? await storage();
    const entries = await readStudioCharacterAssets(store);
    const names = new Set(entries.map((asset) => asset.name));
    let displayName = baseName;
    for (let i = 2; names.has(displayName); i++) displayName = `${baseName} (${i})`;
    const documentId = `character:${crypto.randomUUID()}`;
    const asset = { documentId, modelId: source.model.assetId, name: displayName };
    const document = forkStudioCharacterDocument(source, documentId, new Date().toISOString());
    await (ops ? ops.save(document) : repository.save(document));
    const next = [...entries, asset];
    try {
      await store.set(INDEX, JSON.stringify(next));
    } catch (error) {
      await (ops ? ops.remove(documentId) : repository.remove(documentId));
      throw error;
    }
    return { asset, entries: next };
  };
  // SQLite에 목록을 쓰기 전에 다른 탭이 같은 이름/목록으로 저장하는 경우도 직렬화한다.
  const lockedWrite = () => globalThis.navigator?.locks
    ? globalThis.navigator.locks.request(NAMESPACE, write)
    : write();
  const result = pending.then(lockedWrite, lockedWrite);
  pending = result.catch(() => undefined);
  return result;
}

const thumbnails = new EventTarget();

export function subscribeStudioCharacterPreview(id: string, notify: () => void): () => void {
  thumbnails.addEventListener(id, notify);
  return () => thumbnails.removeEventListener(id, notify);
}

export async function readStudioCharacterPreview(id: string): Promise<string | null> {
  const value = await (await storage()).get(`preview/${id}`);
  return value?.startsWith("data:image/png;base64,") ? value : null;
}

export async function saveStudioCharacterPreview(id: string, blob: Blob, current: () => boolean): Promise<void> {
  if (blob.type !== "image/png" || blob.size > 512 * 1024) return;
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("PNG 읽기 실패"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const store = await storage();
  if (!current()) return;
  await store.set(`preview/${id}`, url);
  thumbnails.dispatchEvent(new Event(id));
}
