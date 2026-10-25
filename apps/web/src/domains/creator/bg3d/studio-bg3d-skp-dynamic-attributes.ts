/**
 * studio-bg3d-skp-dynamic-attributes.ts
 *
 * OpenSKP(`parseSkp`, `buildScene`, `buildInstancedScene`)가 추출한 SketchUp `dynamic_attributes`
 * (`InstanceNode.properties`) 및 SKP 사이드카(컴포넌트·태그·장면 이름 목록)로부터
 * 웹툰 3D 배경 아키타입(`판타지 황실`, `현대 고등학교 교실`, `주인공 자취방`, `조선시대 저막`)과
 * 실시간 조작 가능한 `DynamicComponentState` 목록을 안전하게 복원한다.
 */

import {
  inferDynamicComponentFromSkpNode,
  instantiateArchetypeDynamicComponents,
  type DynamicComponentState,
  type WebtoonArchetypeScenePackId,
} from "../scene-3d/studio-3d-dynamic-components";

import type { StudioBg3dSkpSidecar } from "./studio-bg3d-skp-sidecar";

export const MAX_EXTRACTED_DYNAMIC_COMPONENTS = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toUnknownArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringRecord(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") {
      out[k] = v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = String(v);
    }
  }
  return out;
}

/**
 * OpenSKP `buildScene().sceneHierarchy` 또는 `buildInstancedScene().instanceTree` 루트에서
 * `properties`(`dynamic_attributes`)와 노드·정의·레이어 이름을 전위 순회하여
 * 조작 가능한 다이나믹 컴포넌트 상태 목록을 추출한다.
 */
export function extractDynamicComponentsFromOpenSkpHierarchy(
  root: unknown,
): readonly DynamicComponentState[] {
  if (!isRecord(root)) return [];

  const results: DynamicComponentState[] = [];
  const seenIds = new Set<string>();
  const pending: { readonly node: unknown; readonly depth: number }[] = toUnknownArray(root.children)
    .map((child) => ({ node: child, depth: 1 }))
    .reverse();

  let seq = 1;
  while (pending.length > 0 && results.length < MAX_EXTRACTED_DYNAMIC_COMPONENTS) {
    const item = pending.pop();
    if (!item || !isRecord(item.node)) continue;
    const node = item.node;

    const rawName = typeof node.name === "string" ? node.name : "";
    const rawDefName = typeof node.definitionName === "string" ? node.definitionName : "";
    const rawLayer = typeof node.layer === "string" ? node.layer : "";
    const rawGuid = typeof node.guid === "string" && node.guid.trim().length > 0 ? node.guid.trim() : "";

    const directProps = readStringRecord(node.properties);
    const attrDicts = isRecord(node.attributeDictionaries) ? node.attributeDictionaries : {};
    const dictProps = readStringRecord(attrDicts.dynamic_attributes);
    const mergedProps: Record<string, string> = { ...dictProps, ...directProps };

    const candidateId = rawGuid || `skp-dc-${seq}`;
    seq += 1;

    const inferred = inferDynamicComponentFromSkpNode({
      id: candidateId,
      name: rawName,
      definitionName: rawDefName,
      layer: rawLayer,
      properties: mergedProps,
    });

    if (inferred && !seenIds.has(inferred.id)) {
      seenIds.add(inferred.id);
      results.push(inferred);
    }

    const children = toUnknownArray(node.children);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      pending.push({ node: children[i], depth: item.depth + 1 });
    }
  }

  return Object.freeze(results);
}

const ARCHETYPE_KEYWORD_RULES: readonly {
  readonly archetypeId: WebtoonArchetypeScenePackId;
  readonly keywords: readonly string[];
}[] = [
  {
    archetypeId: "joseon-dynasty-tavern",
    keywords: [
      "조선",
      "저막",
      "주막",
      "들창",
      "들어열개",
      "싸리문",
      "대청",
      "병풍",
      "객주",
      "초롱불",
      "호롱불",
      "아궁이",
      "한옥",
      "사극",
      "tavern",
      "joseon",
      "hanok",
    ],
  },
  {
    archetypeId: "fantasy-imperial-palace",
    keywords: [
      "황실",
      "황궁",
      "알현실",
      "옥좌",
      "양개문",
      "샹들리에",
      "비밀통로",
      "비밀_통로",
      "성물",
      "로판",
      "판타지",
      "imperial",
      "palace",
      "throne",
      "chandelier",
    ],
  },
  {
    archetypeId: "modern-high-school-classroom",
    keywords: [
      "고등학교",
      "학교",
      "교실",
      "교탁",
      "칠판",
      "사물함",
      "형광등",
      "운동장",
      "복도",
      "등교",
      "학원물",
      "classroom",
      "highschool",
      "podium",
      "locker",
    ],
  },
  {
    archetypeId: "protagonist-studio-apartment",
    keywords: [
      "자취방",
      "원룸",
      "오피스텔",
      "붙박이",
      "옷장",
      "베란다",
      "방화문",
      "현관문",
      "독서등",
      "스탠드",
      "studio_apartment",
      "wardrobe",
      "veranda",
    ],
  },
];

/**
 * SKP 모델 제목·컴포넌트·태그(레이어)·장면 이름에서 기성 웹툰 3D 배경 4대 아키타입을 판별한다.
 */
export function inferWebtoonArchetypeFromSkpMetadata(input: {
  readonly title?: string;
  readonly components?: readonly string[];
  readonly tags?: readonly string[];
  readonly scenes?: readonly string[];
}): WebtoonArchetypeScenePackId | null {
  const haystack = [
    input.title ?? "",
    ...(input.components ?? []),
    ...(input.tags ?? []),
    ...(input.scenes ?? []),
  ]
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();

  if (!haystack.trim()) return null;

  let bestId: WebtoonArchetypeScenePackId | null = null;
  let bestScore = 0;

  for (const rule of ARCHETYPE_KEYWORD_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) {
        score += kw.length >= 3 ? 2 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = rule.archetypeId;
    }
  }

  return bestScore > 0 ? bestId : null;
}

export interface SkpSidecarDynamicInferenceResult {
  readonly detectedArchetypeId: WebtoonArchetypeScenePackId | null;
  readonly components: readonly DynamicComponentState[];
}

/**
 * 정규화 GLB 변환 후 보존된 `StudioBg3dSkpSidecar` 기록으로부터
 * 아키타입 분류 및 조작 가능한 동적 구성 요소 목록을 복원한다.
 */
export function inferDynamicComponentsFromSkpSidecar(
  sidecar: StudioBg3dSkpSidecar,
  options: { readonly fallbackToArchetypeComponents?: boolean } = {},
): SkpSidecarDynamicInferenceResult {
  const detectedArchetypeId = inferWebtoonArchetypeFromSkpMetadata({
    components: sidecar.components.items,
    tags: sidecar.tags.items,
    scenes: sidecar.scenes.items,
  });

  const extracted: DynamicComponentState[] = [];
  const seenLabels = new Set<string>();

  for (let i = 0; i < sidecar.components.items.length; i += 1) {
    const compName = sidecar.components.items[i] ?? "";
    const tagHint = sidecar.tags.items[i] ?? "";
    const state = inferDynamicComponentFromSkpNode({
      id: `${sidecar.contentHash.slice(0, 16)}-dc-${i + 1}`,
      name: compName,
      layer: tagHint,
    });
    if (state && !seenLabels.has(state.label)) {
      seenLabels.add(state.label);
      extracted.push(
        detectedArchetypeId
          ? { ...state, archetypeId: detectedArchetypeId }
          : state,
      );
    }
    if (extracted.length >= MAX_EXTRACTED_DYNAMIC_COMPONENTS) break;
  }

  if (
    extracted.length === 0 &&
    options.fallbackToArchetypeComponents !== false &&
    detectedArchetypeId !== null
  ) {
    return Object.freeze({
      detectedArchetypeId,
      components: instantiateArchetypeDynamicComponents(detectedArchetypeId),
    });
  }

  return Object.freeze({
    detectedArchetypeId,
    components: Object.freeze(extracted),
  });
}
