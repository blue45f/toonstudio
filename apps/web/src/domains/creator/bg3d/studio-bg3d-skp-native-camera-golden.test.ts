import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseSkp } from "openskp";
import { Box3, Mesh, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import expected from "../../../../tests/fixtures/skp/native-camera-golden.expected.json";
import { convertStudioBg3dModelFilesToGlb } from "./studio-bg3d-model-import";
import { STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES } from "./studio-bg3d-skp-contract";
import { convertStudioBg3dSkpBytes, isOpenSkpModuleLike } from "./studio-bg3d-skp-conversion-core";
import { readStudioBg3dSkpMetricImport } from "./studio-bg3d-skp-metric-provenance";
import { extractStudioBg3dSkpSceneManifest, parseStudioBg3dSkpSceneManifest, type StudioBg3dSkpSceneManifest } from "./studio-bg3d-skp-scene-manifest";
import { readStudioBg3dSkpSceneSource } from "./studio-bg3d-skp-scene-provenance";

// 유지되는 repo fixture만 읽는다. SDK·원본 template·개인 실험 경로는 실행 의존성이 아니다.
const FIXTURE_URL = new URL("../../../../tests/fixtures/skp/native-camera-golden.skp", import.meta.url);
function fixtureBytes(): Uint8Array<ArrayBuffer> { return Uint8Array.from(readFileSync(FIXTURE_URL)); }

class GoldenFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.(); }, () => this.onerror?.());
  }
}
afterEach(() => vi.unstubAllGlobals());

function expectManifestMatchesNative(manifest: StudioBg3dSkpSceneManifest): void {
  expect(manifest.coverage).toBe("parser-exposed-metadata-only");
  expect(manifest.coordinates).toMatchObject({ linearUnit: "inch", upAxis: "z" });
  expect(manifest.pages.total).toBe(3); expect(manifest.pages.stored).toBe(3);
  expect(manifest.diagnostics.map(({ code }) => code)).toContain(expected.parserCoverage.requiredDiagnostic);
  for (const [index, native] of expected.nativeGroundTruth.scenes.entries()) {
    const page = manifest.pages.items[index];
    if (!page) throw new Error("자체 제작 Scene 세 개가 모두 남아 있어야 합니다.");
    expect(page.name).toBe(native.name);
    expect(page.eye).toEqual(expected.nativeGroundTruth.orientation.eyeInches);
    expect(page.target).toEqual(expected.nativeGroundTruth.orientation.targetInches);
    expect(page.up).toEqual(expected.nativeGroundTruth.orientation.upSdkNormalized);
    expect(page.parallel).toBe(native.projection === "orthographic");
    expect(page.fovBasis).toBe(expected.parserCoverage.manifestFovBasis);
    expect(page.fieldPresence).toBe(expected.parserCoverage.fieldPresence);
    expect(page).not.toHaveProperty("aspectRatio");
    if (native.projection === "perspective") expect(page.fov).toBe(native.fovDegrees);
    else expect(page.orthoHeight).toBe(native.orthoHeightInches);
  }
}

function expectMetreTriangle(root: Object3D): void {
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root, true);
  expect(bounds.min.distanceTo(new Vector3().fromArray(expected.convertedGeometry.boundsMin))).toBeLessThan(1e-6);
  expect(bounds.max.distanceTo(new Vector3().fromArray(expected.convertedGeometry.boundsMax))).toBeLessThan(1e-6);
  const vertices: Vector3[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index += 1) vertices.push(new Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld));
  });
  const authored = expected.convertedGeometry.verticesMetres.map((point) => new Vector3().fromArray(point));
  expect(vertices.length).toBeGreaterThanOrEqual(3);
  for (const vertex of vertices) expect(Math.min(...authored.map((point) => point.distanceTo(vertex)))).toBeLessThan(1e-6);
  for (const point of authored) expect(Math.min(...vertices.map((vertex) => point.distanceTo(vertex)))).toBeLessThan(1e-6);
}

async function converted() {
  const module: unknown = await import("openskp");
  if (!isOpenSkpModuleLike(module)) throw new Error("실제 OpenSKP 변환 API가 필요합니다.");
  return convertStudioBg3dSkpBytes(fixtureBytes(), {
    loadModule: async () => module, execution: "main-thread", maxBytes: STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES,
  });
}

describe("native SDK 자체 제작 SKP 카메라 golden corpus", () => {
  it("유지되는 입력 해시와 자체 제작·native 저장/재읽기 provenance를 확인한다", () => {
    const bytes = fixtureBytes();
    expect(bytes.byteLength).toBe(expected.fixture.byteLength);
    expect(bytes.byteLength).toBe(5377);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected.fixture.sha256);
    expect(expected.provenance).toMatchObject({ nativeApiVersion: [15, 0], saveAndReloadVerified: true, modelReleaseResult: 0, terminateCompleted: true });
    expect(expected.nativeGroundTruth.geometry.verticesInches).toEqual([[0, 0, 0], [100, 0, 0], [0, 100, 0]]);
    expect(expected.nativeGroundTruth.scenes).toHaveLength(3);
  });

  it("실제 parseSkp는 geometry·좌표·활성 카메라 값을 보존하지만 native FOV 축·aspect는 노출하지 않는다", () => {
    const raw = parseSkp(fixtureBytes().buffer);
    expect(raw.version).toBe(expected.fixture.sourceVersion);
    expect(raw.units).toBe(expected.nativeGroundTruth.displayUnits);
    expect(raw.root.vertices.map((point) => [point.x, point.y, point.z])).toEqual(expected.nativeGroundTruth.geometry.verticesInches);
    expect(raw.root.faces.length).toBe(expected.nativeGroundTruth.geometry.sourceFaceCount);
    expect(raw.pages).toHaveLength(3);
    expect(expected.nativeGroundTruth.scenes[0].fovIsHeight).toBe(true);
    expect(expected.nativeGroundTruth.scenes[1].fovIsHeight).toBe(false);
    for (const [index, page] of raw.pages.entries()) {
      const native = expected.nativeGroundTruth.scenes[index];
      if (!native) throw new Error("SDK 카메라 정답이 필요합니다.");
      expect(page.name).toBe(native.name);
      expect(page.eye).toEqual(expected.nativeGroundTruth.orientation.eyeInches);
      expect(page.target).toEqual(expected.nativeGroundTruth.orientation.targetInches);
      expect(page.up).toEqual(expected.nativeGroundTruth.orientation.upSdkNormalized);
      expect(page.parallel).toBe(native.projection === "orthographic");
      if (native.projection === "perspective") expect(page.fov).toBe(native.fovDegrees);
      else expect(page.orthoHeight).toBe(native.orthoHeightInches);
      expect(native.aspectRatio).toBe(1.5);
      expect(page).not.toHaveProperty("fovIsHeight"); expect(page).not.toHaveProperty("aspectRatio");
    }
    // 비활성 FOV/orthoHeight의 파서 기본값은 native getter 정답으로 비교하지 않는다.
    const manifest = extractStudioBg3dSkpSceneManifest(raw);
    if (!manifest.ok) throw new Error(manifest.detail);
    expectManifestMatchesNative(manifest.value);
    expect(parseStudioBg3dSkpSceneManifest(JSON.parse(JSON.stringify(manifest.value)))).toEqual(manifest);
  });

  it("우리 실제 conversion core가 2.54m 삼각형과 원본 inch SceneManifest 세 개를 함께 보존한다", async () => {
    const output = await converted();
    expect(output.report.source).toMatchObject({ byteSize: expected.fixture.byteLength, declaredUnits: "Inches" });
    expect(output.report.counts.sourceFaces).toBe(1);
    expect(output.report.coordinates).toMatchObject({ sourceUnit: "inch", outputUnit: "meter", metersPerSourceUnit: 0.0254, sourceUpAxis: "z", outputUpAxis: "y" });
    expect(output.report.size?.openSkpMeters[0]).toBeCloseTo(2.54, 6);
    expect(output.report.size?.openSkpMeters[2]).toBeCloseTo(2.54, 6);
    if (output.sceneSource.status !== "available") throw new Error("원본 Page가 있는 실제 fixture의 출처가 사라졌습니다.");
    expectManifestMatchesNative(output.sceneSource.manifest);
    const loaded = await new GLTFLoader().parseAsync(new Uint8Array(output.glb).buffer, "");
    expectMetreTriangle(loaded.scene);
  });

  it("main import→GLTFExporter→최종 GLB 재로드 뒤에도 manifest·미터 정책·알려진 축 변환이 남는다", async () => {
    vi.stubGlobal("FileReader", GoldenFileReader);
    const output = await convertStudioBg3dModelFilesToGlb([new File([fixtureBytes()], expected.fixture.fileName)], { executionBackend: "direct" });
    expect(output).toHaveLength(1);
    const loaded = await new GLTFLoader().parseAsync(await output[0].arrayBuffer(), "");
    expectMetreTriangle(loaded.scene);
    const source = readStudioBg3dSkpSceneSource(loaded.scene);
    if (!source.ok || source.value.status !== "available") throw new Error("최종 GLB의 검증된 native 원본 정보가 필요합니다.");
    expectManifestMatchesNative(source.value.manifest);
    expect(source.value.geometryTransform).toMatchObject({ status: "known", sourceUnit: "inch", axisMapping: "x,z,-y", appliedUnit: "inch", unitScaleFactor: 1, userSelectedUnit: false, metersPerSourceUnit: 0.0254 });
    const rawManifest = extractStudioBg3dSkpSceneManifest(parseSkp(fixtureBytes().buffer));
    if (!rawManifest.ok) throw new Error(rawManifest.detail);
    expect(source.value.manifest).toEqual(rawManifest.value);
    expect(readStudioBg3dSkpMetricImport(loaded.scene)).toBe("authored-metres");
  });
});
