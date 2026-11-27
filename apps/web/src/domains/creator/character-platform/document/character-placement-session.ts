import { STUDIO_VRM_HUMANOID_BONES } from "@toonstudio/contracts/studio-vrm-scene-fields";
import { Euler, Quaternion } from "three";

import { serializeCharacterDocumentV3, type CharacterDocumentV3 } from "./character-document-v3";

import type { StudioVrmSceneDocument } from "../../vrm/studio-vrm-scene-document";
import type { CharacterDocumentV3Repository } from "./character-document-v3-repository";

export type CharacterPlacementScene = Pick<StudioVrmSceneDocument, "characterDocumentId"> &
  Partial<Pick<StudioVrmSceneDocument, "pose" | "expressions">>;

/** A saved cut contains XYZ rotations baked from the rendered VRM. The live editor may still be loading. */
export function readCharacterPlacementContext(
  projection: CharacterDocumentV3,
  scene: CharacterPlacementScene,
  modelBaseYaw: number,
): CharacterDocumentV3 {
  if (!scene.pose) return projection;
  const shot = scene.pose;
  const bones: Record<string, readonly [number, number, number, number]> = {};
  for (const name of STUDIO_VRM_HUMANOID_BONES) {
    const saved = shot.bones[name];
    // Fingers use the cut's separately stored authored overrides in the VRM host.
    if (!saved) continue;
    const { x, y, z, w } = new Quaternion().setFromEuler(new Euler(...saved.rotation, "XYZ"));
    bones[name] = [x, y, z, w];
  }
  const yaw = new Quaternion().setFromEuler(new Euler(0, modelBaseYaw + shot.bodyRotationY, 0));
  return {
    ...projection,
    pose: { ...projection.pose, bones, root: {
      position: [shot.translations.root[0], shot.yOffset, shot.translations.root[2]],
      rotation: [yaw.x, yaw.y, yaw.z, yaw.w],
    } },
    expression: scene.expressions ? { ...projection.expression, weights: scene.expressions } : projection.expression,
  };
}

/** 같은 저작 캐릭터의 외형과 한 컷에만 속하는 연기·촬영 상태를 합친다. */
function withCutContext(character: CharacterDocumentV3, cut: CharacterDocumentV3): CharacterDocumentV3 {
  if (character.documentId !== cut.documentId || character.model.assetId !== cut.model.assetId) {
    throw new Error("현재 컷과 연결된 캐릭터 문서 또는 모델이 다릅니다.");
  }
  const slots = { ...character.recipe.slots };
  for (const key of ["pose", "expression"] as const) {
    const value = cut.recipe.slots[key];
    if (value) slots[key] = value;
    else delete slots[key];
  }
  return {
    ...character,
    recipe: { ...character.recipe, slots, handPose: cut.recipe.handPose },
    pose: cut.pose,
    expression: cut.expression,
    camera: cut.camera,
    output: cut.output,
    linkedLayers: cut.linkedLayers,
  };
}

/** 컷을 다시 열 때 외형을 읽고, 편집한 외형만 같은 정본에 저장한다. */
export function createCharacterPlacementSession(
  stored: CharacterDocumentV3,
  cut: CharacterDocumentV3,
  repository: Pick<CharacterDocumentV3Repository, "save">,
  existsInRepository: boolean,
) {
  let canonical = stored;
  let persisted = existsInRepository;
  let tail = Promise.resolve();
  return {
    document: withCutContext(stored, cut),
    save(edited: CharacterDocumentV3): Promise<void> {
      const operation = tail.then(async () => {
        const next = {
          ...withCutContext(edited, canonical),
          revision: canonical.revision,
          updatedAt: canonical.updatedAt,
          sourceReceipts: canonical.sourceReceipts,
        };
        const sameAppearance = serializeCharacterDocumentV3(next) === serializeCharacterDocumentV3(canonical);
        if (persisted && sameAppearance) return;
        const updated = sameAppearance ? canonical : {
          ...next, revision: Math.max(edited.revision, canonical.revision + 1), updatedAt: edited.updatedAt,
        };
        await repository.save(updated, { expectedStoredRevision: persisted ? canonical.revision : null });
        canonical = updated;
        persisted = true;
      });
      tail = operation.catch(() => undefined);
      return operation;
    },
  };
}
