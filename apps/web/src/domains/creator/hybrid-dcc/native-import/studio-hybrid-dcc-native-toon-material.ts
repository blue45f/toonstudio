/** 자체 툰 metadata는 실제 PBR·MToon payload와 정확히 같을 때만 편집 정본으로 복원한다. */
import { canonicalStudioCommandJson } from "../../studio-command-journal";
import { createStudioHybridDccToonGltfMaterial } from "../materials/studio-hybrid-dcc-toon-gltf";
import { hashStudioHybridDccToonMaterial, normalizeStudioHybridDccToonMaterial, type StudioHybridDccToonMaterial } from "../materials/studio-hybrid-dcc-toon-material";

import { object, reject } from "./studio-hybrid-dcc-native-glb-data";

function ownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function decodeStudioNativeToonMaterial(value: unknown, path: string): StudioHybridDccToonMaterial | null {
  const material = object(value, path);
  const extras = ownRecord(material.extras);
  const namespace = extras && Object.hasOwn(extras, "toonSpectrum") ? ownRecord(extras.toonSpectrum) : null;
  if (!namespace || (!Object.hasOwn(namespace, "toonMaterial") && !Object.hasOwn(namespace, "toonMaterialHash"))) return null;
  try {
    if (!Object.hasOwn(namespace, "toonMaterial") || !Object.hasOwn(namespace, "toonMaterialHash")) throw new Error("자체 툰 재질 metadata가 불완전합니다.");
    const dto = normalizeStudioHybridDccToonMaterial(namespace.toonMaterial);
    if (namespace.toonMaterialHash !== hashStudioHybridDccToonMaterial(dto)) throw new Error("자체 툰 재질 내용 해시가 일치하지 않습니다.");
    const expected = createStudioHybridDccToonGltfMaterial(dto);
    const normalized = { ...material, extras: { ...extras, toonSpectrum: { ...namespace, toonMaterial: dto } } };
    if (canonicalStudioCommandJson(normalized, 16 * 1024) !== canonicalStudioCommandJson(expected, 16 * 1024)) {
      throw new Error("자체 툰 재질 metadata와 실제 PBR·MToon payload가 일치하지 않습니다.");
    }
    return dto;
  } catch {
    return reject("INVALID_TOON_MATERIAL", "자체 툰 재질의 DTO·내용 해시·실제 PBR/MToon 데이터가 일치하지 않아 가져오기를 취소했습니다.", path);
  }
}
