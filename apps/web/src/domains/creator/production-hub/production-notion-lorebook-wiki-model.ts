/**
 * REA 역공학 기반 노션(Notion) 작품 설정집·시놉시스·양방향 인물 관계도·동기화 블록 도메인 모델
 * - Evidence: ev_a6a2d4aba21dbfd286465527cc4ac72e01db957fa9c249375b610de3aef938df,
 *   ev_f308afe88aa69ed3a37727436a2f482d451ef16c410a70d037b
 * - 클린룸 구현: WikiBlock, AssociationRelationStore(relation_toggle_inverse_on 대칭/역방향 미러링),
 *   transclusion_container / transclusion_reference(동기화 블록), MentionedBlock(자동 역링크)
 */

export type LorebookPageCategory =
  | "worldview"
  | "synopsis"
  | "character-sheet"
  | "faction-location";

export type CharacterRelationKind =
  | "allies"
  | "hostile"
  | "mentor-student"
  | "lord-knight"
  | "family"
  | "rivals";

export interface CharacterColorChip {
  readonly partLabel: string;
  readonly hex: string;
}

export interface CharacterSheetArchiveItem {
  readonly characterId: string;
  readonly name: string;
  readonly roleTitle: string;
  readonly faction: string;
  readonly ageAndHeight: string;
  readonly personalityCallout: string;
  readonly hiddenSpoilerToggle: string;
  readonly turnaroundViews: readonly string[];
  readonly colorPalette: readonly CharacterColorChip[];
  readonly syncedRuleBlockId: string;
  readonly sharedWithTeam: boolean;
  readonly updatedAtIso: string;
}

export interface CharacterAssociationEdge {
  readonly id: string;
  readonly record1CharacterId: string;
  readonly record2CharacterId: string;
  readonly kind: CharacterRelationKind;
  readonly forwardLabel: string;
  readonly inverseLabel: string;
  readonly mirrorInverse: boolean;
  readonly affinityScore: number;
  readonly note: string;
}

export interface ResolvedCharacterRelationItem {
  readonly edgeId: string;
  readonly counterpartCharacterId: string;
  readonly counterpartName: string;
  readonly relationLabel: string;
  readonly direction: "forward" | "inverse-mirrored";
  readonly affinityScore: number;
  readonly note: string;
}

export interface NotionSyncedBlockContainer {
  readonly syncedBlockId: string;
  readonly title: string;
  readonly canonicalContent: string;
  readonly sourcePageTitle: string;
  readonly referenceEpisodeIds: readonly string[];
  readonly lastSyncedAtIso: string;
}

export interface LorebookWikiPage {
  readonly pageId: string;
  readonly category: LorebookPageCategory;
  readonly title: string;
  readonly episodeRangeLabel: string;
  readonly calloutBanner: string;
  readonly bodyMarkdown: string;
  readonly spoilerToggleContent: string;
  readonly embeddedSyncedBlockIds: readonly string[];
  readonly sharedLiveWithAssistants: boolean;
}

export interface LorebookEntityBacklink {
  readonly characterId: string;
  readonly characterName: string;
  readonly mentionedInPages: readonly {
    readonly pageId: string;
    readonly pageTitle: string;
    readonly category: LorebookPageCategory;
  }[];
}

export const LOREBOOK_CATEGORY_LABELS: Readonly<Record<LorebookPageCategory, string>> = {
  worldview: "세계관 설정",
  synopsis: "회차·시즌 시놉시스",
  "character-sheet": "캐릭터 시트 도감",
  "faction-location": "세력·로케이션 아카이브",
};

export const CHARACTER_RELATION_DEFAULT_LABELS: Readonly<
  Record<CharacterRelationKind, { readonly forward: string; readonly inverse: string }>
> = {
  allies: { forward: "신뢰하는 동료", inverse: "신뢰하는 동료" },
  hostile: { forward: "적대·숙적", inverse: "적대·숙적" },
  "mentor-student": { forward: "스승 (지도)", inverse: "제자 (사사)" },
  "lord-knight": { forward: "주군 (서약)", inverse: "호위 기사 (충성)" },
  family: { forward: "혈연·가문", inverse: "혈연·가문" },
  rivals: { forward: "경쟁자·라이벌", inverse: "경쟁자·라이벌" },
};

/**
 * 노션 `AssociationRelationStore` (`getRecord1Pointer`, `getRecord2Pointer`,
 * `association_relation_symmetric_self_relation_mirroring`, `relation_toggle_inverse_on`)에
 * 따라 특정 캐릭터 관점에서의 양방향 인물 관계 목록을 도출한다.
 */
export function deriveSymmetricCharacterRelations(
  characterId: string,
  characters: readonly CharacterSheetArchiveItem[],
  edges: readonly CharacterAssociationEdge[],
): readonly ResolvedCharacterRelationItem[] {
  const nameById = new Map(characters.map((c) => [c.characterId, c.name]));
  const resolved: ResolvedCharacterRelationItem[] = [];

  for (const edge of edges) {
    if (edge.record1CharacterId === characterId) {
      resolved.push({
        edgeId: edge.id,
        counterpartCharacterId: edge.record2CharacterId,
        counterpartName: nameById.get(edge.record2CharacterId) ?? edge.record2CharacterId,
        relationLabel: edge.forwardLabel,
        direction: "forward",
        affinityScore: edge.affinityScore,
        note: edge.note,
      });
    } else if (edge.record2CharacterId === characterId && edge.mirrorInverse) {
      resolved.push({
        edgeId: edge.id,
        counterpartCharacterId: edge.record1CharacterId,
        counterpartName: nameById.get(edge.record1CharacterId) ?? edge.record1CharacterId,
        relationLabel: edge.inverseLabel,
        direction: "inverse-mirrored",
        affinityScore: edge.affinityScore,
        note: edge.note,
      });
    }
  }

  return resolved;
}

/**
 * 두 캐릭터 간의 양방향 관계 엣지를 추가하거나 갱신한다.
 */
export function upsertCharacterAssociationEdge(
  edges: readonly CharacterAssociationEdge[],
  input: {
    readonly record1CharacterId: string;
    readonly record2CharacterId: string;
    readonly kind: CharacterRelationKind;
    readonly mirrorInverse: boolean;
    readonly affinityScore: number;
    readonly note: string;
  },
): readonly CharacterAssociationEdge[] {
  if (
    !input.record1CharacterId ||
    !input.record2CharacterId ||
    input.record1CharacterId === input.record2CharacterId
  ) {
    return edges;
  }

  const preset = CHARACTER_RELATION_DEFAULT_LABELS[input.kind];
  const clampedAffinity = Math.max(-100, Math.min(100, Math.round(input.affinityScore)));

  const existingIndex = edges.findIndex(
    (edge) =>
      (edge.record1CharacterId === input.record1CharacterId &&
        edge.record2CharacterId === input.record2CharacterId) ||
      (edge.record1CharacterId === input.record2CharacterId &&
        edge.record2CharacterId === input.record1CharacterId),
  );

  const nextEdge: CharacterAssociationEdge = {
    id:
      existingIndex >= 0
        ? edges[existingIndex]!.id
        : `rel-${input.record1CharacterId}-${input.record2CharacterId}`,
    record1CharacterId: input.record1CharacterId,
    record2CharacterId: input.record2CharacterId,
    kind: input.kind,
    forwardLabel: preset.forward,
    inverseLabel: preset.inverse,
    mirrorInverse: input.mirrorInverse,
    affinityScore: clampedAffinity,
    note: input.note.trim() || `${preset.forward} 관계`,
  };

  if (existingIndex >= 0) {
    return edges.map((edge, idx) => (idx === existingIndex ? nextEdge : edge));
  }
  return [...edges, nextEdge];
}

/**
 * 노션 동기화 블록(`transclusion_container` → `transclusion_reference`)의 원본 내용을 수정하면
 * 참조 중인 모든 시놉시스·설정집 페이지에서 동일한 최신 설정이 조회되도록 갱신한다.
 */
export function updateSyncedBlockCanonicalContent(
  blocks: readonly NotionSyncedBlockContainer[],
  syncedBlockId: string,
  nextContent: string,
  updatedAtIso = "2026-10-26T12:00:00.000Z",
): readonly NotionSyncedBlockContainer[] {
  return blocks.map((block) =>
    block.syncedBlockId === syncedBlockId
      ? {
          ...block,
          canonicalContent: nextContent,
          lastSyncedAtIso: updatedAtIso,
        }
      : block,
  );
}

/**
 * 캐릭터 이름 등장 여부를 스캔하여 노션 `MentionedBlock` 방식의 자동 역링크(Backlinks)를 생성한다.
 */
export function computeCharacterLorebookBacklinks(
  characters: readonly CharacterSheetArchiveItem[],
  pages: readonly LorebookWikiPage[],
  syncedBlocks: readonly NotionSyncedBlockContainer[],
): readonly LorebookEntityBacklink[] {
  const syncedById = new Map(syncedBlocks.map((b) => [b.syncedBlockId, b]));

  return characters.map((character) => {
    const mentionedInPages: {
      readonly pageId: string;
      readonly pageTitle: string;
      readonly category: LorebookPageCategory;
    }[] = [];

    for (const page of pages) {
      const embeddedText = page.embeddedSyncedBlockIds
        .map((id) => syncedById.get(id)?.canonicalContent ?? "")
        .join(" ");
      const haystack = `${page.title} ${page.calloutBanner} ${page.bodyMarkdown} ${page.spoilerToggleContent} ${embeddedText}`;
      if (haystack.includes(character.name)) {
        mentionedInPages.push({
          pageId: page.pageId,
          pageTitle: page.title,
          category: page.category,
        });
      }
    }

    return {
      characterId: character.characterId,
      characterName: character.name,
      mentionedInPages,
    };
  });
}
