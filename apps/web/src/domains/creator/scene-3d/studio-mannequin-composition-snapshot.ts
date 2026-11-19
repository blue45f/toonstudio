import type { CompositionCameraSnapshot, CompositionGenerationSnapshot } from "../ai/studio-composition-generation-brief";
import { STUDIO_MANNEQUIN_MATERIAL_STYLES } from "./studio-mannequin-model";

/** 재질 id → 화면 이름(목조 인형·클레이 …). 브리프에 "재질 wood"처럼 내부 id가 새지 않게 한다. */
const MATERIAL_STYLE_LABEL = new Map(
  STUDIO_MANNEQUIN_MATERIAL_STYLES.map((style) => [style.id as string, style.label] as const),
);

/** 브리프에서 포저 캐릭터를 가리키는 안정 식별자. 일관성 키 character:<id>의 근거. */
export const STUDIO_MANNEQUIN_COMPOSITION_CHARACTER_ID = "studio-mannequin";

export interface StudioMannequinCompositionSnapshotInput {
  readonly camera: CompositionCameraSnapshot;
  /** 체형 신장(cm). 유한 양수가 아니면 기준 신장(165cm)으로 떨어진다. */
  readonly heightCm?: number;
  /** 마지막으로 적용한 포즈 프리셋 id. 없으면 포즈 조건 없이 브리프를 만든다. */
  readonly posePresetId?: string | null;
  /** 포즈 프리셋의 사람용 이름 — 있으면 설명 문구로 브리프에 실린다. */
  readonly poseLabel?: string | null;
  /** 표면 재질 스타일 id — 외형 일관성 정보로 실린다. */
  readonly materialStyle?: string | null;
}

export function buildStudioMannequinCompositionSnapshot(
  input: StudioMannequinCompositionSnapshotInput,
): CompositionGenerationSnapshot {
  const heightCm =
    typeof input.heightCm === "number" && Number.isFinite(input.heightCm) && input.heightCm > 0
      ? Math.round(input.heightCm)
      : 165;
  const appearance: string[] = [`신장 ${heightCm}cm`];
  const materialStyle = input.materialStyle?.trim();
  if (materialStyle) appearance.push(`재질 ${MATERIAL_STYLE_LABEL.get(materialStyle) ?? materialStyle}`);
  const posePresetId = input.posePresetId?.trim() ? input.posePresetId.trim() : undefined;
  return {
    characterId: STUDIO_MANNEQUIN_COMPOSITION_CHARACTER_ID,
    characterName: "3D 데생 인형",
    characterAppearance: appearance,
    ...(posePresetId ? { posePresetId } : {}),
    ...(input.poseLabel?.trim() ? { poseDescription: input.poseLabel.trim() } : {}),
    camera: input.camera,
  };
}
