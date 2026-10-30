/** 인스턴스 소유 MToon만 갱신한다. 업로드 표식은 런타임 승인 근거로 사용하지 않는다. */
import { BackSide, type Material } from "three";

import { readStudioMToonRuntimeIdentity } from "./studio-mtoon-runtime-identity";

type UpdatableMToon = Material & { readonly isOutline: boolean; update(deltaSeconds: number): void };
const clockFreezes = new WeakMap<Material, number>();
function hasMToonUpdate(material: Material): material is UpdatableMToon {
  return "isOutline" in material && typeof material.isOutline === "boolean" && "update" in material && typeof material.update === "function";
}
function ownedMToon(material: Material): UpdatableMToon | null {
  const identity = readStudioMToonRuntimeIdentity(material);
  const branded = ("isMToonMaterial" in material && material.isMToonMaterial === true)
    || ("isMToonNodeMaterial" in material && material.isMToonNodeMaterial === true);
  if (!identity) {
    if (branded) throw new Error("MToon 재질의 승인된 런타임과 shader 계약을 확인하지 못했습니다.");
    return null;
  }
  if (!hasMToonUpdate(material)) {
    throw new Error("MToon 재질의 인스턴스 갱신 계약이 올바르지 않습니다.");
  }
  return material;
}

/** override와 reset의 copy 이후 opacity·texture matrix를 동기화하고 inverted hull side를 지킨다. */
export function synchronizeStudioMToonMaterialOverride(material: Material): boolean {
  const mtoon = ownedMToon(material); if (!mtoon) return false;
  if (mtoon.isOutline) mtoon.side = BackSide;
  mtoon.update(0); mtoon.needsUpdate = true;
  return true;
}

/** caller는 clone의 editable bindings만 전달한다. 같은 재질이 여러 mesh에서 쓰여도 한 번만 갱신한다. */
export function updateStudioMToonInstanceMaterials(materials: Iterable<Material>, deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error("MToon 인스턴스 시간은 유한한 0 이상의 값이어야 합니다.");
  const accepted: UpdatableMToon[] = [], seen = new Set<Material>();
  for (const material of materials) {
    if (seen.has(material)) continue;
    seen.add(material); const mtoon = ownedMToon(material); if (mtoon) accepted.push(mtoon);
  }
  // 전체 목록을 먼저 검증하여 뒤쪽의 손상 재질 때문에 앞쪽 시간만 진행되지 않게 한다.
  for (const material of accepted) material.update(clockFreezes.has(material) ? 0 : deltaSeconds);
}

/** 겹친 캡처는 각자 clock lease를 반납한다. source·형제 재질은 목록에 없으면 갱신에 영향이 없다. */
export function freezeStudioMToonInstanceMaterials(materials: Iterable<Material>): () => void {
  const accepted = new Set<UpdatableMToon>();
  for (const material of materials) { const mtoon = ownedMToon(material); if (mtoon) accepted.add(mtoon); }
  for (const material of accepted) clockFreezes.set(material, (clockFreezes.get(material) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const material of accepted) {
      const count = clockFreezes.get(material) ?? 0;
      if (count <= 1) clockFreezes.delete(material); else clockFreezes.set(material, count - 1);
    }
  };
}
