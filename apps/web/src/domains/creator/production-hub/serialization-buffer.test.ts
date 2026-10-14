import { describe, expect, it } from "vitest";

import {
  deriveBufferFromSummary,
  deriveReleaseIntervalDays,
  deriveSerializationBuffer,
  episodeBufferFacts,
  planHiatus,
  serializationBufferWarning,
} from "./serialization-buffer";

const bt = (ko: string) => ko;
const policy = { safeBufferCount: 2 };

describe("episodeBufferFacts", () => {
  it("publish-ready만 완성으로 세고 예약 계획이 있으면 scheduled로 가른다", () => {
    const facts = episodeBufferFacts(
      [
        { episodeId: "e1", state: "publish-ready" },
        { episodeId: "e2", state: "publish-ready" },
        { episodeId: "e3", state: "published" },
        { episodeId: "e4", state: "final-art-production" },
        { episodeId: "e5", state: "cancelled" },
      ],
      [{ episodeId: "e1", status: "scheduled", scheduledAt: "2026-10-21T00:00:00.000Z" }],
    );
    expect(facts).toEqual([
      { episodeId: "e1", state: "scheduled", scheduledFor: "2026-10-21T00:00:00.000Z" },
      { episodeId: "e2", state: "ready" },
      { episodeId: "e3", state: "published" },
      { episodeId: "e4", state: "inProgress" },
      { episodeId: "e5", state: "unknown" },
    ]);
  });
});

describe("deriveSerializationBuffer", () => {
  it("버퍼 횟수·일수가 회차 상태와 일치하고 판정 불가는 제외+개수 표시된다", () => {
    const digest = deriveSerializationBuffer({
      episodes: [
        { episodeId: "e1", state: "scheduled" },
        { episodeId: "e2", state: "ready" },
        { episodeId: "e3", state: "ready" },
        { episodeId: "e4", state: "published" },
        { episodeId: "e5", state: "inProgress" },
        { episodeId: "e6", state: "unknown" },
        { episodeId: "e7", state: "unknown" },
      ],
      releaseIntervalDays: 7,
      policy,
      today: "2026-10-14",
    });
    expect(digest.bufferedReleases).toBe(3);
    expect(digest.bufferedDays).toBe(21);
    expect(digest.level).toBe("safe");
    expect(digest.unknownEpisodeCount).toBe(2);
    expect(digest.projectedEmptyDate).toBe("2026-11-04");
  });

  it("안전선 하회는 thin, 0이면 empty다", () => {
    expect(deriveSerializationBuffer({
      episodes: [{ episodeId: "e1", state: "ready" }],
      releaseIntervalDays: 14, policy, today: "2026-10-14",
    }).level).toBe("thin");
    expect(deriveSerializationBuffer({
      episodes: [], releaseIntervalDays: 7, policy, today: "2026-10-14",
    })).toMatchObject({ level: "empty", bufferedDays: 0, projectedEmptyDate: "2026-10-14" });
  });

  it("격주 주기는 일수 환산에 그대로 반영된다", () => {
    expect(deriveBufferFromSummary({
      readyBufferCount: 2, releaseIntervalDays: 14, policy, today: "2026-10-14",
    }).bufferedDays).toBe(28);
  });
});

describe("deriveReleaseIntervalDays", () => {
  it("일정 날짜 간격의 중앙값을 쓰고, 부족하면 fallback이다", () => {
    expect(deriveReleaseIntervalDays(["2026-10-07", "2026-10-14", "2026-10-21"])).toBe(7);
    expect(deriveReleaseIntervalDays(["2026-10-07", "2026-10-21"])).toBe(14);
    expect(deriveReleaseIntervalDays(["2026-10-07"])).toBe(7);
    expect(deriveReleaseIntervalDays([], 30)).toBe(30);
  });
});

describe("planHiatus", () => {
  const digest = deriveSerializationBuffer({
    episodes: [
      { episodeId: "e1", state: "ready" },
      { episodeId: "e2", state: "ready" },
      { episodeId: "e3", state: "ready" },
    ],
    releaseIntervalDays: 7, policy, today: "2026-10-14",
  });

  it("버퍼가 휴재를 전부 덮으면 결방 0, 복귀일은 시작+기간이다", () => {
    expect(planHiatus(digest, { startsOn: "2026-11-02", weeks: 2, releaseIntervalDays: 7 }))
      .toEqual({ startsOn: "2026-11-02", weeks: 2, coveredByBufferWeeks: 2, resumeDate: "2026-11-16", gapReleases: 0 });
  });

  it("버퍼가 모자라면 소진일과 결방 횟수를 계산한다", () => {
    const scenario = planHiatus(digest, { startsOn: "2026-11-02", weeks: 5, releaseIntervalDays: 7 });
    expect(scenario.coveredByBufferWeeks).toBe(3);
    expect(scenario.gapReleases).toBe(2);
    expect(scenario.bufferRunsOutOn).toBe("2026-11-23");
    expect(scenario.resumeDate).toBe("2026-12-07");
  });
});

describe("serializationBufferWarning", () => {
  it("안전하면 null, 하회하면 근거 문장과 함께 경고한다", () => {
    const safe = deriveSerializationBuffer({
      episodes: [{ episodeId: "e1", state: "ready" }, { episodeId: "e2", state: "ready" }],
      releaseIntervalDays: 7, policy, today: "2026-10-14",
    });
    expect(serializationBufferWarning(safe, bt)).toBeNull();
    const thin = deriveSerializationBuffer({
      episodes: [{ episodeId: "e1", state: "ready" }, { episodeId: "e2", state: "unknown" }],
      releaseIntervalDays: 7, policy, today: "2026-10-14",
    });
    const warning = serializationBufferWarning(thin, bt);
    expect(warning?.tone).toBe("warning");
    expect(warning?.reason).toContain("판정할 수 없는 회차 1개");
  });
});
