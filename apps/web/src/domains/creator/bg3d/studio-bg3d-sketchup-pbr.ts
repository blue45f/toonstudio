/**
 * SketchUp 건축 컴포넌트 물리 기반 PBR 재질 보정기.
 *
 * `buildSketchUpArchitecturalComponentPrimitives`가 생성하는 계단·지붕·창호·회랑·상가·옥상·쉘터
 * 프리미티브에 이진 금속도(`metalness: 0 | 1`)와 표면 거칠기(`roughness`), 강화유리 투과율
 * (`opacityMultiplier: 0.38`)을 보정한 `StudioBg3dMaterialOverride`를 부여한다.
 */

import type { BgPrimitive } from "../studio-background-3d-metadata";
import {
  DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
  type StudioBg3dMaterialOverride,
} from "./studio-bg3d-scene-document-types";
import type { SketchUpArchitecturalComponentKind } from "./studio-bg3d-sketchup-full-engine";

function makePbrOverride(patch: {
  readonly roughness: number;
  readonly metalness: 0 | 1;
  readonly opacityMultiplier?: number;
}): StudioBg3dMaterialOverride {
  return {
    ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
    roughness: patch.roughness,
    metalness: patch.metalness,
    opacityMultiplier: patch.opacityMultiplier ?? 1,
  };
}

const PBR_STONE_CONCRETE = makePbrOverride({ roughness: 0.78, metalness: 0 });
const PBR_HONED_LIMESTONE = makePbrOverride({ roughness: 0.72, metalness: 0 });
const PBR_WARM_TIMBER = makePbrOverride({ roughness: 0.36, metalness: 0 });
const PBR_TERRACOTTA_CLAY = makePbrOverride({ roughness: 0.66, metalness: 0 });
const PBR_MATTE_PLASTER = makePbrOverride({ roughness: 0.88, metalness: 0 });
const PBR_SATIN_SIGNBOARD = makePbrOverride({ roughness: 0.42, metalness: 0 });
const PBR_TEMPERED_GLASS = makePbrOverride({
  roughness: 0.08,
  metalness: 0,
  opacityMultiplier: 0.38,
});
const PBR_ANODIZED_STEEL = makePbrOverride({ roughness: 0.28, metalness: 1 });
const PBR_GALVANIZED_HVAC_METAL = makePbrOverride({ roughness: 0.32, metalness: 1 });
const PBR_BRUSHED_BRASS = makePbrOverride({ roughness: 0.24, metalness: 1 });

export function resolveSketchUpArchitecturalPrimitiveMaterialOverride(
  kind: SketchUpArchitecturalComponentKind,
  primitive: Pick<BgPrimitive, "id" | "name">,
): StudioBg3dMaterialOverride {
  const id = primitive.id.toLowerCase();
  const name = (primitive.name ?? "").toLowerCase();

  if (id.includes("-glass-") || name.includes("glass")) {
    return { ...PBR_TEMPERED_GLASS };
  }
  if (id.includes("brass") || id.includes("rail") || name.includes("brass") || name.includes("rail")) {
    return { ...PBR_BRUSHED_BRASS };
  }
  if (
    id === "skp-arch-spiral-column"
    || id.includes("-mullion-")
    || id.includes("-fan-")
    || id === "skp-arch-bus-canopy"
    || id === "skp-arch-bus-totem"
    || kind === "window-bay"
  ) {
    return { ...PBR_ANODIZED_STEEL };
  }
  if (
    id.includes("-hvac-")
    || id === "skp-arch-roof-duct"
    || id === "skp-arch-roof-tank"
    || id === "skp-arch-roof-tank-dome"
  ) {
    return { ...PBR_GALVANIZED_HVAC_METAL };
  }
  if (id.includes("-spiral-tread-") || id === "skp-arch-bus-bench") {
    return { ...PBR_WARM_TIMBER };
  }
  if (kind === "roof-gable" || kind === "roof-hip" || kind === "roof-hanok") {
    return { ...PBR_TERRACOTTA_CLAY };
  }
  if (id === "skp-arch-shop-wall" || id === "skp-arch-shop-awning") {
    return { ...PBR_MATTE_PLASTER };
  }
  if (id === "skp-arch-shop-sign" || id === "skp-arch-bus-adbox") {
    return { ...PBR_SATIN_SIGNBOARD };
  }
  if (kind === "street-colonnade" || kind === "door-arch" || id === "skp-arch-lstair-landing") {
    return { ...PBR_HONED_LIMESTONE };
  }
  return { ...PBR_STONE_CONCRETE };
}

export function calibrateSketchUpArchitecturalPrimitivesPbr(
  kind: SketchUpArchitecturalComponentKind,
  primitives: readonly BgPrimitive[],
): readonly BgPrimitive[] {
  return primitives.map((primitive) => ({
    ...primitive,
    materialOverride:
      primitive.materialOverride
      ?? resolveSketchUpArchitecturalPrimitiveMaterialOverride(kind, primitive),
  }));
}
