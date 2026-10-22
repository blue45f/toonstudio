import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStudioBg3dModelAttachment,
  getStoredBg3dModelByHashV12,
  getStoredBg3dModelV12,
  resolveBg3dModelHashV12,
  resolveStudioBg3dModelAttachmentSource,
} from "./bg3d-model-library";
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

function rawThemePacks(sha256: string): Record<string, unknown> {
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
      id: BUNDLE_ID, pack: 0, path: "test-pack/scene.glb", bytes: GLB.byteLength, sha256, tris: 0,
    }],
    presets: [],
    crowdPacks: [],
    pendingPacks: [],
    totals: { packs: 1, placeableAssets: 1, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 },
  };
}

async function stubServing(): Promise<`sha256:${string}`> {
  const hex = await sha256Hex(GLB);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("theme-packs.json")) {
      return { ok: true, status: 200, headers: new Headers(), json: async () => rawThemePacks(hex) };
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

beforeEach(() => {
  resetStudioBg3dBundleThemePacksCache();
});

afterEach(() => {
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
