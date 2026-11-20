/**
 * 인라인 슬래시(`/`) 커맨드·`@` 멘션 초성 퍼지 검색, IME 안전 트리거 탐지, 멘션 바인딩 추출.
 */

import {
  SLASH_DIRECTING_COMMANDS,
  type InlineTriggerDetection,
  type MentionEntityKind,
  type SlashDirectingCommandSpec,
  type SlashMentionBinding,
  type SlashUnresolvedMention,
  type StoryBibleMentionCatalog,
  type StoryBibleMentionEntity,
} from "./studio-slash-script-types";

const HANGUL_CHOSEONG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ",
  "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

/** 한글 음절 문자열에서 초성 시퀀스를 추출한다(비한글 문자는 소문자로 유지). */
export function extractKoreanChoseong(input: string): string {
  let result = "";
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = Math.floor((code - 0xac00) / 588);
      result += HANGUL_CHOSEONG[idx] ?? ch;
    } else {
      result += ch.toLowerCase();
    }
  }
  return result;
}

function isPureChoseongQuery(query: string): boolean {
  return /^[ㄱ-ㅎ]+$/u.test(query);
}

function scoreFuzzyTarget(queryRaw: string, targetRaw: string): number {
  const query = queryRaw.trim().toLowerCase();
  const target = targetRaw.trim().toLowerCase();
  if (!query) return 10;
  if (target === query) return 120;
  if (target.startsWith(query)) return 95;
  if (target.includes(query)) return 70;

  if (isPureChoseongQuery(query)) {
    const choseong = extractKoreanChoseong(targetRaw).replace(/\s+/gu, "");
    if (choseong === query) return 110;
    if (choseong.startsWith(query)) return 88;
    if (choseong.includes(query)) return 64;
  }

  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti += 1) {
    if (target[ti] === query[qi]) qi += 1;
  }
  return qi === query.length ? 40 : 0;
}

/** 한글 초성·별칭·영문 퍼지 검색으로 `/` 연출 커맨드 후보를 정렬해 반환한다. */
export function searchSlashDirectingCommands(
  rawQuery: string,
): readonly SlashDirectingCommandSpec[] {
  const query = rawQuery.replace(/^\/+/u, "").trim();
  if (!query) return SLASH_DIRECTING_COMMANDS;
  return SLASH_DIRECTING_COMMANDS.map((cmd) => {
    const candidates = [cmd.primaryToken.slice(1), cmd.labelKo, cmd.id, ...cmd.aliases];
    const best = candidates.reduce((max, item) => Math.max(max, scoreFuzzyTarget(query, item)), 0);
    return { cmd, score: best };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.cmd);
}

/** 한글 이름·별칭·초성·ID 기준으로 `@` 스토리바이블 엔티티를 검색한다. */
export function searchMentionEntities(
  catalog: StoryBibleMentionCatalog,
  rawQuery: string,
  kindFilter?: MentionEntityKind,
): readonly StoryBibleMentionEntity[] {
  const query = rawQuery.replace(/^@+/u, "").trim();
  const scoped = kindFilter
    ? catalog.entities.filter((entity) => entity.kind === kindFilter)
    : catalog.entities;
  if (!query) return scoped;
  return scoped
    .map((entity) => {
      const candidates = [entity.name, entity.id, ...(entity.aliases ?? [])];
      const best = candidates.reduce((max, item) => Math.max(max, scoreFuzzyTarget(query, item)), 0);
      return { entity, score: best };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.entity);
}

/**
 * 커서 위치에서 인라인 `/` 또는 `@` 트리거를 탐지한다.
 * IME 조합 중(`isComposing === true`)이거나 URL·이메일 중간인 경우는 안전하게 무시한다.
 */
export function detectInlineSlashTrigger(
  text: string,
  cursorOffset: number,
  isComposing = false,
): InlineTriggerDetection | null {
  if (isComposing) return null;
  const clamped = Math.max(0, Math.min(text.length, cursorOffset));
  const before = text.slice(0, clamped);
  const match = /(?:^|[\s([{"'])([/@])([가-힣ㄱ-ㅎA-Za-z0-9_-]*)$/u.exec(before);
  if (!match) return null;
  const symbol = match[1];
  const query = match[2] ?? "";
  const symbolIndex = clamped - query.length - 1;
  if (symbol === "/" && symbolIndex > 0 && text[symbolIndex - 1] === ":") {
    return null;
  }
  return {
    kind: symbol === "/" ? "slash" : "mention",
    query,
    rangeStart: symbolIndex,
    rangeEnd: clamped,
  };
}

const MENTION_TOKEN_REGEX = /(^|[\s([{"'])(@([가-힣A-Za-z0-9_-]+))/gu;

export function findExactMentionEntity(
  catalog: StoryBibleMentionCatalog,
  token: string,
): StoryBibleMentionEntity | undefined {
  const lowered = token.toLowerCase();
  return catalog.entities.find(
    (entity) =>
      entity.name.toLowerCase() === lowered ||
      entity.id.toLowerCase() === lowered ||
      (entity.aliases ?? []).some((alias) => alias.toLowerCase() === lowered),
  );
}

export function extractMentionBindings(
  text: string,
  catalog: StoryBibleMentionCatalog,
  lineNumber = 1,
): {
  readonly resolved: readonly SlashMentionBinding[];
  readonly unresolved: readonly SlashUnresolvedMention[];
} {
  const resolved: SlashMentionBinding[] = [];
  const unresolved: SlashUnresolvedMention[] = [];
  const regex = new RegExp(MENTION_TOKEN_REGEX.source, "gu");
  let match = regex.exec(text);
  while (match) {
    const rawToken = match[2] ?? "";
    const mentionText = match[3] ?? "";
    const found = findExactMentionEntity(catalog, mentionText);
    if (found) {
      resolved.push({
        rawToken,
        mentionText,
        entityId: found.id,
        kind: found.kind,
        name: found.name,
        characterLockId: found.characterLockId,
        voicePresetId: found.voicePresetId,
        bg3dSetId: found.bg3dSetId,
      });
    } else if (mentionText.length > 0) {
      unresolved.push({ lineNumber, rawToken, mentionText });
    }
    match = regex.exec(text);
  }
  return { resolved, unresolved };
}

export function resolveSlashCommandToken(token: string): SlashDirectingCommandSpec | null {
  const cleaned = token.replace(/^\/+/u, "").trim().toLowerCase();
  if (!cleaned) return null;
  return (
    SLASH_DIRECTING_COMMANDS.find(
      (cmd) =>
        cmd.primaryToken.slice(1).toLowerCase() === cleaned ||
        cmd.id === cleaned ||
        cmd.aliases.some((alias) => alias.toLowerCase() === cleaned),
    ) ?? null
  );
}
