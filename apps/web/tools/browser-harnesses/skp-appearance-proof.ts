/** 실제 Worker·최종 loader·native 이미지 decode 전용 수동 QA다. 제품 entry나 GPU는 자동 실행하지 않는다. */
import type { StudioBg3dSkpImportReport } from "../../src/domains/creator/bg3d/studio-bg3d-skp-import-report";
import type { Material, Point3, SkpModel, UvPair } from "openskp";
import type { Group, MeshStandardMaterial } from "three";

type ThreeModule = typeof import("three");
type Rgba = readonly [number, number, number, number];
interface SideExpectation {
  readonly side: number; readonly x: number; readonly rgba: Rgba; readonly alpha: number;
  readonly rgb: readonly number[]; readonly shiftU: number; readonly shiftV: number; readonly doubleSided: boolean;
}
interface Fixture { readonly name: string; readonly bytes: ArrayBuffer; readonly sides: readonly SideExpectation[]; readonly imageCount: number;
  readonly sourceImages: readonly { readonly bytes: ArrayBuffer; readonly rgba: Rgba }[]; }
interface SourcePngProof { readonly fixture: string; readonly imageIndex: number; readonly sha256: string; readonly byteLength: number; rgba: readonly number[] | null; }
interface TriangleProof { readonly side: number; readonly xInches: number; readonly rgba: readonly number[]; readonly opacity: number; readonly uvs: readonly number[][]; }
interface CaseProof {
  readonly name: string; readonly sourceSha256: string; readonly finalGlbSha256: string; readonly finalGlbBytes: number;
  readonly report: StudioBg3dSkpImportReport; readonly embeddedPixels: readonly number[][]; readonly triangles: readonly TriangleProof[];
}
export interface StudioBg3dSkpAppearanceProofOptions { readonly signal?: AbortSignal; }
export interface StudioBg3dSkpAppearanceProof {
  readonly scope: "browser-worker-loader-native-image-decode";
  readonly gpu: false; readonly workerLifecycleObservation: "separate-playwright-observation-required";
  readonly assertions: number; readonly cases: readonly CaseProof[]; readonly sourcePngChecks: readonly SourcePngProof[];
}
declare global { interface Window { runStudioBg3dSkpAppearanceProof: typeof runStudioBg3dSkpAppearanceProof; } }

const FIRST: Rgba = [20, 40, 60, 255], SECOND: Rgba = [80, 100, 120, 255];
let active: AbortController | null = null;
function requireValue<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new Error(message); return value;
}
function equal(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function copyBuffer(bytes: Uint8Array): ArrayBuffer { const out = new ArrayBuffer(bytes.byteLength); new Uint8Array(out).set(bytes); return out; }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function uint(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function abortIfNeeded(signal: AbortSignal): void { if (signal.aborted) throw new DOMException("수동 회귀를 취소했습니다.", "AbortError"); }
async function sha256(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
}

/** 유효 PNG의 IEND 앞에 CRC가 있는 tEXt chunk를 추가한다. 다른 픽셀을 가짜 header로 대체하지 않는다. */
function paddedPng(png: Uint8Array, length: number, crc: (type: string, payload: Uint8Array) => number): Uint8Array {
  const payload = new Uint8Array(length - png.byteLength - 12), keyword = new TextEncoder().encode("Fixture\0");
  if (payload.length < keyword.length) throw new Error("PNG padding 예산이 작습니다.");
  payload.set(keyword); payload.fill(120, keyword.length);
  const chunk = new Uint8Array(payload.length + 12), view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length); chunk.set(new TextEncoder().encode("tEXt"), 4); chunk.set(payload, 8);
  view.setUint32(payload.length + 8, crc("tEXt", payload));
  const output = new Uint8Array(length), beforeEnd = png.byteLength - 12;
  output.set(png.subarray(0, beforeEnd)); output.set(chunk, beforeEnd); output.set(png.subarray(beforeEnd), beforeEnd + chunk.length); return output;
}
function triangle(x = 0): Point3[] { return [[x, 0, 0], [x + 10, 0, 0], [x, 10, 0]]; }
function pins(x = 0, u = 0, v = 0): UvPair[] {
  return [[[x, 0, 0], [u, v]], [[x + 10, 0, 0], [1 + u, v]], [[x, 10, 0], [u, 1 + v]]];
}
function materialAt(parsed: SkpModel, index: number, back: boolean): Material {
  const face = requireValue(parsed.root.faces[index], "writer/parser의 원본 면이 없습니다.");
  const id = back ? face.backMaterialId : face.materialId;
  return requireValue(id === null ? undefined : parsed.materialsById.get(id), "실제 원본 재질 참조가 없습니다.");
}
function side(material: Material, rgba: Rgba, direction: number, doubleSided = false, x = 0, u = 0, v = 0): SideExpectation {
  return { side: direction, x, rgba, alpha: material.color.a / 255 * material.transparency,
    rgb: [material.color.r / 255, material.color.g / 255, material.color.b / 255], shiftU: u, shiftV: v, doubleSided };
}
function fixtures(
  openskp: typeof import("openskp"), png: (rgba: Rgba) => Uint8Array,
  crc: (type: string, payload: Uint8Array) => number, check: (condition: boolean, message: string) => void,
): Fixture[] {
  const rawA = png(FIRST), rawB = png(SECOND), length = Math.max(rawA.length, rawB.length) + 20;
  const a = paddedPng(rawA, length, crc), b = paddedPng(rawB, length, crc);
  check(a.length === b.length && equal(Array.from(a.subarray(0, 16)), Array.from(b.subarray(0, 16))), "PNG 충돌 전제");
  check(!equal(Array.from(a), Array.from(b)), "PNG 전체 바이트가 실제로 달라야 합니다.");
  const specs = [
    { name: "back-uv", differentImage: false, shifted: true, opacity: 1, equivalent: false },
    { name: "back-image", differentImage: true, shifted: false, opacity: 1, equivalent: false },
    { name: "back-alpha", differentImage: false, shifted: false, opacity: 0.4, equivalent: false },
    { name: "equivalent-positive", differentImage: false, shifted: false, opacity: 1, equivalent: true },
  ];
  const result: Fixture[] = specs.map((spec) => {
    const builder = openskp.create(), backBytes = spec.differentImage ? b : Uint8Array.from(a);
    const front = builder.addTextureMaterial("front", a, "front.png", 1, 1, 1);
    const back = builder.addTextureMaterial("back", backBytes, "back.png", 1, 1, spec.opacity);
    builder.addFace(triangle(), { material: front, backMaterial: back, frontUv: pins(), backUv: pins(0, spec.shifted ? 0.25 : 0, spec.shifted ? 0.5 : 0) });
    const bytes = copyBuffer(builder.toBytes()), parsed = openskp.parseSkp(bytes);
    check(parsed.root.faces.length === 1, `${spec.name}: 유효 원본 면 수`);
    const original = requireValue(parsed.root.faces[0], "원본 면 누락");
    check(original.uvProjected === false && original.uvProjectedBack === false, "projected가 아닌 affine 원본");
    check(original.uvTransform !== null && original.uvTransformBack !== null, "공개 writer의 실제 앞뒤 pinned UV 행렬");
    check((JSON.stringify(original.uvTransform) !== JSON.stringify(original.uvTransformBack)) === spec.shifted, "앞뒤 원본 UV 전제");
    const fm = materialAt(parsed, 0, false), bm = materialAt(parsed, 0, true);
    const ft = requireValue(fm.texture, "원본 앞 텍스처 누락"), bt = requireValue(bm.texture, "원본 뒤 텍스처 누락");
    const frontData = requireValue(ft.data, "원본 앞 이미지 데이터 누락"), backData = requireValue(bt.data, "원본 뒤 이미지 데이터 누락");
    check(equal(Array.from(frontData), Array.from(a)) && equal(Array.from(backData), Array.from(backBytes)), "원본 앞뒤 image 바이트 전제");
    check(Math.abs(fm.transparency - 1) < 1e-6 && Math.abs(bm.transparency - spec.opacity) < 1e-6, "원본 앞뒤 alpha 전제");
    check(original.materialId !== original.backMaterialId, "다른 실제 material handle의 동치/차이 판정");
    check(equal([fm.color.r, fm.color.g, fm.color.b], [bm.color.r, bm.color.g, bm.color.b]), "앞뒤 같은 RGB 전제");
    const sides = [side(fm, FIRST, 1, spec.equivalent)];
    if (!spec.equivalent) sides.push(side(bm, spec.differentImage ? SECOND : FIRST, -1, false, 0, spec.shifted ? 0.25 : 0, spec.shifted ? 0.5 : 0));
    return { name: spec.name, bytes, sides, imageCount: spec.differentImage ? 2 : 1,
      sourceImages: [{ bytes: copyBuffer(a), rgba: FIRST }, ...(spec.differentImage ? [{ bytes: copyBuffer(b), rgba: SECOND }] : [])] };
  });
  const builder = openskp.create();
  // 공개 writer는 첫 면 이후 재질 추가를 금지하므로 두 재질을 모두 먼저 등록한다.
  const faces = [{ x: 0, image: a }, { x: 20, image: b }].map(({ x, image }) => ({
    x, material: builder.addTextureMaterial(`face-${x}`, image, `face-${x}.png`, 1, 1, 1),
  }));
  for (const { x, material } of faces) {
    builder.addFace(triangle(x), { material, backMaterial: material, frontUv: pins(x), backUv: pins(x) });
  }
  const bytes = copyBuffer(builder.toBytes()), parsed = openskp.parseSkp(bytes);
  check(parsed.root.faces.length === 2, "PNG 충돌 원본의 실제 두 면");
  result.push({ name: "png-prefix-collision", bytes, imageCount: 2,
    sourceImages: [{ bytes: copyBuffer(a), rgba: FIRST }, { bytes: copyBuffer(b), rgba: SECOND }],
    sides: [side(materialAt(parsed, 0, false), FIRST, 1, true), side(materialAt(parsed, 1, false), SECOND, 1, true, 20)] });
  return result;
}

/** 최종 GLB의 자체 포함 image bytes만 읽는다. 외부 URI와 잘린 view는 통과시키지 않는다. */
function embeddedImages(buffer: ArrayBuffer): { readonly bytes: ArrayBuffer; readonly mime: string }[] {
  const view = new DataView(buffer);
  if (buffer.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== buffer.byteLength || buffer.byteLength > 4 * 1024 * 1024) throw new Error("최종 GLB container가 잘못됐습니다.");
  let json: unknown, binary: ArrayBuffer | undefined, offset = 12;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) throw new Error("잘린 GLB chunk입니다.");
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true), end = offset + 8 + length;
    if (length % 4 !== 0 || end > buffer.byteLength) throw new Error("GLB chunk 범위가 잘못됐습니다.");
    if (type === 0x4e4f534a && offset === 12) json = JSON.parse(new TextDecoder().decode(buffer.slice(offset + 8, end)));
    else if (type === 0x004e4942 && binary === undefined) binary = buffer.slice(offset + 8, end);
    else throw new Error("예상하지 못한 GLB chunk입니다.");
    offset = end;
  }
  if (!record(json) || !Array.isArray(json.images) || !Array.isArray(json.bufferViews) || !binary) throw new Error("embedded image가 없습니다.");
  const views: readonly unknown[] = json.bufferViews, bin = binary;
  return json.images.map((image: unknown) => {
    if (!record(image) || !uint(image.bufferView) || image.uri !== undefined || image.mimeType !== "image/png") throw new Error("자체 포함 PNG가 아닙니다.");
    const imageView = views[image.bufferView];
    if (!record(imageView) || imageView.buffer !== 0 || !uint(imageView.byteLength)) throw new Error("image bufferView가 잘못됐습니다.");
    const start = imageView.byteOffset ?? 0;
    if (!uint(start) || start + imageView.byteLength > bin.byteLength) throw new Error("image 범위가 잘못됐습니다.");
    return { bytes: bin.slice(start, start + imageView.byteLength), mime: image.mimeType };
  });
}
function imagePixel(image: unknown): number[] {
  if (!(image instanceof HTMLImageElement || image instanceof HTMLCanvasElement
    || (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)
    || (typeof OffscreenCanvas !== "undefined" && image instanceof OffscreenCanvas))) throw new Error("실제 브라우저 이미지가 아닙니다.");
  if (image.width !== 1 || image.height !== 1) throw new Error("fixture 이미지 크기가 달라졌습니다.");
  const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
  const context = requireValue(canvas.getContext("2d", { willReadFrequently: true }), "2D 이미지 readback을 사용할 수 없습니다.");
  context.drawImage(image, 0, 0); return Array.from(context.getImageData(0, 0, 1, 1).data);
}
async function decodePixel(bytes: ArrayBuffer, mime: string, signal: AbortSignal): Promise<number[]> {
  abortIfNeeded(signal);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  try { abortIfNeeded(signal); return imagePixel(bitmap); } finally { bitmap.close(); }
}

function loadedTriangles(root: Group, three: ThreeModule) {
  const result: { material: MeshStandardMaterial; points: import("three").Vector3[]; normals: import("three").Vector3[]; uvs: number[][] }[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof three.Mesh)) return;
    const geometry = object.geometry;
    if (!(geometry instanceof three.BufferGeometry)) throw new Error("최종 메시의 BufferGeometry가 없습니다.");
    const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal"), uv = geometry.getAttribute("uv");
    if (!positions || !normals || !uv) throw new Error("최종 메시의 position/normal/UV가 없습니다.");
    const count = geometry.index?.count ?? positions.count, normalMatrix = new three.Matrix3().getNormalMatrix(object.matrixWorld);
    if (count % 3 !== 0 || count === 0) throw new Error("삼각형 index가 잘못됐습니다.");
    for (let start = 0; start < count; start += 3) {
      const groups = geometry.groups.filter((group) => start >= group.start && start + 3 <= group.start + group.count);
      if (Array.isArray(object.material) && groups.length !== 1) throw new Error("삼각형 재질 group을 확정할 수 없습니다.");
      const material = Array.isArray(object.material) ? object.material[requireValue(groups[0], "재질 group 누락").materialIndex ?? 0] : object.material;
      if (!(material instanceof three.MeshStandardMaterial)) throw new Error("최종 PBR 재질이 없습니다.");
      const indices = [0, 1, 2].map((delta) => geometry.index?.getX(start + delta) ?? start + delta);
      result.push({ material,
        points: indices.map((index) => new three.Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld)),
        normals: indices.map((index) => new three.Vector3().fromBufferAttribute(normals, index).applyNormalMatrix(normalMatrix)),
        uvs: indices.map((index) => [uv.getX(index), uv.getY(index)]) });
    }
  }); return result;
}
function inspectLoaded(root: Group, fixture: Fixture, three: ThreeModule, check: (condition: boolean, message: string) => void): TriangleProof[] {
  const triangles = loadedTriangles(root, three), unmatched = new Set(fixture.sides);
  check(triangles.length === fixture.sides.length, `${fixture.name}: 앞뒤 삼각형 수`);
  return triangles.map((item) => {
    const firstNormal = requireValue(item.normals[0], "법선 누락"), direction = Math.sign(firstNormal.y);
    const x = Math.min(...item.points.map((point) => point.x)) / 0.0254;
    const expected = requireValue([...unmatched].find((candidate) => candidate.side === direction && Math.abs(candidate.x - x) < 1e-4), "실제 삼각형과 원본 면의 대응이 없습니다.");
    unmatched.delete(expected);
    for (const normal of item.normals) check(Math.abs(normal.y - direction) < 1e-5 && Math.abs(normal.x) < 1e-5 && Math.abs(normal.z) < 1e-5, "앞뒤 법선");
    const [a, b, c] = item.points;
    const av = requireValue(a, "정점 A 누락"), bv = requireValue(b, "정점 B 누락"), cv = requireValue(c, "정점 C 누락");
    check(new three.Vector3().subVectors(bv, av).cross(new three.Vector3().subVectors(cv, av)).normalize().dot(firstNormal) > 0.99999, "winding과 법선 일치");
    for (const [index, point] of item.points.entries()) {
      const actualUv = requireValue(item.uvs[index], "UV 누락"), u = (point.x / 0.0254 - expected.x) / 10, v = -point.z / 0.0254 / 10;
      check(Math.abs(point.y) < 1e-6 && Math.abs(u - Math.round(u)) < 1e-5 && Math.abs(v - Math.round(v)) < 1e-5
        && u > -1e-5 && v > -1e-5 && u + v < 1.00001, "10 inch 삼각형 좌표·미터 단위");
      check(Math.abs(requireValue(actualUv[0], "U 누락") - u - expected.shiftU) < 1e-5
        && Math.abs(requireValue(actualUv[1], "V 누락") - v - expected.shiftV) < 1e-5, "원본 affine UV 보존");
    }
    const material = item.material, map = requireValue(material.map, "최종 재질의 실제 map 누락"), pixels = imagePixel(map.image);
    check(equal(pixels, expected.rgba), "삼각형 재질과 native decoded RGBA 대응");
    check(material.side === (expected.doubleSided ? three.DoubleSide : three.FrontSide), "양면/앞뒷면 재질 side");
    check(Math.abs(material.opacity - expected.alpha) < 1e-6 && material.transparent === (expected.alpha < 1), "PBR alpha 보존");
    check(equal(material.color.toArray(), expected.rgb) && material.metalness === 0 && Math.abs(material.roughness - 0.8) < 1e-6, "원본 RGB·PBR 보존");
    check(map.flipY === false && map.colorSpace === three.SRGBColorSpace && map.channel === 0, "glTF map 방향·색공간·UV 채널");
    map.updateMatrix(); check(map.matrix.equals(new three.Matrix3()), "숨은 texture transform 없이 UV 대응");
    return { side: direction, xInches: x, rgba: pixels, opacity: material.opacity, uvs: item.uvs };
  });
}

/** 제품 입력 옵션을 주입하지 않아 실제 기본 Worker client/factory를 사용한다. */
export async function runStudioBg3dSkpAppearanceProof(options: StudioBg3dSkpAppearanceProofOptions = {}): Promise<StudioBg3dSkpAppearanceProof> {
  if (active) throw new Error("이미 회귀가 실행 중입니다.");
  const controller = new AbortController(), signal = controller.signal, onAbort = () => controller.abort(); active = controller;
  const deadline = window.setTimeout(() => controller.abort(), 120_000);
  options.signal?.addEventListener("abort", onAbort, { once: true }); if (options.signal?.aborted) onAbort();
  setUi("running", "실제 Worker와 최종 GLB를 확인하는 중입니다.");
  let assertions = 0, phase = "runtime-check", currentFixture: string | null = null, sourceImageIndex: number | null = null;
  let currentReport: StudioBg3dSkpImportReport | null = null, currentFinalGlb: { sha256: string; byteLength: number } | null = null;
  const cases: CaseProof[] = [], sourcePngChecks: SourcePngProof[] = [];
  const check = (condition: boolean, message: string): void => { if (!condition) throw new Error(message); assertions += 1; };
  try {
    abortIfNeeded(signal); check(typeof Worker === "function" && typeof createImageBitmap === "function", "실제 Worker/native image decode가 필요합니다.");
    phase = "module-import";
    const [openskp, three, { GLTFLoader }, importer, encoder, { pngChunkCrc32 }, resources] = await Promise.all([
      import("openskp"), import("three"), import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("../../src/domains/creator/bg3d/studio-bg3d-model-import"),
      import("../../src/domains/creator/bg3d/studio-bg3d-scene-glb-exact-images"),
      import("../../src/domains/creator/studio-apng-encoder"), import("../../src/domains/creator/studio-background-3d-model"),
    ]);
    abortIfNeeded(signal);
    const png = (rgba: Rgba) => encoder.encodeStudioBg3dSceneGlbRgbaPng({ width: 1, height: 1, rgba: Uint8Array.from(rgba), signal, maximumBytes: 4096, maximumRgbaBytes: 4 });
    phase = "fixture-construction";
    const inputs = fixtures(openskp, png, pngChunkCrc32, check);
    for (const fixture of inputs) {
      currentFixture = fixture.name; currentReport = null; currentFinalGlb = null; phase = "source-png-native-decode";
      check(fixture.sourceImages.length === fixture.imageCount, "원본 PNG 검사 집합과 실제 image 수");
      for (const [index, image] of fixture.sourceImages.entries()) {
        abortIfNeeded(signal); sourceImageIndex = index;
        const proof: SourcePngProof = { fixture: fixture.name, imageIndex: index, sha256: await sha256(image.bytes), byteLength: image.bytes.byteLength, rgba: null };
        sourcePngChecks.push(proof); proof.rgba = await decodePixel(image.bytes, "image/png", signal);
        check(equal(proof.rgba, image.rgba), "제품 import 이전 원본 PNG의 native decoded RGBA");
      }
      sourceImageIndex = null; phase = "high-level-import";
      abortIfNeeded(signal); const reports: StudioBg3dSkpImportReport[] = [];
      const sourceSha256 = await sha256(fixture.bytes);
      const outputs = await importer.convertStudioBg3dModelFilesToGlb([new File([fixture.bytes], `${fixture.name}.skp`)], {
        signal, skp: { onReport: ({ report }) => { reports.push(report); currentReport = report; } },
      });
      abortIfNeeded(signal); check(outputs.length === 1 && reports.length === 1, "실제 변환 결과와 보고서 수");
      const report = requireValue(reports[0], "실제 변환 보고서 누락"); currentReport = report;
      check(report.conversion.execution === "worker" && report.conversion.textures === "embedded", "Worker 실행·텍스처 포함 실제 보고서");
      const bytes = await requireValue(outputs[0], "최종 GLB 누락").arrayBuffer();
      currentFinalGlb = { sha256: await sha256(bytes), byteLength: bytes.byteLength }; phase = "final-glb-embedded-native-decode";
      const images = embeddedImages(bytes), embeddedPixels: number[][] = [];
      check(images.length === fixture.imageCount, "최종 GLB embedded image 수·동치 공유");
      for (const image of images) embeddedPixels.push(await decodePixel(image.bytes, image.mime, signal));
      const expectedPixels = new Set(fixture.sides.map((item) => item.rgba.join(",")));
      check(new Set(embeddedPixels.map((item) => item.join(","))).size === fixture.imageCount, "불필요한 image 중복 없음");
      check(embeddedPixels.every((item) => expectedPixels.has(item.join(","))), "embedded image 실제 RGBA 집합");
      phase = "final-gltf-loader"; const loaded = await new GLTFLoader().parseAsync(bytes, "");
      try {
        phase = "final-loaded-appearance"; abortIfNeeded(signal);
        cases.push({ name: fixture.name, sourceSha256, finalGlbSha256: await sha256(bytes), finalGlbBytes: bytes.byteLength,
          report, embeddedPixels, triangles: inspectLoaded(loaded.scene, fixture, three, check) });
      } finally { resources.disposeStudioBg3dThreeResources(loaded.scenes); }
    }
    abortIfNeeded(signal); check(cases.length === 5, "실제 다섯 case 완료");
    const result: StudioBg3dSkpAppearanceProof = { scope: "browser-worker-loader-native-image-decode", gpu: false,
      workerLifecycleObservation: "separate-playwright-observation-required", assertions, cases, sourcePngChecks };
    setUi("passed", "5개 case가 실제 Worker·최종 loader·native 이미지 decode 검사를 통과했습니다.", result); return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setUi("failed", message, { phase, currentFixture, sourceImageIndex, assertions, cases, sourcePngChecks, currentReport, currentFinalGlb,
      error: { name: error instanceof Error ? error.name : "unknown", message } }); throw error;
  }
  finally { window.clearTimeout(deadline); options.signal?.removeEventListener("abort", onAbort); active = null; setButtons(false); }
}
function setButtons(running: boolean): void {
  const run = document.getElementById("run"), cancel = document.getElementById("cancel");
  if (run instanceof HTMLButtonElement) run.disabled = running; if (cancel instanceof HTMLButtonElement) cancel.disabled = !running;
}
function setUi(state: string, message: string, detail?: unknown): void {
  const status = document.getElementById("status"), output = document.getElementById("output");
  if (status) status.textContent = message;
  if (output) { output.dataset.state = state; output.textContent = detail === undefined ? "" : JSON.stringify(detail, null, 2); }
  setButtons(state === "running");
}
window.runStudioBg3dSkpAppearanceProof = runStudioBg3dSkpAppearanceProof;
document.getElementById("run")?.addEventListener("click", () => {
  void runStudioBg3dSkpAppearanceProof().catch((error: unknown) => {
    if (document.getElementById("output")?.dataset.state === "failed") return;
    const message = error instanceof Error ? error.message : String(error); setUi("failed", message, { error: message });
  });
});
document.getElementById("cancel")?.addEventListener("click", () => active?.abort());
