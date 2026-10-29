/**
 * OpenSKP 1.3.0 parseSkp 결과의 원본 좌표 메타데이터. 형상·텍스처 바이트는 복제하지 않는다.
 * 인치/Z-up 값과 파서의 미노출·기본값 한계를 기록하며, 미터/Y-up 변환과 런타임 복원은 다른 권위가 맡는다.
 * 전체 수는 파서가 노출한 기록 수다. 파일에서 파서가 놓친 기록의 수를 0이라고 추정하지 않는다.
 */

export type StudioBg3dSkpSourceVec3 = readonly [number, number, number];
export type StudioBg3dSkpSourcePlane = readonly [number, number, number, number];
export type StudioBg3dSkpSourceMatrix13 = readonly [number, number, number, number, number, number, number, number, number, number, number, number, number];
export type StudioBg3dSkpSourceMatrix16 = readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

export type StudioBg3dSkpSourceTransform =
  | { readonly layout: "openskp-row-major-3x3-translation-w"; readonly values: StudioBg3dSkpSourceMatrix13 }
  | { readonly layout: "column-major-4x4"; readonly values: StudioBg3dSkpSourceMatrix16 }
  | { readonly layout: "unavailable"; readonly values: null };

export interface StudioBg3dSkpManifestCollection<T> {
  readonly total: number;
  readonly stored: number;
  /** 원본 파일 전체 수는 파서가 제공하지 않는다. */
  readonly sourceTotal: null;
  readonly items: readonly T[];
}

export interface StudioBg3dSkpManifestPage {
  /** 이 key는 manifest 순서에서 만든 식별자이며 SketchUp 영구 ID가 아니다. */
  readonly key: string;
  readonly name: string;
  /** eye/target은 모델 월드 좌표(인치, Z-up), up은 Z-up 방향이다. */
  readonly eye: StudioBg3dSkpSourceVec3 | null;
  readonly target: StudioBg3dSkpSourceVec3 | null;
  readonly up: StudioBg3dSkpSourceVec3 | null;
  /** 각도 단위는 도(degree)지만 fov_is_height/aspectRatio는 미노출이다. 세로 화각으로 추정하지 않는다. */
  readonly fov: number;
  readonly fovBasis: "not-exposed";
  readonly parallel: boolean;
  readonly orthoHeight: number;
  readonly hiddenLayers: readonly string[];
  readonly savedStateFlags: "not-exposed";
  readonly fieldPresence: "parser-values-may-include-defaults";
}

export interface StudioBg3dSkpManifestTag {
  readonly key: string;
  readonly sourceId: null;
  readonly name: string;
  readonly color: StudioBg3dSkpSourceVec3;
  readonly hidden: boolean;
  readonly hiddenFieldPresence: "parser-values-may-include-defaults";
}

export interface StudioBg3dSkpManifestDefinition {
  readonly key: string;
  readonly kind: "root" | "definition";
  readonly sourceId: number;
  readonly guid: string;
  readonly name: string;
  readonly isImage: boolean;
  readonly alwaysFacesCamera: boolean;
  readonly shadowsFaceSun: boolean;
  /** 파서 배열의 길이만 기록한다. 형상의 유효성은 메시 가져오기 관문에서 검증한다. */
  readonly geometryCounts: { readonly vertices: number; readonly edges: number; readonly faces: number };
}

export interface StudioBg3dSkpManifestInstance {
  readonly key: string;
  readonly parentDefinitionKey: string;
  readonly referencedDefinitionId: number;
  readonly referencedDefinitionKey: string | null;
  readonly name: string;
  readonly guid: string;
  readonly transform: StudioBg3dSkpSourceTransform;
  readonly materialId: number | null;
  readonly hidden: boolean;
  /** 빈 문자열은 상속 또는 파서의 기본값이다. 유효 태그를 추측하지 않는다. */
  readonly layer: string;
  readonly layerFieldPresence: "explicit-or-parser-default";
  readonly properties: Readonly<Record<string, string>>;
  readonly dynamicPropertiesCoverage: "parse-stage-only";
  readonly otherAttributeDictionaries: "not-exposed";
}

interface AnnotationBase { readonly key: string; readonly parentDefinitionKey: string | null }
export type StudioBg3dSkpManifestAnnotation =
  | (AnnotationBase & { readonly kind: "section-plane"; readonly plane: StudioBg3dSkpSourcePlane; readonly name: string; readonly label: string; readonly hidden: boolean; readonly active: "not-exposed" })
  | (AnnotationBase & { readonly kind: "text"; readonly text: string; readonly hidden: boolean; readonly anchor: "not-exposed" })
  | (AnnotationBase & { readonly kind: "dimension"; readonly text: string; readonly hidden: boolean; readonly a: StudioBg3dSkpSourceVec3 | null; readonly b: StudioBg3dSkpSourceVec3 | null; readonly offset: number; readonly planeX: StudioBg3dSkpSourceVec3 | null; readonly normal: StudioBg3dSkpSourceVec3 | null; readonly space: "definition-local" | "model-world" })
  | (AnnotationBase & { readonly kind: "construction-line"; readonly point: StudioBg3dSkpSourceVec3; readonly direction: StudioBg3dSkpSourceVec3; readonly start: StudioBg3dSkpSourceVec3 | null; readonly end: StudioBg3dSkpSourceVec3 | null })
  | (AnnotationBase & { readonly kind: "construction-point"; readonly position: StudioBg3dSkpSourceVec3 });

export interface StudioBg3dSkpManifestStyle {
  readonly key: string;
  readonly name: string;
  readonly frontColor: StudioBg3dSkpSourceVec3 | null;
  readonly backColor: StudioBg3dSkpSourceVec3 | null;
}

export type StudioBg3dSkpManifestDiagnosticCode =
  | "original-counts-unavailable" | "parser-field-presence-unknown" | "scene-state-flags-unavailable"
  | "camera-less-pages-not-exposed" | "camera-fov-basis-not-exposed" | "source-tag-ids-unavailable" | "entity-tag-membership-unavailable"
  | "dynamic-attributes-parse-stage-only" | "annotation-placement-partial" | "definition-local-records-not-expanded"
  | "matrix-unavailable" | "definition-reference-missing";

export interface StudioBg3dSkpManifestDiagnostic {
  readonly code: StudioBg3dSkpManifestDiagnosticCode;
  readonly path: string;
}

export interface StudioBg3dSkpSceneManifest {
  readonly version: 1;
  readonly parser: { readonly name: "openskp"; readonly version: "1.3.0" };
  readonly coverage: "parser-exposed-metadata-only";
  readonly sourceVersion: string;
  readonly declaredUnits: string | null;
  readonly coordinates: { readonly linearUnit: "inch"; readonly upAxis: "z"; readonly transforms: "definition-local" };
  readonly rootDefinitionKey: "root";
  readonly pages: StudioBg3dSkpManifestCollection<StudioBg3dSkpManifestPage>;
  readonly tags: StudioBg3dSkpManifestCollection<StudioBg3dSkpManifestTag>;
  readonly definitions: StudioBg3dSkpManifestCollection<StudioBg3dSkpManifestDefinition>;
  /** 정의 안의 기록을 한 번씩 저장한다. 배치마다 트리를 펼치지 않는다. */
  readonly instances: StudioBg3dSkpManifestCollection<StudioBg3dSkpManifestInstance>;
  readonly annotations: StudioBg3dSkpManifestCollection<StudioBg3dSkpManifestAnnotation>;
  readonly styles: StudioBg3dSkpManifestCollection<StudioBg3dSkpManifestStyle>;
  readonly diagnostics: readonly StudioBg3dSkpManifestDiagnostic[];
}

export interface StudioBg3dSkpManifestLimits {
  readonly maxPages: number;
  readonly maxTags: number;
  readonly maxDefinitions: number;
  readonly maxInstances: number;
  readonly maxAnnotations: number;
  readonly maxStyles: number;
  readonly maxPropertyEntries: number;
  readonly maxStringBytes: number;
  readonly maxTotalStringBytes: number;
  readonly maxSerializedBytes: number;
}

export const STUDIO_BG3D_SKP_MANIFEST_LIMITS: Readonly<StudioBg3dSkpManifestLimits> = Object.freeze({
  maxPages: 256, maxTags: 512, maxDefinitions: 2048, maxInstances: 8192, maxAnnotations: 2048, maxStyles: 256,
  maxPropertyEntries: 16_384, maxStringBytes: 8192, maxTotalStringBytes: 128 * 1024, maxSerializedBytes: 256 * 1024,
});

export type StudioBg3dSkpManifestResult =
  | { readonly ok: true; readonly value: StudioBg3dSkpSceneManifest }
  | { readonly ok: false; readonly code: "invalid-source" | "budget-exceeded"; readonly path: string; readonly detail: string };

const TOXIC_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MANIFEST_LIMITATIONS: readonly StudioBg3dSkpManifestDiagnostic[] = [
  { code: "original-counts-unavailable", path: "$model" }, { code: "parser-field-presence-unknown", path: "$model" },
  { code: "scene-state-flags-unavailable", path: "pages" }, { code: "camera-less-pages-not-exposed", path: "pages" },
  { code: "camera-fov-basis-not-exposed", path: "pages" },
  { code: "source-tag-ids-unavailable", path: "layers" }, { code: "entity-tag-membership-unavailable", path: "definitions" },
  { code: "dynamic-attributes-parse-stage-only", path: "instances" }, { code: "annotation-placement-partial", path: "annotations" },
  { code: "definition-local-records-not-expanded", path: "instances" },
];

class ManifestFailure extends Error {
  constructor(readonly code: "invalid-source" | "budget-exceeded", readonly path: string, detail: string) { super(detail); }
}

function invalid(path: string, detail: string): never { throw new ManifestFailure("invalid-source", path, detail); }
function budget(path: string): never { throw new ManifestFailure("budget-exceeded", path, "source manifest budget exceeded; no records were stored"); }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) return invalid(path, "expected a metadata record");
  return value;
}
function isUnknownArray(value: unknown): value is readonly unknown[] { return Array.isArray(value); }
function array(value: unknown, path: string, limit: number, requireDense = true): readonly unknown[] {
  if (!isUnknownArray(value)) return invalid(path, "expected an array");
  if (value.length > limit) return budget(path);
  // map/forEach가 빈 슬롯을 건너뛰어 기록 수와 실제 저장 항목이 달라지는 것을 막는다.
  if (!requireDense) return value;
  const copied: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) invalid(`${path}[${index}]`, "sparse metadata arrays are not supported");
    copied.push(value[index]);
  }
  return copied;
}
function number(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return invalid(path, "expected a finite number");
  return value;
}
function integer(value: unknown, path: string, min = 0): number {
  const result = number(value, path);
  if (!Number.isSafeInteger(result) || result < min) return invalid(path, "expected a safe integer");
  return result;
}
function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") return invalid(path, "expected a boolean");
  return value;
}
function vec3(value: unknown, path: string): StudioBg3dSkpSourceVec3 {
  if (!isUnknownArray(value) || value.length !== 3) return invalid(path, "expected three coordinates");
  const values = array(value, path, 3);
  return [number(values[0], path), number(values[1], path), number(values[2], path)];
}
function optionalVec3(value: unknown, path: string): StudioBg3dSkpSourceVec3 | null { return value === null ? null : vec3(value, path); }
function color(value: unknown, path: string): StudioBg3dSkpSourceVec3 {
  const result = vec3(value, path);
  if (result.some((v) => v < 0 || v > 255)) return invalid(path, "color channel is outside 0..255");
  return result;
}
function collection<T>(items: readonly T[]): StudioBg3dSkpManifestCollection<T> { return { total: items.length, stored: items.length, sourceTotal: null, items }; }

class Reader {
  private stringBytes = 0;
  private propertyEntries = 0;
  readonly diagnostics: StudioBg3dSkpManifestDiagnostic[] = [];
  constructor(readonly limits: StudioBg3dSkpManifestLimits) {}

  string(value: unknown, path: string): string {
    if (typeof value !== "string") return invalid(path, "expected a string");
    if (value.length > this.limits.maxStringBytes) return budget(path);
    const bytes = new TextEncoder().encode(value).byteLength;
    this.stringBytes += bytes;
    if (bytes > this.limits.maxStringBytes || this.stringBytes > this.limits.maxTotalStringBytes) return budget(path);
    return value;
  }

  strings(value: unknown, path: string): readonly string[] {
    return array(value, path, this.limits.maxTags).map((item, index) => this.string(item, `${path}[${index}]`));
  }

  properties(value: unknown, path: string): Readonly<Record<string, string>> {
    const source = record(value, path);
    const entries: [string, string][] = [];
    for (const key in source) {
      if (!Object.hasOwn(source, key)) continue;
      if (TOXIC_KEYS.has(key)) invalid(path, "unsafe metadata property key");
      this.propertyEntries += 1;
      if (this.propertyEntries > this.limits.maxPropertyEntries) return budget(path);
      entries.push([this.string(key, path), this.string(source[key], `${path}.${key}`)]);
    }
    return Object.fromEntries(entries);
  }

  transform(value: unknown, path: string): StudioBg3dSkpSourceTransform {
    if (!isUnknownArray(value) || ![0, 13, 16].includes(value.length)) return invalid(path, "unsupported source matrix length");
    const m = array(value, path, 16);
    if (m.length === 0) {
      this.diagnostics.push({ code: "matrix-unavailable", path });
      return { layout: "unavailable", values: null };
    }
    const n = (index: number) => number(m[index], `${path}[${index}]`);
    // OpenSKP transforms.ts의 13원소 경로는 3x3 행 우선 + 이동 3개 + w다. 16원소 경로만 열 우선이다.
    if (m.length === 13) return { layout: "openskp-row-major-3x3-translation-w", values: [n(0), n(1), n(2), n(3), n(4), n(5), n(6), n(7), n(8), n(9), n(10), n(11), n(12)] };
    if (m.length === 16) return { layout: "column-major-4x4", values: [n(0), n(1), n(2), n(3), n(4), n(5), n(6), n(7), n(8), n(9), n(10), n(11), n(12), n(13), n(14), n(15)] };
    return invalid(path, "unsupported source matrix length");
  }

  page(value: unknown, index: number): StudioBg3dSkpManifestPage {
    const path = `pages[${index}]`, source = record(value, path);
    return { key: `page:${index}`, name: this.string(source.name, `${path}.name`), eye: optionalVec3(source.eye, `${path}.eye`),
      target: optionalVec3(source.target, `${path}.target`), up: optionalVec3(source.up, `${path}.up`),
      fov: number(source.fov, `${path}.fov`), fovBasis: "not-exposed", parallel: bool(source.parallel, `${path}.parallel`),
      orthoHeight: number(source.orthoHeight, `${path}.orthoHeight`), hiddenLayers: this.strings(source.hiddenLayers, `${path}.hiddenLayers`),
      savedStateFlags: "not-exposed", fieldPresence: "parser-values-may-include-defaults" };
  }

  tag(value: unknown, index: number): StudioBg3dSkpManifestTag {
    const path = `layers[${index}]`, source = record(value, path), rgb = record(source.color, `${path}.color`);
    return { key: `tag:${index}`, sourceId: null, name: this.string(source.name, `${path}.name`),
      color: color([rgb.r, rgb.g, rgb.b], `${path}.color`), hidden: bool(source.hidden, `${path}.hidden`),
      hiddenFieldPresence: "parser-values-may-include-defaults" };
  }

  definition(source: Record<string, unknown>, key: string, root: boolean): StudioBg3dSkpManifestDefinition {
    // 형상은 다른 검증 관문이 맡는다. 여기서는 원소를 복사하거나 전수 순회하지 않고 배열 길이만 기록한다.
    const count = (field: string) => array(source[field], `${key}.${field}`, Number.MAX_SAFE_INTEGER, false).length;
    return { key, kind: root ? "root" : "definition", sourceId: integer(source.id, `${key}.id`),
      guid: this.string(source.guid, `${key}.guid`), name: this.string(source.name, `${key}.name`),
      isImage: bool(source.isImage, `${key}.isImage`), alwaysFacesCamera: bool(source.alwaysFacesCamera, `${key}.alwaysFacesCamera`),
      shadowsFaceSun: bool(source.shadowsFaceSun, `${key}.shadowsFaceSun`),
      geometryCounts: { vertices: count("vertices"), edges: count("edges"), faces: count("faces") } };
  }

  instance(value: unknown, index: number, parent: string, definitions: ReadonlyMap<number, string>): StudioBg3dSkpManifestInstance {
    const path = `${parent}.instances[${index}]`, source = record(value, path);
    const ref = integer(source.refIdx, `${path}.refIdx`, -1), target = definitions.get(ref) ?? null;
    if (target === null) this.diagnostics.push({ code: "definition-reference-missing", path: `${path}.refIdx` });
    return { key: `${parent}/instance:${index}`, parentDefinitionKey: parent, referencedDefinitionId: ref, referencedDefinitionKey: target,
      name: this.string(source.name, `${path}.name`), guid: this.string(source.guid, `${path}.guid`), transform: this.transform(source.matrix, `${path}.matrix`),
      materialId: source.materialId === null ? null : integer(source.materialId, `${path}.materialId`), hidden: bool(source.hidden, `${path}.hidden`),
      layer: this.string(source.layer, `${path}.layer`), layerFieldPresence: "explicit-or-parser-default",
      properties: this.properties(source.properties, `${path}.properties`), dynamicPropertiesCoverage: "parse-stage-only", otherAttributeDictionaries: "not-exposed" };
  }

  dimension(value: unknown, key: string, parent: string | null): StudioBg3dSkpManifestAnnotation {
    const source = record(value, key);
    return { kind: "dimension", key, parentDefinitionKey: parent, text: this.string(source.text, `${key}.text`),
      hidden: bool(source.hidden, `${key}.hidden`), a: optionalVec3(source.a, `${key}.a`), b: optionalVec3(source.b, `${key}.b`),
      offset: number(source.offset, `${key}.offset`), planeX: optionalVec3(source.planeX, `${key}.planeX`), normal: optionalVec3(source.normal, `${key}.normal`),
      space: parent === null ? "model-world" : "definition-local" };
  }

  annotations(source: Record<string, unknown>, parent: string, output: StudioBg3dSkpManifestAnnotation[]): void {
    for (const field of ["sectionPlanes", "texts", "dimensions", "constructionLines", "constructionPoints"]) {
      const values = array(source[field], `${parent}.${field}`, this.limits.maxAnnotations);
      if (output.length + values.length > this.limits.maxAnnotations) budget(`${parent}.${field}`);
      for (const [index, raw] of values.entries()) {
        const key = `${parent}/${field}:${index}`, item = record(raw, key);
        if (field === "dimensions") { output.push(this.dimension(item, key, parent)); continue; }
        const base = { key, parentDefinitionKey: parent };
        if (field === "sectionPlanes") {
          const p = item.plane;
          if (!isUnknownArray(p) || p.length !== 4) invalid(`${key}.plane`, "expected four plane coefficients");
          array(p, `${key}.plane`, 4);
          output.push({ ...base, kind: "section-plane", plane: [number(p[0], key), number(p[1], key), number(p[2], key), number(p[3], key)],
            name: this.string(item.name, `${key}.name`), label: this.string(item.label, `${key}.label`), hidden: bool(item.hidden, `${key}.hidden`), active: "not-exposed" });
        } else if (field === "texts") output.push({ ...base, kind: "text", text: this.string(item.text, `${key}.text`), hidden: bool(item.hidden, `${key}.hidden`), anchor: "not-exposed" });
        else if (field === "constructionLines") output.push({ ...base, kind: "construction-line", point: vec3(item.point, `${key}.point`),
          direction: vec3(item.direction, `${key}.direction`), start: optionalVec3(item.start, `${key}.start`), end: optionalVec3(item.end, `${key}.end`) });
        else output.push({ ...base, kind: "construction-point", position: vec3(item.position, `${key}.position`) });
      }
    }
  }
}

function readLimits(options: Partial<StudioBg3dSkpManifestLimits>): StudioBg3dSkpManifestLimits {
  const limits = { ...STUDIO_BG3D_SKP_MANIFEST_LIMITS, ...options };
  for (const key of Object.keys(STUDIO_BG3D_SKP_MANIFEST_LIMITS)) {
    const value: unknown = Reflect.get(limits, key), ceiling: unknown = Reflect.get(STUDIO_BG3D_SKP_MANIFEST_LIMITS, key);
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || typeof ceiling !== "number" || value > ceiling) {
      invalid(`options.${key}`, "limits must be positive integers no greater than the built-in ceiling");
    }
  }
  return limits;
}

function ensureAcyclic(instances: readonly StudioBg3dSkpManifestInstance[], keys: readonly string[]): void {
  const children = new Map<string, string[]>();
  for (const item of instances) {
    if (item.referencedDefinitionKey === null) continue;
    const list = children.get(item.parentDefinitionKey) ?? [];
    list.push(item.referencedDefinitionKey);
    children.set(item.parentDefinitionKey, list);
  }
  const done = new Set<string>(), active = new Set<string>();
  for (const key of keys) {
    const pending = [{ key, exit: false }];
    while (pending.length > 0) {
      const next = pending.pop();
      if (!next) break;
      if (next.exit) { active.delete(next.key); done.add(next.key); continue; }
      if (done.has(next.key)) continue;
      if (active.has(next.key)) invalid("instances", "component definitions contain a reference cycle");
      active.add(next.key); pending.push({ key: next.key, exit: true });
      for (const child of children.get(next.key) ?? []) pending.push({ key: child, exit: false });
    }
  }
}

/** 형상 변환과 독립된 추출기다. 실패하면 부분 결과를 반환하거나 기록을 조용히 버리지 않는다. */
export function extractStudioBg3dSkpSceneManifest(model: unknown, options: Partial<StudioBg3dSkpManifestLimits> = {}): StudioBg3dSkpManifestResult {
  try {
    const limits = readLimits(options), reader = new Reader(limits), source = record(model, "$model");
    const root = record(source.root, "root");
    if (root.id !== 0) invalid("root.id", "the parser root must have source id 0");
    if (!(source.definitions instanceof Map)) return invalid("definitions", "expected the parser definition Map");
    if (source.definitions.size + 1 > limits.maxDefinitions) return budget("definitions");
    const definitions: StudioBg3dSkpManifestDefinition[] = [reader.definition(root, "root", true)];
    const rawDefinitions: [string, Record<string, unknown>][] = [["root", root]];
    const byId = new Map<number, string>();
    for (const [rawId, rawValue] of source.definitions) {
      if (definitions.length >= limits.maxDefinitions) return budget("definitions");
      const id = integer(rawId, "definitions.id"), value = record(rawValue, `definition:${id}`), key = `definition:${id}`;
      if (byId.has(id)) invalid(key, "definition iterator repeats an id");
      if (value.id !== id) invalid(key, "definition Map key does not match its source id");
      definitions.push(reader.definition(value, key, false)); rawDefinitions.push([key, value]); byId.set(id, key);
    }
    const instances: StudioBg3dSkpManifestInstance[] = [], annotations: StudioBg3dSkpManifestAnnotation[] = [];
    for (const [key, value] of rawDefinitions) {
      const values = array(value.instances, `${key}.instances`, limits.maxInstances);
      if (instances.length + values.length > limits.maxInstances) return budget("instances");
      values.forEach((item, index) => instances.push(reader.instance(item, index, key, byId)));
      reader.annotations(value, key, annotations);
    }
    ensureAcyclic(instances, definitions.map(({ key }) => key));
    const worldDimensions = array(source.dimensions, "dimensions", limits.maxAnnotations);
    if (annotations.length + worldDimensions.length > limits.maxAnnotations) return budget("annotations");
    worldDimensions.forEach((item, index) => annotations.push(reader.dimension(item, `model/dimension:${index}`, null)));
    const styles = array(source.styles, "styles", limits.maxStyles).map((value, index): StudioBg3dSkpManifestStyle => {
      const key = `style:${index}`, item = record(value, key);
      return { key, name: reader.string(item.name, `${key}.name`), frontColor: item.frontColor === null ? null : color(item.frontColor, `${key}.frontColor`), backColor: item.backColor === null ? null : color(item.backColor, `${key}.backColor`) };
    });
    const manifest: StudioBg3dSkpSceneManifest = {
      version: 1, parser: { name: "openskp", version: "1.3.0" }, coverage: "parser-exposed-metadata-only",
      sourceVersion: readSourceVersion(source.version, reader), declaredUnits: source.units === null ? null : reader.string(source.units, "units"),
      coordinates: { linearUnit: "inch", upAxis: "z", transforms: "definition-local" }, rootDefinitionKey: "root",
      pages: collection(array(source.pages, "pages", limits.maxPages).map((page, index) => reader.page(page, index))),
      tags: collection(array(source.layers, "layers", limits.maxTags).map((layer, index) => reader.tag(layer, index))),
      definitions: collection(definitions), instances: collection(instances), annotations: collection(annotations), styles: collection(styles),
      diagnostics: [...MANIFEST_LIMITATIONS.map((item) => ({ ...item })), ...reader.diagnostics],
    };
    if (new TextEncoder().encode(JSON.stringify(manifest)).byteLength > limits.maxSerializedBytes) return budget("$serialized");
    return { ok: true, value: manifest };
  } catch (error) {
    if (error instanceof ManifestFailure) return { ok: false, code: error.code, path: error.path, detail: error.message };
    return { ok: false, code: "invalid-source", path: "$model", detail: "metadata could not be read safely" };
  }
}

function readSourceVersion(value: unknown, reader: Reader): string {
  const result = reader.string(value, "sourceVersion");
  if (result !== "unknown" && !/^\{\d+(?:\.\d+)+\}$/.test(result)) invalid("sourceVersion", "unsupported source version notation");
  return result;
}

/** JSON에 실릴 수 있는 제한된 자료만 통과시킨다. getter나 toJSON을 실행하지 않고 바이트 수를 센다. */
function assertManifestJson(value: unknown, limits: StudioBg3dSkpManifestLimits): void {
  const active = new Set<object>();
  const pending: { value: unknown; path: string; depth: number; exit?: object }[] = [{ value, path: "$manifest", depth: 0 }];
  let bytes = 0, nodes = 0;
  const add = (amount: number, path: string) => { bytes += amount; if (bytes > limits.maxSerializedBytes) budget(path); };
  const textBytes = (item: string, path: string): number => {
    // 고정 스키마 이름/진단은 원본 문자열 한도와 별개다. 원본 필드의 낮춘 한도는 Reader에서 동일하게 적용한다.
    if (item.length > STUDIO_BG3D_SKP_MANIFEST_LIMITS.maxStringBytes || new TextEncoder().encode(item).byteLength > STUDIO_BG3D_SKP_MANIFEST_LIMITS.maxStringBytes) budget(path);
    return new TextEncoder().encode(JSON.stringify(item)).byteLength;
  };
  while (pending.length > 0) {
    const next = pending.pop();
    if (!next) break;
    if (next.exit) { active.delete(next.exit); continue; }
    if (++nodes > limits.maxSerializedBytes * 2) budget(next.path);
    if (next.depth > 24) invalid(next.path, "manifest nesting is too deep");
    const item = next.value;
    if (item === null) { add(4, next.path); continue; }
    if (typeof item === "string") { add(textBytes(item, next.path), next.path); continue; }
    if (typeof item === "boolean") { add(item ? 4 : 5, next.path); continue; }
    if (typeof item === "number") { number(item, next.path); add(String(Object.is(item, -0) ? 0 : item).length, next.path); continue; }
    if (typeof item !== "object") invalid(next.path, "manifest must contain JSON values only");
    const sequence = isUnknownArray(item);
    if (sequence ? Object.getPrototypeOf(item) !== Array.prototype : !isRecord(item)) invalid(next.path, "unsupported manifest prototype");
    if (active.has(item)) invalid(next.path, "cyclic manifest values are not supported");
    active.add(item); pending.push({ ...next, exit: item });
    if (sequence && item.length > limits.maxSerializedBytes) budget(next.path);
    const keys = Reflect.ownKeys(item);
    if (keys.length > limits.maxSerializedBytes) budget(next.path);
    if (sequence && keys.length !== item.length + 1) invalid(next.path, "arrays must be dense and have no extra properties");
    let count = 0;
    for (const key of keys) {
      if (typeof key !== "string") invalid(next.path, "symbol keys are not supported");
      if (sequence && key === "length") continue;
      if (TOXIC_KEYS.has(key)) invalid(next.path, "unsafe manifest property key");
      if (sequence && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) invalid(next.path, "invalid array index");
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid(next.path, "accessors and non-enumerable fields are not supported");
      const child: unknown = descriptor.value;
      if (count++ > 0) add(1, next.path);
      if (!sequence) add(textBytes(key, next.path) + 1, next.path);
      pending.push({ value: child, path: `${next.path}.${key}`, depth: next.depth + 1 });
    }
    add(2, next.path);
  }
}

function shape(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  const result = record(value, path), keys = Object.keys(result);
  if (keys.length !== fields.length || fields.some((key) => !Object.hasOwn(result, key))) invalid(path, "manifest fields do not match version 1");
  return result;
}
function literal<T extends string | number | null>(value: unknown, expected: T, path: string): T {
  if (value !== expected) invalid(path, "unexpected manifest constant");
  return expected;
}
function readCollection<T>(value: unknown, path: string, limit: number, parse: (value: unknown, index: number) => T): StudioBg3dSkpManifestCollection<T> {
  const source = shape(value, path, ["total", "stored", "sourceTotal", "items"]), values = array(source.items, `${path}.items`, limit);
  if (integer(source.total, `${path}.total`) !== values.length || integer(source.stored, `${path}.stored`) !== values.length) invalid(path, "manifest counts do not match stored records");
  literal(source.sourceTotal, null, `${path}.sourceTotal`);
  return collection(values.map(parse));
}
function key(value: unknown, expected: string, path: string): string { return literal(value, expected, path); }

class ManifestReader {
  readonly reader: Reader;
  readonly definitionById = new Map<number, string>();
  readonly definitionOrder = new Map<string, number>();
  readonly instanceOrdinal = new Map<string, number>();
  readonly annotationOrdinal = new Map<string, number>();
  readonly expectedDiagnostics = new Set(MANIFEST_LIMITATIONS.map(({ code, path }) => `${code}\0${path}`));
  private lastInstanceParent = -1;
  private lastAnnotationRank = -1;
  constructor(readonly limits: StudioBg3dSkpManifestLimits) { this.reader = new Reader(limits); }

  page(value: unknown, index: number): StudioBg3dSkpManifestPage {
    const path = `pages.items[${index}]`, source = shape(value, path, ["key", "name", "eye", "target", "up", "fov", "fovBasis", "parallel", "orthoHeight", "hiddenLayers", "savedStateFlags", "fieldPresence"]);
    return { key: key(source.key, `page:${index}`, path), name: this.reader.string(source.name, `${path}.name`),
      eye: optionalVec3(source.eye, `${path}.eye`), target: optionalVec3(source.target, `${path}.target`), up: optionalVec3(source.up, `${path}.up`),
      fov: number(source.fov, `${path}.fov`), fovBasis: literal(source.fovBasis, "not-exposed", path), parallel: bool(source.parallel, `${path}.parallel`), orthoHeight: number(source.orthoHeight, `${path}.orthoHeight`),
      hiddenLayers: this.reader.strings(source.hiddenLayers, `${path}.hiddenLayers`), savedStateFlags: literal(source.savedStateFlags, "not-exposed", path),
      fieldPresence: literal(source.fieldPresence, "parser-values-may-include-defaults", path) };
  }

  tag(value: unknown, index: number): StudioBg3dSkpManifestTag {
    const path = `tags.items[${index}]`, source = shape(value, path, ["key", "sourceId", "name", "color", "hidden", "hiddenFieldPresence"]);
    return { key: key(source.key, `tag:${index}`, path), sourceId: literal(source.sourceId, null, path), name: this.reader.string(source.name, `${path}.name`),
      color: color(source.color, `${path}.color`), hidden: bool(source.hidden, `${path}.hidden`), hiddenFieldPresence: literal(source.hiddenFieldPresence, "parser-values-may-include-defaults", path) };
  }

  definition(value: unknown, index: number): StudioBg3dSkpManifestDefinition {
    const path = `definitions.items[${index}]`, source = shape(value, path, ["key", "kind", "sourceId", "guid", "name", "isImage", "alwaysFacesCamera", "shadowsFaceSun", "geometryCounts"]);
    const id = integer(source.sourceId, `${path}.sourceId`), root = index === 0;
    if (root && id !== 0) invalid(path, "root source id must be 0");
    const definitionKey = key(source.key, root ? "root" : `definition:${id}`, `${path}.key`);
    if (!root && this.definitionById.has(id)) invalid(path, "duplicate definition id");
    if (!root) this.definitionById.set(id, definitionKey);
    this.definitionOrder.set(definitionKey, index);
    const counts = shape(source.geometryCounts, `${path}.geometryCounts`, ["vertices", "edges", "faces"]);
    const count = (field: string) => {
      const value = integer(counts[field], `${path}.geometryCounts.${field}`);
      if (value > 0xffff_ffff) invalid(path, "geometry array length exceeds the parser representation");
      return value;
    };
    return { key: definitionKey, kind: literal(source.kind, root ? "root" : "definition", path), sourceId: id,
      guid: this.reader.string(source.guid, `${path}.guid`), name: this.reader.string(source.name, `${path}.name`),
      isImage: bool(source.isImage, `${path}.isImage`), alwaysFacesCamera: bool(source.alwaysFacesCamera, `${path}.alwaysFacesCamera`), shadowsFaceSun: bool(source.shadowsFaceSun, `${path}.shadowsFaceSun`),
      geometryCounts: { vertices: count("vertices"), edges: count("edges"), faces: count("faces") } };
  }

  instance(value: unknown, index: number): StudioBg3dSkpManifestInstance {
    const path = `instances.items[${index}]`, source = shape(value, path, ["key", "parentDefinitionKey", "referencedDefinitionId", "referencedDefinitionKey", "name", "guid", "transform", "materialId", "hidden", "layer", "layerFieldPresence", "properties", "dynamicPropertiesCoverage", "otherAttributeDictionaries"]);
    const parent = source.parentDefinitionKey;
    if (typeof parent !== "string" || !this.definitionOrder.has(parent)) invalid(path, "missing parent definition");
    const parentOrder = this.definitionOrder.get(parent) ?? -1;
    if (parentOrder < this.lastInstanceParent) invalid(path, "instance records are outside definition order");
    this.lastInstanceParent = parentOrder;
    const ordinal = this.instanceOrdinal.get(parent) ?? 0;
    this.instanceOrdinal.set(parent, ordinal + 1);
    const ref = integer(source.referencedDefinitionId, `${path}.referencedDefinitionId`, -1), target = this.definitionById.get(ref) ?? null;
    literal(source.referencedDefinitionKey, target, `${path}.referencedDefinitionKey`);
    const transformSource = shape(source.transform, `${path}.transform`, ["layout", "values"]);
    let transform: StudioBg3dSkpSourceTransform;
    if (transformSource.layout === "unavailable") {
      literal(transformSource.values, null, `${path}.transform.values`); transform = { layout: "unavailable", values: null };
      this.expectedDiagnostics.add(`matrix-unavailable\0${parent}.instances[${ordinal}].matrix`);
    } else {
      transform = this.reader.transform(transformSource.values, `${path}.transform.values`);
      if (transform.layout === "unavailable" || transform.layout !== transformSource.layout) invalid(path, "matrix values do not match their declared layout");
    }
    if (target === null) this.expectedDiagnostics.add(`definition-reference-missing\0${parent}.instances[${ordinal}].refIdx`);
    return { key: key(source.key, `${parent}/instance:${ordinal}`, path), parentDefinitionKey: parent, referencedDefinitionId: ref, referencedDefinitionKey: target,
      name: this.reader.string(source.name, `${path}.name`), guid: this.reader.string(source.guid, `${path}.guid`), transform,
      materialId: source.materialId === null ? null : integer(source.materialId, `${path}.materialId`), hidden: bool(source.hidden, `${path}.hidden`),
      layer: this.reader.string(source.layer, `${path}.layer`), layerFieldPresence: literal(source.layerFieldPresence, "explicit-or-parser-default", path),
      properties: this.reader.properties(source.properties, `${path}.properties`), dynamicPropertiesCoverage: literal(source.dynamicPropertiesCoverage, "parse-stage-only", path),
      otherAttributeDictionaries: literal(source.otherAttributeDictionaries, "not-exposed", path) };
  }

  annotation(value: unknown, index: number): StudioBg3dSkpManifestAnnotation {
    const path = `annotations.items[${index}]`, source = record(value, path), parent = source.parentDefinitionKey;
    const kinds = ["section-plane", "text", "dimension", "construction-line", "construction-point"];
    const fields = ["sectionPlanes", "texts", "dimensions", "constructionLines", "constructionPoints"];
    const kindIndex = kinds.indexOf(typeof source.kind === "string" ? source.kind : "");
    if (kindIndex < 0 || (parent !== null && (typeof parent !== "string" || !this.definitionOrder.has(parent)))) invalid(path, "unknown annotation kind or parent");
    if (parent === null && source.kind !== "dimension") invalid(path, "only dimensions have model-world annotation records");
    const rank = parent === null ? this.definitionOrder.size * 5 : (this.definitionOrder.get(parent) ?? -1) * 5 + kindIndex;
    if (rank < this.lastAnnotationRank) invalid(path, "annotations are outside definition/type order");
    this.lastAnnotationRank = rank;
    const prefix = parent === null ? "model/dimension" : `${parent}/${fields[kindIndex]}`, ordinal = this.annotationOrdinal.get(prefix) ?? 0;
    this.annotationOrdinal.set(prefix, ordinal + 1);
    const base = { key: key(source.key, `${prefix}:${ordinal}`, path), parentDefinitionKey: parent };
    const check = (extra: readonly string[]) => shape(source, path, ["key", "parentDefinitionKey", "kind", ...extra]);
    if (source.kind === "section-plane") {
      check(["plane", "name", "label", "hidden", "active"]);
      const plane = array(source.plane, `${path}.plane`, 4);
      if (plane.length !== 4) invalid(path, "expected four plane coefficients");
      return { ...base, kind: "section-plane", plane: [number(plane[0], path), number(plane[1], path), number(plane[2], path), number(plane[3], path)], name: this.reader.string(source.name, `${path}.name`), label: this.reader.string(source.label, `${path}.label`), hidden: bool(source.hidden, path), active: literal(source.active, "not-exposed", path) };
    }
    if (source.kind === "text") {
      check(["text", "hidden", "anchor"]);
      return { ...base, kind: "text", text: this.reader.string(source.text, `${path}.text`), hidden: bool(source.hidden, path), anchor: literal(source.anchor, "not-exposed", path) };
    }
    if (source.kind === "dimension") {
      check(["text", "hidden", "a", "b", "offset", "planeX", "normal", "space"]);
      return { ...base, kind: "dimension", text: this.reader.string(source.text, `${path}.text`), hidden: bool(source.hidden, path), a: optionalVec3(source.a, path), b: optionalVec3(source.b, path), offset: number(source.offset, path), planeX: optionalVec3(source.planeX, path), normal: optionalVec3(source.normal, path), space: literal(source.space, parent === null ? "model-world" : "definition-local", path) };
    }
    if (source.kind === "construction-line") {
      check(["point", "direction", "start", "end"]);
      return { ...base, kind: "construction-line", point: vec3(source.point, path), direction: vec3(source.direction, path), start: optionalVec3(source.start, path), end: optionalVec3(source.end, path) };
    }
    check(["position"]);
    return { ...base, kind: "construction-point", position: vec3(source.position, path) };
  }

  style(value: unknown, index: number): StudioBg3dSkpManifestStyle {
    const path = `styles.items[${index}]`, source = shape(value, path, ["key", "name", "frontColor", "backColor"]);
    return { key: key(source.key, `style:${index}`, path), name: this.reader.string(source.name, `${path}.name`), frontColor: source.frontColor === null ? null : color(source.frontColor, path), backColor: source.backColor === null ? null : color(source.backColor, path) };
  }

  diagnostics(value: unknown): readonly StudioBg3dSkpManifestDiagnostic[] {
    const codes: readonly StudioBg3dSkpManifestDiagnosticCode[] = [...MANIFEST_LIMITATIONS.map(({ code }) => code), "matrix-unavailable", "definition-reference-missing"];
    const seen = new Set<string>();
    const items = array(value, "diagnostics", MANIFEST_LIMITATIONS.length + this.limits.maxInstances * 2).map((value, index): StudioBg3dSkpManifestDiagnostic => {
      const path = `diagnostics[${index}]`, source = shape(value, path, ["code", "path"]), code = codes.find((code) => code === source.code);
      if (!code || typeof source.path !== "string") return invalid(path, "unknown diagnostic");
      const signature = `${code}\0${source.path}`;
      if (seen.has(signature) || !this.expectedDiagnostics.has(signature)) invalid(path, "diagnostic does not match preserved limitations");
      seen.add(signature); return { code, path: source.path };
    });
    if (seen.size !== this.expectedDiagnostics.size) invalid("diagnostics", "required parser limitation diagnostics are missing");
    return items;
  }
}

/** Worker·GLB extras·저장소에서 읽은 manifest를 원본 파서 자료와 별도 형식으로 완전히 검증한다. */
export function parseStudioBg3dSkpSceneManifest(value: unknown, options: Partial<StudioBg3dSkpManifestLimits> = {}): StudioBg3dSkpManifestResult {
  try {
    const limits = readLimits(options);
    assertManifestJson(value, limits);
    const source = shape(value, "$manifest", ["version", "parser", "coverage", "sourceVersion", "declaredUnits", "coordinates", "rootDefinitionKey", "pages", "tags", "definitions", "instances", "annotations", "styles", "diagnostics"]);
    literal(source.version, 1, "version"); literal(source.coverage, "parser-exposed-metadata-only", "coverage"); literal(source.rootDefinitionKey, "root", "rootDefinitionKey");
    const parser = shape(source.parser, "parser", ["name", "version"]), coordinates = shape(source.coordinates, "coordinates", ["linearUnit", "upAxis", "transforms"]);
    literal(parser.name, "openskp", "parser.name"); literal(parser.version, "1.3.0", "parser.version");
    literal(coordinates.linearUnit, "inch", "coordinates.linearUnit"); literal(coordinates.upAxis, "z", "coordinates.upAxis"); literal(coordinates.transforms, "definition-local", "coordinates.transforms");
    const r = new ManifestReader(limits);
    const definitions = readCollection(source.definitions, "definitions", limits.maxDefinitions, (v, i) => r.definition(v, i));
    if (definitions.total === 0) invalid("definitions", "root definition is missing");
    const instances = readCollection(source.instances, "instances", limits.maxInstances, (v, i) => r.instance(v, i));
    ensureAcyclic(instances.items, definitions.items.map(({ key }) => key));
    const manifest: StudioBg3dSkpSceneManifest = {
      version: 1, parser: { name: "openskp", version: "1.3.0" }, coverage: "parser-exposed-metadata-only", rootDefinitionKey: "root",
      coordinates: { linearUnit: "inch", upAxis: "z", transforms: "definition-local" }, sourceVersion: readSourceVersion(source.sourceVersion, r.reader),
      declaredUnits: source.declaredUnits === null ? null : r.reader.string(source.declaredUnits, "declaredUnits"), definitions, instances,
      pages: readCollection(source.pages, "pages", limits.maxPages, (v, i) => r.page(v, i)), tags: readCollection(source.tags, "tags", limits.maxTags, (v, i) => r.tag(v, i)),
      annotations: readCollection(source.annotations, "annotations", limits.maxAnnotations, (v, i) => r.annotation(v, i)), styles: readCollection(source.styles, "styles", limits.maxStyles, (v, i) => r.style(v, i)),
      diagnostics: r.diagnostics(source.diagnostics),
    };
    return { ok: true, value: manifest };
  } catch (error) {
    if (error instanceof ManifestFailure) return { ok: false, code: error.code, path: error.path, detail: error.message };
    return { ok: false, code: "invalid-source", path: "$manifest", detail: "manifest could not be read safely" };
  }
}
