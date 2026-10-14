/**
 * team-vote-model.ts
 *
 * Miro 투표(Voting)의 핵심을 제작 회의에 맞게: 표지 시안·콘티 방향 같은 "팀 결정"을
 * 세션·선택지·1인 1표·집계로 모델링한다. 독자 투표(창의 제안 F-2)와 달리 이건 팀 내부용이며,
 * 결과는 결정 기록으로 남기는 것이 목적이라 동률·미참여를 정직하게 표시한다.
 *
 * 초안(tool-strengths/drafts/team-vote-model.ts)을 승격하고 배선용으로만 더했다:
 * - 비교 소스(ProcessCompareItem)를 선택지로 바꾸는 어댑터 — 선택지가 비교 소스·시안 ref와 연결된다.
 * - 마감 세션을 "결정 기록"으로 요약하는 빌더 — 득표·동률·미결정을 그대로 남긴다.
 * - 회차 룸 로컬 저장(localStorage) 키·직렬화·방어적 복원 — 깨진 저장본은 사유와 함께 거부한다.
 */

export type TeamVoteStatus = "open" | "closed";

export interface TeamVoteOption {
  readonly id: string;
  readonly label: string;
  /** 비교 소스·시안 등 참조. */
  readonly refId?: string;
}

export interface TeamVoteSession {
  readonly version: 1;
  readonly id: string;
  readonly title: string;
  readonly options: readonly TeamVoteOption[];
  /** userId → optionId. 다시 투표하면 교체된다. */
  readonly ballots: Readonly<Record<string, string>>;
  readonly anonymous: boolean;
  readonly status: TeamVoteStatus;
}

export function createTeamVoteSession(input: {
  id: string;
  title: string;
  options: readonly TeamVoteOption[];
  anonymous?: boolean;
}): TeamVoteSession {
  return {
    version: 1,
    id: input.id,
    title: input.title,
    options: input.options,
    ballots: {},
    anonymous: input.anonymous ?? false,
    status: "open",
  };
}

export function castTeamVote(
  session: TeamVoteSession,
  userId: string,
  optionId: string,
): TeamVoteSession {
  if (session.status !== "open") return session;
  if (!session.options.some((o) => o.id === optionId)) return session;
  return { ...session, ballots: { ...session.ballots, [userId]: optionId } };
}

export function closeTeamVote(session: TeamVoteSession): TeamVoteSession {
  return { ...session, status: "closed" };
}

export interface TeamVoteTally {
  readonly optionId: string;
  readonly count: number;
  /** 0..1, 투표자 기준. */
  readonly ratio: number;
}

export function tallyTeamVote(session: TeamVoteSession): {
  tallies: readonly TeamVoteTally[];
  totalVoters: number;
  /** 최다 득표 선택지. 동률이면 전부, 표가 없으면 빈 배열. */
  leaders: readonly string[];
  isTie: boolean;
} {
  const counts = new Map<string, number>(session.options.map((o) => [o.id, 0]));
  for (const optionId of Object.values(session.ballots)) {
    counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
  }
  const totalVoters = Object.keys(session.ballots).length;
  const tallies = session.options.map((o) => ({
    optionId: o.id,
    count: counts.get(o.id) ?? 0,
    ratio: totalVoters === 0 ? 0 : (counts.get(o.id) ?? 0) / totalVoters,
  }));
  const max = Math.max(0, ...tallies.map((t) => t.count));
  const leaders = max === 0 ? [] : tallies.filter((t) => t.count === max).map((t) => t.optionId);
  return { tallies, totalVoters, leaders, isTie: leaders.length > 1 };
}

/** 세션 생성 입력 검증. 표면 폼과 저장 복원이 같은 기준을 쓴다. */
export function validateTeamVoteOptions(
  options: readonly TeamVoteOption[],
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (options.length < 2) return { ok: false, reason: "선택지는 2개 이상이어야 합니다." };
  const seen = new Set<string>();
  for (const option of options) {
    if (!option.id.trim()) return { ok: false, reason: "선택지 id가 비어 있습니다." };
    if (!option.label.trim()) return { ok: false, reason: "선택지 이름이 비어 있습니다." };
    if (seen.has(option.id)) return { ok: false, reason: `선택지 id가 겹칩니다: ${option.id}` };
    seen.add(option.id);
  }
  return { ok: true };
}

/**
 * 비교 소스를 투표 선택지로 바꾼다. 선택지 id는 소스 id에서 결정적으로 만들고
 * refId에 원본 비교 소스 id를 남겨, 표를 던진 대상이 어떤 시안인지 역추적할 수 있다.
 */
export function teamVoteOptionsFromCompareItems(
  items: readonly { readonly id: string; readonly processLabel: string; readonly revisionLabel: string }[],
): readonly TeamVoteOption[] {
  return items.map((item) => ({
    id: `compare:${item.id}`,
    label: `${item.processLabel} · ${item.revisionLabel}`,
    refId: item.id,
  }));
}

export interface TeamVoteDecisionRecord {
  readonly sessionId: string;
  readonly title: string;
  readonly status: TeamVoteStatus;
  readonly totalVoters: number;
  readonly tallies: readonly (TeamVoteTally & { readonly label: string })[];
  /** 최다 득표 선택지 라벨. 동률이면 전부, 무표면 빈 배열. */
  readonly leaderLabels: readonly string[];
  readonly isTie: boolean;
  /** 마감됐고 동률이 아니며 표가 있을 때만 "결정됨"이다. 그 외에는 미결정으로 남는다. */
  readonly decided: boolean;
}

/** 마감된 세션을 결정 기록으로 요약한다. 동률·무표는 결정된 것처럼 포장하지 않는다. */
export function buildTeamVoteDecisionRecord(session: TeamVoteSession): TeamVoteDecisionRecord {
  const tally = tallyTeamVote(session);
  const labelOf = (optionId: string) => session.options.find((o) => o.id === optionId)?.label ?? optionId;
  return {
    sessionId: session.id,
    title: session.title,
    status: session.status,
    totalVoters: tally.totalVoters,
    tallies: tally.tallies.map((t) => ({ ...t, label: labelOf(t.optionId) })),
    leaderLabels: tally.leaders.map(labelOf),
    isTie: tally.isTie,
    decided: session.status === "closed" && !tally.isTie && tally.leaders.length === 1,
  };
}

/** 회차 룸 로컬 저장 키. 프로젝트·회차 단위로 세션 목록을 격리한다. */
export function teamVoteStorageKey(projectId: string, episodeId: string): string {
  return `toonstudio:team-vote:v1:${projectId}:${episodeId}`;
}

export function serializeTeamVoteSessions(sessions: readonly TeamVoteSession[]): string {
  return JSON.stringify({ version: 1, sessions });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSession(value: unknown): TeamVoteSession | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1) return null;
  if (typeof value.id !== "string" || !value.id) return null;
  if (typeof value.title !== "string" || !value.title.trim()) return null;
  if (value.status !== "open" && value.status !== "closed") return null;
  if (typeof value.anonymous !== "boolean") return null;
  if (!Array.isArray(value.options)) return null;
  const options: TeamVoteOption[] = [];
  for (const raw of value.options) {
    if (!isRecord(raw)) return null;
    if (typeof raw.id !== "string" || typeof raw.label !== "string") return null;
    if (raw.refId !== undefined && typeof raw.refId !== "string") return null;
    options.push(raw.refId === undefined ? { id: raw.id, label: raw.label } : { id: raw.id, label: raw.label, refId: raw.refId });
  }
  if (!validateTeamVoteOptions(options).ok) return null;
  if (!isRecord(value.ballots)) return null;
  const ballots: Record<string, string> = {};
  for (const [userId, optionId] of Object.entries(value.ballots)) {
    if (typeof optionId !== "string") return null;
    // 존재하지 않는 선택지를 가리키는 표는 깨진 데이터로 보고 세션 전체를 거부한다.
    if (!options.some((o) => o.id === optionId)) return null;
    ballots[userId] = optionId;
  }
  return {
    version: 1,
    id: value.id,
    title: value.title,
    options,
    ballots,
    anonymous: value.anonymous,
    status: value.status,
  };
}

/** 깨진 저장본은 null — 표면이 빈 목록으로 조용히 덮지 않고 사유를 보여줄 수 있게 한다. */
export function parseTeamVoteSessions(raw: string | null): readonly TeamVoteSession[] | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.sessions)) return null;
  const sessions: TeamVoteSession[] = [];
  const seen = new Set<string>();
  for (const rawSession of parsed.sessions) {
    const session = parseSession(rawSession);
    if (!session || seen.has(session.id)) return null;
    seen.add(session.id);
    sessions.push(session);
  }
  return sessions;
}
