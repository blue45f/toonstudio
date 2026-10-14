import { describe, expect, it } from "vitest";

import {
  buildTeamVoteDecisionRecord,
  castTeamVote,
  closeTeamVote,
  createTeamVoteSession,
  parseTeamVoteSessions,
  serializeTeamVoteSessions,
  tallyTeamVote,
  teamVoteOptionsFromCompareItems,
  teamVoteStorageKey,
  validateTeamVoteOptions,
  type TeamVoteSession,
} from "./team-vote-model";

const options = [
  { id: "a", label: "시안 A" },
  { id: "b", label: "시안 B" },
  { id: "c", label: "시안 C" },
] as const;

function session(ballots: Readonly<Record<string, string>> = {}): TeamVoteSession {
  let s = createTeamVoteSession({ id: "vote:1", title: "표지 시안 결정", options });
  for (const [userId, optionId] of Object.entries(ballots)) s = castTeamVote(s, userId, optionId);
  return s;
}

describe("team-vote-model", () => {
  it("투표하면 집계되고, 다시 투표하면 교체된다", () => {
    const s = session({ u1: "a", u2: "a", u3: "b" });
    const tally = tallyTeamVote(s);
    expect(tally.totalVoters).toBe(3);
    expect(tally.tallies.find((t) => t.optionId === "a")?.count).toBe(2);
    expect(tally.leaders).toEqual(["a"]);
    expect(tally.isTie).toBe(false);
    const changed = castTeamVote(s, "u3", "a");
    expect(tallyTeamVote(changed).tallies.find((t) => t.optionId === "b")?.count).toBe(0);
    expect(tallyTeamVote(changed).totalVoters).toBe(3);
  });

  it("없는 선택지 투표는 무변경이다", () => {
    const s = session({ u1: "a" });
    expect(castTeamVote(s, "u2", "missing")).toBe(s);
  });

  it("동률은 leaders에 전부 들어가고 isTie가 된다", () => {
    const tally = tallyTeamVote(session({ u1: "a", u2: "b" }));
    expect(tally.leaders).toEqual(["a", "b"]);
    expect(tally.isTie).toBe(true);
  });

  it("마감하면 득표·동률이 결정 기록에 그대로 남고, 마감 후 투표는 거부된다", () => {
    const closed = closeTeamVote(session({ u1: "a", u2: "b", u3: "b" }));
    const record = buildTeamVoteDecisionRecord(closed);
    expect(record.decided).toBe(true);
    expect(record.leaderLabels).toEqual(["시안 B"]);
    expect(record.tallies.find((t) => t.optionId === "b")?.count).toBe(2);
    expect(castTeamVote(closed, "u4", "a")).toBe(closed);
    expect(castTeamVote(closed, "u1", "b")).toBe(closed);
  });

  it("동률 마감은 결정으로 포장하지 않는다", () => {
    const record = buildTeamVoteDecisionRecord(closeTeamVote(session({ u1: "a", u2: "b" })));
    expect(record.isTie).toBe(true);
    expect(record.decided).toBe(false);
    expect(record.leaderLabels).toEqual(["시안 A", "시안 B"]);
  });

  it("무표 마감은 결정 없음으로 남는다", () => {
    const record = buildTeamVoteDecisionRecord(closeTeamVote(session()));
    expect(record.decided).toBe(false);
    expect(record.leaderLabels).toEqual([]);
    expect(record.totalVoters).toBe(0);
  });

  it("진행 중 세션은 결정 기록에서도 미결정이다", () => {
    const record = buildTeamVoteDecisionRecord(session({ u1: "a", u2: "a" }));
    expect(record.status).toBe("open");
    expect(record.decided).toBe(false);
  });

  it("비교 소스가 refId를 단 선택지가 된다", () => {
    const built = teamVoteOptionsFromCompareItems([
      { id: "cover::cover-v1", processLabel: "표지", revisionLabel: "v1" },
      { id: "cover::cover-v2", processLabel: "표지", revisionLabel: "v2" },
    ]);
    expect(built).toEqual([
      { id: "compare:cover::cover-v1", label: "표지 · v1", refId: "cover::cover-v1" },
      { id: "compare:cover::cover-v2", label: "표지 · v2", refId: "cover::cover-v2" },
    ]);
  });

  it("선택지 검증: 2개 미만·중복 id·빈 라벨을 거부한다", () => {
    expect(validateTeamVoteOptions([{ id: "a", label: "A" }]).ok).toBe(false);
    expect(validateTeamVoteOptions([{ id: "a", label: "A" }, { id: "a", label: "B" }]).ok).toBe(false);
    expect(validateTeamVoteOptions([{ id: "a", label: " " }, { id: "b", label: "B" }]).ok).toBe(false);
    expect(validateTeamVoteOptions(options).ok).toBe(true);
  });

  it("직렬화 왕복 후 세션이 그대로 복원된다", () => {
    const original = closeTeamVote(session({ u1: "a", u2: "c" }));
    const parsed = parseTeamVoteSessions(serializeTeamVoteSessions([original]));
    expect(parsed).toEqual([original]);
  });

  it("깨진 저장본은 거부한다: 깨진 JSON·버전 불일치·유령 표·세션 id 중복", () => {
    expect(parseTeamVoteSessions("{broken")).toBeNull();
    expect(parseTeamVoteSessions(JSON.stringify({ version: 2, sessions: [] }))).toBeNull();
    const ghost = session({ u1: "a" });
    const ghostRaw = JSON.stringify({ version: 1, sessions: [{ ...ghost, ballots: { u1: "missing" } }] });
    expect(parseTeamVoteSessions(ghostRaw)).toBeNull();
    const dupRaw = JSON.stringify({ version: 1, sessions: [ghost, ghost] });
    expect(parseTeamVoteSessions(dupRaw)).toBeNull();
    expect(parseTeamVoteSessions(null)).toBeNull();
  });

  it("저장 키는 프로젝트·회차로 격리된다", () => {
    expect(teamVoteStorageKey("p1", "e1")).toBe("toonstudio:team-vote:v1:p1:e1");
    expect(teamVoteStorageKey("p1", "e2")).not.toBe(teamVoteStorageKey("p1", "e1"));
  });
});
