/**
 * 씨앗 빌더 설정 인용 공급 어댑터 — 세계관 허브 항목·캐릭터 시트를
 * 씨앗 빌더의 설정 인용 목록(StorySeedSettingRef[])으로 합치는 순수 변환.
 *
 * 선행(story-seed-builder)은 바이블 캐릭터·장소만 공급했다. 이 어댑터가
 * "전체 연결"이다:
 * - 캐릭터: 바이블 캐릭터 + 서술형 시트(studio-character-profile)의 특징을
 *   detail 로 붙인다. 시트가 있는 캐릭터가 우선 근거가 된다 — 이름만 있는
 *   캐릭터와 "시트까지 쓴 캐릭터"를 빌더 목록에서 구분할 수 있게.
 * - 세계관 허브(studio-world-lore): 항목 전 종류를 공급한다. place 항목은
 *   무대 슬롯을 채울 수 있게 location 으로, 나머지는 lore 로 온다.
 *   detail 은 허브의 한 줄 요약, sourceLabel 은 "세계관 허브 · <종류>".
 *
 * 원칙:
 * - id 로만 합친다. 이름이 같다고 합치지 않고, 같은 id 가 두 소스에서 오면
 *   먼저 온 것(캐릭터→바이블 장소→허브 순)을 남긴다 — 허브 place 항목의 id 는
 *   바이블 장소 id 와 공간이 달라 보통 충돌하지 않는다.
 * - 이름이 빈 항목은 인용할 수 없으므로 뺀다. 내용을 지어내지 않는다.
 */
import type { StudioStoryBible } from "../studio-story-bible";

import type { StudioStoryCharacterProfile } from "./studio-character-profile";
import type { StorySeedSettingRef } from "./studio-story-seed";
import {
  STUDIO_LORE_KIND_LABELS,
  type StudioWorldLore,
} from "./studio-world-lore";

export interface StorySeedSettingSources {
  readonly bible: StudioStoryBible | null;
  /** 서술형 캐릭터 시트 — bible 캐릭터에 characterId 로 붙는다. */
  readonly profiles?: readonly StudioStoryCharacterProfile[];
  /** 세계관 허브 항목 묶음. 없으면 허브 인용 없이 동작한다. */
  readonly lore?: StudioWorldLore | null;
}

/** 시트 특징 한 줄 — 인계 카드와 같은 우선순위(personality → motivation → speechStyle). */
function profileDetail(profile: StudioStoryCharacterProfile | undefined): string {
  if (!profile) return "";
  return (
    profile.personality.trim() ||
    profile.motivation.trim() ||
    profile.speechStyle.trim()
  );
}

export function buildStorySeedSettingRefs(
  sources: StorySeedSettingSources,
): readonly StorySeedSettingRef[] {
  const refs: StorySeedSettingRef[] = [];
  const seenIds = new Set<string>();
  const push = (ref: StorySeedSettingRef) => {
    const name = ref.name.trim();
    if (!name || !ref.id.trim() || seenIds.has(ref.id)) return;
    seenIds.add(ref.id);
    refs.push(Object.freeze({ ...ref, name }));
  };

  const profileByCharacterId = new Map(
    (sources.profiles ?? []).map((profile) => [profile.characterId, profile] as const),
  );

  for (const character of sources.bible?.characters ?? []) {
    const detail = profileDetail(profileByCharacterId.get(character.id));
    push({
      id: character.id,
      kind: "character",
      name: character.name,
      ...(detail ? { detail } : {}),
      sourceLabel: detail ? "캐릭터 시트" : "캐릭터",
    });
  }

  for (const location of sources.bible?.locations ?? []) {
    push({ id: location.id, kind: "location", name: location.name, sourceLabel: "장소" });
  }

  for (const entry of sources.lore?.entries ?? []) {
    const kindLabel = STUDIO_LORE_KIND_LABELS[entry.kind].ko;
    push({
      id: entry.id,
      // 허브의 장소 항목은 무대 슬롯을 채울 수 있어야 해서 location 으로 온다.
      kind: entry.kind === "place" ? "location" : "lore",
      name: entry.name,
      ...(entry.summary.trim() ? { detail: entry.summary.trim() } : {}),
      sourceLabel: `세계관 허브 · ${kindLabel}`,
    });
  }

  return Object.freeze(refs);
}

/**
 * 초안의 referencedSettingIds 를 인용 목록에서 이름 있는 항목으로 되돌린다.
 * 순서는 referencedSettingIds 순서를 따른다(초안이 인용한 순서 = 출처 순서).
 * 목록에서 찾을 수 없는 id 는 빼지 않고 이름 없이(id 만으로) 남긴다 —
 * 출처가 사라졌다고 조용히 지우면 인계 카드가 거짓말을 하게 된다.
 */
export function resolveStorySeedReferencedSettings(
  refs: readonly StorySeedSettingRef[],
  referencedSettingIds: readonly string[],
): readonly StorySeedSettingRef[] {
  const byId = new Map(refs.map((ref) => [ref.id, ref] as const));
  const resolved: StorySeedSettingRef[] = [];
  const seen = new Set<string>();
  for (const id of referencedSettingIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const found = byId.get(id);
    resolved.push(
      found ?? Object.freeze({ id, kind: "lore" as const, name: "" }),
    );
  }
  return Object.freeze(resolved);
}
