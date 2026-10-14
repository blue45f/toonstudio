/**
 * 설정 충돌 자동 감지 — 회차 메타·대사를 바이블 사실과 대조하는 순수 모델 (REPORT R-1).
 *
 * 홀로크론 사례의 핵심은 "연속성 관리자가 제출물을 기존 사실과 대조해 충돌을
 * 짚어내되, 최종 판정은 사람이 내린다"는 역할 분리다. 이 모듈도 정확히 그
 * 경계까지만 한다: 충돌 "후보"를 근거와 함께 도출할 뿐, 충돌이라고 확정하지
 * 않고 어떤 데이터도 고치지 않는다. QC에서는 warning('확인 요망')으로만
 * 오르고 게시를 막지 않는다(production-episode-qc의 setting-conflict 항목).
 *
 * 재료의 한계 (정직성):
 * - 바이블 사실(StudioStoryFact)은 label 자유 텍스트 + 연결된 캐릭터·장소뿐이라
 *   구조화된 술어가 없다. 그래서 대조는 ① 사실 label의 핵심 토큰이 텍스트에
 *   등장하는지 ② 지식 부정 표현이 함께 있는지 ③ 장소가 사실의 장소와 다른지
 *   라는 명시 규칙으로만 한다. 토큰이 안 잡히면 침묵한다(지어내지 않음).
 * - 대사 화자는 호출부가 명시로 준 speakerId만 믿는다. 화자 없는 대사는
 *   사실에 연결된 캐릭터가 정확히 1명일 때만 그 캐릭터 후보로 올린다.
 * - 장소 불일치는 회차 메타가 장소를 정확히 1곳으로 선언했을 때만 본다 —
 *   장면 이동이 잦은 회차에서 오탐을 만들지 않기 위해서다.
 */
import type { StudioStoryBible, StudioStoryFact } from "./studio-story-bible";

export type SettingConflictCode =
  /** 이미 아는 것으로 등록된 사실을 "몰랐다/처음 듣는다"고 말하는 후보. */
  | "knowledge-negation"
  /** 사실의 장소와 회차 메타·대사가 가리키는 장소가 다른 후보. */
  | "location-mismatch";

export interface SettingConflictDialogueLine {
  readonly id: string;
  /** 화자 캐릭터 id. 모르면 null — 귀속을 지어내지 않는다. */
  readonly speakerId: string | null;
  readonly text: string;
}

export interface EpisodeSettingInput {
  readonly episodeId: string;
  /** 회차 메타 텍스트 (제목·줄거리·목표 등). id는 출처 표시용. */
  readonly metaTexts: readonly { readonly id: string; readonly text: string }[];
  /** 회차 메타가 선언한 장소 id 목록. */
  readonly declaredLocationIds: readonly string[];
  readonly dialogueLines: readonly SettingConflictDialogueLine[];
}

export interface SettingConflictCandidate {
  readonly id: string;
  readonly code: SettingConflictCode;
  readonly factId: string;
  readonly factLabel: string;
  readonly characterId: string | null;
  readonly characterName: string | null;
  readonly sourceKind: "dialogue" | "meta";
  readonly sourceId: string;
  /** 근거 발췌 (최대 80자). */
  readonly excerpt: string;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface SettingConflictReport {
  readonly episodeId: string;
  readonly candidates: readonly SettingConflictCandidate[];
  readonly candidateCount: number;
  /** 후보가 1건이라도 있으면 true — QC '확인 요망' 판정의 단일 출처. */
  readonly needsReview: boolean;
}

export interface SettingConflictOptions {
  readonly disabledCodes?: readonly SettingConflictCode[];
  readonly maxCandidates?: number;
}

/** 지식 부정 표현 — 이 표현이 사실 언급과 같은 문장 재료에 있을 때만 후보가 된다. */
const KNOWLEDGE_NEGATIONS: readonly string[] = Object.freeze([
  "몰랐",
  "모른",
  "몰라",
  "처음 들",
  "처음 알",
  "처음 듣",
  "알 리 없",
  "알 수 없",
  "들어본 적 없",
  "기억이 없",
  "didn't know",
  "did not know",
  "never heard",
  "no idea",
  "didn't realize",
]);

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** 사실 label에서 대조용 핵심 토큰을 뽑는다 (2자 이상 단어, 중복 제거). */
export function settingFactKeywords(fact: StudioStoryFact): readonly string[] {
  const tokens = normalize(fact.label)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
  return Object.freeze([...new Set(tokens)]);
}

const TRAILING_PARTICLES: readonly string[] = Object.freeze([
  "의", "은", "는", "이", "가", "을", "를", "에", "와", "과",
]);

function tokenMatches(haystack: string, token: string): boolean {
  if (haystack.includes(token)) return true;
  // 조사로 끝나는 토큰은 어간으로도 비교한다 ("아르카의" → "아르카").
  const last = token.slice(-1);
  if (token.length >= 3 && TRAILING_PARTICLES.includes(last)) {
    return haystack.includes(token.slice(0, -1));
  }
  return false;
}

function mentionsFact(text: string, fact: StudioStoryFact): boolean {
  const haystack = normalize(text);
  if (!haystack) return false;
  if (haystack.includes(normalize(fact.label))) return true;
  const keywords = settingFactKeywords(fact);
  // 3자 이상 토큰은 단독 등장을 언급으로 본다. 2자 토큰은 흔한 말과 겹치기
  // 쉬워 단독 근거로 쓰지 않고, 서로 다른 토큰 2개 이상이 함께 등장할 때만 본다.
  if (keywords.some((token) => token.length >= 3 && tokenMatches(haystack, token))) return true;
  const shortHits = keywords.filter(
    (token) => token.length === 2 && tokenMatches(haystack, token),
  );
  return shortHits.length >= 2;
}

function hasKnowledgeNegation(text: string): boolean {
  const haystack = normalize(text);
  return KNOWLEDGE_NEGATIONS.some((pattern) => haystack.includes(pattern));
}

function excerptOf(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}

interface TextSource {
  readonly kind: "dialogue" | "meta";
  readonly id: string;
  readonly text: string;
  readonly speakerId: string | null;
}

export function detectSettingConflicts(
  bible: StudioStoryBible,
  input: EpisodeSettingInput,
  options?: SettingConflictOptions,
): SettingConflictReport {
  const disabled = new Set(options?.disabledCodes ?? []);
  const maxCandidates = Math.max(0, options?.maxCandidates ?? 20);
  const characterName = new Map(bible.characters.map((c) => [c.id, c.name]));
  const locationName = new Map(bible.locations.map((l) => [l.id, l.name]));
  const declared = [...new Set(input.declaredLocationIds)];

  const sources: TextSource[] = [
    ...input.metaTexts.map((meta) => ({
      kind: "meta" as const,
      id: meta.id,
      text: meta.text,
      speakerId: null,
    })),
    ...input.dialogueLines.map((line) => ({
      kind: "dialogue" as const,
      id: line.id,
      text: line.text,
      speakerId: line.speakerId,
    })),
  ];

  const candidates: SettingConflictCandidate[] = [];
  const seen = new Set<string>();
  const push = (candidate: SettingConflictCandidate) => {
    if (seen.has(candidate.id) || candidates.length >= maxCandidates) return;
    seen.add(candidate.id);
    candidates.push(candidate);
  };

  for (const fact of bible.facts) {
    for (const source of sources) {
      if (!mentionsFact(source.text, fact)) continue;

      // 규칙 1 — 지식 부정: 사실을 언급하면서 "몰랐다"류 표현이 함께 있다.
      if (!disabled.has("knowledge-negation") && hasKnowledgeNegation(source.text)) {
        // 귀속: 대사면 화자, 아니면 사실 연결 캐릭터가 정확히 1명일 때만 그 사람.
        const characterId =
          source.speakerId ??
          (fact.characterIds.length === 1 ? (fact.characterIds[0] ?? null) : null);
        // 화자가 정해졌는데 사실과 무관한 캐릭터면 이 사실의 후보가 아니다.
        const attributed =
          characterId === null || fact.characterIds.length === 0 || fact.characterIds.includes(characterId);
        if (attributed) {
          const name = characterId ? (characterName.get(characterId) ?? null) : null;
          push(Object.freeze({
            id: `knowledge-negation:${fact.id}:${source.id}`,
            code: "knowledge-negation" as const,
            factId: fact.id,
            factLabel: fact.label,
            characterId,
            characterName: name,
            sourceKind: source.kind,
            sourceId: source.id,
            excerpt: excerptOf(source.text),
            messageKo: name
              ? `${name}이(가) 이미 아는 것으로 등록된 사실 '${fact.label}'을(를) 모른다고 말하는 것처럼 보여요. 연출인지 설정 충돌인지 확인해 주세요.`
              : `이미 등록된 사실 '${fact.label}'을(를) 모른다는 표현이 있어요. 연출인지 설정 충돌인지 확인해 주세요.`,
            messageEn: name
              ? `${name} appears to say they don't know '${fact.label}', which the bible records them as knowing. Please check whether this is intentional or a setting conflict.`
              : `A line suggests not knowing the registered fact '${fact.label}'. Please check whether this is intentional or a setting conflict.`,
          }));
        }
      }

      // 규칙 2 — 장소 불일치: 사실에 장소가 있는데, 텍스트가 다른 바이블 장소를
      // 이름으로 가리키거나, 회차 선언 장소가 정확히 1곳인데 그곳이 아니다.
      if (!disabled.has("location-mismatch") && fact.locationId) {
        const factLocationName = locationName.get(fact.locationId) ?? fact.locationId;
        const namedOther = bible.locations.find(
          (location) =>
            location.id !== fact.locationId && normalize(source.text).includes(normalize(location.name)),
        );
        const declaredOther =
          !namedOther && declared.length === 1 && declared[0] !== fact.locationId
            ? (locationName.get(declared[0] as string) ?? (declared[0] as string))
            : null;
        const otherName = namedOther?.name ?? declaredOther;
        if (otherName) {
          push(Object.freeze({
            id: `location-mismatch:${fact.id}:${source.id}`,
            code: "location-mismatch" as const,
            factId: fact.id,
            factLabel: fact.label,
            characterId: null,
            characterName: null,
            sourceKind: source.kind,
            sourceId: source.id,
            excerpt: excerptOf(source.text),
            messageKo: `사실 '${fact.label}'의 장소는 '${factLocationName}'인데, 이 회차에서는 '${otherName}'(으)로 읽혀요. 장소 이동이 있는 회차인지 확인해 주세요.`,
            messageEn: `Fact '${fact.label}' is set in '${factLocationName}', but this episode reads as '${otherName}'. Please check whether the episode actually moves location.`,
          }));
        }
      }
    }
  }

  return Object.freeze({
    episodeId: input.episodeId,
    candidates: Object.freeze(candidates),
    candidateCount: candidates.length,
    needsReview: candidates.length > 0,
  });
}

/**
 * QC extras 브리지 — production-episode-qc의 EpisodeQcExtras.settingConflict
 * 모양과 구조적으로 같다(QC 모듈은 이 파일을 import하지 않는다).
 * report가 null이면 null을 돌려 QC 항목이 skipped가 되게 한다.
 */
export function settingConflictQcExtras(
  report: SettingConflictReport | null,
): {
  readonly candidateCount: number;
  readonly topMessage: { readonly ko: string; readonly en: string } | null;
} | null {
  if (!report) return null;
  const first = report.candidates[0];
  return Object.freeze({
    candidateCount: report.candidateCount,
    topMessage: first
      ? Object.freeze({ ko: first.messageKo, en: first.messageEn })
      : null,
  });
}
