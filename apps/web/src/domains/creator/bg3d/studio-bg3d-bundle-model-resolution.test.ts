import { bindConsumerReleaseFixture, consumerReleaseFixture, isConsumerCatalogUrl } from "./studio-bg3d-bundle-release-consumer.test-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStudioBg3dModelAttachment,
  deleteStoredBg3dModelV12,
  importVerifiedBg3dModelsAtomicallyV12,
  getStoredBg3dModelByHashV12,
  getStoredBg3dModelV12,
  resolveBg3dModelHashV12,
  resolveStudioBg3dModelAttachmentSource,
} from "./bg3d-model-library";
import { openStudioLocalDatabase, type StudioLocalDatabase } from "../studio-local-database";
import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import { createStudioBg3dLibrariesAuthority, STUDIO_BG3D_LIBRARIES_SQLITE_NAMESPACE, STUDIO_BG3D_LIBRARY_MANIFEST_KEYS } from "./studio-bg3d-libraries-sqlite-opfs-authority";
import type { StudioBg3dLibrariesAuthority } from "./studio-bg3d-libraries-sqlite-opfs-authority";
import { resetStudioBg3dBundleThemePacksCache } from "./studio-bg3d-bundle-theme-packs";

/**
 * Creator Bundle 테마 팩 에셋이 모델 라이브러리 해석 경로(id·해시·첨부 출처)를 타고
 * 실제 GLB 검증까지 통과하는지 확인한다. 배포 서빙은 URL 라우터 스텁으로 재현한다.
 */

const JSON_CHUNK = 0x4e4f534a;
const BUNDLE_ID = "cbv1-ingest-test-001";
/** 팩별 권리(권리 원장이 allow한 팩에만 생성기가 싣는 값)를 흉내 낸 픽스처 라이선스 이름. */
const TEST_PACK_LICENSE_NAME = "Creator Bundle: Volume 1 — Test Pack License";

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function validGlb(): Uint8Array {
  const encodedJson = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" },
    scenes: [{}],
  }));
  const json = new Uint8Array(Math.ceil(encodedJson.byteLength / 4) * 4);
  json.fill(0x20);
  json.set(encodedJson);
  const bytes = new Uint8Array(12 + 8 + json.byteLength);
  writeUint32(bytes, 0, 0x46546c67);
  writeUint32(bytes, 4, 2);
  writeUint32(bytes, 8, bytes.byteLength);
  writeUint32(bytes, 12, json.byteLength);
  writeUint32(bytes, 16, JSON_CHUNK);
  bytes.set(json, 20);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const GLB = validGlb();

function rawThemePacks(sha256: string, assetId = BUNDLE_ID): Record<string, unknown> {
  return {
    schema: "toonstudio.bg3d-bundle-theme-packs.v1",
    version: 1,
    inServiceOnly: true,
    downloadable: false,
    rights: { holder: "Test Holder", inServiceOnly: true, downloadable: false },
    assetRoot: "/assets/studio/bundle-v2/",
    themes: [{ id: "city", label: "도시" }],
    packs: [{
      catalogIds: ["cbv1-001-test"],
      title: "Test Pack",
      creator: "Tester",
      theme: "city",
      category: "environment",
      ingestPackIds: ["test-pack"],
      placeable: 1,
      twinCovered: 0,
      deferred: { fbx: 0, gltf: 0, blend: 0, overBudget: {} },
      rights: {
        serve: "allow",
        status: "licensed",
        licenseName: TEST_PACK_LICENSE_NAME,
        commercialUse: true,
        attributionRequired: false,
      },
      note: null,
    }],
    assets: [{
      id: assetId, pack: 0, path: "test-pack/scene.glb", bytes: GLB.byteLength, sha256, tris: 0,
    }],
    presets: [],
    crowdPacks: [],
    pendingPacks: [],
    totals: { packs: 1, placeableAssets: 1, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 },
  };
}

async function stubServing(assetId = BUNDLE_ID): Promise<`sha256:${string}`> {
  const hex = await sha256Hex(GLB);
  bindConsumerReleaseFixture(() => rawThemePacks(hex, assetId));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (isConsumerCatalogUrl(String(input))) {
      return consumerReleaseFixture(rawThemePacks(hex, assetId)).catalogResponse();
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": String(GLB.byteLength) }),
      arrayBuffer: async () => Uint8Array.from(GLB).buffer as ArrayBuffer,
    };
  }));
  return `sha256:${hex}`;
}

const localDatabases: StudioLocalDatabase[] = [];
async function localLibrary(includeRecord = true) {
  const database = await openStudioLocalDatabase({ vfs: "memory", memoryFilename: `local-resolution-${crypto.randomUUID()}.sqlite3` });
  localDatabases.push(database);
  const fileSystem = createStudioOpfsMemoryFileSystem();
  const assets = createStudioOpfsAssetStore({ fs: fileSystem, now: () => 1_000 });
  let tail: Promise<unknown> = Promise.resolve();
  const authority = createStudioBg3dLibrariesAuthority({ acquireDatabase: async () => database,
    acquireAssetStore: async () => assets, allowNonDurableAssetStoreForTests: true, now: () => 1_000,
    runExclusive: <T>(task: () => Promise<T>) => { const result = tail.then(task, task); tail = result.catch(() => undefined); return result; } });
  const records = includeRecord ? await importVerifiedBg3dModelsAtomicallyV12([{ file: new File([Uint8Array.from(GLB)], "local.glb", { type: "model/gltf-binary" }),
    rights: { status: "unknown", commercialUse: false, attributionRequired: false },
    ingress: { kind: "user-file", modelFileExport: "allowed" } }], { authority, executionBackend: "direct", now: 1_000 }) : [];
  return { database, authority, fileSystem, record: records[0], options: { authority, executionBackend: "direct" as const, source: "local-library" as const } };
}
async function unavailableBundle() {
  const assetId = `cbv1-ingest-local-${crypto.randomUUID()}`;
  const hash = await stubServing(assetId);
  const fetcher = vi.fn<typeof fetch>(async (input) => isConsumerCatalogUrl(String(input))
    ? consumerReleaseFixture(rawThemePacks(hash.slice(7), assetId)).catalogResponse()
    : new Response("", { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  return { hash, fetcher };
}

beforeEach(() => {
  resetStudioBg3dBundleThemePacksCache();
});

afterEach(async () => {
  await Promise.all(localDatabases.splice(0).map((database) => database.close()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Creator Bundle records through the model library", () => {
  it("resolves a bundle asset id to a verified record with bundle rights", async () => {
    const sha = await stubServing();
    const record = await getStoredBg3dModelV12(BUNDLE_ID, { executionBackend: "direct" });
    expect(record).not.toBeNull();
    if (!record) return;
    expect(record.id).toBe(BUNDLE_ID);
    expect(record.contentHash).toBe(sha);
    expect(record.byteSize).toBe(GLB.byteLength);
    expect(record.validatorProfile).toBe("mobile");
    expect(record.rights).toMatchObject({
      status: "licensed",
      commercialUse: true,
      attributionRequired: false,
      licenseName: TEST_PACK_LICENSE_NAME,
    });
  });

  it("resolves the same record by content hash", async () => {
    const sha = await stubServing();
    const byHash = await getStoredBg3dModelByHashV12(sha, { executionBackend: "direct" });
    expect(byHash?.id).toBe(BUNDLE_ID);
    const resolution = await resolveBg3dModelHashV12(sha, { executionBackend: "direct" });
    expect(resolution.record?.id).toBe(BUNDLE_ID);
    expect(resolution.deletionReceipt).toBeNull();
  });

  it("classifies bundle records as bundled attachments, never local uploads", async () => {
    const sha = await stubServing();
    expect(resolveStudioBg3dModelAttachmentSource(BUNDLE_ID)).toBe("bundled");
    expect(resolveStudioBg3dModelAttachmentSource("my-uploaded-model")).toBe("local-library");
    const record = await getStoredBg3dModelV12(BUNDLE_ID, { executionBackend: "direct" });
    if (!record) throw new Error("bundle record missing");
    const attachment = createStudioBg3dModelAttachment(record);
    expect(attachment.source).toBe("bundled");
    expect(attachment.hash).toBe(sha);
    expect(attachment.rights.licenseName).toBe(TEST_PACK_LICENSE_NAME);
  });
});


describe("로컬 출처를 명시한 V12 해시 복원", () => {
  it("같은 해시의 번들 바이트가 실패해도 실제 SQLite/OPFS 원본의 ID·바이트·권리를 보존한다", async () => {
    const local = await localLibrary(), { hash, fetcher } = await unavailableBundle();
    if (!local.record) throw Error("실제 저장 모델이 필요합니다.");
    await expect(resolveBg3dModelHashV12(hash, { executionBackend: "direct" })).rejects.toThrow();
    const requests = fetcher.mock.calls.length;
    const result = await resolveBg3dModelHashV12(hash, local.options);
    expect(result.record).toMatchObject({ id: local.record.id, contentHash: hash, byteSize: GLB.byteLength,
      mime: local.record.mime, rights: local.record.rights });
    expect(result.deletionReceipt).toBeNull();
    if (!result.record) throw Error("복원 모델이 필요합니다.");
    expect(new Uint8Array(await result.record.blob.arrayBuffer())).toEqual(GLB);
    expect(fetcher).toHaveBeenCalledTimes(requests);
  });

  it("로컬 원본이 없으면 번들의 같은 해시로 대체하지 않는다", async () => {
    const local = await localLibrary(false), { hash, fetcher } = await unavailableBundle();
    await expect(resolveBg3dModelHashV12(hash, local.options)).resolves.toEqual({ record: null, deletionReceipt: null });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("유효한 로컬 삭제 영수증을 그대로 돌려주고 번들로 부활시키지 않는다", async () => {
    const local = await localLibrary(); if (!local.record) throw Error("실제 저장 모델이 필요합니다.");
    await deleteStoredBg3dModelV12(local.record.id, { authority: local.authority, now: 2_000 });
    const { hash, fetcher } = await unavailableBundle();
    const result = await resolveBg3dModelHashV12(hash, local.options);
    expect(result.record).toBeNull();
    expect(result.deletionReceipt).toMatchObject({ contentHash: hash, storageModelId: local.record.id, deletedAt: 2_000 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("손상된 로컬 manifest와 취소 요청은 계속 실패로 반환한다", async () => {
    const local = await localLibrary(), { hash, fetcher } = await unavailableBundle();
    await local.database.kvSet(STUDIO_BG3D_LIBRARIES_SQLITE_NAMESPACE, STUDIO_BG3D_LIBRARY_MANIFEST_KEYS.models, "{broken");
    await expect(resolveBg3dModelHashV12(hash, local.options)).rejects.toMatchObject({ code: "stored-metadata-mismatch" });
    const controller = new AbortController(); controller.abort();
    await expect(resolveBg3dModelHashV12(hash, { ...local.options, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("같은 길이로 변조된 로컬 CAS도 해시 검증에서 차단한다", async () => {
    const local = await localLibrary(), { hash, fetcher } = await unavailableBundle();
    const path = [...local.fileSystem.snapshot().keys()].find((value) => value.includes(hash.slice(7)));
    if (!path) throw Error("실제 CAS 파일 경로가 필요합니다.");
    const bytes = local.fileSystem.snapshot().get(path);
    if (!bytes) throw Error("실제 CAS 바이트가 필요합니다.");
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
    await local.fileSystem.write(path, bytes);
    await expect(resolveBg3dModelHashV12(hash, local.options)).rejects.toMatchObject({ code: "corrupt" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("기본 번들 복원은 로컬 DB를 열지 않고 기존 번들 권리를 유지한다", async () => {
    const local = await localLibrary(false), hash = await stubServing();
    const readManifest = vi.fn<StudioBg3dLibrariesAuthority["readManifest"]>(async () => { throw Error("기본 번들은 로컬 DB에 의존하지 않아야 합니다."); });
    const authority: StudioBg3dLibrariesAuthority = { ...local.authority, readManifest };
    const result = await resolveBg3dModelHashV12(hash, { authority, executionBackend: "direct" });
    expect(result.record).toMatchObject({ id: BUNDLE_ID, contentHash: hash, rights: { licenseName: TEST_PACK_LICENSE_NAME } });
    expect(readManifest).not.toHaveBeenCalled();
  });
});
