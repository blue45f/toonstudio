/**
 * 성장 단계 엔진 5:
 * 휴재·완결 공백기 무스포일러 캐릭터 비하인드 카드 & Q&A 봇.
 */

export interface CharacterBibleEntry {
  readonly id: string;
  readonly episodeUnlocked: number;
  readonly keywords: readonly string[];
  readonly topic: string;
  readonly answer: string;
  readonly behindTitle: string;
  readonly behindFact: string;
  readonly moodTag: string;
}

export interface RestrictedSpoilerTerm {
  readonly term: string;
  readonly unlocksAtEpisode: number;
  readonly safeDeflection: string;
}

export interface HiatusCharacterBible {
  readonly workTitle: string;
  readonly characterName: string;
  readonly characterRole: string;
  readonly characterTone: string;
  readonly approvedUpToEpisode: number;
  readonly entries: readonly CharacterBibleEntry[];
  readonly restrictedSpoilerTerms: readonly RestrictedSpoilerTerm[];
}

export interface HiatusBehindCard {
  readonly cardId: string;
  readonly characterName: string;
  readonly episodeBadge: string;
  readonly title: string;
  readonly fact: string;
  readonly moodTag: string;
  readonly spoilerSafe: true;
  readonly approvedUpToEpisode: number;
}

export interface HiatusQaAnswer {
  readonly status: "answered" | "spoiler-blocked";
  readonly spoilerBlocked: boolean;
  readonly blockedReason: string | null;
  readonly mentionedEpisode: number | null;
  readonly approvedUpToEpisode: number;
  readonly matchedEntryId: string | null;
  readonly reply: string;
  readonly behindCard: HiatusBehindCard;
}

function extractMentionedEpisode(question: string, hint?: number): number | null {
  if (hint !== undefined && Number.isFinite(hint) && hint > 0) {
    return Math.floor(hint);
  }
  const koMatch = question.match(/(\d{1,4})\s*화/u);
  if (koMatch?.[1]) return Number.parseInt(koMatch[1], 10);
  const enMatch = question.match(/(?:ep\.?|episode)\s*(\d{1,4})/iu);
  if (enMatch?.[1]) return Number.parseInt(enMatch[1], 10);
  return null;
}

export function answerHiatusFanQuestion(
  bible: HiatusCharacterBible,
  question: string,
  requestedEpisodeHint?: number,
): HiatusQaAnswer {
  const normalizedQuestion = question.trim().toLowerCase();
  const approvedEntries = bible.entries.filter(
    (entry) => entry.episodeUnlocked <= bible.approvedUpToEpisode,
  );
  const fallbackEntry = approvedEntries[0] ?? {
    id: "approved-fallback",
    episodeUnlocked: Math.min(1, bible.approvedUpToEpisode),
    keywords: [],
    topic: "공백기 인사",
    answer: `지금은 ${bible.approvedUpToEpisode}화까지 공개된 이야기로만 답할 수 있어요. 다음 연재 복귀 때 시계탑에서 다시 만나요!`,
    behindTitle: "연재 복귀 전 공식 설정 노트",
    behindFact: `${bible.characterName}의 공식 프로필은 현재 ${bible.approvedUpToEpisode}화까지 작가 승인 검증을 마쳤습니다.`,
    moodTag: "공식 안전 카드",
  };

  const makeCard = (entry: CharacterBibleEntry): HiatusBehindCard => ({
    cardId: `card-${entry.id}-ep${bible.approvedUpToEpisode}`,
    characterName: bible.characterName,
    episodeBadge: `1~${bible.approvedUpToEpisode}화 공식 공개 범위`,
    title: entry.behindTitle,
    fact: entry.behindFact,
    moodTag: entry.moodTag,
    spoilerSafe: true,
    approvedUpToEpisode: bible.approvedUpToEpisode,
  });

  const mentionedEpisode = extractMentionedEpisode(question, requestedEpisodeHint);
  if (mentionedEpisode !== null && mentionedEpisode > bible.approvedUpToEpisode) {
    return {
      status: "spoiler-blocked",
      spoilerBlocked: true,
      blockedReason: `미공개 ${mentionedEpisode}화 질문 차단 (승인 상한: ${bible.approvedUpToEpisode}화)`,
      mentionedEpisode,
      approvedUpToEpisode: bible.approvedUpToEpisode,
      matchedEntryId: null,
      reply: `잠깐! ${mentionedEpisode}화 이야기는 아직 시계탑 금고에 봉인돼 있어요. 지금 공개된 ${bible.approvedUpToEpisode}화까지의 설정과 비하인드로 대신 들려드릴게요.`,
      behindCard: makeCard(fallbackEntry),
    };
  }

  const hitRestricted = bible.restrictedSpoilerTerms.find(
    (item) =>
      item.unlocksAtEpisode > bible.approvedUpToEpisode &&
      normalizedQuestion.includes(item.term.toLowerCase()),
  );
  if (hitRestricted) {
    return {
      status: "spoiler-blocked",
      spoilerBlocked: true,
      blockedReason: `미공개 스포일러 키워드('${hitRestricted.term}') 차단 (${hitRestricted.unlocksAtEpisode}화 공개 예정)`,
      mentionedEpisode,
      approvedUpToEpisode: bible.approvedUpToEpisode,
      matchedEntryId: null,
      reply: hitRestricted.safeDeflection,
      behindCard: makeCard(fallbackEntry),
    };
  }

  let bestEntry: CharacterBibleEntry | null = null;
  let bestScore = 0;
  for (const entry of approvedEntries) {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (normalizedQuestion.includes(keyword.toLowerCase())) {
        score += keyword.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  const chosen = bestEntry ?? fallbackEntry;
  return {
    status: "answered",
    spoilerBlocked: false,
    blockedReason: null,
    mentionedEpisode,
    approvedUpToEpisode: bible.approvedUpToEpisode,
    matchedEntryId: bestEntry ? chosen.id : null,
    reply: bestEntry
      ? chosen.answer
      : `고마워요! 현재 공개된 ${bible.approvedUpToEpisode}화까지 기준으로는 "${chosen.behindTitle}" 이야기를 들려드릴 수 있어요. 궁금한 소품이나 명장면을 물어봐 주세요.`,
    behindCard: makeCard(chosen),
  };
}

export const DEFAULT_HIATUS_CHARACTER_BIBLE: HiatusCharacterBible = {
  workTitle: "은빛 시계탑의 공녀",
  characterName: "세레나 아벨",
  characterRole: "시간 복원사 · 주인공",
  characterTone: "차분하지만 장난기 있는 경어체",
  approvedUpToEpisode: 21,
  entries: [
    {
      id: "bible-watch",
      episodeUnlocked: 1,
      keywords: ["회중시계", "시계", "소품", "복원", "태엽"],
      topic: "은빛 회중시계 설정",
      answer: "제 손에 늘 들려 있는 은빛 회중시계는 1화 시계탑 지하 공방에서 처음 깨웠어요. 태엽을 거꾸로 감을 때마다 차가운 박하 향이 살짝 납니다.",
      behindTitle: "1화 회중시계 톱니바퀴 개수 비밀",
      behindFact: "작가가 실제 19세기 회중시계 도면을 참고해 톱니 12개 중 3시 방향 하나만 깎아 둔 채 그렸습니다.",
      moodTag: "소품 비하인드",
    },
    {
      id: "bible-tea",
      episodeUnlocked: 9,
      keywords: ["홍차", "간식", "취향", "좋아하", "음식"],
      topic: "좋아하는 차와 공방 일상",
      answer: "밤샘 수리를 할 땐 베르가못 홍차에 각설탕 두 개를 꼭 넣어요. 9화에서 카인이 몰래 놓고 간 레몬 타르트도 사실 끝까지 다 먹었답니다.",
      behindTitle: "9화 공방 책상 위 찻잔 디테일",
      behindFact: "9화~14화 내내 세레나의 찻잔 손잡이에 금이 가 있는데, 1화 종탑 진동 때 생긴 흔적입니다.",
      moodTag: "일상 비하인드",
    },
    {
      id: "bible-kain",
      episodeUnlocked: 18,
      keywords: ["카인", "기사단장", "관계", "북부", "신뢰"],
      topic: "카인과의 공조 계기",
      answer: "18화 다리 붕괴 사건 이후로 서로 등을 맡기기로 했어요. 무뚝뚝해 보여도 늘 제 공구 가방 무게부터 확인해 주는 사람이에요.",
      behindTitle: "18화 빗속 대치 컷 초기 콘티",
      behindFact: "원래 18화 우산 컷은 실내 대화였지만, 북부 기사의 결심을 강조하려고 빗속 석교로 바꿨습니다.",
      moodTag: "연출 비하인드",
    },
    {
      id: "bible-ep30-secret",
      episodeUnlocked: 30,
      keywords: ["결말", "흑막", "진짜 범인", "대공"],
      topic: "미공개 30화 흑막 정체",
      answer: "30화에서 시계탑 설계자 대공이 흑막으로 밝혀집니다.",
      behindTitle: "30화 미공개 반전",
      behindFact: "30화 콘티에서만 공개되는 대공의 이중 계약서 설정입니다.",
      moodTag: "미공개",
    },
  ],
  restrictedSpoilerTerms: [
    {
      term: "결말",
      unlocksAtEpisode: 50,
      safeDeflection: "결말은 아직 태엽이 돌아가는 중이라 비밀이에요! 대신 1~21화 사이 가장 좋아하신 장면을 알려 주시면 제작 비하인드를 꺼내 드릴게요.",
    },
    {
      term: "흑막",
      unlocksAtEpisode: 30,
      safeDeflection: "흑막의 정체는 아직 공식 연재분(21화) 밖의 스포일러라 말씀드릴 수 없어요. 복귀 화에서 직접 확인해 주세요!",
    },
    {
      term: "배신",
      unlocksAtEpisode: 28,
      safeDeflection: "누군가의 배신 여부는 아직 미공개 구간이에요. 지금은 18화 북부 석교 공조까지의 공식 설정만 안전하게 열려 있습니다.",
    },
    {
      term: "죽",
      unlocksAtEpisode: 42,
      safeDeflection: "인물의 생사 전개는 미공개 스포일러로 보호 중입니다. 대신 공식 1~21화 비하인드 카드를 먼저 열어 보실래요?",
    },
  ],
};
