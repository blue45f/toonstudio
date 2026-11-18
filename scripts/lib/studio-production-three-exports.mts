import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIST_DIR } from "./repo-paths.mjs";

interface ManifestEntry {
  readonly file: string;
  readonly imports?: readonly string[];
}

export interface StudioProductionThreeExport {
  readonly moduleUrl: string;
  readonly exportName: string;
}

export interface StudioProductionThreeExports {
  readonly WebGLRenderer: StudioProductionThreeExport;
  readonly PerspectiveCamera: StudioProductionThreeExport;
  readonly Scene: StudioProductionThreeExport;
  readonly scenePrimitives?: {
    readonly BoxGeometry: StudioProductionThreeExport;
    readonly MeshBasicMaterial: StudioProductionThreeExport;
    readonly Mesh: StudioProductionThreeExport;
  };
}

/** 원본 청크와 같은 빌드의 정적 import만 따라간다. 동적 엔진이나 개발용 Three를 섞지 않는다. */
export function studioProductionThreeModuleUrls(entryUrl: string, input: unknown): readonly string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("프로덕션 Vite manifest가 객체가 아닙니다.");
  }
  const manifest = new Map<string, ManifestEntry>();
  for (const [key, value] of Object.entries(input)) {
    if (!value || typeof value !== "object" || !Reflect.has(value, "file")) {
      throw new Error(`프로덕션 manifest 항목이 올바르지 않습니다: ${key}`);
    }
    const file: unknown = Reflect.get(value, "file");
    const imports: unknown = Reflect.get(value, "imports");
    if (typeof file !== "string" || (imports !== undefined
      && (!Array.isArray(imports) || !imports.every((item) => typeof item === "string")))) {
      throw new Error(`프로덕션 manifest 파일/import 계약이 올바르지 않습니다: ${key}`);
    }
    manifest.set(key, { file, imports });
  }
  const entry = new URL(entryUrl);
  const roots = [...manifest].filter(([, value]) => entry.pathname.endsWith(`/${value.file}`));
  if (roots.length !== 1) {
    throw new Error(`프로덕션 Three 진입점이 manifest에 유일하지 않습니다: ${entry.pathname} (${roots.length})`);
  }
  const root = roots[0]!;
  const base = new URL(entry.href);
  base.pathname = entry.pathname.slice(0, -root[1].file.length);
  base.search = "";
  base.hash = "";
  const visited = new Set<string>();
  const urls = new Set<string>();
  function visit(key: string): void {
    if (visited.has(key)) return;
    visited.add(key);
    const record = manifest.get(key);
    if (!record) throw new Error(`프로덕션 Three 정적 import가 manifest에 없습니다: ${key}`);
    const url = new URL(record.file, base);
    if (!/\.m?js$/u.test(record.file) || record.file.includes("\\")
      || record.file.split("/").some((segment) => segment === "." || segment === "..")
      || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      throw new Error(`프로덕션 Three import가 빌드 파일 경계를 벗어났습니다: ${record.file}`);
    }
    urls.add(url.href);
    for (const dependency of record.imports ?? []) visit(dependency);
  }
  visit(root[0]);
  return [...urls];
}

export function readStudioProductionThreeModuleUrls(entryUrl: string, distDirectory = DIST_DIR): readonly string[] {
  const manifest: unknown = JSON.parse(readFileSync(join(distDirectory, ".vite", "manifest.json"), "utf8"));
  return studioProductionThreeModuleUrls(entryUrl, manifest);
}

/** page.evaluate에서 실행한다. 축약된 이름/함수 문자열 대신 실제 공개 메서드와 브랜드를 검사한다. */
export async function resolveStudioProductionThreeExports(input: readonly string[] | Readonly<{
  moduleUrls: readonly string[];
  scenePrimitives: true;
}>): Promise<StudioProductionThreeExports> {
  const moduleUrls = "moduleUrls" in input ? input.moduleUrls : input;
  const includePrimitives = "moduleUrls" in input && input.scenePrimitives;
  if (!moduleUrls.length) throw new Error("프로덕션 Three import 그래프가 비어 있습니다.");
  const matches = {
    WebGLRenderer: new Map<unknown, StudioProductionThreeExport[]>(),
    PerspectiveCamera: new Map<unknown, StudioProductionThreeExport[]>(),
    Scene: new Map<unknown, StudioProductionThreeExport[]>(),
    BoxGeometry: new Map<unknown, StudioProductionThreeExport[]>(),
    MeshBasicMaterial: new Map<unknown, StudioProductionThreeExport[]>(),
    Mesh: new Map<unknown, StudioProductionThreeExport[]>(),
  };
  const rejectedCandidates: string[] = [];
  const cameraMethods = ["setFocalLength", "getFocalLength", "getFilmWidth", "getFilmHeight", "setViewOffset", "updateProjectionMatrix"];
  for (const moduleUrl of [...new Set(moduleUrls)]) {
    const namespace: Record<string, unknown> = await import(/* @vite-ignore */ moduleUrl);
    for (const [exportName, value] of Object.entries(namespace)) {
      if (typeof value !== "function") continue;
      const prototype: unknown = value.prototype;
      if (!prototype || typeof prototype !== "object") continue;
      const binding = { moduleUrl, exportName };
      const add = (kind: keyof typeof matches) => {
        matches[kind].set(value, [...(matches[kind].get(value) ?? []), binding]);
      };
      const coordinateSystem = Object.getOwnPropertyDescriptor(prototype, "coordinateSystem");
      const outputColorSpace = Object.getOwnPropertyDescriptor(prototype, "outputColorSpace");
      if (typeof coordinateSystem?.get === "function"
        && typeof outputColorSpace?.get === "function" && typeof outputColorSpace.set === "function") {
        add("WebGLRenderer");
      }
      if (cameraMethods.every((method) => typeof Object.getOwnPropertyDescriptor(prototype, method)?.value === "function")) {
        add("PerspectiveCamera");
      }
      // CPU 장면/지오메트리/재질 계약에 맞는 후보만 생성한다. 렌더러와 임의 함수는 제외한다.
      const methods = (names: readonly string[]) => names.every((name) => typeof Reflect.get(prototype, name) === "function");
      const ownMethods = (names: readonly string[]) => names.every((name) => typeof Object.getOwnPropertyDescriptor(prototype, name)?.value === "function");
      const sceneCandidate = ownMethods(["copy", "toJSON"]) && methods(["add", "remove", "updateMatrixWorld"]);
      const geometryCandidate = includePrimitives && ownMethods(["copy"])
        && methods(["getAttribute", "setAttribute", "dispose"]) && typeof Reflect.get(value, "fromJSON") === "function";
      const materialCandidate = includePrimitives && ownMethods(["copy"]) && methods(["setValues", "dispose", "toJSON"]);
      const meshCandidate = includePrimitives && ownMethods(["updateMorphTargets", "getVertexPosition", "raycast"]);
      if (!sceneCandidate && !geometryCandidate && !materialCandidate && !meshCandidate) continue;
      let instance: unknown;
      try {
        instance = Reflect.construct(value, []);
      } catch (error) {
        rejectedCandidates.push(`${exportName}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (!instance || typeof instance !== "object") continue;
      const type: unknown = Reflect.get(instance, "type");
      if (sceneCandidate && type === "Scene" && Reflect.get(instance, "isScene") === true
        && Reflect.get(instance, "isObject3D") === true) add("Scene");
      if (geometryCandidate && type === "BoxGeometry" && Reflect.get(instance, "isBufferGeometry") === true) add("BoxGeometry");
      if (materialCandidate && type === "MeshBasicMaterial" && Reflect.get(instance, "isMeshBasicMaterial") === true
        && Reflect.get(instance, "isMaterial") === true) add("MeshBasicMaterial");
      if (meshCandidate && type === "Mesh" && Reflect.get(instance, "isMesh") === true
        && Reflect.get(instance, "isObject3D") === true) add("Mesh");
      const dispose = (object: unknown) => {
        if (!object || typeof object !== "object") return;
        const method: unknown = Reflect.get(object, "dispose");
        if (typeof method === "function") Reflect.apply(method, object, []);
      };
      dispose(instance);
      if (meshCandidate) {
        dispose(Reflect.get(instance, "geometry"));
        const material: unknown = Reflect.get(instance, "material");
        for (const item of Array.isArray(material) ? material : [material]) dispose(item);
      }
    }
  }
  const resolve = (kind: keyof typeof matches): StudioProductionThreeExport => {
    const candidates = matches[kind];
    if (candidates.size !== 1) {
      throw new Error(`프로덕션 Three ${kind} 구현은 하나여야 합니다: ${candidates.size}; 청크 ${moduleUrls.length}개; 후보 오류 ${JSON.stringify(rejectedCandidates)}`);
    }
    const aliases = [...candidates.values()][0]!;
    return aliases.find((alias) => alias.exportName === kind) ?? aliases[0]!;
  };
  return { WebGLRenderer: resolve("WebGLRenderer"), PerspectiveCamera: resolve("PerspectiveCamera"), Scene: resolve("Scene"),
    ...(includePrimitives ? { scenePrimitives: { BoxGeometry: resolve("BoxGeometry"), MeshBasicMaterial: resolve("MeshBasicMaterial"), Mesh: resolve("Mesh") } } : {}) };
}
