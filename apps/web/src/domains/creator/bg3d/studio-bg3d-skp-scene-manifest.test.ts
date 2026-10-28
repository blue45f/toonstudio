import { strToU8, zipSync } from "fflate";
import { create, parseSkp, type SkpModel } from "openskp";
import { describe, expect, it } from "vitest";

import {
  extractStudioBg3dSkpSceneManifest, parseStudioBg3dSkpSceneManifest, STUDIO_BG3D_SKP_MANIFEST_LIMITS,
  type StudioBg3dSkpManifestLimits, type StudioBg3dSkpManifestResult, type StudioBg3dSkpSceneManifest,
} from "./studio-bg3d-skp-scene-manifest";

function expectOk(result: StudioBg3dSkpManifestResult): StudioBg3dSkpSceneManifest {
  if (!result.ok) throw new Error(`${result.code} at ${result.path}: ${result.detail}`);
  return result.value;
}

function expectFailure(result: StudioBg3dSkpManifestResult, code: string, path?: string): void {
  if (result.ok) throw new Error(`expected ${code}, got a manifest`);
  expect(result.code).toBe(code);
  if (path) expect(result.path).toBe(path);
  expect("value" in result).toBe(false);
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** 작성기의 실제 MFC/v17 바이트로 중첩 컴포넌트와 태그·속성을 만든다. */
function legacyModel(): SkpModel {
  const builder = create();
  const hidden = builder.addLayer("가구", { hidden: true, color: [31, 63, 127] });
  const leg = builder.addComponentDefinition("다리", (definition) => {
    definition.addFace([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
  });
  const chair = builder.addComponentDefinition("의자", (definition) => {
    definition.addInstance(leg, { translation: [0, 0, 12], layer: hidden });
  });
  builder.addInstance(chair, { name: "A", translation: [100, 200, 300], rotation: { axis: [0, 0, 1], angleRadians: Math.PI / 2 },
    layer: hidden, hidden: true, attributes: { onclick: "ANIMATE(\"RotZ\", 0, 90)", label: "문" }, attributeDictName: "dynamic_attributes" });
  builder.addInstance(chair, { name: "B", translation: [-10, 0, 0] });
  return parseSkp(exactBuffer(builder.toBytes()));
}

function join(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

function tlv(tag: number, ...parts: readonly Uint8Array[]): Uint8Array {
  const payload = join(...parts), header = new Uint8Array(6), view = new DataView(header.buffer);
  view.setUint16(0, tag, true); view.setUint32(2, payload.byteLength, true);
  return join(header, payload);
}

function f64(...values: readonly number[]): Uint8Array {
  const result = new Uint8Array(values.length * 8), view = new DataView(result.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return result;
}

/** 배포된 parsePages가 실제로 읽는 VFF TLV와 ZIP 컨테이너다. 모델 객체를 흉내 내지 않는다. */
function vffModel(cameraDefaults = false): SkpModel {
  const page = (name: string, parallel: boolean, eye: readonly number[] | null) => tlv(29000,
    tlv(28500, tlv(28501, strToU8(name))),
    tlv(29002, tlv(13500,
      ...(eye ? [tlv(13501, f64(...eye))] : []), tlv(13502, f64(10, 20, 30)),
      ...(cameraDefaults ? [] : [tlv(13503, f64(0, 0, 1)), tlv(13506, new Uint8Array([parallel ? 0 : 1])), tlv(13507, f64(parallel ? 144 : 0)), tlv(13508, f64(47.5))]))),
    tlv(29008, new Uint8Array([1, 2, 1, 99])));
  const pages = tlv(0x0207, tlv(28000, tlv(28001,
    page("원근 컷", false, [100, -200, 300]), page("평행 컷", true, [0, 0, 500]), page("카메라 없는 장면", false, null))));
  const layers = tlv(0x3a99, tlv(0x3c8c, tlv(0x05dc, new Uint8Array([2])), tlv(0x3c8d, strToU8("지붕")), tlv(0x3c8e, new Uint8Array([1]))));
  const definition = tlv(0x157c, tlv(0x05de, new Uint8Array([42])), tlv(0x157e, strToU8("VFF 컴포넌트")));
  const root = tlv(0x01f6, tlv(0x1964, tlv(0x1967, new Uint8Array([42])), tlv(0x1965, strToU8("VFF 배치")),
    tlv(0x1966, f64(1, 0, 0, 0, 1, 0, 0, 0, 1, 101, 202, 303, 1)),
    tlv(0x07d0, tlv(0x07d2, new Uint8Array([2])), tlv(0x07d3, new Uint8Array([1])))));
  const zip = zipSync({
    "model.dat": join(pages, layers, definition, root),
    "meta/meta.dat": tlv(100, tlv(109, strToU8("Millimeter"))),
    "materials/layer/material.xml": strToU8('<material name="Layer_지붕" colorRed="10" colorGreen="20" colorBlue="30"/>'),
  });
  const version = "{21.0.339}", text = new Uint8Array(version.length * 2);
  const view = new DataView(text.buffer);
  for (let index = 0; index < version.length; index += 1) view.setUint16(index * 2, version.charCodeAt(index), true);
  const header = join(new Uint8Array([255, 254, 255, 14, 0, 0, 255, 254, 255, version.length]), text);
  return parseSkp(exactBuffer(join(header, zip)));
}

describe("SKP 원본 장면 manifest: 실제 parser 바이트", () => {
  it("실제 작성기→파서의 중첩 정의/배치를 한 번씩 보존하며 행렬을 미터나 Y-up으로 바꾸지 않는다", () => {
    const model = legacyModel(), manifest = expectOk(extractStudioBg3dSkpSceneManifest(model));
    expect(manifest).toMatchObject({ version: 1, parser: { name: "openskp", version: "1.3.0" }, sourceVersion: "{17.0.1}",
      declaredUnits: null, coordinates: { linearUnit: "inch", upAxis: "z", transforms: "definition-local" } });
    expect(manifest.definitions.total).toBe(3);
    expect(manifest.definitions.stored).toBe(3);
    expect(manifest.instances.total).toBe(3);
    expect(manifest.instances.stored).toBe(3);
    expect(manifest.definitions.sourceTotal).toBeNull();
    expect(manifest.instances.items.filter(({ parentDefinitionKey }) => parentDefinitionKey === "root")).toHaveLength(2);
    const rootInstance = manifest.instances.items[0];
    expect(rootInstance?.transform.layout).toBe("openskp-row-major-3x3-translation-w");
    expect(rootInstance?.transform.values?.slice(9, 12)).toEqual([100, 200, 300]);
    expect(rootInstance?.transform.values?.[0]).toBeCloseTo(0, 12);
    expect(rootInstance?.transform.values?.[1]).toBeCloseTo(-1, 12);
    expect(rootInstance?.transform.values?.[3]).toBeCloseTo(1, 12);
    expect(rootInstance?.hidden).toBe(true);
    expect(rootInstance?.layer).toBe("가구");
    expect(rootInstance?.properties).toMatchObject({ onclick: 'ANIMATE("RotZ", 0, 90)', label: "문" });
    const chairKey = rootInstance?.referencedDefinitionKey;
    expect(manifest.instances.items.some(({ parentDefinitionKey }) => parentDefinitionKey === chairKey)).toBe(true);
    expect(manifest.tags.items.find(({ name }) => name === "가구")).toMatchObject({ hidden: true, sourceId: null, color: [31, 63, 127] });
    expect(manifest.pages).toEqual({ total: 0, stored: 0, sourceTotal: null, items: [] });
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });

  it("실제 VFF 장면의 카메라/투영/숨김 태그를 보존하고 파서가 생략한 카메라 없는 장면의 총수는 모른다고 기록한다", () => {
    const model = vffModel();
    expect(model.pages).toHaveLength(2);
    const manifest = expectOk(extractStudioBg3dSkpSceneManifest(model));
    expect(manifest.declaredUnits).toBe("Millimeter");
    expect(manifest.coordinates.linearUnit).toBe("inch");
    expect(manifest.pages).toMatchObject({ total: 2, stored: 2, sourceTotal: null });
    expect(manifest.pages.items[0]).toEqual({ key: "page:0", name: "원근 컷", eye: [100, -200, 300], target: [10, 20, 30], up: [0, 0, 1],
      fov: 47.5, fovBasis: "not-exposed", parallel: false, orthoHeight: 0, hiddenLayers: ["지붕"], savedStateFlags: "not-exposed", fieldPresence: "parser-values-may-include-defaults" });
    expect(manifest.pages.items[1]).toMatchObject({ parallel: true, orthoHeight: 144 });
    expect(manifest.tags.items.find(({ name }) => name === "지붕")).toMatchObject({ hidden: true, color: [10, 20, 30] });
    expect(manifest.instances.items[0]).toMatchObject({ layer: "지붕", hidden: true, properties: {}, dynamicPropertiesCoverage: "parse-stage-only" });
    expect(manifest.diagnostics.map(({ code }) => code)).toContain("camera-less-pages-not-exposed");
    expect(manifest.diagnostics.map(({ code }) => code)).toContain("scene-state-flags-unavailable");
    expect(manifest.diagnostics.map(({ code }) => code)).toContain("camera-fov-basis-not-exposed");
    expect(manifest.diagnostics.map(({ code }) => code)).toContain("dynamic-attributes-parse-stage-only");
  });

  it("서로 다른 배치의 GUID가 비어 있어도 정의+순서 key로 구분하고 계층을 이름으로 추측하지 않는다", () => {
    const model = legacyModel();
    const manifest = expectOk(extractStudioBg3dSkpSceneManifest(model));
    expect(new Set(manifest.instances.items.map(({ key }) => key)).size).toBe(3);
    expect(manifest.instances.items.every(({ guid }) => guid === "")).toBe(true);
    expect(manifest.instances.items[0]?.referencedDefinitionKey).toBe(manifest.instances.items[1]?.referencedDefinitionKey);
    expect(manifest.diagnostics.map(({ code }) => code)).toContain("definition-local-records-not-expanded");
  });

  it("실제 parser가 보충한 기본 화각/투영과 미노출 up을 원본 저장 상태로 단정하지 않는다", () => {
    const model = vffModel(true), manifest = expectOk(extractStudioBg3dSkpSceneManifest(model));
    expect(model.pages[0]).toMatchObject({ fov: 35, parallel: false, orthoHeight: 0, up: null });
    expect(manifest.pages.items[0]).toMatchObject({ fov: 35, parallel: false, orthoHeight: 0, up: null,
      savedStateFlags: "not-exposed", fieldPresence: "parser-values-may-include-defaults" });
    expect(manifest.diagnostics.map(({ code }) => code)).toContain("parser-field-presence-unknown");
    // 파서가 이름을 찾지 못한 태그 ID 99는 이미 노출 목록에 없다. 원본 수를 복원했다고 주장하지 않는다.
    expect(manifest.pages.items[0]?.hiddenLayers).toEqual(["지붕"]);
    expect(manifest.tags.sourceTotal).toBeNull();
  });
});

describe("SKP 원본 장면 manifest: 손실과 입력 검증", () => {
  it("파서가 노출하는 주석/보조선/단면/스타일을 원형 보존하고 위치 미노출은 채우지 않는다", () => {
    const model = legacyModel();
    const source = { ...model, root: { ...model.root,
      texts: [{ text: "말풍선 위치", hidden: true }],
      sectionPlanes: [{ name: "평면", label: "A", plane: [0, 0, 1, -100], hidden: false }],
      dimensions: [{ text: "legacy", hidden: false, a: null, b: null, offset: 0, planeX: null, normal: null }],
      constructionLines: [{ point: [1, 2, 3], direction: [1, 0, 0], start: null, end: [100, 2, 3] }],
      constructionPoints: [{ position: [100, 200, 300] }],
    }, dimensions: [{ text: "world", hidden: false, a: [0, 0, 0], b: [100, 0, 0], offset: 10, planeX: [1, 0, 0], normal: [0, 0, 1] }],
    styles: [{ name: "웹툰", frontColor: [255, 255, 255], backColor: null }] };
    const manifest = expectOk(extractStudioBg3dSkpSceneManifest(source));
    expect(manifest.annotations.total).toBe(6);
    expect(manifest.annotations.items.find(({ kind }) => kind === "text")).toMatchObject({ text: "말풍선 위치", hidden: true, anchor: "not-exposed" });
    expect(manifest.annotations.items.find(({ kind }) => kind === "section-plane")).toMatchObject({ plane: [0, 0, 1, -100], active: "not-exposed" });
    expect(manifest.annotations.items.find((item) => item.kind === "dimension" && item.space === "definition-local")).toMatchObject({ a: null, b: null });
    expect(manifest.annotations.items.find((item) => item.kind === "dimension" && item.space === "model-world")).toMatchObject({ parentDefinitionKey: null, b: [100, 0, 0] });
    expect(manifest.annotations.items.find(({ kind }) => kind === "construction-line")).toMatchObject({ start: null, end: [100, 2, 3] });
    expect(manifest.styles.items).toEqual([{ key: "style:0", name: "웹툰", frontColor: [255, 255, 255], backColor: null }]);
  });

  it("비어 있는 원본 행렬과 끊어진 참조를 identity나 가짜 정의로 채우지 않는다", () => {
    const model = legacyModel(), first = model.root.instances[0];
    if (!first) throw new Error("missing fixture instance");
    const source = { ...model, root: { ...model.root, instances: [{ ...first, matrix: [], refIdx: 999 }] } };
    const manifest = expectOk(extractStudioBg3dSkpSceneManifest(source));
    expect(manifest.instances.items[0]).toMatchObject({ referencedDefinitionId: 999, referencedDefinitionKey: null, transform: { layout: "unavailable", values: null } });
    expect(manifest.diagnostics).toContainEqual({ code: "matrix-unavailable", path: "root.instances[0].matrix" });
    expect(manifest.diagnostics).toContainEqual({ code: "definition-reference-missing", path: "root.instances[0].refIdx" });
  });

  it("16원소 행렬은 13원소와 별도 형식으로 보존한다", () => {
    const model = legacyModel(), first = model.root.instances[0];
    if (!first) throw new Error("missing fixture instance");
    const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 200, 300, 1];
    const source = { ...model, root: { ...model.root, instances: [{ ...first, matrix }] } };
    expect(expectOk(extractStudioBg3dSkpSceneManifest(source)).instances.items[0]?.transform).toEqual({ layout: "column-major-4x4", values: matrix });
  });

  it.each([null, undefined, 4, [], {}, { definitions: new Map() }])("불완전한 metadata는 빈 장면 성공으로 바꾸지 않는다: %s", (source) => {
    expectFailure(extractStudioBg3dSkpSceneManifest(source), "invalid-source");
  });

  it("숫자/배열/문자열 타입 오류를 정확한 경로의 실패로 반환한다", () => {
    const source = vffModel(), page = source.pages[0];
    if (!page) throw new Error("missing page");
    expectFailure(extractStudioBg3dSkpSceneManifest({ ...source, pages: [{ ...page, eye: [1, Infinity, 3] }] }), "invalid-source", "pages[0].eye");
    expectFailure(extractStudioBg3dSkpSceneManifest({ ...source, pages: [{ ...page, eye: [1, 2] }] }), "invalid-source", "pages[0].eye");
    expectFailure(extractStudioBg3dSkpSceneManifest({ ...source, pages: [{ ...page, eye: [1, 2, 3, 4] }] }), "invalid-source", "pages[0].eye");
    expectFailure(extractStudioBg3dSkpSceneManifest({ ...source, pages: [{ ...page, name: 42 }] }), "invalid-source", "pages[0].name");
    expectFailure(extractStudioBg3dSkpSceneManifest({ ...source, pages: [{ ...page, parallel: "false" }] }), "invalid-source", "pages[0].parallel");
    expectFailure(extractStudioBg3dSkpSceneManifest({ ...source, pages: [{ ...page, fov: NaN }] }), "invalid-source", "pages[0].fov");
  });

  it("지원하지 않는 길이와 비유한 행렬/속성을 보존 성공으로 통과시키지 않는다", () => {
    const model = legacyModel(), first = model.root.instances[0];
    if (!first) throw new Error("missing fixture instance");
    for (const matrix of [Array.from({ length: 12 }, () => 0), Array.from({ length: 17 }, () => 0), [...first.matrix.slice(0, 12), NaN]]) {
      expectFailure(extractStudioBg3dSkpSceneManifest({ ...model, root: { ...model.root, instances: [{ ...first, matrix }] } }), "invalid-source");
    }
    expectFailure(extractStudioBg3dSkpSceneManifest({ ...model, root: { ...model.root, instances: [{ ...first, properties: { onclick: 123 } }] } }), "invalid-source");
  });

  it("희소 metadata 배열을 건너뛰거나 JSON null 항목을 typed 성공으로 반환하지 않는다", () => {
    const model = legacyModel(), hole = new Array<unknown>(1), first = model.root.instances[0];
    if (!first) throw new Error("missing fixture instance");
    for (const field of ["pages", "layers", "styles", "dimensions"]) {
      expectFailure(extractStudioBg3dSkpSceneManifest({ ...model, [field]: hole }), "invalid-source", `${field}[0]`);
    }
    expectFailure(extractStudioBg3dSkpSceneManifest({ ...model, root: { ...model.root, instances: hole } }), "invalid-source", "root.instances[0]");
    expectFailure(extractStudioBg3dSkpSceneManifest({ ...model, root: { ...model.root, texts: hole } }), "invalid-source", "root.texts[0]");
    const matrix = new Array<unknown>(13);
    expectFailure(extractStudioBg3dSkpSceneManifest({ ...model, root: { ...model.root, instances: [{ ...first, matrix }] } }), "invalid-source", "root.instances[0].matrix[0]");
  });

  it("입력의 getter 예외와 잘못된 Map key를 데이터가 노출되지 않는 실패로 변환한다", () => {
    const model = legacyModel();
    expectFailure(extractStudioBg3dSkpSceneManifest({ get root() { throw new Error("비공개 원문"); } }), "invalid-source", "$model");
    const definition = [...model.definitions.values()][0];
    if (!definition) throw new Error("missing definition");
    expectFailure(extractStudioBg3dSkpSceneManifest({ ...model, definitions: new Map([[999, definition]]) }), "invalid-source", "definition:999");
  });

  it("순환 참조를 재귀 확장하지 않고 실패하며 원본을 바꾸지 않는다", () => {
    const model = legacyModel(), definition = [...model.definitions.values()][0], first = model.root.instances[0];
    if (!definition || !first) throw new Error("missing fixture records");
    const circular = { ...definition, instances: [{ ...first, refIdx: definition.id }] };
    const source = { ...model, definitions: new Map([[definition.id, circular]]) };
    const before = JSON.stringify(circular);
    expectFailure(extractStudioBg3dSkpSceneManifest(source), "invalid-source", "instances");
    expect(JSON.stringify(circular)).toBe(before);
  });

  it("출력 배열/사전은 원본 metadata와 분리돼 나중 입력 변경이 결과를 바꾸지 않는다", () => {
    const model = legacyModel(), manifest = expectOk(extractStudioBg3dSkpSceneManifest(model));
    const before = JSON.stringify(manifest), instance = model.root.instances[0];
    if (!instance) throw new Error("missing fixture instance");
    instance.matrix[9] = -999; instance.properties.onclick = "changed";
    model.layers.push({ name: "나중 태그", color: { r: 0, g: 0, b: 0 }, hidden: false });
    expect(JSON.stringify(manifest)).toBe(before);
  });
});

describe("SKP 원본 장면 manifest: 제한 초과를 조용히 잘라내지 않는다", () => {
  const cases: readonly (readonly [string, Partial<StudioBg3dSkpManifestLimits>])[] = [
    ["pages", { maxPages: 1 }], ["layers", { maxTags: 1 }], ["definitions", { maxDefinitions: 1 }],
    ["instances", { maxInstances: 2 }], ["$serialized", { maxSerializedBytes: 256 }],
  ];
  it.each(cases)("%s 예산 초과는 partial success 없이 전체 실패", (path, limits) => {
    expectFailure(extractStudioBg3dSkpSceneManifest(path === "instances" ? legacyModel() : vffModel(), limits), "budget-exceeded", path);
  });

  it("문자열의 UTF-8 바이트 수와 속성 수 예산도 적용한다", () => {
    const model = legacyModel();
    expectFailure(extractStudioBg3dSkpSceneManifest(model, { maxPropertyEntries: 1 }), "budget-exceeded");
    expectFailure(extractStudioBg3dSkpSceneManifest(model, { maxStringBytes: 3 }), "budget-exceeded");
    expectFailure(extractStudioBg3dSkpSceneManifest(model, { maxTotalStringBytes: 1 }), "budget-exceeded");
    const manifest = expectOk(extractStudioBg3dSkpSceneManifest(model));
    const bytes = new TextEncoder().encode(JSON.stringify(manifest)).byteLength;
    expectOk(extractStudioBg3dSkpSceneManifest(model, { maxSerializedBytes: bytes }));
    expectFailure(extractStudioBg3dSkpSceneManifest(model, { maxSerializedBytes: bytes - 1 }), "budget-exceeded", "$serialized");
  });

  it("주석과 스타일도 집계 한도를 넘으면 앞부분만 남기지 않는다", () => {
    const model = legacyModel();
    const source = { ...model, root: { ...model.root, texts: [{ text: "A", hidden: false }, { text: "B", hidden: false }] } };
    expectFailure(extractStudioBg3dSkpSceneManifest(source, { maxAnnotations: 1 }), "budget-exceeded", "root.texts");
    const styles = [{ name: "A", frontColor: null, backColor: null }, { name: "B", frontColor: null, backColor: null }];
    expectFailure(extractStudioBg3dSkpSceneManifest({ ...model, styles }, { maxStyles: 1 }), "budget-exceeded", "styles");
  });

  it("독성 속성명은 추출 단계부터 명시적으로 거부한다", () => {
    const model = legacyModel(), first = model.root.instances[0];
    if (!first) throw new Error("missing fixture instance");
    const properties = Object.fromEntries([["__proto__", "source text"], ["constructor", "source constructor"]]);
    const source = { ...model, root: { ...model.root, instances: [{ ...first, properties }] } };
    expectFailure(extractStudioBg3dSkpSceneManifest(source), "invalid-source", "root.instances[0].properties");
  });

  it("호출자가 제한을 낮출 수 있지만 비정수·0·상한 증가로 검증을 끄지 못한다", () => {
    for (const maxPages of [0, 1.5, NaN, STUDIO_BG3D_SKP_MANIFEST_LIMITS.maxPages + 1]) {
      expectFailure(extractStudioBg3dSkpSceneManifest(legacyModel(), { maxPages }), "invalid-source", "options.maxPages");
    }
  });
});

function annotatedManifest(): StudioBg3dSkpSceneManifest {
  const model = legacyModel();
  return expectOk(extractStudioBg3dSkpSceneManifest({ ...model, root: { ...model.root,
    sectionPlanes: [{ plane: [0, 0, 1, -10], name: "단면", label: "A", hidden: true }], texts: [{ text: "주석", hidden: false }],
    dimensions: [{ text: "로컬", hidden: true, a: null, b: null, offset: 0, planeX: null, normal: null }],
    constructionLines: [{ point: [1, 2, 3], direction: [1, 0, 0], start: null, end: [10, 2, 3] }],
    constructionPoints: [{ position: [4, 5, 6] }],
  }, dimensions: [{ text: "월드", hidden: false, a: [0, 0, 0], b: [10, 0, 0], offset: 2, planeX: [1, 0, 0], normal: [0, 0, 1] }],
  styles: [{ name: "스타일", frontColor: [255, 254, 253], backColor: null }] }));
}

describe("SKP manifest 신뢰 경계: 형식과 손실 정보 보존", () => {
  const cases: readonly (readonly [string, () => StudioBg3dSkpSceneManifest])[] = [
    ["MFC 중첩/동적 속성", () => expectOk(extractStudioBg3dSkpSceneManifest(legacyModel()))],
    ["VFF 카메라/태그", () => expectOk(extractStudioBg3dSkpSceneManifest(vffModel()))],
    ["VFF 파서 기본값", () => expectOk(extractStudioBg3dSkpSceneManifest(vffModel(true)))],
    ["모든 주석/스타일", annotatedManifest],
  ];
  it.each(cases)("%s를 Worker clone 및 JSON 저장 복원 후 동일하게 검증한다", (_label, create) => {
    const original = create(), json: unknown = JSON.parse(JSON.stringify(original));
    expect(expectOk(parseStudioBg3dSkpSceneManifest(structuredClone(original)))).toEqual(original);
    expect(expectOk(parseStudioBg3dSkpSceneManifest(json))).toEqual(original);
  });

  it("sourceVersion unknown과 실제 미노출 행렬/참조를 필수 진단과 함께 그대로 돌려준다", () => {
    const model = legacyModel(), first = model.root.instances[0];
    if (!first) throw new Error("fixture missing");
    const original = expectOk(extractStudioBg3dSkpSceneManifest({ ...model, version: "unknown", root: { ...model.root, instances: [{ ...first, matrix: [], refIdx: 999 }] } }));
    expect(expectOk(parseStudioBg3dSkpSceneManifest(original))).toEqual(original);
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...original, diagnostics: original.diagnostics.filter(({ code }) => code !== "matrix-unavailable") }), "invalid-source", "diagnostics");
  });

  it("원본 문자열 제한을 낮춰도 같은 설정의 추출 성공은 같은 설정으로 검증된다", () => {
    const builder = create();
    builder.addFace([[0, 0, 0], [10, 0, 0], [0, 10, 0]]);
    const model = parseSkp(exactBuffer(builder.toBytes())), options = { maxStringBytes: 32 };
    const manifest = expectOk(extractStudioBg3dSkpSceneManifest(model, options));
    expect(expectOk(parseStudioBg3dSkpSceneManifest(manifest, options))).toEqual(manifest);
  });

  it("16원소 형식을 저장 후에도 13원소로 바꾸지 않는다", () => {
    const model = legacyModel(), first = model.root.instances[0];
    if (!first) throw new Error("fixture missing");
    const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1];
    const original = expectOk(extractStudioBg3dSkpSceneManifest({ ...model, root: { ...model.root, instances: [{ ...first, matrix }] } }));
    expect(expectOk(parseStudioBg3dSkpSceneManifest(original))).toEqual(original);
  });

  it("null prototype의 JSON record를 허용하고 반환 객체를 입력과 분리한다", () => {
    const original = expectOk(extractStudioBg3dSkpSceneManifest(vffModel())), first = original.pages.items[0];
    if (!first) throw new Error("fixture missing");
    const eye = [100, 200, 300];
    const input: unknown = Object.assign(Object.create(null), original, { pages: { ...original.pages, items: [{ ...first, eye }, ...original.pages.items.slice(1)] } });
    const result = expectOk(parseStudioBg3dSkpSceneManifest(input));
    eye[0] = -999;
    expect(result.pages.items[0]?.eye).toEqual([100, 200, 300]);
    expect(result.pages.items[0]).not.toBe(first);
  });

  it("원본 parseSkp 입력과 manifest 입력을 서로 다른 형식으로 다룬다", () => {
    const model = legacyModel(), manifest = expectOk(extractStudioBg3dSkpSceneManifest(model));
    expectFailure(parseStudioBg3dSkpSceneManifest(model), "invalid-source");
    expectFailure(extractStudioBg3dSkpSceneManifest(manifest), "invalid-source");
  });
});

describe("SKP manifest 신뢰 경계: 계약 일관성", () => {
  it("version/parser/좌표계/원본 버전의 변조나 임의 필드를 거부한다", () => {
    const m = expectOk(extractStudioBg3dSkpSceneManifest(vffModel()));
    const invalid: readonly unknown[] = [
      { ...m, version: 2 }, { ...m, parser: { name: "other", version: "1.3.0" } }, { ...m, parser: { name: "openskp", version: "1.4.0" } },
      { ...m, coordinates: { ...m.coordinates, linearUnit: "meter" } }, { ...m, coordinates: { ...m.coordinates, upAxis: "y" } },
      { ...m, coordinates: { ...m.coordinates, transforms: "world" } }, { ...m, coverage: "complete" }, { ...m, sourceVersion: "unspecified" },
      { ...m, rootDefinitionKey: "fake" }, { ...m, extra: "unversioned" },
    ];
    for (const value of invalid) expectFailure(parseStudioBg3dSkpSceneManifest(value), "invalid-source");
  });

  it("total/stored/sourceTotal과 실제 배열 길이는 서로 일치해야 한다", () => {
    const m = expectOk(extractStudioBg3dSkpSceneManifest(vffModel()));
    for (const pages of [{ ...m.pages, total: 3 }, { ...m.pages, stored: 1 }, { ...m.pages, total: 1.5 }, { ...m.pages, sourceTotal: 2 }]) {
      expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, pages }), "invalid-source");
    }
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, pages: { ...m.pages, total: 3 } }), "invalid-source", "pages");
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, definitions: { total: 0, stored: 0, sourceTotal: null, items: [] } }), "invalid-source", "definitions");
  });

  it("순서 key·고유 정의 ID·부모·대상 참조를 검증한다", () => {
    const m = expectOk(extractStudioBg3dSkpSceneManifest(vffModel())), page = m.pages.items[0], tag = m.tags.items[0], d = m.definitions.items[1], i = m.instances.items[0];
    if (!page || !tag || !d || !i) throw new Error("fixture missing");
    const invalid: readonly unknown[] = [
      { ...m, pages: { ...m.pages, items: [{ ...page, key: "page:8" }, ...m.pages.items.slice(1)] } },
      { ...m, tags: { ...m.tags, items: [{ ...tag, sourceId: 42 }, ...m.tags.items.slice(1)] } },
      { ...m, definitions: { ...m.definitions, total: 3, stored: 3, items: [...m.definitions.items, d] } },
      { ...m, definitions: { ...m.definitions, items: [{ ...m.definitions.items[0], sourceId: 1 }, d] } },
      { ...m, instances: { ...m.instances, items: [{ ...i, key: "root/instance:8" }] } },
      { ...m, instances: { ...m.instances, items: [{ ...i, parentDefinitionKey: "definition:999" }] } },
      { ...m, instances: { ...m.instances, items: [{ ...i, referencedDefinitionKey: "definition:999" }] } },
      { ...m, instances: { ...m.instances, items: [{ ...i, referencedDefinitionId: 999 }] } },
    ];
    for (const value of invalid) expectFailure(parseStudioBg3dSkpSceneManifest(value), "invalid-source");
  });

  it("배치 순서 및 참조 cycle도 검증하며 저장 형태를 실제로 확장하지 않는다", () => {
    const m = expectOk(extractStudioBg3dSkpSceneManifest(legacyModel())), first = m.instances.items[0];
    if (!first || !first.referencedDefinitionKey) throw new Error("fixture missing");
    const parent = first.referencedDefinitionKey;
    const self = { ...first, key: `${parent}/instance:0`, parentDefinitionKey: parent };
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, instances: { total: 1, stored: 1, sourceTotal: null, items: [self] } }), "invalid-source", "instances");
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, instances: { ...m.instances, items: [...m.instances.items].reverse() } }), "invalid-source");
  });

  it("행렬 선언/값 길이와 parser unknown 상태를 바꾸지 못한다", () => {
    const m = expectOk(extractStudioBg3dSkpSceneManifest(vffModel())), first = m.instances.items[0], page = m.pages.items[0];
    if (!first || !page) throw new Error("fixture missing");
    for (const transform of [{ ...first.transform, layout: "column-major-4x4" }, { layout: "unavailable", values: [] }, { layout: "openskp-row-major-3x3-translation-w", values: [] }]) {
      expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, instances: { ...m.instances, items: [{ ...first, transform }] } }), "invalid-source");
    }
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, pages: { ...m.pages, items: [{ ...page, savedStateFlags: "saved" }, ...m.pages.items.slice(1)] } }), "invalid-source");
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, pages: { ...m.pages, items: [{ ...page, fovBasis: "vertical" }, ...m.pages.items.slice(1)] } }), "invalid-source");
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, instances: { ...m.instances, items: [{ ...first, dynamicPropertiesCoverage: "complete" }] } }), "invalid-source");
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, diagnostics: m.diagnostics.slice(1) }), "invalid-source", "diagnostics");
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, diagnostics: [...m.diagnostics, m.diagnostics[0]] }), "invalid-source");
  });

  it("주석의 부모/종류/key/좌표공간과 스타일 색상도 검증한다", () => {
    const m = annotatedManifest(), first = m.annotations.items[0], style = m.styles.items[0];
    if (!first || !style) throw new Error("fixture missing");
    for (const annotation of [{ ...first, parentDefinitionKey: null }, { ...first, kind: "unknown" }, { ...first, key: "root/sectionPlanes:9" }]) {
      expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, annotations: { ...m.annotations, items: [annotation, ...m.annotations.items.slice(1)] } }), "invalid-source");
    }
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, styles: { ...m.styles, items: [{ ...style, frontColor: [256, 0, 0] }] } }), "invalid-source");
    const items = m.annotations.items.map((item) => item.kind === "dimension" ? { ...item, space: item.space === "model-world" ? "definition-local" : "model-world" } : item);
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, annotations: { ...m.annotations, items } }), "invalid-source");
  });
});

describe("SKP manifest 신뢰 경계: JSON 안전성과 예산", () => {
  it("getters/toJSON을 실행하지 않고 지원하지 않는 JavaScript 값을 거부한다", () => {
    const m = expectOk(extractStudioBg3dSkpSceneManifest(vffModel()));
    let calls = 0;
    const accessor = Object.defineProperty({ ...m }, "version", { enumerable: true, get: () => { calls += 1; return 1; } });
    const values: readonly unknown[] = [accessor, { ...m, toJSON: () => { calls += 1; return m; } },
      { ...m, extra: undefined }, { ...m, extra: BigInt(1) }, { ...m, extra: Symbol("x") }, { ...m, extra: NaN },
      { ...m, extra: new Date() }, { ...m, extra: new Map() }, { ...m, extra: new Uint8Array(1) }, Object.assign(Object.create({ inherited: true }), m)];
    for (const value of values) expectFailure(parseStudioBg3dSkpSceneManifest(value), "invalid-source");
    expect(calls).toBe(0);
  });

  it("독성 키/숨은 필드/심볼 키/순환/과도한 중첩은 거부한다", () => {
    const m = expectOk(extractStudioBg3dSkpSceneManifest(vffModel())), cyclic: Record<string, unknown> = { ...m };
    cyclic.extra = cyclic;
    const hidden = Object.defineProperty({ ...m }, "hidden", { value: 1, enumerable: false });
    const symbol = { ...m, [Symbol("hidden")]: 1 };
    const values: unknown[] = [cyclic, hidden, symbol];
    for (const toxic of ["__proto__", "constructor", "prototype"]) values.push({ ...m, ...Object.fromEntries([[toxic, "unsafe"]]) });
    let deep: unknown = 0;
    for (let index = 0; index < 30; index += 1) deep = { deep };
    values.push({ ...m, extra: deep });
    for (const value of values) expectFailure(parseStudioBg3dSkpSceneManifest(value), "invalid-source");
  });

  it("희소 배열 및 배열의 추가 속성도 기록 손실 없이 거부한다", () => {
    const m = expectOk(extractStudioBg3dSkpSceneManifest(vffModel())), extra = Object.assign([...m.pages.items], { extra: 1 });
    const sparse = new Array<unknown>(m.pages.total);
    for (const items of [extra, sparse]) expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, pages: { ...m.pages, items } }), "invalid-source");
    expectFailure(parseStudioBg3dSkpSceneManifest({ ...m, pages: { ...m.pages, items: new Array<unknown>(1_000_000) } }), "budget-exceeded");
  });

  it("최종 JSON 바이트를 정확히 계산하며 collection/문자열/속성 한도를 다시 검사한다", () => {
    const m = expectOk(extractStudioBg3dSkpSceneManifest(legacyModel())), bytes = new TextEncoder().encode(JSON.stringify(m)).byteLength;
    expectOk(parseStudioBg3dSkpSceneManifest(m, { maxSerializedBytes: bytes }));
    expectFailure(parseStudioBg3dSkpSceneManifest(m, { maxSerializedBytes: bytes - 1 }), "budget-exceeded");
    expectFailure(parseStudioBg3dSkpSceneManifest(m, { maxInstances: 2 }), "budget-exceeded");
    expectFailure(parseStudioBg3dSkpSceneManifest(m, { maxPropertyEntries: 1 }), "budget-exceeded");
    expectFailure(parseStudioBg3dSkpSceneManifest(m, { maxTotalStringBytes: 1 }), "budget-exceeded");
    expectFailure(parseStudioBg3dSkpSceneManifest(m, { maxStringBytes: 3 }), "budget-exceeded");
    expectFailure(parseStudioBg3dSkpSceneManifest(m, { maxPages: Infinity }), "invalid-source", "options.maxPages");
  });
});
