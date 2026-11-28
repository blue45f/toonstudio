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

function freeGuideRoots(document: CharacterGroomDocument, coordinateSpace: CharacterGroomGuideCurve["coordinateSpace"]): number[] {
  return document.groups.flatMap((group) => group.guides.flatMap((guide) => {
    const root = guide.points[0];
    return guide.coordinateSpace === coordinateSpace && guide.status === "valid" && root && !root.surfaceAnchor
      ? [root.position[0]] : [];
  }));
}

function defaultRootX(offset: number, fit?: StudioVrmHeadFit): number {
  return fit ? fit.frontSign * fit.center[0] + fit.radiusX * (offset / 0.10 * 0.61 + 0.10) : offset;
}

function nextFringeOffset(document: CharacterGroomDocument, fit?: StudioVrmHeadFit): number {
  const center = defaultRootX(0, fit);
  const scale = defaultRootX(1, fit) - center;
  const offsets = freeGuideRoots(document, fit ? "anatomical-head" : undefined).map((x) => (x - center) / scale);
  // 먼저 가운데와 양옆을 잡고, 이후에는 현재 뿌리 사이의 가장 넓은 빈 곳을 나눈다.
  for (const offset of [0, -0.044, 0.044]) {
    if (offsets.every((value) => Math.abs(value - offset) >= 0.012)) return offset;
  }
  const minimum = -0.075;
  const maximum = 0.075;
  const stops = [minimum, ...offsets.filter((value) => value > minimum && value < maximum).sort((a, b) => a - b), maximum];
  let widest = 0;
  let midpoint = 0;
  for (let index = 1; index < stops.length; index++) {
    const gap = stops[index] - stops[index - 1];
    if (gap > widest) {
      widest = gap;
      midpoint = (stops[index - 1] + stops[index]) / 2;
    }
  }
  return midpoint;
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
        { position: [defaultRootX(offset, fit), cy + height * 0.89, forward + depth * 0.32], width: 0.13, twist: 0 },
        { position: [fit.frontSign * cx + width * (side * 0.72 + 0.06), cy + height * 0.72, forward + depth * 0.76], width: 0.54, twist: 0 },
        { position: [fit.frontSign * cx + width * (side * 0.91 - 0.07), cy + height * 0.42, fringe], width: 0.41, twist: 0 },
        { position: [fit.frontSign * cx + width * (side - 0.15), fit.eyeCenter[1] + height * 0.17, fringe + depth * 0.02], width: 0.10, twist: 0 },
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
      guides: [createCharacterHeadLocalGroomGuide(guideId, nextFringeOffset(document, fit), fit)],
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
      nextFringeOffset(document, fit),
      fit,
    )],
  }));
}

export function duplicateCharacterGroomGuide(
  document: CharacterGroomDocument, groupId: string, guideId: string, fit?: StudioVrmHeadFit,
): CharacterGroomDocument {
  return editCharacterGroomGroup(document, groupId, (group) => {
    const guide = group.guides.find((candidate) => candidate.guideId === guideId);
    if (!guide) throw new Error("선택한 헤어 가이드를 찾을 수 없습니다.");
    if (guide.points.some((point) => point.surfaceAnchor)) {
      throw new Error("표면 앵커 가이드는 다시 투영한 뒤 복제할 수 있습니다. 원본 가이드는 보존됩니다.");
    }
    const rootX = guide.points[0].position[0];
    const anatomicalFit = guide.coordinateSpace === "anatomical-head" ? fit : undefined;
    const centerX = anatomicalFit ? anatomicalFit.frontSign * anatomicalFit.center[0] : 0;
    const halfWidth = anatomicalFit ? anatomicalFit.radiusX * 0.75 : Infinity;
    let left = Math.max(0, rootX - (centerX - halfWidth));
    let right = Math.max(0, centerX + halfWidth - rootX);
    for (const x of freeGuideRoots(document, guide.coordinateSpace)) {
      if (x < rootX) left = Math.min(left, rootX - x);
      if (x > rootX) right = Math.min(right, x - rootX);
    }
    const step = anatomicalFit ? anatomicalFit.radiusX * 0.20 : 0.025;
    const shiftLeft = Math.min(step, left / 2);
    const shiftRight = Math.min(step, right / 2);
    const shift = shiftRight >= shiftLeft ? shiftRight : -shiftLeft;
    return {
      ...group,
      guides: [...group.guides, {
        ...guide,
        guideId: nextId("groom:guide", allGuideIds(document)),
        points: guide.points.map((point) => ({ ...point, position: [point.position[0] + shift, point.position[1], point.position[2]] })),
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
