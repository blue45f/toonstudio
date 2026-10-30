/** 기하 pass에서 승인된 툰 본체만 렌더한다. 원본 geometry·group·재질을 변경하지 않는다. */
import type { Material, Object3D, Scene } from "three";

import { hasStudioMToonRuntimeRegistration, readStudioMToonRuntimeIdentity, type StudioMToonMaterialBackend } from "./studio-mtoon-runtime-identity";

interface MaterialObject extends Object3D { material: Material | Material[] }
interface Binding {
  readonly object: MaterialObject;
  readonly original: Material | Material[];
  readonly entries: readonly Material[];
}
export interface StudioMToonGeometryScope {
  /** 한 번만 제출한다. 본체는 제출 순간 복제하며 Promise settlement 전에 장면을 복원한다. */
  submit<Value>(submitSync: () => Value): Value;
  /** 제출된 GPU 작업이 끝난 뒤 임시 재질만 해제한다. */
  dispose(): void;
}
function hasMaterial(object: Object3D): object is MaterialObject {
  if (!("material" in object)) return false;
  const input: unknown = object.material;
  const entries: readonly unknown[] = Array.isArray(input) ? input : [input];
  return entries.length > 0 && entries.every((entry) => entry !== null && typeof entry === "object" && "isMaterial" in entry && entry.isMaterial === true);
}
function isOutline(material: Material): boolean {
  if (!("isOutline" in material) || typeof material.isOutline !== "boolean") throw new Error("툰 기하 pass의 본체·외곽선 구분이 올바르지 않습니다.");
  return material.isOutline;
}
function releaseMaterials(materials: Iterable<Material>): unknown[] {
  const failures: unknown[] = [];
  for (const material of materials) try { material.dispose(); } catch (error) { failures.push(error); }
  return failures;
}

/** factory가 만든 본체 pass만 소유한다. 미등록 레거시는 기존 scene override의 동작을 유지한다. */
export function beginStudioMToonGeometryScope(options: {
  readonly scene: Scene;
  readonly backend: StudioMToonMaterialBackend;
  readonly fallbackMaterial: Material;
  readonly createBodyPass: (source: Material) => Material;
}): StudioMToonGeometryScope {
  const { scene, backend, fallbackMaterial, createBodyPass } = options;
  const previousOverride = scene.overrideMaterial;
  const owned = new Set<Material>(), replacements = new Map<Material, Material>(), bindings: Binding[] = [];
  const registered = new Map<Material, { readonly outline: boolean; readonly visible: boolean }>();
  const visibility = new Map<Material, boolean>();
  let invisible: Material | undefined, hasToon = false, closed = false, submitting = false, submitted = false;
  const hidden = () => {
    if (!invisible) { invisible = fallbackMaterial.clone(); invisible.visible = false; owned.add(invisible); }
    return invisible;
  };
  scene.traverseVisible((object) => {
    if (!hasMaterial(object)) return;
    const original = object.material, entries = Array.isArray(original) ? [...original] : [original];
    for (const material of entries) {
      visibility.set(material, material.visible);
      const identity = readStudioMToonRuntimeIdentity(material);
      if (!identity) {
        if (hasStudioMToonRuntimeRegistration(material)) throw new Error("툰 기하 pass의 등록된 재질 계약이 손상되었습니다.");
        continue;
      }
      if (identity.backend !== backend) throw new Error("툰 기하 pass와 표시 backend가 다릅니다.");
      hasToon = true;
      registered.set(material, { outline: isOutline(material), visible: material.visible });
    }
    bindings.push({ object, original, entries });
  });
  return {
    submit(submitSync) {
      if (closed || submitting || submitted) throw new Error("종료했거나 제출 중이거나 이미 제출한 툰 기하 pass입니다.");
      const current: MaterialObject[] = [];
      scene.traverseVisible((object) => { if (hasMaterial(object)) current.push(object); });
      if (current.length !== bindings.length || current.some((object, index) => object !== bindings[index]?.object)
        || [...visibility].some(([material, visible]) => material.visible !== visible)
        || scene.overrideMaterial !== previousOverride || bindings.some(({ object, original, entries }) => object.material !== original
        || (Array.isArray(original) && (original.length !== entries.length || original.some((material, index) => material !== entries[index]))))) {
        throw new Error("툰 기하 pass 준비 후 장면의 재질 연결이 바뀌었습니다.");
      }
      for (const [material, previous] of registered) if (readStudioMToonRuntimeIdentity(material)?.backend !== backend
        || isOutline(material) !== previous.outline || material.visible !== previous.visible)
        throw new Error("툰 기하 pass 제출 전 본체·외곽선 재질 계약이 바뀌었습니다.");
      submitting = true;
      submitted = true;
      try {
        // live uniform·side·clipping 입력은 제출 시점 factory가 한 번 복제한다. 준비 시점의 오래된 pass를 재사용하지 않는다.
        const prepared = hasToon ? bindings.map((binding) => {
          const entries = binding.entries.map((material) => {
            const registration = registered.get(material);
            if (!registration) return material.visible ? fallbackMaterial : hidden();
            if (registration.outline || !material.visible) return hidden();
            let pass = replacements.get(material);
            if (!pass) {
              pass = createBodyPass(material);
              if (pass === material || pass === fallbackMaterial) throw new Error("툰 기하 pass는 별도 소유 재질을 생성해야 합니다.");
              replacements.set(material, pass); owned.add(pass);
            }
            return pass;
          });
          return { object: binding.object, replacement: Array.isArray(binding.original) ? entries : entries[0]! };
        }) : [];
        scene.overrideMaterial = hasToon ? null : fallbackMaterial;
        for (const { object, replacement } of prepared) object.material = replacement;
        return submitSync();
      } finally {
        if (hasToon) for (const { object, original } of bindings) object.material = original;
        scene.overrideMaterial = previousOverride;
        submitting = false;
      }
    },
    dispose() {
      if (submitting) throw new Error("툰 기하 pass 제출 중에는 임시 재질을 해제할 수 없습니다.");
      if (closed) return;
      closed = true;
      const failures = releaseMaterials(owned);
      if (failures.length) throw new AggregateError(failures, "툰 기하 pass의 임시 재질을 정리하지 못했습니다.");
    },
  };
}
