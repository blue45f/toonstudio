/**
 * 사용자 색(customColors)이 어느 재질에 닿는지 — 부위 분류와 피부색 규칙.
 *
 * `studio-vrm-poser-utils.ts` 의 `applyVrmCustomColors` 가 쓰는 판정을 한곳에 모았다(분류 함수는
 * 그 파일에서 옮겨 왔고 같은 이름으로 다시 내보낸다).
 *
 * 피부색(A-11, 2026-10-23): 셰이퍼의 피부색은 사용자 색 `body` 다. 예전에는 VRoid 얼굴 피부
 * (`Face_00_SKIN`)가 이름 때문에 `face` 로 분류돼 몸만 물들고 얼굴은 원래 색으로 남아 목에 경계가
 * 생겼다. 이제 피부 재질은 얼굴이든 몸이든 `body` 를 따른다(얼굴 색 `face` 를 따로 정했으면 그것이 우선).
 * 그리고 MToon 그림자 색을 같은 비율로 물들인다 — 밝은 원래 그림자에 어두운 피부를 곱하면 그림자가
 * 오히려 더 밝은 명암 역전이 생긴다.
 */
import * as THREE from "three";

/**
 * Map a single mesh/material name to a recolor slot.
 * Hair before bare "top" (Hair_Top); face before body/head; cloth before generic body.
 */
export function classifyVrmCustomColorPart(nameRaw: string): string | null {
  const name = nameRaw.toLowerCase();
  if (!name.trim()) return null;
  if (name.includes("hair") || name.includes("kami")) return "hair";
  if (
    name.includes("face")
    || name.includes("eye")
    || name.includes("mouth")
    || name.includes("brow")
    || name.includes("lash")
    || name.includes("tooth")
  ) {
    return "face";
  }
  // Clothing before body — VRoid bakes Tops/Bottoms materials onto a node named "Body".
  // Bottoms before generic "cloth" so names like Bottoms_01_CLOTH do not fall into tops.
  if (
    name.includes("bottoms")
    || name.includes("bottom")
    || name.includes("pants")
    || name.includes("skirt")
    || name.includes("shoes")
    || name.includes("boot")
    || name.includes("sock")
    || name.includes("acc")
  ) {
    return "bottoms";
  }
  if (
    name.includes("tops")
    || name.includes("clothes")
    || name.includes("cloth")
    || name.includes("shirt")
    || name.includes("jacket")
    || name.includes("coat")
    || name.includes("wear")
    || /(^|[^a-z])top([^a-z]|$)/.test(name)
  ) {
    return "tops";
  }
  if (
    name.includes("body")
    || name.includes("skin")
    || name.includes("hand")
    || name.includes("leg")
    || name.includes("arm")
    || name.includes("foot")
    || name.includes("head")
    || name.includes("neck")
    || name.includes("torso")
  ) {
    return "body";
  }
  return null;
}

/**
 * Prefer material name over mesh name so multi-material "Body" meshes (skin + tops + bottoms
 * + hair) recolor only the matching primitive, not the entire body as one slot.
 */
export function classifyVrmCustomColorPartForMaterial(
  meshName: string,
  materialName?: string | null,
): string | null {
  return classifyVrmCustomColorPart(materialName ?? "")
    ?? classifyVrmCustomColorPart(meshName);
}

function isActiveHex(hex: string | undefined): hex is string {
  if (typeof hex !== "string") return false;
  const normalized = hex.trim().toLowerCase();
  return normalized !== "" && normalized !== "#ffffff" && normalized !== "#fff";
}

/** 재질 이름이 피부(`_SKIN`, `Skin`)인지. 눈·입·눈썹 같은 얼굴 재질은 피부가 아니다. */
export function isVrmSkinMaterialName(materialName: string | null | undefined): boolean {
  return /skin/i.test(materialName ?? "");
}

/**
 * 재질 하나가 받을 사용자 색. 얼굴 피부는 이름상 `face` 로 분류되지만 피부색(`body`)을 따른다 —
 * 사용자가 얼굴 색(`face`)을 따로 정했을 때만 그 색을 쓴다.
 */
export function resolveVrmCustomColorHex(
  part: string | null,
  materialName: string | null | undefined,
  customColors: Readonly<Record<string, string>>,
): string | undefined {
  if (!part) return undefined;
  if (part === "face" && isVrmSkinMaterialName(materialName) && !isActiveHex(customColors.face)) {
    return customColors.body;
  }
  return customColors[part];
}

/** 피부 재질 그림자 원본(첫 변경 직전 값)과 지금 적용 중인 그림자 배율. */
const SKIN_SHADE_ORIGINAL = "__vrmSkinShadeOriginal";
const SKIN_SHADE_TINT = "__vrmSkinShadeTint";
/** `applyVrmMaterialFx` 가 그림자 색을 직접 덮어쓰는 동안 true. 그때는 피부 배율을 얹지 않는다. */
export const VRM_MATERIAL_FX_SHADE_OVERRIDE = "__vrmMaterialFxShadeOverride";

interface ShadeMaterial {
  readonly shadeColorFactor?: THREE.Color;
  readonly userData: Record<string, unknown>;
}

function pristineShade(material: ShadeMaterial): THREE.Color | null {
  const fxOriginal = (material.userData.__vrmMaterialFxOriginal as { shadeColor?: THREE.Color } | undefined)?.shadeColor;
  const stored = material.userData[SKIN_SHADE_ORIGINAL] as THREE.Color | undefined;
  return stored ?? fxOriginal ?? null;
}

/** 재질 효과(그림자 색) 원본을 잡을 때 피부 배율이 섞이지 않은 값을 돌려준다. */
export function readVrmPristineShadeColor(material: ShadeMaterial): THREE.Color | undefined {
  return (material.userData[SKIN_SHADE_ORIGINAL] as THREE.Color | undefined) ?? material.shadeColorFactor;
}

/** 재질 효과를 끌 때 원본 그림자로 돌리되, 피부색이 살아 있으면 그 배율을 다시 얹는다. */
export function restoreVrmShadeColor(material: ShadeMaterial, original: THREE.Color): void {
  const shade = material.shadeColorFactor;
  if (!shade) return;
  shade.copy(original);
  const tint = material.userData[SKIN_SHADE_TINT] as THREE.Color | undefined;
  if (tint) shade.multiply(tint);
}

/**
 * 피부 재질의 MToon 그림자 색을 피부색 톤에 맞춘다. 밝은 색 경로(텍스처 × 색)에서 바뀐 비율
 * (목표색 / 원래 밝은 면 색)을 그림자에도 같은 비율로 곱한다. `targetHex` 가 null 이거나 피부가
 * 아니면 원래 그림자로 되돌린다.
 */
export function syncVrmSkinToneShade(
  material: ShadeMaterial,
  materialName: string | null | undefined,
  targetHex: string | null,
): void {
  const shade = material.shadeColorFactor;
  if (!shade) return;
  const active = targetHex !== null && isActiveHex(targetHex) && isVrmSkinMaterialName(materialName);
  if (!active) {
    const original = material.userData[SKIN_SHADE_ORIGINAL] as THREE.Color | undefined;
    if (!original) return;
    delete material.userData[SKIN_SHADE_TINT];
    delete material.userData[SKIN_SHADE_ORIGINAL];
    if (material.userData[VRM_MATERIAL_FX_SHADE_OVERRIDE] !== true) shade.copy(original);
    return;
  }
  const original = pristineShade(material) ?? shade.clone();
  material.userData[SKIN_SHADE_ORIGINAL] = original;
  const lit = (material.userData.__vrmCustomColorOriginal as THREE.Color | undefined) ?? new THREE.Color(1, 1, 1);
  const target = new THREE.Color(targetHex);
  const ratio = (channel: number, base: number) => Math.min(1.5, Math.max(0, channel / Math.max(0.05, base)));
  const tint = new THREE.Color(ratio(target.r, lit.r), ratio(target.g, lit.g), ratio(target.b, lit.b));
  material.userData[SKIN_SHADE_TINT] = tint;
  if (material.userData[VRM_MATERIAL_FX_SHADE_OVERRIDE] === true) return;
  shade.copy(original).multiply(tint);
  shade.setRGB(Math.min(1, shade.r), Math.min(1, shade.g), Math.min(1, shade.b));
}
