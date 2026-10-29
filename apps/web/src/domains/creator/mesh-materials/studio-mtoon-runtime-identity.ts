/** 업로드 userData와 분리하여 앱이 생성한 재질 인스턴스의 실제 렌더 계약을 식별한다. */
import type { Material } from "three";

export type StudioMToonMaterialBackend = "webgl" | "webgpu";
export interface StudioMToonRuntimeIdentity {
  readonly backend: StudioMToonMaterialBackend;
  readonly revision: string;
}
interface Registration extends StudioMToonRuntimeIdentity {
  readonly validate: () => boolean;
}
const registrations = new WeakMap<Material, Registration>();

/** 생성한 대상마다 등록한다. clone의 원본 callback이나 외부 직렬화 표식을 재사용하지 않는다. */
export function registerStudioMToonRuntimeMaterial(material: Material, registration: Registration): void {
  registrations.set(material, Object.freeze({ ...registration }));
}

/** 미등록 레거시와 손상된 앱 재질을 구분한다. 등록 존재만으로 렌더 계약을 승인하지 않는다. */
export function hasStudioMToonRuntimeRegistration(material: Material): boolean {
  return registrations.has(material);
}

/** 등록 이후 shader·callback·node 계약이 바뀐 재질은 승인된 런타임으로 취급하지 않는다. */
export function readStudioMToonRuntimeIdentity(material: Material): StudioMToonRuntimeIdentity | null {
  const registration = registrations.get(material);
  if (!registration || !registration.validate()) return null;
  return { backend: registration.backend, revision: registration.revision };
}
