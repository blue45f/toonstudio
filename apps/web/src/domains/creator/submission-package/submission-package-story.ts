/**
 * 투고 패키지 — 스토리 바이블에서 캐릭터 시트를 투고용으로 옮긴다(순수).
 *
 * 정본은 스튜디오 프로젝트의 스토리 바이블(`StudioStoryBible` 의 연속성 캐릭터)과 그 위에 붙는 서술형
 * 시트(`StudioStoryCharacterProfile`, `StudioStoryBibleNarrative`)다. 이 모듈은 그 읽기 전용 투영만 만들고
 * 바이블을 고치지 않는다. 연속성 레코드(이름·별칭)는 그대로, 서술 정보는 `characterId` 로 붙은 시트에서 가져온다.
 */
import type { StudioStoryBibleNarrative } from "../planning/studio-character-profile";
import type { StudioStoryBible } from "../studio-story-bible";

import { normalizeSingleLine, normalizeUserText } from "./submission-package-text";
import {
  SUBMISSION_PACKAGE_LIMITS,
  type SubmissionCharacterRelation,
  type SubmissionCharacterSheet,
} from "./submission-package-types";

/** 시트에 서술이 채워진 칸 수(성격·말투·배경·욕망·외형·대표 대사). 화면의 "얼마나 채웠나" 표시에 쓴다. */
export function countFilledSheetFields(sheet: SubmissionCharacterSheet): number {
  const texts = [sheet.personality, sheet.speechStyle, sheet.background, sheet.motivation, sheet.appearanceNotes];
  const filledTexts = texts.filter((value) => normalizeUserText(value).length > 0).length;
  return filledTexts + (sheet.signatureLines.some((line) => normalizeUserText(line).length > 0) ? 1 : 0);
}

/** 서술 시트가 한 칸이라도 채워졌는가. 비어 있으면 화면에서 기본으로 선택하지 않는다. */
export function hasSheetContent(sheet: SubmissionCharacterSheet): boolean {
  return countFilledSheetFields(sheet) > 0;
}

export function buildSubmissionCharacterSheets(
  bible: StudioStoryBible,
  narrative: StudioStoryBibleNarrative,
): SubmissionCharacterSheet[] {
  const nameOf = new Map(bible.characters.map((character) => [character.id, normalizeSingleLine(character.name)]));
  return bible.characters.map((character) => {
    const profile = narrative.profiles.find((entry) => entry.characterId === character.id);
    const relations: SubmissionCharacterRelation[] = [];
    for (const relation of narrative.relations) {
      if (relation.fromCharacterId === character.id) {
        relations.push({
          withName: nameOf.get(relation.toCharacterId) ?? relation.toCharacterId,
          direction: "outgoing",
          kind: relation.kind,
          label: normalizeSingleLine(relation.label),
          note: normalizeUserText(relation.note),
        });
      } else if (relation.toCharacterId === character.id) {
        relations.push({
          withName: nameOf.get(relation.fromCharacterId) ?? relation.fromCharacterId,
          direction: "incoming",
          kind: relation.kind,
          label: normalizeSingleLine(relation.label),
          note: normalizeUserText(relation.note),
        });
      }
    }
    return {
      id: character.id,
      name: normalizeSingleLine(character.name),
      aliases: character.aliases.map(normalizeSingleLine).filter((alias) => alias.length > 0),
      personality: normalizeUserText(profile?.personality ?? ""),
      speechStyle: normalizeUserText(profile?.speechStyle ?? ""),
      background: normalizeUserText(profile?.background ?? ""),
      motivation: normalizeUserText(profile?.motivation ?? ""),
      signatureLines: (profile?.signatureLines ?? [])
        .map(normalizeUserText)
        .filter((line) => line.length > 0)
        .slice(0, SUBMISSION_PACKAGE_LIMITS.signatureLines),
      appearanceNotes: normalizeUserText(profile?.appearanceNotes ?? ""),
      relations,
    };
  });
}
