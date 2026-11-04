import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStudioBg3dSixPassBundleReceipt, hashStudioBg3dSixPassBundleManifest, hashStudioBg3dSixPassCanonicalJson,
  parseStudioBg3dSixPassBundleManifest, STUDIO_BG3D_SIX_PASS_ROLES,
  type StudioBg3dSixPassContentHash } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { sha256HexPortable } from "@toonstudio/contracts/sha256-portable";
import { hydrateStudioBg3dSixPassRemoteBundle, recoverStudioBg3dSixPassRemoteBundleState, sealStudioBg3dSixPassRemoteBundle } from "./studio-bg3d-six-pass-bundle-api";
import { createBg3dBundleProjectFixture, createBg3dBundleTestAuthority } from "../../bg3d/studio-bg3d-bundle-project.test-fixture";
import type { StudioOpfsAssetStore } from "../../studio-opfs-asset-store";

const { get, put, fetchBody } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), fetchBody: vi.fn() }));
vi.mock("@/platform/api", () => ({ api: { raw: { get, put } }, apiPath: (value: string) => `/api${value}` }));
const digest = (bytes: Uint8Array): StudioBg3dSixPassContentHash => `sha256:${sha256HexPortable(bytes)}`;
function fixture() {
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAYAAAD5PA/NAAAAFElEQVR42mNggIKeBVsOnLjz4T8AGVwGNJa9xxsAAAAASUVORK5CYII="), (value) => value.charCodeAt(0));
  const camera = { position: [0, 1, 5], target: [0, 1, 0], fovDegrees: 50 };
  const output = { sixPassLt: { version: 1, shadowOpacity: 0.68, depthFogOpacity: 0.32, fogNearMeters: 4, fogFarMeters: 25, fogTintHex: "#fed7aa" } };
  const scene = new TextEncoder().encode(JSON.stringify({ kind: "toonstudio.bg3d-scene", version: 4, camera, output, nodes: [], attachments: [], shots: [], activeShotId: null }));
  const manifest = parseStudioBg3dSixPassBundleManifest({ contract: "toonstudio.bg3d-sixpass-bundle.v1", version: 1,
    minimumReaderCapability: "bg3d-sixpass-bundle.v1", minimumProjectVersion: 5, bundleId: "bundle-one", renderRevisionId: "revision-one", parentRevisionId: null,
    pageId: "page-one", groupId: "group-one", anchorElementId: "element-main-line", width: 4, height: 1,
    cameraHash: hashStudioBg3dSixPassCanonicalJson(camera), outputSettingsHash: hashStudioBg3dSixPassCanonicalJson(output),
    scene: { documentVersion: 4, contentHash: digest(scene), byteSize: scene.byteLength, mimeType: "application/json", activeShotId: null },
    layers: STUDIO_BG3D_SIX_PASS_ROLES.map((role) => ({ role, elementId: `element-${role}`, artifact: { contentHash: digest(png), byteSize: png.byteLength, mimeType: "image/png", width: 4, height: 1 }, blendMode: "normal", opacity: 1, visible: true })) });
  const bodies = new Map<StudioBg3dSixPassContentHash, Uint8Array>([[digest(png), png], [digest(scene), scene]]);
  const authority = { get: vi.fn(async (key: StudioBg3dSixPassContentHash) => bodies.get(key) ?? null),
    put: vi.fn(async (bytes: Uint8Array) => { const key = digest(bytes); bodies.set(key, bytes); return { ref: { hash: key } }; }) } as unknown as StudioOpfsAssetStore;
  const prepared = { manifest };
  const record = (state: "prepared" | "sealed", uploadedRoles: readonly string[]) => ({ version: 1, workId: "work-one", state, manifest,
    manifestHash: hashStudioBg3dSixPassBundleManifest(manifest), sealedAt: state === "sealed" ? "2026-11-05T00:00:00Z" : null,
    receipt: state === "sealed" ? createStudioBg3dSixPassBundleReceipt(manifest, "work-one") : null, uploadedRoles });
  const reference = { version: 1 as const, pageId: manifest.pageId, bundleId: manifest.bundleId, renderRevisionId: manifest.renderRevisionId,
    parentRevisionId: null, manifestHash: hashStudioBg3dSixPassBundleManifest(manifest) };
  return { manifest, png, scene, bodies, authority, prepared, record, reference };
}
const json = (value: unknown) => ({ json: async () => value });
beforeEach(() => { get.mockReset(); put.mockReset(); fetchBody.mockReset(); vi.stubGlobal("fetch", fetchBody); });
afterEach(() => vi.unstubAllGlobals());
it("실제 7본문을 한 역할씩 업로드한 뒤 작품 봉인 영수증만 반환한다", async () => {
  const input = fixture(), uploaded: string[] = [];
  put.mockImplementation(async (url: string) => {
    if (url.endsWith("/seal")) return json(input.record("sealed", uploaded));
    const role = url.split("/artifacts/")[1]; if (role) uploaded.push(role);
    return json(input.record("prepared", uploaded));
  });
  const receipt = await sealStudioBg3dSixPassRemoteBundle({ workId: "work-one", ...input });
  expect(receipt.scope).toBe("work"); expect(receipt.workId).toBe("work-one");
  expect(uploaded).toEqual([...STUDIO_BG3D_SIX_PASS_ROLES, "scene"]); expect(put).toHaveBeenCalledTimes(9);
  expect(put.mock.calls.every((call) => call[1].retry === 0)).toBe(true);
});
it("업로드 응답 유실은 자동 재전송하지 않고 caller의 명시적 재개 때 확인된 역할을 건너뛴다", async () => {
  const input = fixture(); put.mockResolvedValueOnce(json(input.record("prepared", []))).mockRejectedValueOnce(new Error("response lost"));
  await expect(sealStudioBg3dSixPassRemoteBundle({ workId: "work-one", ...input })).rejects.toThrow("response lost");
  expect(put).toHaveBeenCalledTimes(2);
  put.mockReset(); const roles = ["scene", ...STUDIO_BG3D_SIX_PASS_ROLES];
  put.mockResolvedValueOnce(json(input.record("prepared", roles))).mockResolvedValueOnce(json(input.record("sealed", roles)));
  await sealStudioBg3dSixPassRemoteBundle({ workId: "work-one", ...input }); expect(put).toHaveBeenCalledTimes(2);
});
it("다른 작품 또는 origin 영수증을 원격 저장 완료로 수용하지 않는다", async () => {
  const input = fixture(), response = input.record("sealed", ["scene", ...STUDIO_BG3D_SIX_PASS_ROLES]);
  put.mockResolvedValue(json({ ...response, receipt: createStudioBg3dSixPassBundleReceipt(input.manifest) }));
  await expect(sealStudioBg3dSixPassRemoteBundle({ workId: "work-one", ...input })).rejects.toThrow("작품 범위");
});
it("봉인 manifest와 7본문을 검증한 뒤 manifest를 마지막에 CAS에 기록한다", async () => {
  const input = fixture(); input.bodies.clear();
  get.mockImplementation(async (url: string) => {
    const role = url.split("/artifacts/")[1];
    if (!role) return json(input.record("sealed", ["scene", ...STUDIO_BG3D_SIX_PASS_ROLES]));
    const bytes = role === "scene" ? input.scene : input.png;
    return json({ manifestHash: input.reference.manifestHash, role, contentHash: digest(bytes), signedRead: { url: `https://storage.example/${role}`, expiresAtEpochMs: Date.now() + 60_000 } });
  });
  fetchBody.mockImplementation(async (url: URL) => { const scene = url.pathname.endsWith("scene"); return new Response(scene ? input.scene : input.png,
    { headers: { "content-type": scene ? "application/json" : "image/png" } }); });
  await hydrateStudioBg3dSixPassRemoteBundle({ workId: "work-one", ...input });
  expect(fetchBody).toHaveBeenCalledTimes(2); // 동일 PNG digest는 CAS에서 검증 후 재사용한다.
  expect(input.bodies.has(input.reference.manifestHash)).toBe(true);
  expect(fetchBody.mock.calls.every((call) => call[1].credentials === "omit" && call[1].redirect === "error")).toBe(true);
});
it("잘못된 hash의 원격 본문을 받으면 완성 manifest를 공개하지 않는다", async () => {
  const input = fixture(); input.bodies.clear();
  get.mockResolvedValueOnce(json(input.record("sealed", ["scene", ...STUDIO_BG3D_SIX_PASS_ROLES]))).mockResolvedValueOnce(json({ manifestHash: input.reference.manifestHash,
    role: "color", contentHash: input.manifest.layers[0].artifact.contentHash, signedRead: { url: "https://storage.example/color", expiresAtEpochMs: Date.now() + 60_000 } }));
  fetchBody.mockResolvedValue(new Response(new Uint8Array(input.png.byteLength), { headers: { "content-type": "image/png" } }));
  await expect(hydrateStudioBg3dSixPassRemoteBundle({ workId: "work-one", ...input })).rejects.toThrow();
  expect(input.bodies.has(input.reference.manifestHash)).toBe(false);
});

async function recoveryFixture() {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() })));
  const source = await createBg3dBundleProjectFixture(true), authority = createBg3dBundleTestAuthority(), lineAuthority = createBg3dBundleTestAuthority();
  const bundle = source.state.bundles[0], first = bundle.revisions[0];
  const previousState = { ...source.state, bundles: [{ ...bundle, activeRevisionId: first.renderRevisionId, revisions: [first] }] };
  const elements = source.project.pagesList[0].elements.map((element) => {
    const layer = first.layers.find(({ elementId }) => elementId === element.id);
    if (!layer || !element.bg3dLtBundleReference) throw new Error("첫 리비전의 역할이 없습니다.");
    return { ...element, src: layer.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}` : `bg3d-lt-artifact://${layer.artifact.contentHash}`,
      bg3dLtBundleReference: { ...element.bg3dLtBundleReference, renderRevisionId: first.renderRevisionId, manifestHash: hashStudioBg3dSixPassBundleManifest(first) } };
  });
  const chain = { version: 1, workId: "work-one", bundleId: bundle.bundleId, sealedTipRevisionId: source.manifest.renderRevisionId, revisions: bundle.revisions };
  get.mockImplementation(async (url: string) => {
    if (url.endsWith("/sealed-chain")) return json(chain);
    const manifest = bundle.revisions.find(({ renderRevisionId }) => url.includes(`/revisions/${renderRevisionId}`));
    if (!manifest) throw new Error("알 수 없는 복구 원본입니다.");
    const role = url.split("/artifacts/")[1];
    if (!role) return json({ version: 1, workId: chain.workId, state: "sealed", manifest, manifestHash: hashStudioBg3dSixPassBundleManifest(manifest),
      sealedAt: "2026-11-05T00:00:00Z", receipt: createStudioBg3dSixPassBundleReceipt(manifest, chain.workId), uploadedRoles: ["scene", ...STUDIO_BG3D_SIX_PASS_ROLES] });
    const artifact = role === "scene" ? manifest.scene : manifest.layers.find((layer) => layer.role === role)?.artifact;
    if (!artifact) throw new Error("알 수 없는 복구 역할입니다.");
    return json({ manifestHash: hashStudioBg3dSixPassBundleManifest(manifest), role, contentHash: artifact.contentHash,
      signedRead: { url: `https://storage.example/${manifest.renderRevisionId}/${role}`, expiresAtEpochMs: Date.now() + 60_000 } });
  });
  fetchBody.mockImplementation(async (url: URL) => {
    const [, revisionId, role] = url.pathname.split("/"), manifest = bundle.revisions.find(({ renderRevisionId }) => renderRevisionId === revisionId);
    const artifact = role === "scene" ? manifest?.scene : manifest?.layers.find((layer) => layer.role === role)?.artifact;
    if (!artifact) throw new Error("알 수 없는 본문입니다.");
    const body = await source.authority.get(artifact.contentHash);
    if (!body) throw new Error("복구 fixture 본문이 없습니다.");
    return new Response(Uint8Array.from(body), { headers: { "content-type": artifact.mimeType } });
  });
  return { source, chain, authority, input: { workId: chain.workId, pageId: first.pageId, bundleId: first.bundleId,
    groupId: first.groupId, previousState, elements, authority, lineAuthority } };
}
it("미게시 봉인 이력은 본문·scene·PNG를 복구하되 기존 active·화면·owner를 변경하지 않는다", async () => {
  const f = await recoveryFixture(), before = structuredClone(f.input.previousState), elements = structuredClone(f.input.elements);
  const restored = await recoverStudioBg3dSixPassRemoteBundleState(f.input);
  expect(restored.state?.bundles[0].activeRevisionId).toBe(before.bundles[0].activeRevisionId);
  expect(restored.state?.bundles[0].revisions).toHaveLength(2);
  expect(restored.restoredManifests.map(({ renderRevisionId }) => renderRevisionId)).toEqual([f.source.manifest.renderRevisionId]);
  expect(f.input.previousState).toEqual(before); expect(f.input.elements).toEqual(elements);
  expect(await f.authority.owners()).toEqual([]);
  const main = f.source.manifest.layers.find(({ role }) => role === "main-line");
  expect(main && await f.input.lineAuthority.get(main.artifact.contentHash, { verify: true })).not.toBeNull();
});
it.each(["work", "group", "element-id", "local-hash"])("복구의 %s 충돌은 다운로드·원고 반영 전에 거부한다", async (kind) => {
  const f = await recoveryFixture();
  if (kind === "work") f.chain.workId = "other-work";
  const previousState = kind === "local-hash" ? { ...f.input.previousState, bundles: f.input.previousState.bundles.map((bundle) => ({ ...bundle,
    revisions: bundle.revisions.map((manifest) => ({ ...manifest, cameraHash: `sha256:${"f".repeat(64)}` as const })) })) } : f.input.previousState;
  const elements = kind === "element-id" ? f.input.elements.map((element, index) => index ? element : { ...element, id: "conflicting-id" }) : f.input.elements;
  await expect(recoverStudioBg3dSixPassRemoteBundleState({ ...f.input, previousState, elements,
    groupId: kind === "group" ? "other-group" : f.input.groupId })).rejects.toThrow();
  expect(fetchBody).not.toHaveBeenCalled(); expect(await f.authority.owners()).toEqual([]);
});
it("복구 원본 손상은 active와 owner를 공개하지 않고 중단한다", async () => {
  const f = await recoveryFixture();
  fetchBody.mockResolvedValue(new Response(new Uint8Array(20), { headers: { "content-type": "image/png" } }));
  await expect(recoverStudioBg3dSixPassRemoteBundleState(f.input)).rejects.toThrow();
  expect(await f.authority.owners()).toEqual([]);
  expect(f.input.previousState.bundles[0].revisions).toHaveLength(1);
});
