/** Lettuce 원본의 파일 UI·일반 복제·내 템플릿 재열기를 검사한다. import만으로 실행하지 않는다. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { createImportedEntities, requireSavedSourceIdentity } from "./imported-material-scenario.mjs";
import { createMultiObjectScenario } from "./multi-object-scenario.mjs";

export const LETTUCE_CASE_ID = "lettuce-owner-bound-template-material-roundtrip";
export const LETTUCE_FIXTURE = Object.freeze({
  fileName: "Lettuce_C.owner-bound.glb",
  bytes: 563256, sha256: "d0278329da4045e00515f0bad66925eccdf08985c9aed1f66d90a929a777f3a3",
  cardName: "Lettuce_C.owner-bound 장면에 추가", sourceLinearColor: Object.freeze([1, 1, 1]),
  meshCount: 1, materialCount: 1, vertexCount: 210, indexCount: 282,
  embeddedBaseColor: Object.freeze({ width: 1024, height: 1024, bytes: 554524,
    sha256: "141fe1c73737333126847649ce76a3e56cb6e1ba83d105495df2577b104d8e8b" }),
  provenance: Object.freeze([]),
});
const OWNER_PACK = "cbv1-030-nature-megapack-extended";
const SOURCE_SHA256 = "f446a6d9bb2546fafc425f2292ae847e21269e61363d56d3404bccfd92cdb393";
const SOURCE_URL = "https://rg-poly.itch.io/nature-megapack-low-poly-refreshed-unity-urp";
const RECEIPT_PIN = Object.freeze({ bytes: 4854,
  sha256: "b786b2e4b1fdf2da38dc43178bf6cd987abb946b22e26e108d707298c3dd59f7" });
const RIGHTS_PIN = Object.freeze({ relativePath: "config/creator-bundle-pack-rights.json", bytes: 262378,
  sha256: "6087ad71124cd7f88c300585323421efe6481aec8a7b1e678c5077d2723dd6b5" });
const HTML_PIN = Object.freeze({ relativePath: "docs/evidence/itch-licenses-20261028/nature-extended.html", bytes: 220,
  sha256: "38c4b4e9ae7d83397469649330c2d625e88662cc6643943fa60b74316c10a2e2" });
const INDEX_PIN = Object.freeze({ relativePath: "docs/evidence/itch-licenses-20261028/index.json", bytes: 7811,
  sha256: "0be6524f7ae5a3135fe3fc80dbb8d18baff2b304c1f143288021fb2e9f28d016" });

function only(values, message) {
  assert(Array.isArray(values) && values.length === 1, message); return values[0];
}
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

/** 이미 고정 해시를 대조한 바이트에서만 GLB 구조와 내장 PNG의 연결을 읽는다. */
function requireLettuceGlb(buffer) {
  assert(Buffer.isBuffer(buffer)); assert.equal(buffer.byteLength, LETTUCE_FIXTURE.bytes);
  assert.equal(buffer.readUInt32LE(0), 0x46546c67); assert.equal(buffer.readUInt32LE(4), 2);
  assert.equal(buffer.readUInt32LE(8), buffer.byteLength);
  const chunks = [];
  for (let offset = 12; offset < buffer.byteLength;) {
    assert(offset + 8 <= buffer.byteLength, "GLB chunk header가 잘렸습니다.");
    const bytes = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4);
    assert.equal(bytes % 4, 0); assert(offset + 8 + bytes <= buffer.byteLength, "GLB chunk가 본문 범위를 벗어납니다.");
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + bytes) }); offset += 8 + bytes;
  }
  assert.equal(chunks.length, 2); assert.equal(chunks[0].type, 0x4e4f534a); assert.equal(chunks[1].type, 0x004e4942);
  const gltf = JSON.parse(chunks[0].data.toString("utf8"));
  assert.equal(gltf.asset.version, "2.0");
  const declaredBuffer = only(gltf.buffers, "GLB는 내장 buffer 하나여야 합니다.");
  assert.equal(declaredBuffer.uri, undefined); assert.equal(declaredBuffer.byteLength, chunks[1].data.byteLength);
  assert.equal(gltf.skins?.length ?? 0, 0); assert.equal(gltf.animations?.length ?? 0, 0);
  const mesh = only(gltf.meshes, "Lettuce 원본 mesh는 하나여야 합니다.");
  const primitive = only(mesh.primitives, "Lettuce 원본 primitive는 하나여야 합니다.");
  assert.equal(primitive.material, 0); assert.equal(primitive.mode ?? 4, 4);
  for (const [semantic, type] of [["POSITION", "VEC3"], ["NORMAL", "VEC3"], ["TEXCOORD_0", "VEC2"]]) {
    const accessor = gltf.accessors[primitive.attributes[semantic]];
    assert.equal(accessor.count, LETTUCE_FIXTURE.vertexCount); assert.equal(accessor.type, type);
    assert.equal(accessor.componentType, 5126);
  }
  const indices = gltf.accessors[primitive.indices];
  assert.equal(indices.count, LETTUCE_FIXTURE.indexCount); assert.equal(indices.type, "SCALAR"); assert.equal(indices.componentType, 5123);
  const material = only(gltf.materials, "Lettuce 원본 재질은 하나여야 합니다."), pbr = material.pbrMetallicRoughness;
  assert.deepEqual(pbr.baseColorFactor ?? [1, 1, 1, 1], [1, 1, 1, 1]);
  assert.equal(pbr.roughnessFactor ?? 1, 1); assert.equal(pbr.metallicFactor ?? 1, 0);
  assert.equal(material.doubleSided, true); assert.equal(material.alphaMode ?? "OPAQUE", "OPAQUE");
  for (const key of ["normalTexture", "occlusionTexture", "emissiveTexture"]) assert.equal(material[key], undefined);
  assert.equal(pbr.metallicRoughnessTexture, undefined); assert.equal(pbr.baseColorTexture.index, 0);
  assert.equal(only(gltf.textures, "원본 texture는 하나여야 합니다.").source, 0);
  const image = only(gltf.images, "원본 image는 하나여야 합니다.");
  assert.equal(image.uri, undefined); assert.equal(image.mimeType, "image/png");
  const view = gltf.bufferViews[image.bufferView], texture = LETTUCE_FIXTURE.embeddedBaseColor;
  assert.equal(view.buffer, 0); assert.equal(view.byteLength, texture.bytes);
  assert(Number.isSafeInteger(view.byteOffset) && view.byteOffset >= 0
    && view.byteOffset + view.byteLength <= chunks[1].data.byteLength, "내장 PNG의 bufferView 범위가 다릅니다.");
  const png = chunks[1].data.subarray(view.byteOffset, view.byteOffset + view.byteLength);
  assert.equal(sha256(png), texture.sha256); assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(png.readUInt32BE(16), texture.width); assert.equal(png.readUInt32BE(20), texture.height);
  return { meshes: LETTUCE_FIXTURE.meshCount, materials: LETTUCE_FIXTURE.materialCount,
    vertices: LETTUCE_FIXTURE.vertexCount, indices: LETTUCE_FIXTURE.indexCount, embeddedBaseColor: texture };
}

/** 비공개 경로·본문을 반환하지 않고 원본·정상화 영수증·공개 권리 증빙의 해시 연결만 남긴다. */
export async function verifyLettuceFixture({ repo, file, receiptFile, readPinned }) {
  assert.equal(typeof repo, "string"); assert(path.isAbsolute(repo)); assert.equal(typeof readPinned, "function");
  for (const input of [file, receiptFile]) assert(typeof input === "string" && path.isAbsolute(input)
    && path.resolve(input) === input, "Lettuce 파일과 영수증은 명시적인 정규 절대 경로가 필요합니다.");
  assert.equal(path.basename(file), LETTUCE_FIXTURE.fileName);
  const [body, normalized, rights, html, index] = await Promise.all([
    readPinned({ absolutePath: file, bytes: LETTUCE_FIXTURE.bytes, sha256: LETTUCE_FIXTURE.sha256 }),
    readPinned({ absolutePath: receiptFile, ...RECEIPT_PIN }), readPinned(RIGHTS_PIN), readPinned(HTML_PIN), readPinned(INDEX_PIN),
  ]);
  const receipt = JSON.parse(normalized.bytes.toString("utf8"));
  assert.equal(receipt.schema, "toonstudio.atlas-real-sample.v1"); assert.equal(receipt.owner, OWNER_PACK);
  assert.equal(receipt.status, "passed"); assert.equal(receipt.phase, "private-pilot-only"); assert.equal(receipt.inputUnchanged, true);
  assert(JSON.stringify(receipt.before) === JSON.stringify(receipt.after), "영수증의 전후 입력 해시 기록이 다릅니다.");
  const sourceEntries = Object.entries(receipt.before).filter(([name]) => name.endsWith("/Models/Farm Plants/Lettuce_C.glb"));
  assert(sourceEntries.length === 1 && sourceEntries[0][1] === SOURCE_SHA256, "정상화 전 원본 GLB의 해시 연결이 다릅니다.");
  const textureEntries = Object.entries(receipt.before).filter(([name]) => name.endsWith("/Textures/atlas_nature.png"));
  assert(textureEntries.length === 1 && textureEntries[0][1] === LETTUCE_FIXTURE.embeddedBaseColor.sha256,
    "정상화 전 atlas의 해시 연결이 다릅니다.");
  const report = receipt.normalizerReport, binding = report.ownerPackBinding;
  assert.equal(report.sourceSha256, SOURCE_SHA256); assert.equal(report.normalizedSha256, LETTUCE_FIXTURE.sha256);
  assert.equal(report.geometryBytesPreserved, true); assert.equal(report.externalImageUrisRemaining, 0);
  assert.equal(binding.ownerPackId, OWNER_PACK); assert.equal(binding.sourceRelative, "Models/Farm Plants/Lettuce_C.glb");
  assert.equal(binding.policy, "exact-owner-pack-atlas-v1");
  assert.deepEqual(binding.imagePaths, { "../../Textures/atlas_nature.png": "Textures/atlas_nature.png" });
  const embedded = only(report.embeddedTextures, "영수증의 내장 atlas는 하나여야 합니다.");
  assert.equal(embedded.uri, "../../Textures/atlas_nature.png");
  assert.equal(embedded.bytes, LETTUCE_FIXTURE.embeddedBaseColor.bytes); assert.equal(embedded.sha256, LETTUCE_FIXTURE.embeddedBaseColor.sha256);
  assert.equal(receipt.derived.bytes, LETTUCE_FIXTURE.bytes); assert.equal(receipt.derived.sha256, LETTUCE_FIXTURE.sha256);
  for (const key of ["fullExpectedJsonEqual", "originalDeclaredBinPrefixEqual", "embeddedImageBytesEqual", "rgbaPixelsEqual", "idempotentBytesEqual"]) {
    assert.equal(receipt.derived[key], true, "정상화 보존 검증이 참이 아닙니다: " + key);
  }
  assert.deepEqual(receipt.decodedImage.size, [1024, 1024]); assert.equal(receipt.decodedImage.mode, "RGBA");
  const ledger = JSON.parse(rights.bytes.toString("utf8")), captures = JSON.parse(index.bytes.toString("utf8"));
  assert.equal(ledger.schema, "toonstudio.creator-bundle-pack-rights.v1");
  const pack = only(ledger.packs.filter((entry) => entry.id === OWNER_PACK), "원장의 정확한 Nature pack이 유일하지 않습니다.");
  assert.equal(pack.creator, "RG Poly"); assert.equal(pack.serve, "allow");
  assert.equal(pack.grant.status, "public-domain"); assert.equal(pack.grant.licenseName, "CC0-1.0");
  assert.equal(pack.grant.commercialUse, true); assert.equal(pack.grant.attributionRequired, false);
  const evidence = only(pack.evidence.filter((entry) => entry.kind === "itch-page-capture" && entry.ref === HTML_PIN.relativePath),
    "Nature pack의 공개 페이지 캡처가 유일하지 않습니다.");
  assert.equal(evidence.sha256, HTML_PIN.sha256); assert.equal(evidence.url, SOURCE_URL);
  assert.equal(captures.schema, "toonstudio.itch-license-evidence.v1");
  const capture = only(captures.captures.filter((entry) => entry.ledgerPackId === OWNER_PACK), "Nature 캡처의 owner 연결이 유일하지 않습니다.");
  assert.equal(capture.path, HTML_PIN.relativePath); assert.equal(capture.sha256, HTML_PIN.sha256); assert.equal(capture.bytes, HTML_PIN.bytes);
  assert.equal(capture.sourceUrl, SOURCE_URL); assert.equal(capture.observedAssetLicense, "CC0-1.0");
  assert.match(html.bytes.toString("utf8"), /by RG Poly/u); assert.match(html.bytes.toString("utf8"), /Creative Commons Zero v1\.0 Universal/u);
  const structure = requireLettuceGlb(body.bytes);
  const metadata = (kind, entry) => ({ kind, bytes: entry.pin.bytes, sha256: entry.pin.sha256, identity: entry.pin.identity });
  return { buffer: body.bytes, source: { provider: "RG Poly", licenseId: "CC0-1.0", ownerPackId: OWNER_PACK,
    body: { bytes: body.pin.bytes, sha256: body.pin.sha256, identity: body.pin.identity, structure },
    provenance: [metadata("owner-bound-normalization-receipt", normalized), metadata("pack-rights-ledger", rights),
      metadata("public-cc0-html-excerpt", html), metadata("public-license-capture-index", index)] } };
}

function originalSnapshot(entity) {
  const fields = ["materialType", "color", "roughness", "metalness", "normalMapType", "normalScale", "opacity",
    "transparent", "emissive", "emissiveIntensity", "wireframe", "materialSettings", "channels", "auxiliaryChannels"];
  return Object.fromEntries(fields.map((key) => [key, entity[key]]));
}
function originalReady(entity, baseline) {
  const map = entity.channels.baseColor, texture = LETTUCE_FIXTURE.embeddedBaseColor;
  if (entity.entityKind !== "model" || entity.materialType !== "MeshStandardMaterial" || !entity.visible
    || !entity.appearance || !entity.program.linked || !map?.decoded || map.sourceUrl !== null
    || map.width !== texture.width || map.height !== texture.height || !map.sourceDataReady || !map.gpuObjectAlive
    || map.version <= 0 || map.uploadedVersion !== map.version || !Number.isSafeInteger(map.gpuIdentityToken)
    || map.gpuIdentityToken <= 0 || entity.program.samplers.baseColor !== true
    || ["normal", "roughness", "metalness"].some((key) => entity.channels[key] !== null || entity.program.samplers[key] !== false)
    || Object.values(entity.auxiliaryChannels).some((channel) => channel !== null)) return false;
  return !baseline || JSON.stringify(originalSnapshot(entity)) === JSON.stringify(baseline);
}
function assertGeometry(entity) {
  assert.equal(entity.appearance.geometry.positions.length, LETTUCE_FIXTURE.vertexCount * 3);
  assert.equal(entity.appearance.geometry.normals.length, LETTUCE_FIXTURE.vertexCount * 3);
  assert.equal(entity.appearance.geometry.uvs.length, LETTUCE_FIXTURE.vertexCount * 2);
  assert.equal(entity.appearance.geometry.indices.length, LETTUCE_FIXTURE.indexCount);
}
function assertOriginal(entity) {
  assert(originalReady(entity)); assertGeometry(entity);
  assert.deepEqual(entity.color, LETTUCE_FIXTURE.sourceLinearColor); assert.equal(entity.roughness, 1); assert.equal(entity.metalness, 0);
  assert.equal(entity.opacity, 1); assert.equal(entity.transparent, false); assert.equal(entity.materialSettings.side, 2);
  assert.deepEqual(entity.emissive, [0, 0, 0]); assert.equal(entity.emissiveIntensity, 1); assert.equal(entity.wireframe, false);
  assert.equal(entity.channels.baseColor.colorSpace, "srgb"); assert.deepEqual(entity.channels.baseColor.repeat, [1, 1]);
}
function assertSeparateInstances(observation, A, B) {
  const a = only(observation.entities.filter((entry) => entry.entityId === A), "A의 실제 mesh가 유일하지 않습니다.");
  const b = only(observation.entities.filter((entry) => entry.entityId === B), "B의 실제 mesh가 유일하지 않습니다.");
  for (const entity of [a, b]) {
    const mesh = only(observation.entityMeshes.filter((entry) => entry.entityId === entity.entityId), "각 모델은 mesh 하나여야 합니다.");
    assert.equal(mesh.entityKind, "model"); assert.deepEqual(mesh.materialTypes, ["MeshStandardMaterial"]); assertGeometry(entity);
  }
  assert.notEqual(a.meshUuid, b.meshUuid, "같은 mesh를 두 모델로 세었습니다.");
  assert.equal(a.geometryUuid, b.geometryUuid, "같은 source cache의 geometry를 공유하지 않습니다.");
  assert.notEqual(a.materialUuid, b.materialUuid, "두 모델이 같은 mutable Material을 공유합니다.");
}

export function createLettuceMaterialScenario(core, fixtureInput) {
  assert.equal(typeof core.bounded, "function"); assert.equal(fixtureInput.name, LETTUCE_FIXTURE.fileName);
  assert.equal(fixtureInput.mimeType, "model/gltf-binary"); assert(Buffer.isBuffer(fixtureInput.buffer));
  assert.equal(fixtureInput.buffer.byteLength, LETTUCE_FIXTURE.bytes);
  return createMultiObjectScenario(core, {
    templateOnly: true, names: { A: "Lettuce 격리 A", B: "Lettuce 격리 B" },
    originalReady, originalSnapshot, assertOriginal, assertSeparateInstances,
    createEntities: createImportedEntities(core, fixtureInput, LETTUCE_FIXTURE),
    requireSavedSourceIdentity: (args) => requireSavedSourceIdentity({ ...args, core, fixture: LETTUCE_FIXTURE }),
  });
}
