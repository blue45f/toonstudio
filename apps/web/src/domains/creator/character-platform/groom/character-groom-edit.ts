import {
  validateCharacterGroomDocument,
  type CharacterGroomDocument,
  type CharacterGroomGroup,
  type CharacterGroomGuideCurve,
  type CharacterGroomProfile,
} from "./character-groom-document";
import type { StudioVrmHeadFit } from "../../vrm/studio-vrm-head-fit";

export const DEFAULT_CHARACTER_GROOM_PROFILE: CharacterGroomProfile = Object.freeze({
  baseWidth: 0.045, taper: 0.85, lengthScale: 1, curl: 0, wave: 0,
  clump: 0, noise: 0, rootRotation: 0, lineOnly: false, fill: true, segmentsPerSpan: 6,
});

function nextId(prefix: string, existing: readonly string[]): string {
  const ids = new Set(existing);
  let index = 1;
  while (ids.has(`${prefix}:${index}`)) index += 1;
  return `${prefix}:${index}`;
}

function allGuideIds(document: CharacterGroomDocument): string[] {
  return document.groups.flatMap((group) => group.guides.map((guide) => guide.guideId));
}

export function createCharacterHeadLocalGroomGuide(guideId: string, offset = 0, fit?: StudioVrmHeadFit): CharacterGroomGuideCurve {
  if (fit) {
    const [cx, cy, cz] = fit.center;
    const width = fit.radiusX;
    const height = fit.radiusY;
    const depth = fit.radiusZ;
    const side = offset / 0.10;
    const forward = fit.frontSign * cz;
    const fringe = fit.faceFront + depth * 0.09;
    // 뿌리는 두피 가까이 두고, 이마를 감싸면서 끝이 눈 위에서 가늘어지게 한다.
    return {
      guideId, status: "valid", coordinateSpace: "anatomical-head",
      points: [
        { position: [fit.frontSign * cx + width * (side * 0.55 + 0.12), cy + height * 0.99, forward + depth * 0.24], width: 0.65, twist: 0 },
        { position: [fit.frontSign * cx + width * (side * 0.72 + 0.06), cy + height * 0.76, forward + depth * 0.77], width: 0.88, twist: 0 },
        { position: [fit.frontSign * cx + width * (side * 0.91 - 0.07), cy + height * 0.42, fringe], width: 0.64, twist: 0 },
        { position: [fit.frontSign * cx + width * (side - 0.15), fit.eyeCenter[1] + height * 0.17, fringe + depth * 0.02], width: 0.20, twist: 0 },
      ],
    };
  }
  return {
    guideId, status: "valid", points: [
      { position: [offset, 0.12, 0.04], width: 1, twist: 0 },
      { position: [offset, 0.10, 0.105], width: 1, twist: 0 },
      { position: [offset, 0.025, 0.12], width: 0.8, twist: 0 },
      { position: [offset, -0.015, 0.10], width: 0.5, twist: 0 },
    ],
  };
}

export function addCharacterGroomGroup(document: CharacterGroomDocument, name: string, fit?: StudioVrmHeadFit): CharacterGroomDocument {
  const groupId = nextId("groom:group", document.groups.map((group) => group.groupId));
  const guideId = nextId("groom:guide", allGuideIds(document));
  return validateCharacterGroomDocument({
    ...document,
    groups: [...document.groups, {
      groupId, name, scalpRegionId: "scalp:head-local", materialId: "material:hair",
      visible: true, locked: false, profile: DEFAULT_CHARACTER_GROOM_PROFILE,
      guides: [createCharacterHeadLocalGroomGuide(guideId, 0, fit)],
    }],
  });
}

export function editCharacterGroomGroup(
  document: CharacterGroomDocument,
  groupId: string,
  edit: (group: CharacterGroomGroup) => CharacterGroomGroup,
): CharacterGroomDocument {
  const group = document.groups.find((candidate) => candidate.groupId === groupId);
  if (!group) throw new Error("선택한 헤어 그룹을 찾을 수 없습니다.");
  if (group.locked) throw new Error("잠긴 헤어 그룹은 편집할 수 없습니다.");
  return validateCharacterGroomDocument({
    ...document,
    groups: document.groups.map((candidate) => candidate === group ? edit(group) : candidate),
  });
}

export function addCharacterGroomGuide(document: CharacterGroomDocument, groupId: string, fit?: StudioVrmHeadFit): CharacterGroomDocument {
  return editCharacterGroomGroup(document, groupId, (group) => ({
    ...group,
    guides: [...group.guides, createCharacterHeadLocalGroomGuide(
      nextId("groom:guide", allGuideIds(document)),
      (group.guides.length % 7 - 3) * 0.022,
      fit,
    )],
  }));
}

export function duplicateCharacterGroomGuide(
  document: CharacterGroomDocument, groupId: string, guideId: string,
): CharacterGroomDocument {
  return editCharacterGroomGroup(document, groupId, (group) => {
    const guide = group.guides.find((candidate) => candidate.guideId === guideId);
    if (!guide) throw new Error("선택한 헤어 가이드를 찾을 수 없습니다.");
    if (guide.points.some((point) => point.surfaceAnchor)) {
      throw new Error("표면 앵커 가이드는 다시 투영한 뒤 복제할 수 있습니다. 원본 가이드는 보존됩니다.");
    }
    return {
      ...group,
      guides: [...group.guides, {
        ...guide,
        guideId: nextId("groom:guide", allGuideIds(document)),
        points: guide.points.map((point) => ({ ...point, position: [point.position[0] + 0.025, point.position[1], point.position[2]] })),
      }],
    };
  });
}

export function duplicateCharacterGroomGroup(document: CharacterGroomDocument, groupId: string): CharacterGroomDocument {
  const group = document.groups.find((candidate) => candidate.groupId === groupId);
  if (!group) throw new Error("선택한 헤어 그룹을 찾을 수 없습니다.");
  const guideIds = allGuideIds(document);
  const guides = group.guides.map((guide) => {
    const guideId = nextId("groom:guide", guideIds);
    guideIds.push(guideId);
    return { ...guide, guideId };
  });
  return validateCharacterGroomDocument({
    ...document,
    groups: [...document.groups, {
      ...group,
      groupId: nextId("groom:group", document.groups.map((candidate) => candidate.groupId)),
      name: `${group.name} (2)`, guides, locked: false,
    }],
  });
}
