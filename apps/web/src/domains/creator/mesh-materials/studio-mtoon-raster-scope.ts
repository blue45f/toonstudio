/** 승인된 MToon의 타일 제출 동안만 폭·culling을 바꾸고, 전체 세션 동안 재질 clock을 고정한다. */
import type { Material, Object3D, Scene } from "three";

import { freezeStudioMToonInstanceMaterials } from "./studio-mtoon-instance-materials";
import { hasStudioMToonRuntimeFactors } from "./studio-mtoon-runtime-factors";
import { hasStudioMToonRuntimeRegistration, readStudioMToonRuntimeIdentity, type StudioMToonMaterialBackend } from "./studio-mtoon-runtime-identity";

type RasterMaterial = Material & {
  readonly isOutline: boolean;
  readonly shadingShiftFactor: number;
  readonly shadingToonyFactor: number;
  readonly outlineWidthMode: string;
  outlineWidthFactor: number;
  uniformsNeedUpdate?: boolean;
};
function hasRasterFactors(material: Material): material is RasterMaterial {
  return "isOutline" in material && typeof material.isOutline === "boolean"
    && "shadingShiftFactor" in material && typeof material.shadingShiftFactor === "number"
    && "shadingToonyFactor" in material && typeof material.shadingToonyFactor === "number"
    && "outlineWidthMode" in material && typeof material.outlineWidthMode === "string"
    && "outlineWidthFactor" in material && typeof material.outlineWidthFactor === "number";
}

/** 표식만 있는 외부 SDK 재질은 승인하지 않는다. 일반 PBR은 기존 admission이 판단한다. */
export function isStudioMToonRasterMaterial(material: Material, backend: StudioMToonMaterialBackend, policy: "strict" | "registered-only" = "strict"): boolean {
  const identity = readStudioMToonRuntimeIdentity(material);
  if (!identity) {
    if (hasStudioMToonRuntimeRegistration(material) || (policy === "strict" && (("isMToonMaterial" in material && material.isMToonMaterial === true)
      || ("isMToonNodeMaterial" in material && material.isMToonNodeMaterial === true)))) throw new Error("타일 출력용 MToon 런타임 계약이 손상되었습니다.");
    return false;
  }
  if (identity.backend !== backend || !hasRasterFactors(material) || !hasStudioMToonRuntimeFactors(material))
    throw new Error("MToon 재질의 타일 출력 backend 또는 수치가 올바르지 않습니다.");
  return true;
}

interface Binding { readonly object: Object3D; readonly materials: readonly Material[] }
function isMaterial(value: unknown): value is Material {
  return value !== null && typeof value === "object" && "isMaterial" in value && value.isMaterial === true;
}
function collect(scene: Scene, backend: StudioMToonMaterialBackend, policy: "strict" | "registered-only") {
  const materials = new Set<RasterMaterial>(), bindings: Binding[] = [];
  scene.traverseVisible((object) => {
    const input: unknown = "material" in object ? object.material : undefined;
    const candidates: readonly unknown[] = Array.isArray(input) ? input : input ? [input] : [];
    if (!candidates.every(isMaterial)) throw new Error("MToon 타일 출력의 재질 배열이 올바르지 않습니다.");
    const entries: readonly Material[] = candidates;
    let found = false;
    for (const material of entries) if (isStudioMToonRasterMaterial(material, backend, policy) && hasRasterFactors(material)) { materials.add(material); found = true; }
    if (found) bindings.push({ object, materials: [...entries] });
  });
  return { materials, bindings };
}
export interface StudioMToonRasterWindow { readonly fullHeight: number; readonly height: number }
export interface StudioMToonRasterScope {
  /** callback은 모든 draw/copy를 동기 제출해야 한다. 반환 Promise를 기다리기 전에 임시 상태를 복원한다. */
  submit<Value>(window: StudioMToonRasterWindow, submitSync: () => Value): Value;
  dispose(): void;
}
const submittingScenes = new WeakSet<Scene>();
export interface StudioMToonRasterScopeOptions {
  readonly registrationPolicy?: "strict" | "registered-only";
  readonly assertSceneCurrent?: () => void;
  readonly prepareScene?: () => (() => void);
}

export function beginStudioMToonRasterScope(
  scene: Scene, backend: StudioMToonMaterialBackend, options: StudioMToonRasterScopeOptions = {},
): StudioMToonRasterScope {
  if (backend !== "webgl" && backend !== "webgpu") throw new Error("MToon 타일 출력 backend가 올바르지 않습니다.");
  if (submittingScenes.has(scene)) throw new Error("MToon 타일 제출 중 새 scope를 시작할 수 없습니다.");
  const { assertSceneCurrent, prepareScene, registrationPolicy = "strict" } = options;
  if (registrationPolicy !== "strict" && registrationPolicy !== "registered-only") throw new Error("MToon 캡처의 등록 정책이 올바르지 않습니다.");
  assertSceneCurrent?.();
  const readBindings = () => {
    const restore = prepareScene?.();
    try { return collect(scene, backend, registrationPolicy); } finally { restore?.(); }
  };
  const initial = readBindings();
  const widths = new Map([...initial.materials].map((material) => [material, { factor: material.outlineWidthFactor, mode: material.outlineWidthMode, outline: material.isOutline }]));
  const releaseClock = freezeStudioMToonInstanceMaterials(initial.materials);
  let closed = false;
  return {
    submit(window, submitSync) {
      if (closed || submittingScenes.has(scene)) throw new Error("종료했거나 제출 중인 MToon 타일 출력입니다.");
      if (!Number.isSafeInteger(window.fullHeight) || !Number.isSafeInteger(window.height) || window.height < 1 || window.fullHeight < window.height)
        throw new Error("MToon 타일 높이가 올바르지 않습니다.");
      assertSceneCurrent?.();
      const current = readBindings();
      if (current.bindings.length !== initial.bindings.length || current.bindings.some((binding, index) => {
        const previous = initial.bindings[index];
        return !previous || binding.object !== previous.object || binding.materials.length !== previous.materials.length
          || binding.materials.some((material, slot) => material !== previous.materials[slot]);
      })) throw new Error("MToon 타일 출력 중 모델의 재질 연결이 변경되었습니다.");
      const changes: Array<{ material: RasterMaterial; factor: number; scaled: number }> = [];
      // 모든 수치를 먼저 검사하여 뒤쪽 overflow가 앞쪽 재질만 바꾸지 않게 한다.
      for (const material of current.materials) {
        const original = widths.get(material);
        if (!original || material.outlineWidthFactor !== original.factor || material.outlineWidthMode !== original.mode || material.isOutline !== original.outline)
          throw new Error("MToon 타일 출력 중 외곽선 설정이 변경되었습니다.");
        const scaled = material.outlineWidthMode === "screenCoordinates" ? original.factor * (window.fullHeight / window.height) : original.factor;
        if (!Number.isFinite(scaled) || !Number.isFinite(Math.fround(scaled))) throw new Error("MToon 타일 외곽선 폭이 Float32 범위를 벗어났습니다.");
        changes.push({ material, factor: original.factor, scaled });
      }
      const culling = current.bindings.map(({ object }) => ({ object, previous: object.frustumCulled }));
      submittingScenes.add(scene);
      try {
        for (const change of changes) { change.material.outlineWidthFactor = change.scaled; if ("uniformsNeedUpdate" in change.material) change.material.uniformsNeedUpdate = true; }
        for (const { object } of culling) object.frustumCulled = false;
        return submitSync();
      } finally {
        try {
          for (const change of changes) { change.material.outlineWidthFactor = change.factor; if ("uniformsNeedUpdate" in change.material) change.material.uniformsNeedUpdate = true; }
        } finally {
          for (const { object, previous } of culling) object.frustumCulled = previous;
          submittingScenes.delete(scene);
        }
      }
    },
    dispose() { if (!closed) { closed = true; releaseClock(); } },
  };
}
