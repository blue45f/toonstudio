import { parseStudioBg3dSkpSceneManifest } from "./studio-bg3d-skp-scene-manifest";
import { isStudioBg3dSkpUnit, studioBg3dSkpUnitScaleFactor } from "./studio-bg3d-skp-unit";

import type { StudioBg3dSkpSceneManifest } from "./studio-bg3d-skp-scene-manifest";
import type { StudioBg3dSkpUnit } from "./studio-bg3d-skp-unit";

export type StudioBg3dSkpSceneSourceReason =
  | "metadata-pass-size-limit" | "parser-unavailable" | "metadata-parse-failed"
  | "manifest-invalid-source" | "manifest-budget-exceeded";

export type StudioBg3dSkpGeometryTransform =
  | {
    readonly status: "known";
    readonly authority: "openskp-1.3.0/buildScene+toonstudio-unit-override";
    readonly sourceUnit: "inch";
    readonly sourceUpAxis: "z";
    readonly outputUnit: "meter";
    readonly outputUpAxis: "y";
    /** 설치된 buildScene이 적용하는 (x,y,z)→(x,z,-y). 표시 단위에서 추정하지 않는다. */
    readonly axisMapping: "x,z,-y";
    readonly appliedUnit: StudioBg3dSkpUnit;
    readonly unitScaleFactor: number;
    readonly userSelectedUnit: boolean;
    readonly metersPerSourceUnit: number;
  }
  | { readonly status: "unknown"; readonly reason: "legacy-not-recorded" };

interface SceneSourceBase {
  readonly version: 1;
  readonly geometryTransform: StudioBg3dSkpGeometryTransform;
}

/** available은 파서 노출 정보만 확보했다는 뜻이다. manifest의 sourceTotal:null과 한계 진단을 그대로 보존한다. */
export type StudioBg3dSkpSceneSource = SceneSourceBase & (
  | { readonly status: "available"; readonly manifest: StudioBg3dSkpSceneManifest; readonly reason: null }
  | { readonly status: "unavailable"; readonly manifest: null; readonly reason: StudioBg3dSkpSceneSourceReason }
  | { readonly status: "legacy"; readonly manifest: null; readonly reason: "not-recorded" }
);

export type StudioBg3dSkpSceneSourceParseResult =
  | { readonly ok: true; readonly value: StudioBg3dSkpSceneSource }
  | { readonly ok: false; readonly code: "invalid-source" | "budget-exceeded"; readonly path: string; readonly detail: string };

export function studioBg3dSkpGeometryTransform(
  appliedUnit: StudioBg3dSkpUnit = "inch", userSelectedUnit = false,
): StudioBg3dSkpGeometryTransform {
  if (appliedUnit !== "inch" && !userSelectedUnit) throw new TypeError("studio-bg3d-skp:unit-override-not-selected");
  const unitScaleFactor = studioBg3dSkpUnitScaleFactor(appliedUnit);
  return {
    status: "known", authority: "openskp-1.3.0/buildScene+toonstudio-unit-override",
    sourceUnit: "inch", sourceUpAxis: "z", outputUnit: "meter", outputUpAxis: "y", axisMapping: "x,z,-y",
    appliedUnit, unitScaleFactor, userSelectedUnit, metersPerSourceUnit: 0.0254 * unitScaleFactor,
  };
}

export function unavailableStudioBg3dSkpSceneSource(reason: StudioBg3dSkpSceneSourceReason): StudioBg3dSkpSceneSource {
  return { version: 1, status: "unavailable", manifest: null, reason, geometryTransform: studioBg3dSkpGeometryTransform() };
}

export function legacyStudioBg3dSkpSceneSource(): StudioBg3dSkpSceneSource {
  return { version: 1, status: "legacy", manifest: null, reason: "not-recorded", geometryTransform: { status: "unknown", reason: "legacy-not-recorded" } };
}

/** 원본 manifest는 바꾸지 않고, 실제 GLB에 추가로 적용한 단위 배율만 갱신한다. */
export function applyStudioBg3dSkpSceneSourceUnit(
  source: StudioBg3dSkpSceneSource,
  units: { readonly appliedUnit: StudioBg3dSkpUnit; readonly scaleFactor: number; readonly userSelected: boolean },
): StudioBg3dSkpSceneSource {
  if (source.geometryTransform.status === "unknown") return source;
  if (units.scaleFactor !== studioBg3dSkpUnitScaleFactor(units.appliedUnit)) throw new TypeError("studio-bg3d-skp:inconsistent-unit-authority");
  return { ...source, geometryTransform: studioBg3dSkpGeometryTransform(units.appliedUnit, units.userSelected) };
}

function dataRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length <= 16 && keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === "string" && descriptor !== undefined && "value" in descriptor && descriptor.enumerable;
  });
}

function fields(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isReason(value: unknown): value is StudioBg3dSkpSceneSourceReason {
  return value === "metadata-pass-size-limit" || value === "parser-unavailable" || value === "metadata-parse-failed"
    || value === "manifest-invalid-source" || value === "manifest-budget-exceeded";
}

function readTransform(value: unknown): StudioBg3dSkpGeometryTransform | null {
  if (!dataRecord(value)) return null;
  if (value.status === "unknown") return fields(value, ["status", "reason"]) && value.reason === "legacy-not-recorded"
    ? { status: "unknown", reason: "legacy-not-recorded" } : null;
  if (!fields(value, ["status", "authority", "sourceUnit", "sourceUpAxis", "outputUnit", "outputUpAxis", "axisMapping", "appliedUnit", "unitScaleFactor", "userSelectedUnit", "metersPerSourceUnit"])
    || value.status !== "known" || value.authority !== "openskp-1.3.0/buildScene+toonstudio-unit-override"
    || value.sourceUnit !== "inch" || value.sourceUpAxis !== "z" || value.outputUnit !== "meter" || value.outputUpAxis !== "y"
    || value.axisMapping !== "x,z,-y" || !isStudioBg3dSkpUnit(value.appliedUnit) || typeof value.userSelectedUnit !== "boolean") return null;
  if (value.appliedUnit !== "inch" && !value.userSelectedUnit) return null;
  const transform = studioBg3dSkpGeometryTransform(value.appliedUnit, value.userSelectedUnit);
  return transform.status === "known" && value.unitScaleFactor === transform.unitScaleFactor && value.metersPerSourceUnit === transform.metersPerSourceUnit
    ? transform : null;
}

/** Worker·GLB의 누락은 legacy이며 잘못된 available payload는 legacy로 바꾸지 않고 거부한다. */
export function parseStudioBg3dSkpSceneSource(value: unknown): StudioBg3dSkpSceneSourceParseResult {
  const invalid = (): StudioBg3dSkpSceneSourceParseResult => ({ ok: false, code: "invalid-source", path: "$sceneSource", detail: "scene source does not match version 1" });
  try {
    if (value === undefined) return { ok: true, value: legacyStudioBg3dSkpSceneSource() };
    if (!dataRecord(value) || !fields(value, ["version", "status", "manifest", "reason", "geometryTransform"]) || value.version !== 1) return invalid();
    const geometryTransform = readTransform(value.geometryTransform);
    if (!geometryTransform) return invalid();
    if (value.status === "legacy") return value.manifest === null && value.reason === "not-recorded" && geometryTransform.status === "unknown"
      ? { ok: true, value: legacyStudioBg3dSkpSceneSource() } : invalid();
    if (geometryTransform.status !== "known") return invalid();
    if (value.status === "unavailable") return value.manifest === null && isReason(value.reason)
      ? { ok: true, value: { version: 1, status: "unavailable", manifest: null, reason: value.reason, geometryTransform } } : invalid();
    if (value.status !== "available" || value.reason !== null) return invalid();
    const manifest = parseStudioBg3dSkpSceneManifest(value.manifest);
    return manifest.ok ? { ok: true, value: { version: 1, status: "available", manifest: manifest.value, reason: null, geometryTransform } } : manifest;
  } catch {
    return invalid();
  }
}
