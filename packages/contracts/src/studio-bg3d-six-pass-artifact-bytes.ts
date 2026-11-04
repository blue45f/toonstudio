import { sha256HexPortable } from "./sha256-portable";
import { StudioBg3dSixPassPngArtifactSchema, StudioBg3dSixPassSceneArtifactSchema,
  hashStudioBg3dSixPassCanonicalJson, parseStudioBg3dSixPassBundleManifest } from "./studio-bg3d-six-pass-bundle";

import type { StudioBg3dSixPassArtifact, StudioBg3dSixPassBundleManifest } from "./studio-bg3d-six-pass-bundle";
import type { StudioBg3dSixPassRole } from "./studio-bg3d-six-pass-reference";

export type StudioBg3dSixPassArtifactRole = StudioBg3dSixPassRole | "scene";
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function fail(message: string): never { throw new Error(`6패스 본문 검증 실패: ${message}`); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function inspectPng(bytes: Uint8Array, width: number, height: number): void {
  if (bytes.byteLength < 57 || SIGNATURE.some((value, index) => bytes[index] !== value)) fail("PNG 서명·길이가 올바르지 않습니다.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, idat = false, idatBytes = 0, idatEnded = false, palette = false, colorType = -1;
  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 12) fail("PNG 블록이 잘렸습니다.");
    const length = view.getUint32(offset, false), end = offset + 12 + length;
    if (end > bytes.byteLength) fail("PNG 블록 경계가 올바르지 않습니다.");
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/u.test(type)) fail("PNG 블록 이름이 올바르지 않습니다.");
    let crc = 0xffffffff;
    for (let index = offset + 4; index < end - 4; index += 1) crc = CRC[(crc ^ bytes[index]) & 255] ^ crc >>> 8;
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(end - 4, false)) fail("PNG CRC가 다릅니다.");
    if (offset === 8) {
      if (type !== "IHDR" || length !== 13 || view.getUint32(offset + 8, false) !== width
        || view.getUint32(offset + 12, false) !== height) fail("PNG IHDR 크기가 영수증과 다릅니다.");
      const depth = bytes[offset + 16]; colorType = bytes[offset + 17];
      const depths: Readonly<Record<number, readonly number[]>> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[colorType]?.includes(depth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0
        || (bytes[offset + 20] !== 0 && bytes[offset + 20] !== 1)) fail("PNG IHDR 형식이 올바르지 않습니다.");
    } else if (type === "IHDR") fail("PNG IHDR가 중복되었습니다.");
    if (["acTL", "fcTL", "fdAT"].includes(type)) fail("움직이는 PNG는 6패스 본문으로 저장할 수 없습니다.");
    if (type === "PLTE") {
      if (idat || palette || length < 3 || length > 768 || length % 3 !== 0) fail("PNG 팔레트가 올바르지 않습니다.");
      palette = true;
    }
    if (type === "IDAT") {
      if (idatEnded || (colorType === 3 && !palette)) fail("PNG 픽셀 블록 순서가 올바르지 않습니다.");
      idat = true; idatBytes += length;
    } else if (idat) idatEnded = true;
    if (type === "IEND") {
      if (length !== 0 || !idat || idatBytes === 0 || end !== bytes.byteLength) fail("PNG 종료·픽셀 블록이 올바르지 않습니다.");
      return;
    }
    if (!['IHDR', 'PLTE', 'IDAT'].includes(type) && /^[A-Z]/u.test(type)) fail("알 수 없는 필수 PNG 블록입니다.");
    offset = end;
  }
  fail("PNG 종료 블록이 없습니다.");
}
function readScene(bytes: Uint8Array, activeShotId: string | null): Record<string, unknown> {
  let scene: unknown;
  try { scene = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail("장면 JSON·UTF-8이 올바르지 않습니다."); }
  if (!record(scene) || scene.kind !== "toonstudio.bg3d-scene" || scene.version !== 4
    || !record(scene.camera) || !record(scene.output) || !record(scene.output.sixPassLt)
    || !Array.isArray(scene.nodes) || scene.nodes.length > 512
    || (scene.shots !== undefined && (!Array.isArray(scene.shots) || scene.shots.length > 64))
    || !Array.isArray(scene.attachments) || scene.attachments.length > 256
    || (scene.activeShotId ?? null) !== activeShotId) fail("장면 v4·현재 6패스·활성 컷 결박이 올바르지 않습니다.");
  if (scene.attachments.length !== 0 || scene.nodes.some((node) => !record(node) || node.kind !== "primitive"))
    fail("묶음 v1은 원본 첨부가 없는 primitive 장면만 지원합니다. 외부 모델 원본 입장을 검증하지 못했습니다.");
  const settings = scene.output.sixPassLt;
  if (Object.keys(settings).sort().join(",") !== "depthFogOpacity,fogFarMeters,fogNearMeters,fogTintHex,shadowOpacity,version"
    || settings.version !== 1 || typeof settings.fogTintHex !== "string" || !/^#[0-9a-f]{6}$/u.test(settings.fogTintHex)) fail("장면 6패스 설정이 올바르지 않습니다.");
  for (const key of ["shadowOpacity", "depthFogOpacity"] as const) {
    const value = settings[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) fail("장면 불투명도가 올바르지 않습니다.");
  }
  const near = settings.fogNearMeters, far = settings.fogFarMeters;
  if (typeof near !== "number" || typeof far !== "number" || !Number.isFinite(near) || !Number.isFinite(far)
    || near < 0 || near >= far || far > 100_000) fail("장면 안개 거리가 올바르지 않습니다.");
  const shots = Array.isArray(scene.shots) ? scene.shots : [];
  if (activeShotId !== null && !shots.some((shot) => record(shot) && shot.id === activeShotId)) fail("활성 컷 원본이 장면에 없습니다.");
  return scene;
}
/** 본문 길이·digest·PNG 구조/CRC 또는 최소 scene 봉투를 검사한다. 전체 SceneDocument 의미 검사는 제품 reader가 담당한다. */
export function verifyStudioBg3dSixPassArtifactBytes(artifactValue: StudioBg3dSixPassArtifact, bytes: Uint8Array): void {
  const artifact = artifactValue.mimeType === "image/png" ? StudioBg3dSixPassPngArtifactSchema.parse(artifactValue)
    : StudioBg3dSixPassSceneArtifactSchema.parse(artifactValue);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== artifact.byteSize) fail("본문 길이가 영수증과 다릅니다.");
  if (`sha256:${sha256HexPortable(bytes)}` !== artifact.contentHash) fail("본문 SHA-256이 영수증과 다릅니다.");
  if (artifact.mimeType === "image/png") inspectPng(bytes, artifact.width, artifact.height);
  else readScene(bytes, artifact.activeShotId);
}
export function getStudioBg3dSixPassBundleArtifacts(manifestValue: StudioBg3dSixPassBundleManifest): readonly {
  readonly role: StudioBg3dSixPassArtifactRole; readonly artifact: StudioBg3dSixPassArtifact;
}[] {
  const manifest = parseStudioBg3dSixPassBundleManifest(manifestValue);
  return [...manifest.layers.map(({ role, artifact }) => ({ role, artifact })), { role: "scene", artifact: manifest.scene }];
}
export function verifyStudioBg3dSixPassBundleBodies(manifestValue: StudioBg3dSixPassBundleManifest,
  bodies: ReadonlyMap<StudioBg3dSixPassArtifactRole, Uint8Array>): void {
  const manifest = parseStudioBg3dSixPassBundleManifest(manifestValue);
  const artifacts = getStudioBg3dSixPassBundleArtifacts(manifest);
  if (bodies.size !== artifacts.length) fail("장면과 여섯 PNG가 모두 필요합니다.");
  for (const { role, artifact } of artifacts) {
    const bytes = bodies.get(role);
    if (!bytes) fail(`${role} 본문이 없습니다.`);
    verifyStudioBg3dSixPassArtifactBytes(artifact, bytes);
  }
  const sceneBytes = bodies.get("scene");
  if (!sceneBytes) fail("장면 본문이 없습니다.");
  verifyStudioBg3dSixPassBundleSceneBytes(manifest, sceneBytes);
}
/** 역할별 스트리밍 검증에서도 장면의 카메라·출력 결박을 같은 계약으로 확인한다. */
export function verifyStudioBg3dSixPassBundleSceneBytes(manifestValue: StudioBg3dSixPassBundleManifest,
  sceneBytes: Uint8Array): void {
  const manifest = parseStudioBg3dSixPassBundleManifest(manifestValue);
  verifyStudioBg3dSixPassArtifactBytes(manifest.scene, sceneBytes);
  const scene = readScene(sceneBytes, manifest.scene.activeShotId);
  if (hashStudioBg3dSixPassCanonicalJson(scene.camera) !== manifest.cameraHash
    || hashStudioBg3dSixPassCanonicalJson(scene.output) !== manifest.outputSettingsHash) fail("장면 카메라·출력 설정 hash가 다릅니다.");
}
