import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";

import {
  STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, STUDIO_BG3D_SIX_PASS_ROLES, STUDIO_BG3D_SIX_PASS_IMAGE_BLEND_MODES,
  STUDIO_BG3D_SIX_PASS_MANIFEST_MAX_BYTES, STUDIO_BG3D_SIX_PASS_PNG_MAX_BYTES,
  STUDIO_BG3D_SIX_PASS_PNG_TOTAL_MAX_BYTES, STUDIO_BG3D_SIX_PASS_SCENE_MAX_BYTES,
  StudioBg3dSixPassPngArtifactSchema, assertStudioBg3dSixPassBundleTransition,
  createStudioBg3dSixPassBundleReceipt, getStudioBg3dSixPassBundleArtifacts,
  hashStudioBg3dSixPassBundleManifest, hashStudioBg3dSixPassCanonicalJson,
  hasStudioBg3dSixPassBundleStateEnvelope, parseStudioBg3dSixPassBundleImageReference,
  parseStudioBg3dSixPassArtifactSourceUri, parseStudioBg3dSixPassBundleManifest,
  parseStudioBg3dSixPassBundleState, serializeStudioBg3dSixPassBundleManifest,
  serializeStudioBg3dSixPassCanonicalJson, studioBg3dSixPassArtifactSourceUri,
  studioBg3dSixPassBundleRequiredCapabilities, verifyStudioBg3dSixPassArtifactBytes,
  verifyStudioBg3dSixPassBundleBodies, verifyStudioBg3dSixPassBundleSceneBytes, verifyStudioBg3dSixPassBundleReceipt,
} from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { describe, expect, it } from "vitest";


import type { StudioBg3dSixPassBundleManifest, StudioBg3dSixPassContentHash, StudioBg3dSixPassRole } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";

const encoder = new TextEncoder();
const hash = (bytes: Uint8Array): StudioBg3dSixPassContentHash => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function chunk(type: string, bytes: Uint8Array): Buffer {
  const result = Buffer.alloc(12 + bytes.byteLength); result.writeUInt32BE(bytes.byteLength);
  result.write(type, 4); result.set(bytes, 8); result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}
function png(): Uint8Array {
  const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(Uint8Array.of(0, 10, 20, 30, 255))), chunk("IEND", new Uint8Array())]);
}
function fixture() {
  const image = png();
  const camera = { position: [0, 1, 5], target: [0, 1, 0], fovDegrees: 50 };
  const output = { sixPassLt: { version: 1, shadowOpacity: .68, depthFogOpacity: .32,
    fogNearMeters: 4, fogFarMeters: 25, fogTintHex: "#fed7aa" } };
  const scene = encoder.encode(JSON.stringify({ kind: "toonstudio.bg3d-scene", version: 4,
    camera, output, nodes: [], shots: [{ id: "shot-1" }], activeShotId: "shot-1", attachments: [] }));
  const artifact = { contentHash: hash(image), byteSize: image.byteLength, mimeType: "image/png" as const, width: 1, height: 1 };
  const manifest = parseStudioBg3dSixPassBundleManifest({ contract: "toonstudio.bg3d-sixpass-bundle.v1", version: 1,
    minimumReaderCapability: STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, minimumProjectVersion: 5,
    bundleId: "bundle-1", renderRevisionId: "revision-1", parentRevisionId: null, pageId: "page-1", groupId: "group-1",
    anchorElementId: "element-main-line", width: 1, height: 1, cameraHash: hashStudioBg3dSixPassCanonicalJson(camera),
    outputSettingsHash: hashStudioBg3dSixPassCanonicalJson(output), scene: { documentVersion: 4, contentHash: hash(scene),
      byteSize: scene.byteLength, mimeType: "application/json", activeShotId: "shot-1" },
    layers: STUDIO_BG3D_SIX_PASS_ROLES.map((role) => ({ role, elementId: `element-${role}`, artifact,
      blendMode: role === "depth" ? "screen" : "multiply", opacity: .68, visible: true })) });
  const bodies = new Map<StudioBg3dSixPassRole | "scene", Uint8Array>(STUDIO_BG3D_SIX_PASS_ROLES.map((role) => [role, image]));
  bodies.set("scene", scene);
  return { image, scene, manifest, bodies };
}
function state(manifest: StudioBg3dSixPassBundleManifest, revisions = [manifest], activeRevisionId: string | null = manifest.renderRevisionId) {
  return { contract: "toonstudio.bg3d-sixpass-bundles.v1", version: 1,
    minimumReaderCapability: STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, minimumProjectVersion: 5,
    bundles: [{ bundleId: manifest.bundleId, activeRevisionId, revisions }] };
}
describe("실제 6패스 묶음 공통 계약", () => {
  it("노드·웹 공통 canonical hash와 6PNG+scene 영수증을 검증한다", () => {
    const f = fixture();
    const text = serializeStudioBg3dSixPassBundleManifest(f.manifest);
    expect(encoder.encode(text).byteLength).toBeLessThan(STUDIO_BG3D_SIX_PASS_MANIFEST_MAX_BYTES);
    expect(hashStudioBg3dSixPassBundleManifest(f.manifest)).toBe(hash(encoder.encode(text)));
    expect(getStudioBg3dSixPassBundleArtifacts(f.manifest).map(({ role }) => role)).toEqual([...STUDIO_BG3D_SIX_PASS_ROLES, "scene"]);
    expect(() => verifyStudioBg3dSixPassBundleBodies(f.manifest, f.bodies)).not.toThrow();
    expect(() => verifyStudioBg3dSixPassBundleSceneBytes(f.manifest, f.scene)).not.toThrow();
    const reversed = Object.fromEntries(Object.entries(f.manifest).reverse());
    expect(serializeStudioBg3dSixPassBundleManifest(parseStudioBg3dSixPassBundleManifest(reversed))).toBe(text);
  });
  it.each(["color", "tone", "shadow", "depth", "texture-line", "main-line", "scene"] as const)("%s 하나가 누락되면 완성된 묶음으로 취급하지 않는다", (role) => {
    const f = fixture(); f.bodies.delete(role);
    expect(() => verifyStudioBg3dSixPassBundleBodies(f.manifest, f.bodies)).toThrow(/모두 필요/);
  });
  it("이미지 8MiB 계약을 건드리지 않고 전용 64MiB/384MiB/320KiB 예산만 정의한다", () => {
    expect(STUDIO_BG3D_SIX_PASS_PNG_MAX_BYTES).toBe(64 * 1024 * 1024);
    expect(STUDIO_BG3D_SIX_PASS_PNG_TOTAL_MAX_BYTES).toBe(384 * 1024 * 1024);
    expect(STUDIO_BG3D_SIX_PASS_SCENE_MAX_BYTES).toBe(320 * 1024);
    const f = fixture();
    expect(() => StudioBg3dSixPassPngArtifactSchema.parse({ ...f.manifest.layers[0].artifact, byteSize: STUDIO_BG3D_SIX_PASS_PNG_MAX_BYTES })).not.toThrow();
    expect(() => StudioBg3dSixPassPngArtifactSchema.parse({ ...f.manifest.layers[0].artifact, byteSize: STUDIO_BG3D_SIX_PASS_PNG_MAX_BYTES + 1 })).toThrow();
    expect(() => StudioBg3dSixPassPngArtifactSchema.parse({ ...f.manifest.layers[0].artifact, width: 4096, height: 2049 })).toThrow(/픽셀/);
  });
  it.each([
    (m: StudioBg3dSixPassBundleManifest) => ({ ...m, layers: m.layers.slice(0, 5) }),
    (m: StudioBg3dSixPassBundleManifest) => ({ ...m, minimumProjectVersion: 4 }),
    (m: StudioBg3dSixPassBundleManifest) => ({ ...m, layers: m.layers.map((entry) => ({ ...entry, elementId: "duplicate" })) }),
    (m: StudioBg3dSixPassBundleManifest) => ({ ...m, width: 2 }),
    (m: StudioBg3dSixPassBundleManifest) => ({ ...m, extraBody: "data:image/png;base64,AA==" }),
    (m: StudioBg3dSixPassBundleManifest) => ({ ...m, scene: { ...m.scene, objectUrl: "file:///private/object" } }),
    (m: StudioBg3dSixPassBundleManifest) => ({ ...m, layers: m.layers.map((entry) => ({ ...entry, opacity: 2 })) }),
  ])("잘못된 개수·reader·ID·해상도·본문·로케이터·presentation을 거부한다", (mutate) => {
    const f = fixture(); expect(() => parseStudioBg3dSixPassBundleManifest(mutate(f.manifest))).toThrow();
  });
  it("digest가 맞아도 손상된 PNG CRC·scene 의미 결박은 거부한다", () => {
    const f = fixture(); const bad = new Uint8Array(f.image); bad[bad.length - 1] ^= 1;
    expect(() => verifyStudioBg3dSixPassArtifactBytes({ ...f.manifest.layers[0].artifact, contentHash: hash(bad) }, bad)).toThrow(/CRC/);
    const badScene = encoder.encode(JSON.stringify({ version: 4 }));
    expect(() => verifyStudioBg3dSixPassArtifactBytes({ ...f.manifest.scene, contentHash: hash(badScene), byteSize: badScene.length }, badScene)).toThrow(/장면 v4/);
    expect(() => verifyStudioBg3dSixPassBundleBodies({ ...f.manifest, cameraHash: `sha256:${"f".repeat(64)}` }, f.bodies)).toThrow(/카메라/);
    expect(() => verifyStudioBg3dSixPassArtifactBytes(f.manifest.scene, new Uint8Array(f.scene.length))).toThrow(/SHA-256/);
  });
  it("CRC가 맞더라도 픽셀 본문이 비어 있는 PNG는 거부한다", () => {
    const f = fixture();
    const bytes = Buffer.concat([Buffer.from(f.image.subarray(0, 33)), chunk("IDAT", new Uint8Array()), chunk("IEND", new Uint8Array())]);
    expect(() => verifyStudioBg3dSixPassArtifactBytes({ ...f.manifest.layers[0].artifact,
      contentHash: hash(bytes), byteSize: bytes.length }, bytes)).toThrow(/픽셀 블록/);
  });
  it("원본 첨부가 준비되지 않은 장면을 scene JSON만으로 전달하지 않는다", () => {
    const f = fixture();
    const scene = JSON.parse(new TextDecoder().decode(f.scene)) as Record<string, unknown>;
    for (const patch of [{ attachments: [{ id: "local-model" }] }, { nodes: [{ kind: "model", attachmentId: "missing" }] }]) {
      const bytes = encoder.encode(JSON.stringify({ ...scene, ...patch }));
      expect(() => verifyStudioBg3dSixPassArtifactBytes({ ...f.manifest.scene, contentHash: hash(bytes), byteSize: bytes.length }, bytes)).toThrow(/원본 첨부/);
    }
  });
  it("선택한 컷과 shots가 없는 canonical 기본 장면도 보존한다", () => {
    const f = fixture();
    const original = JSON.parse(new TextDecoder().decode(f.scene)) as Record<string, unknown>;
    const { shots: _shots, activeShotId: _activeShotId, ...scene } = original;
    const bytes = encoder.encode(JSON.stringify(scene));
    expect(() => verifyStudioBg3dSixPassBundleSceneBytes({ ...f.manifest, scene: { ...f.manifest.scene,
      activeShotId: null, byteSize: bytes.length, contentHash: hash(bytes) } }, bytes)).not.toThrow();
    expect(() => verifyStudioBg3dSixPassArtifactBytes({ ...f.manifest.scene,
      byteSize: bytes.length, contentHash: hash(bytes) }, bytes)).toThrow(/활성 컷/);
  });
  it("artist가 고른 Canvas 합성과 normal 별칭을 재캡처 manifest에 그대로 보존한다", () => {
    const f = fixture();
    for (const blendMode of STUDIO_BG3D_SIX_PASS_IMAGE_BLEND_MODES) {
      const parsed = parseStudioBg3dSixPassBundleManifest({ ...f.manifest,
        layers: f.manifest.layers.map((entry) => ({ ...entry, blendMode })) });
      expect(parsed.layers.every((entry) => entry.blendMode === blendMode)).toBe(true);
    }
    for (const blendMode of ["linear-dodge", "dissolve", "unknown"]) {
      expect(() => parseStudioBg3dSixPassBundleManifest({ ...f.manifest,
        layers: f.manifest.layers.map((entry) => ({ ...entry, blendMode })) })).toThrow();
    }
  });
  it("origin/work 영수증을 구분하고 다른 scope/hash로 보상·적용하지 않는다", () => {
    const f = fixture();
    for (const workId of [null, "work-1"]) {
      const receipt = createStudioBg3dSixPassBundleReceipt(f.manifest, workId);
      expect(() => verifyStudioBg3dSixPassBundleReceipt(receipt, f.manifest, workId)).not.toThrow();
      expect(() => verifyStudioBg3dSixPassBundleReceipt(receipt, f.manifest, "work-2")).toThrow(/영수증/);
    }
  });
  it("같은 요소 ID의 새 immutable revision과 비활성 undo frontier를 보존한다", () => {
    const f = fixture();
    const next = { ...f.manifest, renderRevisionId: "revision-2", parentRevisionId: f.manifest.renderRevisionId };
    expect(() => assertStudioBg3dSixPassBundleTransition(f.manifest, next)).not.toThrow();
    const retained = parseStudioBg3dSixPassBundleState(state(f.manifest, [f.manifest, next], null));
    expect(retained.bundles[0].revisions).toHaveLength(2);
    expect(studioBg3dSixPassBundleRequiredCapabilities(retained)).toEqual([STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY]);
    expect(() => parseStudioBg3dSixPassBundleState(state(f.manifest, [next], next.renderRevisionId))).toThrow(/부모/);
    expect(() => assertStudioBg3dSixPassBundleTransition(f.manifest, { ...next, anchorElementId: "element-color" })).toThrow(/결박/);
    expect(() => parseStudioBg3dSixPassBundleState(state(f.manifest, [f.manifest, { ...next, parentRevisionId: null }]))).toThrow(/유일/);
  });
  it("일반 LT에서 승계한 revision을 보존하고 원본 변경에만 정확히 증가시킨다", () => {
    const first = { ...fixture().manifest, linePassRevision: 7 };
    expect(() => assertStudioBg3dSixPassBundleTransition(null, first)).not.toThrow();
    const next = { ...first, renderRevisionId: "revision-2", parentRevisionId: first.renderRevisionId };
    expect(() => assertStudioBg3dSixPassBundleTransition(first, next)).not.toThrow();
    const changed = { ...next, scene: { ...next.scene, contentHash: `sha256:${"f".repeat(64)}` as const } };
    expect(() => assertStudioBg3dSixPassBundleTransition(first, changed)).toThrow(/revision/);
    expect(() => assertStudioBg3dSixPassBundleTransition(first, { ...changed, linePassRevision: 8 })).not.toThrow();
    expect(() => assertStudioBg3dSixPassBundleTransition(first, { ...next, linePassRevision: 8 })).toThrow(/revision/);
  });
  it("시작용 가벼운 봉투 검사를 본문 입장 검증과 혼동하지 않는다", () => {
    const f = fixture(); const envelope = state(f.manifest);
    expect(hasStudioBg3dSixPassBundleStateEnvelope(envelope)).toBe(true);
    expect(hasStudioBg3dSixPassBundleStateEnvelope({ ...envelope, minimumProjectVersion: 4 })).toBe(false);
    expect(hasStudioBg3dSixPassBundleStateEnvelope(state(f.manifest, [f.manifest], "missing"))).toBe(false);
    const imageRef = { kind: "bg3d-sixpass-bundle", bundleId: f.manifest.bundleId,
      renderRevisionId: f.manifest.renderRevisionId, manifestHash: hashStudioBg3dSixPassBundleManifest(f.manifest),
      role: "shadow", elementId: "element-shadow" };
    expect(parseStudioBg3dSixPassBundleImageReference(imageRef)).toEqual(imageRef);
    expect(parseStudioBg3dSixPassBundleImageReference({ ...imageRef, bytes: "AAAA" })).toBeNull();
    expect(parseStudioBg3dSixPassBundleImageReference({ ...imageRef, role: "beauty" })).toBeNull();
    const uri = studioBg3dSixPassArtifactSourceUri(f.manifest.scene.contentHash);
    expect(parseStudioBg3dSixPassArtifactSourceUri(uri)).toBe(f.manifest.scene.contentHash);
    for (const bad of [uri + "?token=private", uri + "/", "https://storage/sha256/value", "file:///private/value"])
      expect(parseStudioBg3dSixPassArtifactSourceUri(bad)).toBeNull();
  });
  it("canonical JSON은 속성 순서 차이를 지우고 nonfinite·undefined·순환·빈 슬롯은 거부한다", () => {
    expect(serializeStudioBg3dSixPassCanonicalJson({ b: 2, a: [1, true] })).toBe('{"a":[1,true],"b":2}');
    const cycle: { self?: unknown } = {}; cycle.self = cycle;
    for (const value of [{ value: NaN }, { value: undefined }, cycle, new Array(1)])
      expect(() => serializeStudioBg3dSixPassCanonicalJson(value)).toThrow();
  });
});
