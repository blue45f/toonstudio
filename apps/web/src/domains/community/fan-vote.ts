/**
 * 다음 장면 투표(팬 투표) 순수 로직 — REPORT F-2.
 *
 * 설계 원칙: 참여 범위를 '본편 비개입'으로 못 박는다.
 * - 투표 주제는 허용목록(FAN_VOTE_TOPICS) 안에서만 고를 수 있다. 본편 전개·다음 화 내용 같은
 *   주제는 타입에도 런타임 검증에도 존재하지 않아, 작가가 실수로라도 올릴 수 없다.
 * - 질문 문구에 본편 전개를 묻는 표현이 들어가면 생성 자체를 거부한다(방어 심층).
 * - 독자에게 보이는 뷰(readerFanVoteView)에는 선택지별 득표가 구조적으로 들어가지 않는다.
 *   집계는 작가 운영 표면 전용 tallyFanVote 로만 얻을 수 있다.
 *
 * 모든 함수는 불변 객체를 반환하며 네트워크·DOM에 의존하지 않는다.
 * 팀 내부 투표(tool-strengths team-vote-model)·가상 스튜디오 투표와는 별개 모델이다.
 */

export const FAN_VOTE_MIN_OPTIONS = 2;
export const FAN_VOTE_MAX_OPTIONS = 4;
export const FAN_VOTE_MAX_QUESTION_LENGTH = 120;
export const FAN_VOTE_MAX_OPTION_LENGTH = 40;

/** 본편 비개입 주제 허용목록. 여기에 없는 주제(특히 본편 전개)는 만들 수 없다. */
export const FAN_VOTE_TOPICS = [
  "special-episode-lead",
  "cover-concept",
  "side-story-theme",
  "bonus-content",
] as const;

export type FanVoteTopic = (typeof FAN_VOTE_TOPICS)[number];

export const FAN_VOTE_TOPIC_LABELS: Readonly<Record<FanVoteTopic, { readonly ko: string; readonly en: string }>> = {
  "special-episode-lead": { ko: "특별편 주인공", en: "Special episode lead" },
  "cover-concept": { ko: "표지 시안", en: "Cover concept" },
  "side-story-theme": { ko: "외전 소재", en: "Side story theme" },
  "bonus-content": { ko: "보너스 콘텐츠", en: "Bonus content" },
};

/** 질문 문구에서 본편 전개를 묻는 표현을 걸러내는 방어 심층 패턴(주제 허용목록이 1차 방어). */
const MAIN_STORY_QUESTION_PATTERNS: readonly RegExp[] = [
  /본편\s*전개/u,
  /다음\s*화\s*(내용|전개|스토리)/u,
  /메인\s*스토리/u,
  /스토리\s*(방향|전개)\s*결정/u,
];

export interface FanVoteOption {
  readonly id: string;
  readonly label: string;
  /** 표지 시안 이미지·캐릭터 등 참조. 작품 페이지 에셋과 연결할 때만 쓴다. */
  readonly refId?: string;
}

export interface FanVotePoll {
  readonly version: 1;
  readonly id: string;
  /** 작품(시리즈) id. 작품 페이지·커뮤니티 표면에 붙는 단위. */
  readonly workId: string;
  readonly authorId: string;
  readonly topic: FanVoteTopic;
  readonly question: string;
  readonly options: readonly FanVoteOption[];
  /** readerId → optionId. 진행 중에는 교체할 수 있다. */
  readonly ballots: Readonly<Record<string, string>>;
  /** 마감 시각(epoch ms). null이면 작가가 마감할 때까지 진행. */
  readonly deadlineMs: number | null;
  readonly createdAt: number;
  readonly closed: boolean;
}

export type FanVoteStatus = "open" | "closed" | "expired";

export type FanVoteCreateError =
  | "topic-not-allowed"
  | "main-story-question"
  | "question-empty"
  | "question-too-long"
  | "too-few-options"
  | "too-many-options"
  | "option-empty"
  | "option-too-long"
  | "duplicate-options"
  | "work-invalid"
  | "author-invalid"
  | "deadline-in-past";

export type FanVoteCastError = "poll-closed" | "poll-expired" | "invalid-option" | "reader-invalid";

export interface FanVoteCreateInput {
  readonly id: string;
  readonly workId: string;
  readonly authorId: string;
  /** 허용목록 밖 문자열이 들어오면 거부한다(타입을 우회한 호출 방어). */
  readonly topic: FanVoteTopic;
  readonly question: string;
  readonly options: readonly { readonly label: string; readonly refId?: string }[];
  readonly closesInMs?: number | null;
  readonly nowMs?: number;
}

const isNonEmptyText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function freezePoll(poll: FanVotePoll): FanVotePoll {
  return Object.freeze({
    ...poll,
    options: Object.freeze(poll.options.map((option) => Object.freeze({ ...option }))),
    ballots: Object.freeze({ ...poll.ballots }),
  });
}

/**
 * 팬 투표를 생성한다. 본편 전개 주제·문구는 어떤 입력으로도 통과하지 않는다.
 */
export function createFanVotePoll(
  input: FanVoteCreateInput,
): { readonly ok: true; readonly poll: FanVotePoll } | { readonly ok: false; readonly reason: FanVoteCreateError } {
  if (!(FAN_VOTE_TOPICS as readonly string[]).includes(input.topic)) {
    return { ok: false, reason: "topic-not-allowed" };
  }
  const question = typeof input.question === "string" ? input.question.trim() : "";
  if (!question) return { ok: false, reason: "question-empty" };
  if (question.length > FAN_VOTE_MAX_QUESTION_LENGTH) return { ok: false, reason: "question-too-long" };
  if (MAIN_STORY_QUESTION_PATTERNS.some((pattern) => pattern.test(question))) {
    return { ok: false, reason: "main-story-question" };
  }
  if (!isNonEmptyText(input.workId)) return { ok: false, reason: "work-invalid" };
  if (!isNonEmptyText(input.authorId)) return { ok: false, reason: "author-invalid" };
  const labels = input.options.map((option) => (typeof option?.label === "string" ? option.label.trim() : ""));
  if (labels.length < FAN_VOTE_MIN_OPTIONS) return { ok: false, reason: "too-few-options" };
  if (labels.length > FAN_VOTE_MAX_OPTIONS) return { ok: false, reason: "too-many-options" };
  if (labels.some((label) => !label)) return { ok: false, reason: "option-empty" };
  if (labels.some((label) => label.length > FAN_VOTE_MAX_OPTION_LENGTH)) return { ok: false, reason: "option-too-long" };
  if (new Set(labels).size !== labels.length) return { ok: false, reason: "duplicate-options" };
  const now = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  let deadlineMs: number | null = null;
  if (input.closesInMs != null) {
    if (!Number.isFinite(input.closesInMs) || input.closesInMs <= 0) return { ok: false, reason: "deadline-in-past" };
    deadlineMs = now + Math.floor(input.closesInMs);
  }
  const id = input.id.trim();
  return {
    ok: true,
    poll: freezePoll({
      version: 1,
      id,
      workId: input.workId.trim(),
      authorId: input.authorId.trim(),
      topic: input.topic,
      question,
      options: input.options.map((option, index) => {
        const refId = typeof option.refId === "string" && option.refId.trim() ? option.refId.trim() : undefined;
        return refId
          ? { id: `${id}:o${index}`, label: labels[index], refId }
          : { id: `${id}:o${index}`, label: labels[index] };
      }),
      ballots: {},
      deadlineMs,
      createdAt: now,
      closed: false,
    }),
  };
}

export function fanVoteStatus(poll: FanVotePoll, nowMs?: number): FanVoteStatus {
  if (poll.closed) return "closed";
  const now = Number.isFinite(nowMs) ? Number(nowMs) : Date.now();
  if (poll.deadlineMs != null && now >= poll.deadlineMs) return "expired";
  return "open";
}

/**
 * 한 표를 행사한다. 같은 독자가 다시 투표하면 표가 교체된다(1인 1표 유지).
 */
export function castFanVote(
  poll: FanVotePoll,
  readerId: string,
  optionId: string,
  nowMs?: number,
): { readonly ok: true; readonly poll: FanVotePoll } | { readonly ok: false; readonly reason: FanVoteCastError } {
  const status = fanVoteStatus(poll, nowMs);
  if (status === "closed") return { ok: false, reason: "poll-closed" };
  if (status === "expired") return { ok: false, reason: "poll-expired" };
  if (!isNonEmptyText(readerId)) return { ok: false, reason: "reader-invalid" };
  if (!poll.options.some((option) => option.id === optionId)) return { ok: false, reason: "invalid-option" };
  return {
    ok: true,
    poll: freezePoll({ ...poll, ballots: { ...poll.ballots, [readerId.trim()]: optionId } }),
  };
}

export function closeFanVotePoll(poll: FanVotePoll): FanVotePoll {
  return freezePoll({ ...poll, closed: true });
}

/**
 * 독자 표면 전용 뷰. 선택지별 득표·비율은 타입 수준에서 존재하지 않는다 —
 * 독자는 내 선택과 전체 참여 인원만 본다. 집계 노출은 tallyFanVote(작가 전용)뿐이다.
 */
export interface FanVoteReaderView {
  readonly pollId: string;
  readonly topic: FanVoteTopic;
  readonly question: string;
  readonly options: readonly FanVoteOption[];
  readonly status: FanVoteStatus;
  /** 내가 고른 선택지. 아직 투표하지 않았으면 null. */
  readonly myOptionId: string | null;
  /** 전체 참여 인원(선택지별 분포는 포함하지 않는다). */
  readonly totalVoters: number;
}

export function readerFanVoteView(poll: FanVotePoll, readerId: string, nowMs?: number): FanVoteReaderView {
  const key = typeof readerId === "string" ? readerId.trim() : "";
  return Object.freeze({
    pollId: poll.id,
    topic: poll.topic,
    question: poll.question,
    options: poll.options,
    status: fanVoteStatus(poll, nowMs),
    myOptionId: key && poll.ballots[key] ? poll.ballots[key] : null,
    totalVoters: Object.keys(poll.ballots).length,
  });
}

export interface FanVoteTallyEntry {
  readonly optionId: string;
  readonly label: string;
  readonly count: number;
  /** 0..100, 소수 1자리. */
  readonly percent: number;
}

export interface FanVoteTally {
  readonly totalVoters: number;
  readonly entries: readonly FanVoteTallyEntry[];
  /** 최다 득표 선택지 id. 동률이면 전부, 표가 없으면 빈 배열. */
  readonly leaders: readonly string[];
  readonly isTie: boolean;
}

/**
 * 작가 운영 표면 전용 집계. 독자 표면에서는 호출하지 않는다 —
 * 독자에게는 readerFanVoteView 만 전달하는 것이 이 기능의 공개 정책이다.
 */
export function tallyFanVote(poll: FanVotePoll): FanVoteTally {
  const counts = new Map<string, number>(poll.options.map((option) => [option.id, 0]));
  for (const optionId of Object.values(poll.ballots)) {
    if (counts.has(optionId)) counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
  }
  const totalVoters = Object.keys(poll.ballots).length;
  const entries = poll.options
    .map((option) => {
      const count = counts.get(option.id) ?? 0;
      return {
        optionId: option.id,
        label: option.label,
        count,
        percent: totalVoters === 0 ? 0 : Math.round((count / totalVoters) * 1000) / 10,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"));
  const max = Math.max(0, ...entries.map((entry) => entry.count));
  const leaders = max === 0 ? [] : entries.filter((entry) => entry.count === max).map((entry) => entry.optionId);
  return Object.freeze({
    totalVoters,
    entries: Object.freeze(entries),
    leaders: Object.freeze(leaders),
    isTie: leaders.length > 1,
  });
}
