import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";
import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsNativeFileSystem, type StudioOpfsStorageManagerLike } from "../studio-opfs-filesystem";

const NS = "studio-poser-rig-v1";
export interface StudioRigReceipt {
  readonly hash: string;
  readonly name: string;
  readonly weightUndo?: string;
}
function fileStore(scope: string) {
  if (!navigator.storage?.getDirectory) throw new Error("이 브라우저에서 기기 작업 파일을 열 수 없어요.");
  return createStudioOpfsAssetStore({
    fs: createStudioOpfsNativeFileSystem(
      navigator.storage as unknown as StudioOpfsStorageManagerLike,
      `${NS}-${encodeURIComponent(scope)}`,
    ),
  });
}
function receipt(raw: string | null): StudioRigReceipt | null {
  if (raw === null) return null;
  const value = JSON.parse(raw) as Partial<StudioRigReceipt>;
  if (
    typeof value.name !== "string" ||
    typeof value.hash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(value.hash) ||
    (value.weightUndo !== undefined &&
      (typeof value.weightUndo !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.weightUndo)))
  )
    throw new Error("저장한 리그 작업 파일 정보가 손상됐어요.");
  return { name: value.name, hash: value.hash, ...(value.weightUndo ? { weightUndo: value.weightUndo } : {}) };
}
export async function loadStudioRigWork(scope: string) {
  if (!navigator.locks) throw new Error("이 브라우저에서 작업 파일을 안전하게 열 수 없어요.");
  return navigator.locks.request(`${NS}:${scope}`, { mode: "shared" }, async () => {
    const db = await acquireStudioLocalDatabase(),
      saved = receipt(await db.kvGet(NS, scope));
    if (!saved) return null;
    const bytes = await fileStore(scope).get(saved.hash, { verify: true });
    if (!bytes) throw new Error("저장한 골격의 GLB 파일을 찾지 못했어요.");
    return { saved, bytes };
  });
}
function sameReceipt(current: StudioRigReceipt | null, expected: StudioRigReceipt | null) {
  return (
    current?.hash === expected?.hash &&
    current?.name === expected?.name &&
    current?.weightUndo === expected?.weightUndo
  );
}
export async function loadStudioRigWeightUndo(scope: string, expected: StudioRigReceipt) {
  if (!navigator.locks) throw new Error("이 브라우저에서 작업 파일을 안전하게 열 수 없어요.");
  return navigator.locks.request(`${NS}:${scope}`, { mode: "shared" }, async () => {
    const db = await acquireStudioLocalDatabase();
    const current = receipt(await db.kvGet(NS, scope));
    if (!sameReceipt(current, expected)) throw new Error("다른 창에서 작업 파일이 바뀌었어요. 다시 열어 주세요.");
    if (!current?.weightUndo) throw new Error("되돌릴 웨이트 편집이 없어요.");
    const bytes = await fileStore(scope).get(current.weightUndo, { verify: true });
    if (!bytes) throw new Error("이전 웨이트의 작업 파일을 찾지 못했어요.");
    return bytes;
  });
}
export async function saveStudioRigWork(
  scope: string,
  expected: StudioRigReceipt | null,
  name: string,
  bytes: Uint8Array,
  beforeWeightEdit?: Uint8Array,
) {
  if (!navigator.locks) throw new Error("이 브라우저에서 작업 파일을 안전하게 잠글 수 없어요.");
  return navigator.locks.request(`${NS}:${scope}`, async () => {
    const db = await acquireStudioLocalDatabase(),
      current = receipt(await db.kvGet(NS, scope));
    if (!sameReceipt(current, expected))
      throw new Error("다른 창에서 이 작업 파일을 저장했어요. GLB 사본을 받은 뒤 작업대를 다시 열어 주세요.");
    const store = fileStore(scope);
    const { ref } = await store.put(bytes, { mime: "model/gltf-binary" });
    const undo = beforeWeightEdit ? await store.put(beforeWeightEdit, { mime: "model/gltf-binary" }) : null;
    const next: StudioRigReceipt = { hash: ref.hash, name, ...(undo ? { weightUndo: undo.ref.hash } : {}) };
    const nextRefs = next.weightUndo ? [next.hash, next.weightUndo] : [next.hash];
    // SQLite 커밋이 끝나기 전까지 이전 파일과 새 파일을 모두 보존한다.
    await store.setOwnerRefs("work", [
      ...new Set([
        ...nextRefs,
        ...(current ? [current.hash] : []),
        ...(current?.weightUndo ? [current.weightUndo] : []),
      ]),
    ]);
    await db.kvSet(NS, scope, JSON.stringify(next));
    try {
      await store.setOwnerRefs("work", nextRefs);
      await store.sweep({ graceMs: 0 });
    } catch (error) {
      // 정리만 실패하면 다음 저장에서 회수한다. 이미 커밋한 원고는 다시 쓰지 않는다.
      console.warn("GLB 작업 파일 정리를 다음 저장으로 미룹니다.", error);
    }
    return next;
  });
}
