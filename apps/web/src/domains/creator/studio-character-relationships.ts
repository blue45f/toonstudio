import {
  patchStudioCharacter,
  STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEMS,
  type StudioCharacterBible,
  type StudioCharacterBibleEntry,
} from "./studio-character-bible";

/**
 * Structured view over the character bible's free-text `relationships` list.
 *
 * The v1 save model stays the single source of truth: each relationship is still one bounded
 * string in `entry.relationships`, so no schema migration can lose data. This module parses
 * those strings into drafts (target · kind · memo), formats edits back into strings, and
 * builds the node-edge relationship map. Parsing never drops text: everything after the
 * target separator survives verbatim in `memo`, and an explicitly chosen kind is written
 * back as a readable `(종류)` tag that the parser reads first, so a structured edit survives
 * a save/load round-trip instead of depending on keyword inference alone.
 */

export const STUDIO_CHARACTER_RELATIONSHIP_KINDS = [
  "conflict",
  "ally",
  "family",
  "lover",
  "other",
] as const;

export type StudioCharacterRelationshipKind =
  (typeof STUDIO_CHARACTER_RELATIONSHIP_KINDS)[number];

export const STUDIO_CHARACTER_RELATIONSHIP_KIND_LABELS: Record<
  StudioCharacterRelationshipKind,
  string
> = {
  conflict: "갈등",
  ally: "동맹",
  family: "가족",
  lover: "연인",
  other: "기타",
};

const KIND_BY_LABEL = new Map<string, StudioCharacterRelationshipKind>(
  STUDIO_CHARACTER_RELATIONSHIP_KINDS.map((kind) => [
    STUDIO_CHARACTER_RELATIONSHIP_KIND_LABELS[kind],
    kind,
  ]),
);

export interface StudioCharacterRelationship {
  /** Position inside the owner's `relationships` list. */
  readonly index: number;
  /** The stored string, exactly as saved. */
  readonly raw: string;
  /** Relationship target as written (a character name or a free-text label). */
  readonly targetName: string;
  /** Resolved bible character id when `targetName` exactly matches another character. */
  readonly targetCharacterId: string | null;
  readonly kind: StudioCharacterRelationshipKind;
  /** True when the kind came from an explicit `(종류)` tag rather than keyword inference. */
  readonly kindExplicit: boolean;
  /** Everything written after the target — kept verbatim so migration loses nothing. */
  readonly memo: string;
}

export interface StudioCharacterRelationshipInput {
  readonly targetName: string;
  readonly targetCharacterId?: string | null;
  readonly kind: StudioCharacterRelationshipKind;
  readonly memo: string;
}

const KIND_TAG_PATTERN = /\((갈등|동맹|가족|연인|기타)\)\s*$/u;
const TARGET_SEPARATOR_PATTERN = /^([^:—–-]+?)\s*(?:—|–|:|-)\s*(.*)$/su;

/**
 * Keyword inference is only a drafting aid for legacy text. Family and lover keywords are
 * checked before conflict, and conflict before ally, so "불신하지만 의지하는 동료" drafts as
 * 갈등 (the friction is the story-relevant fact) while "실종된 형" drafts as 가족.
 */
const KIND_KEYWORDS: readonly (readonly [StudioCharacterRelationshipKind, readonly string[]])[] = [
  ["family", ["가족", "형제", "자매", "남매", "아버지", "어머니", "아빠", "엄마", "부모", "형", "누나", "언니", "오빠", "동생", "사촌", "할머니", "할아버지", "아들", "딸", "삼촌", "이모", "고모", "조카"]],
  ["lover", ["연인", "애인", "사랑", "짝사랑", "첫사랑", "약혼", "남편", "아내", "결혼", "고백", "썸"]],
  ["conflict", ["갈등", "라이벌", "숙적", "원수", "적대", "대립", "불신", "경쟁", "배신", "증오", "미워", "적"]],
  ["ally", ["동맹", "동료", "친구", "조력", "파트너", "멘토", "스승", "제자", "의지", "동지", "아군", "협력"]],
];

function inferKind(text: string): StudioCharacterRelationshipKind {
  for (const [kind, keywords] of KIND_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) return kind;
  }
  return "other";
}

function resolveTargetCharacterId(
  targetName: string,
  ownerId: string,
  characters: readonly StudioCharacterBibleEntry[],
): string | null {
  if (!targetName) return null;
  const match = characters.find(
    (character) => character.id !== ownerId && character.name.trim() === targetName,
  );
  return match?.id ?? null;
}

export function parseStudioCharacterRelationship(
  raw: string,
  owner: Pick<StudioCharacterBibleEntry, "id">,
  characters: readonly StudioCharacterBibleEntry[],
): Omit<StudioCharacterRelationship, "index"> {
  const text = raw.trim();
  const separated = TARGET_SEPARATOR_PATTERN.exec(text);
  let targetPart = separated ? separated[1] ?? "" : text;
  const memo = separated ? (separated[2] ?? "").trim() : "";
  targetPart = targetPart.trim();

  let kindExplicit = false;
  let kind: StudioCharacterRelationshipKind | null = null;
  const tag = KIND_TAG_PATTERN.exec(targetPart);
  if (tag) {
    kind = KIND_BY_LABEL.get(tag[1] ?? "") ?? null;
    if (kind) {
      kindExplicit = true;
      targetPart = targetPart.slice(0, tag.index).trim();
    }
  }
  if (!kind) kind = inferKind(memo || text);

  return {
    raw,
    targetName: targetPart,
    targetCharacterId: resolveTargetCharacterId(targetPart, owner.id, characters),
    kind,
    kindExplicit,
    memo,
  };
}

/**
 * Canonical stored form: `대상 (종류) — 메모`. The kind tag is written whenever the kind is
 * known explicitly or was inferred as non-기타, so re-parsing the formatted string yields
 * the same structured draft (stable round-trip).
 */
export function formatStudioCharacterRelationship(
  input: StudioCharacterRelationshipInput & { readonly kindExplicit?: boolean },
): string {
  const targetName = input.targetName.trim();
  const memo = input.memo.trim();
  const showTag = input.kindExplicit === true || input.kind !== "other";
  const tagged = showTag
    ? `${targetName} (${STUDIO_CHARACTER_RELATIONSHIP_KIND_LABELS[input.kind]})`
    : targetName;
  return memo ? `${tagged} — ${memo}` : tagged;
}

export function parseStudioCharacterRelationships(
  bible: StudioCharacterBible,
  characterId: string,
): StudioCharacterRelationship[] {
  const entry = bible.characters.find((character) => character.id === characterId);
  if (!entry) return [];
  return entry.relationships.map((raw, index) => ({
    ...parseStudioCharacterRelationship(raw, entry, bible.characters),
    index,
  }));
}

/** Lossless-migration check helper: every legacy string drafts into exactly one relationship. */
export function draftAllStudioCharacterRelationships(
  bible: StudioCharacterBible,
): ReadonlyMap<string, StudioCharacterRelationship[]> {
  return new Map(
    bible.characters.map((character) => [
      character.id,
      parseStudioCharacterRelationships(bible, character.id),
    ]),
  );
}

function relationshipInputToRaw(
  bible: StudioCharacterBible,
  input: StudioCharacterRelationshipInput,
): string {
  let targetName = input.targetName.trim();
  if (input.targetCharacterId) {
    const target = bible.characters.find((character) => character.id === input.targetCharacterId);
    if (target?.name.trim()) targetName = target.name.trim();
  }
  if (!targetName) throw new Error("관계 대상을 입력하거나 캐릭터를 선택해 주세요.");
  return formatStudioCharacterRelationship({
    targetName,
    kind: input.kind,
    kindExplicit: true,
    memo: input.memo,
  });
}

/**
 * Adds (index omitted) or replaces (index given) one structured relationship on the owner's
 * sheet. Goes through `patchStudioCharacter`, so the edit lands in the same list the sheet
 * edits and the prompt context reads — map edits and sheet edits cannot drift apart.
 */
export function upsertStudioCharacterRelationship(
  bible: StudioCharacterBible,
  characterId: string,
  input: StudioCharacterRelationshipInput,
  index?: number,
): StudioCharacterBible {
  const entry = bible.characters.find((character) => character.id === characterId);
  if (!entry) return bible;
  const raw = relationshipInputToRaw(bible, input);
  const next = entry.relationships.slice();
  if (index !== undefined && index >= 0 && index < next.length) {
    next[index] = raw;
  } else {
    if (next.length >= STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEMS) {
      throw new Error(`관계는 최대 ${STUDIO_CHARACTER_BIBLE_MAX_LIST_ITEMS}개까지 저장할 수 있어요.`);
    }
    // The list normalizer dedupes identical strings; refuse a silent no-op add up front.
    if (next.includes(raw)) throw new Error("이미 같은 관계가 있어요.");
    next.push(raw);
  }
  return patchStudioCharacter(bible, characterId, { relationships: next });
}

export function removeStudioCharacterRelationship(
  bible: StudioCharacterBible,
  characterId: string,
  index: number,
): StudioCharacterBible {
  const entry = bible.characters.find((character) => character.id === characterId);
  if (!entry || index < 0 || index >= entry.relationships.length) return bible;
  const next = entry.relationships.filter((_, itemIndex) => itemIndex !== index);
  return patchStudioCharacter(bible, characterId, { relationships: next });
}

export interface StudioCharacterRelationshipMapNode {
  readonly key: string;
  /** Null for targets that are written in text but have no character sheet yet. */
  readonly characterId: string | null;
  readonly name: string;
  readonly role: string;
  /** Normalised 0..1 layout coordinates (deterministic circle, bible order). */
  readonly x: number;
  readonly y: number;
  readonly relationshipCount: number;
}

export interface StudioCharacterRelationshipMapEdge {
  readonly key: string;
  readonly ownerCharacterId: string;
  readonly index: number;
  readonly targetCharacterId: string | null;
  readonly targetName: string;
  readonly kind: StudioCharacterRelationshipKind;
  readonly memo: string;
  readonly raw: string;
  /** True when the target also lists a relationship back to the owner. */
  readonly bidirectional: boolean;
}

export interface StudioCharacterRelationshipMap {
  readonly nodes: readonly StudioCharacterRelationshipMapNode[];
  readonly edges: readonly StudioCharacterRelationshipMapEdge[];
}

export function buildStudioCharacterRelationshipMap(
  bible: StudioCharacterBible,
): StudioCharacterRelationshipMap {
  const drafts = draftAllStudioCharacterRelationships(bible);

  const ghostNames: string[] = [];
  for (const relationships of drafts.values()) {
    for (const relationship of relationships) {
      if (
        relationship.targetCharacterId === null &&
        relationship.targetName &&
        !ghostNames.includes(relationship.targetName)
      ) {
        ghostNames.push(relationship.targetName);
      }
    }
  }

  const total = bible.characters.length + ghostNames.length;
  const position = (order: number): { x: number; y: number } => {
    if (total <= 1) return { x: 0.5, y: 0.5 };
    const angle = (order / total) * Math.PI * 2 - Math.PI / 2;
    return { x: 0.5 + 0.4 * Math.cos(angle), y: 0.5 + 0.4 * Math.sin(angle) };
  };

  const nodes: StudioCharacterRelationshipMapNode[] = [
    ...bible.characters.map((character, order) => ({
      key: `character:${character.id}`,
      characterId: character.id,
      name: character.name.trim() || "이름 없는 캐릭터",
      role: character.role,
      ...position(order),
      relationshipCount: drafts.get(character.id)?.length ?? 0,
    })),
    ...ghostNames.map((name, ghostOrder) => ({
      key: `unresolved:${name}`,
      characterId: null,
      name,
      role: "시트 없는 대상",
      ...position(bible.characters.length + ghostOrder),
      relationshipCount: 0,
    })),
  ];

  const edges: StudioCharacterRelationshipMapEdge[] = [];
  for (const character of bible.characters) {
    for (const relationship of drafts.get(character.id) ?? []) {
      const reverse = relationship.targetCharacterId
        ? (drafts.get(relationship.targetCharacterId) ?? []).some(
            (candidate) => candidate.targetCharacterId === character.id,
          )
        : false;
      edges.push({
        key: `${character.id}:${relationship.index}`,
        ownerCharacterId: character.id,
        index: relationship.index,
        targetCharacterId: relationship.targetCharacterId,
        targetName: relationship.targetName,
        kind: relationship.kind,
        memo: relationship.memo,
        raw: relationship.raw,
        bidirectional: reverse,
      });
    }
  }

  return { nodes, edges };
}

export function countStudioCharacterRelationshipsByKind(
  bible: StudioCharacterBible,
): Record<StudioCharacterRelationshipKind, number> {
  const counts: Record<StudioCharacterRelationshipKind, number> = {
    conflict: 0,
    ally: 0,
    family: 0,
    lover: 0,
    other: 0,
  };
  for (const relationships of draftAllStudioCharacterRelationships(bible).values()) {
    for (const relationship of relationships) counts[relationship.kind] += 1;
  }
  return counts;
}
