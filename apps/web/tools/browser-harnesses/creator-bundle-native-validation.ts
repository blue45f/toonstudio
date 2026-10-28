import * as THREE from "three";

import {
  prepareVerifiedBg3dModelRecord,
  revalidateStoredBg3dModelForRendering,
} from "../../src/domains/creator/bg3d/bg3d-model-library";
import {
  loadStudioBg3dBundleAssetBytes,
  releaseStudioBg3dBundleAssetBytes,
  studioBg3dBundleAssetRights,
} from "../../src/domains/creator/bg3d/studio-bg3d-bundle-asset-loader";
import {
  loadStudioBg3dBundleThemePacks,
  studioBg3dBundleAssetUrl,
  type StudioBg3dBundleThemePacks,
} from "../../src/domains/creator/bg3d/studio-bg3d-bundle-theme-packs";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES } from "../../src/domains/creator/bg3d/studio-bg3d-glb-validation";
import { resolveStudioBg3dModelNormalizationScale } from "../../src/domains/creator/bg3d/studio-bg3d-model-runtime-admission";
import { loadVerifiedStudioBg3dGlbWithThree } from "../../src/domains/creator/studio-background-3d-model";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

let catalog: StudioBg3dBundleThemePacks;
let disposePreview: (() => void) | undefined;

async function prepare(index: number, expectedHash?: string) {
  const asset = catalog.assets[index];
  assert(asset, "카탈로그 에셋 인덱스가 없습니다.");
  const loaded = await loadStudioBg3dBundleAssetBytes(asset, studioBg3dBundleAssetUrl(asset, catalog));
  try {
    const record = await prepareVerifiedBg3dModelRecord({
      file: {
        name: asset.path.split("/").at(-1) ?? "bundle.glb",
        size: asset.bytes,
        type: "model/gltf-binary",
        arrayBuffer: async () => Uint8Array.from(loaded.bytes).buffer,
      },
      rights: studioBg3dBundleAssetRights(asset, catalog),
      expectedSha256: expectedHash ?? asset.sha256,
    }, { profile: "mobile", executionBackend: "worker", idFactory: () => asset.id, now: 0 });
    assert(record.contentHash === asset.sha256 && record.byteSize === asset.bytes, "검증 레코드 무결성이 다릅니다.");
    assert(record.validatorProfile === "mobile", "모바일 프로필이 아닙니다.");
    assert(record.rights.status === "public-domain" && record.rights.licenseName === "CC0-1.0", "검증 레코드의 CC0 권리가 다릅니다.");
    return record;
  } finally {
    releaseStudioBg3dBundleAssetBytes(asset.id);
  }
}

function errorProof(error: unknown) {
  return {
    message: error instanceof Error ? error.message : String(error),
    code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : null,
    validationCode: typeof error === "object" && error !== null && "validationCode" in error ? String(error.validationCode) : null,
  };
}

async function validateRange(start: number, end: number) {
  const rows = [];
  for (let index = start; index < Math.min(end, catalog.assets.length); index += 1) {
    const asset = catalog.assets[index];
    assert(asset, "검증할 에셋이 없습니다.");
    try {
      const record = await prepare(index);
      rows.push({ id: asset.id, packIndex: asset.packIndex, ok: true, sha256: record.contentHash,
        bytes: record.byteSize, profile: record.validatorProfile, rights: record.rights,
        metrics: record.validatorMetrics });
    } catch (error) {
      rows.push({ id: asset.id, packIndex: asset.packIndex, ok: false, ...errorProof(error) });
    }
  }
  return rows;
}

async function rejectWrongHash() {
  try {
    await prepare(0, `sha256:${"0".repeat(64)}`);
    throw new Error("변조 해시를 허용했습니다.");
  } catch (error) {
    const proof = errorProof(error);
    assert(proof.code === "hash-mismatch", `변조 해시를 무결성 경계에서 거부하지 못했습니다: ${proof.message}`);
    return proof;
  }
}

async function render(index: number) {
  disposePreview?.();
  disposePreview = undefined;
  const asset = catalog.assets[index];
  assert(asset, "대표 에셋이 없습니다.");
  const pack = catalog.packs[asset.packIndex];
  assert(pack, "대표 에셋 소속 팩이 없습니다.");
  const record = await prepare(index);
  const verification = await revalidateStoredBg3dModelForRendering(record, { profile: "mobile", executionBackend: "worker" });
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(800, 600);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x293544, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const gl = renderer.getContext();
  const extension = gl.getExtension("WEBGL_debug_renderer_info");
  assert(extension, "실제 WebGL backend 식별 확장이 없습니다.");
  const backend = { vendor: String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)),
    renderer: String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)), version: String(gl.getParameter(gl.VERSION)) };
  const expectedLane = new URL(location.href).searchParams.get("lane") ?? "hardware";
  const software = /SwiftShader|llvmpipe|software/i.test(backend.renderer);
  assert(expectedLane === "hardware" ? !software && /Apple|Metal|NVIDIA|AMD|Intel|Radeon/i.test(backend.renderer) : software,
    `선언한 GPU backend와 실제 renderer가 다릅니다: ${JSON.stringify(backend)}`);
  const shaderErrors: string[] = [];
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (_context, program, vertex, fragment) => {
    shaderErrors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join("\n"));
  };
  const loaded = await loadVerifiedStudioBg3dGlbWithThree(verification, DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES.mobile, { renderer });
  assert(loaded.ok, `실제 Three 로더가 모델을 거부했습니다: ${loaded.code}`);
  const sourceBox = new THREE.Box3().setFromObject(loaded.root);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const scale = resolveStudioBg3dModelNormalizationScale(record.id, [sourceSize.x, sourceSize.y, sourceSize.z]);
  loaded.root.scale.setScalar(scale);
  const scaledBox = new THREE.Box3().setFromObject(loaded.root);
  const center = scaledBox.getCenter(new THREE.Vector3());
  loaded.root.position.sub(new THREE.Vector3(center.x, scaledBox.min.y, center.z));
  loaded.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(loaded.root);
  const size = box.getSize(new THREE.Vector3());
  assert(Math.abs(Math.max(size.x, size.y, size.z) - 2) < 0.0001, "제품의 2m 정규화가 다릅니다.");
  const scene = new THREE.Scene();
  scene.add(loaded.root);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8291a4, 2.8));
  const light = new THREE.DirectionalLight(0xffffff, 3.2);
  light.position.set(4, 7, 5); scene.add(light);
  const target = box.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(38, 800 / 600, 0.01, 100);
  const direction = new THREE.Vector3(3.5, 2.5, 4.3).normalize();
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    corners.push(new THREE.Vector3(x, y, z));
  }
  const frameAt = (distance: number) => {
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.lookAt(target); camera.updateMatrixWorld();
    return corners.every((corner) => {
      const p = corner.clone().project(camera);
      return Math.abs(p.x) <= 0.78 && Math.abs(p.y) <= 0.78 && p.z > -1 && p.z < 1;
    });
  };
  let lower = 0.1;
  let upper = 20;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (frameAt(middle)) upper = middle; else lower = middle;
  }
  assert(frameAt(upper), "대표 모델 전체를 카메라에 담지 못했습니다.");
  const projected = [];
  for (const corner of corners) {
    const p = corner.clone().project(camera);
    assert(Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95 && p.z > -1 && p.z < 1, "모델이 카메라 범위를 벗어납니다.");
    projected.push([p.x, p.y, p.z]);
  }
  const materials: { type: string; color: string | null; maps: string[] }[] = [];
  loaded.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const maps = Object.entries(material).filter(([, value]) => value instanceof THREE.Texture).map(([key]) => key);
      materials.push({ type: material.type, color: "color" in material && material.color instanceof THREE.Color ? material.color.getHexString() : null, maps });
    }
  });
  assert(materials.length > 0, "검수할 재질이 없습니다.");
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  assert(shaderErrors.length === 0 && gl.getError() === gl.NO_ERROR, `GPU 셰이더/드로우 오류: ${shaderErrors.join(" / ")}`);
  const pixels = new Uint8Array(800 * 600 * 4);
  gl.readPixels(0, 0, 800, 600, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let foreground = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (Math.abs((pixels[offset] ?? 0) - (pixels[0] ?? 0)) + Math.abs((pixels[offset + 1] ?? 0) - (pixels[1] ?? 0))
      + Math.abs((pixels[offset + 2] ?? 0) - (pixels[2] ?? 0)) > 24) foreground += 1;
  }
  assert(foreground > 4800, "모델이 화면의 1% 이상을 차지하지 않습니다.");
  document.body.replaceChildren();
  const title = document.createElement("h1"); title.textContent = `${pack.title} · ${record.name}`;
  const note = document.createElement("p"); note.textContent = `CC0-1.0 · 모바일 Worker 검증 · 최대 변 2m · ${backend.renderer}`;
  document.body.append(title, note, renderer.domElement);
  disposePreview = () => { loaded.dispose(); renderer.dispose(); };
  return { id: asset.id, packIndex: asset.packIndex, title: pack.title, sha256: record.contentHash,
    bytes: record.byteSize, backend, scale, sourceSize: sourceSize.toArray(), normalizedSize: size.toArray(),
    camera: { position: camera.position.toArray(), target: target.toArray(), fov: camera.fov, corners: projected },
    materials, metrics: loaded.metrics, foregroundPixels: foreground, shaderErrors };
}

void loadStudioBg3dBundleThemePacks().then((data) => {
  catalog = data;
  Object.assign(window, { __creatorBundleNative: { validateRange, rejectWrongHash, render } });
}, (error: unknown) => {
  Object.assign(window, { __creatorBundleNativeError: errorProof(error) });
});
