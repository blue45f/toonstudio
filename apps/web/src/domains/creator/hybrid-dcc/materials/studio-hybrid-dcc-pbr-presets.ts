/**
 * 정밀 3D 모델러(Hybrid DCC)용 물리 기반 스튜디오 표면 재질 프리셋(Physically Plausible Studio PBR).
 *
 * 원칙:
 * - 이진 금속도(Binary Metallic): 유전체(점토·원목·석재·패브릭·백자·크리스탈)는 항상 `metalness: 0.0`,
 *   순수 금속(황동·스틸)은 항상 `metalness: 1.0`을 유지해 비물리적 프레넬 오염을 원천 차단한다.
 * - 유광 원목·백자는 `clearcoat`(바니시/유약 코팅), 무광 직물은 `sheen`(미세 섬유 역광),
 *   보석·프리즘 수정은 Blender 5.3 OpenPBR 규약에 맞춘 `transmission` + `dispersion`(빛 분산)으로 표현한다.
 */

export type StudioHybridDccPbrPresetId =
  | "studio-clay"
  | "satin-oak"
  | "limestone"
  | "brushed-brass"
  | "anodized-steel"
  | "matte-fabric"
  | "glazed-porcelain"
  | "crystal-prism";

export interface StudioHybridDccPbrPreset {
  readonly id: StudioHybridDccPbrPresetId;
  readonly label: readonly [ko: string, en: string];
  readonly hint: readonly [ko: string, en: string];
  /** null이면 뷰포트 기본 클레이/선택 팔레트 색상을 그대로 따른다. */
  readonly baseColor: string | null;
  readonly selectedColor: string | null;
  readonly metalness: 0 | 1;
  readonly roughness: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly sheen: number;
  readonly sheenRoughness: number;
  readonly sheenColor: string;
  readonly ior: number;
  readonly transmission: number;
  readonly dispersion: number;
  readonly thickness: number;
}

export const STUDIO_HYBRID_DCC_PBR_PRESETS: readonly StudioHybridDccPbrPreset[] = Object.freeze([
  {
    id: "studio-clay",
    label: ["스튜디오 점토", "Studio clay"],
    hint: ["모서리 베벨·실루엣 검사용 표준 유전체", "Clean dielectric form-check clay"],
    baseColor: null,
    selectedColor: null,
    metalness: 0,
    roughness: 0.46,
    clearcoat: 0.16,
    clearcoatRoughness: 0.26,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: "#ffffff",
    ior: 1.5,
    transmission: 0,
    dispersion: 0,
    thickness: 0,
  },
  {
    id: "satin-oak",
    label: ["새틴 원목", "Satin oak"],
    hint: ["바니시 코팅 마루·가구 목재", "Satin-varnished timber joinery"],
    baseColor: "#a87449",
    selectedColor: "#dc853d",
    metalness: 0,
    roughness: 0.36,
    clearcoat: 0.46,
    clearcoatRoughness: 0.20,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: "#ffffff",
    ior: 1.52,
    transmission: 0,
    dispersion: 0,
    thickness: 0,
  },
  {
    id: "limestone",
    label: ["노출 석재", "Limestone"],
    hint: ["건축 외벽·기단·콘크리트 무광 석재", "Matte architectural stone & concrete"],
    baseColor: "#cdc6ba",
    selectedColor: "#e29552",
    metalness: 0,
    roughness: 0.76,
    clearcoat: 0.04,
    clearcoatRoughness: 0.62,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: "#ffffff",
    ior: 1.5,
    transmission: 0,
    dispersion: 0,
    thickness: 0,
  },
  {
    id: "brushed-brass",
    label: ["브러시드 황동", "Brushed brass"],
    hint: ["난간·조명·장식 순수 금속 반사", "Pure metallic architectural brass"],
    baseColor: "#d4ab59",
    selectedColor: "#f2c15a",
    metalness: 1,
    roughness: 0.24,
    clearcoat: 0.14,
    clearcoatRoughness: 0.22,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: "#ffffff",
    ior: 1.5,
    transmission: 0,
    dispersion: 0,
    thickness: 0,
  },
  {
    id: "anodized-steel",
    label: ["아노다이징 스틸", "Anodized steel"],
    hint: ["창호 멀리언·프레임·기계 금속", "Brushed stainless & window steel"],
    baseColor: "#aeb6c2",
    selectedColor: "#e59650",
    metalness: 1,
    roughness: 0.28,
    clearcoat: 0.10,
    clearcoatRoughness: 0.26,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: "#ffffff",
    ior: 1.5,
    transmission: 0,
    dispersion: 0,
    thickness: 0,
  },
  {
    id: "matte-fabric",
    label: ["매트 패브릭", "Matte textile"],
    hint: ["소파·커튼·의상 미세 섬유 역광", "Soft upholstery & drapery sheen"],
    baseColor: "#8e97a8",
    selectedColor: "#de8a4b",
    metalness: 0,
    roughness: 0.86,
    clearcoat: 0,
    clearcoatRoughness: 0.5,
    sheen: 0.52,
    sheenRoughness: 0.56,
    sheenColor: "#e8edf5",
    ior: 1.48,
    transmission: 0,
    dispersion: 0,
    thickness: 0,
  },
  {
    id: "glazed-porcelain",
    label: ["유약 백자", "Glazed porcelain"],
    hint: ["고광택 도자기·조형 흉상·세라믹 유약", "High-gloss ceramic & sculpture glaze"],
    baseColor: "#f5f1ea",
    selectedColor: "#ef9d56",
    metalness: 0,
    roughness: 0.14,
    clearcoat: 0.88,
    clearcoatRoughness: 0.08,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: "#ffffff",
    ior: 1.56,
    transmission: 0,
    dispersion: 0,
    thickness: 0,
  },
  {
    id: "crystal-prism",
    label: ["프리즘 크리스탈", "Crystal prism"],
    hint: ["Blender 5.3 빛 분산·굴절 투명 보석", "OpenPBR refractive dispersion crystal"],
    baseColor: "#cbeafe",
    selectedColor: "#67e8f9",
    metalness: 0,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: "#ffffff",
    ior: 2.15,
    transmission: 0.88,
    dispersion: 0.45,
    thickness: 0.65,
  },
]);

const PRESET_BY_ID = new Map<StudioHybridDccPbrPresetId, StudioHybridDccPbrPreset>(
  STUDIO_HYBRID_DCC_PBR_PRESETS.map((preset) => [preset.id, preset]),
);

export function getStudioHybridDccPbrPreset(
  id: StudioHybridDccPbrPresetId = "studio-clay",
): StudioHybridDccPbrPreset {
  return PRESET_BY_ID.get(id) ?? STUDIO_HYBRID_DCC_PBR_PRESETS[0]!;
}

export interface ResolvedStudioHybridDccPhysicalProps {
  readonly color: string;
  readonly metalness: 0 | 1;
  readonly roughness: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly sheen: number;
  readonly sheenRoughness: number;
  readonly sheenColor: string;
  readonly ior: number;
  readonly transmission: number;
  readonly dispersion: number;
  readonly thickness: number;
}

export function resolveStudioHybridDccPhysicalProps(
  presetId: StudioHybridDccPbrPresetId | undefined,
  fallbackColor: string,
  selected = false,
): ResolvedStudioHybridDccPhysicalProps {
  const preset = getStudioHybridDccPbrPreset(presetId ?? "studio-clay");
  const resolvedColor = selected
    ? (preset.selectedColor ?? fallbackColor)
    : (preset.baseColor ?? fallbackColor);
  return {
    color: resolvedColor,
    metalness: preset.metalness,
    roughness: preset.roughness,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: preset.clearcoatRoughness,
    sheen: preset.sheen,
    sheenRoughness: preset.sheenRoughness,
    sheenColor: preset.sheenColor,
    ior: preset.ior,
    transmission: preset.transmission,
    dispersion: preset.dispersion,
    thickness: preset.thickness,
  };
}
