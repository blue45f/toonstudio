import { describe, expect, it } from "vitest";

import {
  derivePreSerializationBuffer,
  episodeFlowPosition,
  preBufferViewerForRoleLens,
  preSerializationBufferWarning,
  projectPreBufferForViewer,
} from "./pre-serialization-buffer";

const bt = (ko: string) => ko;
const TODAY = "2026-10-14";

const stage0Input = {
  episodes: [
    { episodeId: "e1", state: "publish-ready" as const, plannedReleaseAt: null },
    { episodeId: "e2", state: "publish-ready" as const, plannedReleaseAt: null },
    { episodeId: "e3", state: "publish-ready" as const, plannedReleaseAt: null },
    { episodeId: "e4", state: "final-art-production" as const, plannedReleaseAt: null },
    { episodeId: "e5", state: "final-art-production" as const, plannedReleaseAt: null },
    { episodeId: "e6", state: "cancelled" as const, plannedReleaseAt: null },
  ],
  seasonPlans: [{ releaseStartsAt: "2026-11-11", releaseCadenceDays: 7 }],
  today: TODAY,
};

describe("derivePreSerializationBuffer — 0단계", () => {
  it("게시된 회차가 없으면 stage-0이고 준비 회차·부족분·시작일이 도출된다", () => {
    const digest = derivePreSerializationBuffer(stage0Input);
    expect(digest.phase).toBe("stage-0");
    expect(digest.preparedCount).toBe(3);
    expect(digest.inProgressCount).toBe(2);
    expect(digest.unknownEpisodeCount).toBe(1);
    expect(digest.targetPreparedCount).toBe(5);
    expect(digest.shortfall).toBe(2);
    expect(digest.readinessRatio).toBe(0.6);
    expect(digest.launchDate).toBe("2026-11-11");
    expect(digest.launchSource).toBe("season-plan");
    expect(digest.daysUntilLaunch).toBe(28);
    expect(digest.bufferedDays).toBe(21);
    // 제작 속도를 모르면 보충 0 가정 + 그 사실을 노출한다.
    expect(digest.netBurnPerWeek).toBe(1);
    expect(digest.assumesNoReplenishment).toBe(true);
    // 소진은 연재 시작일부터: 2026-11-11 + 3주.
    expect(digest.projectedExhaustionDate).toBe("2026-12-02");
    expect(digest.requiredPacePerWeek).toBe(0.5);
    expect(digest.riskLevel).toBe("caution");
  });

  it("목표를 채우면 safe이고 경고가 없다", () => {
    const digest = derivePreSerializationBuffer({
      ...stage0Input,
      episodes: Array.from({ length: 5 }, (_, i) => ({
        episodeId: `r${i}`,
        state: "publish-ready" as const,
        plannedReleaseAt: null,
      })),
    });
    expect(digest.shortfall).toBe(0);
    expect(digest.riskLevel).toBe("safe");
    expect(digest.requiredPacePerWeek).toBe(0);
    expect(preSerializationBufferWarning(digest, bt)).toBeNull();
  });

  it("준비 회차가 0개면 critical + danger 경고", () => {
    const digest = derivePreSerializationBuffer({ episodes: [], today: TODAY });
    expect(digest.riskLevel).toBe("critical");
    const warning = preSerializationBufferWarning(digest, bt);
    expect(warning?.tone).toBe("danger");
    expect(warning?.title).toContain("준비된 회차가 없어요");
  });

  it("시작이 한 주기 이내인데 부족하면 danger", () => {
    const digest = derivePreSerializationBuffer({
      ...stage0Input,
      seasonPlans: [{ releaseStartsAt: "2026-10-20", releaseCadenceDays: 7 }],
    });
    expect(digest.daysUntilLaunch).toBe(6);
    expect(digest.riskLevel).toBe("danger");
  });

  it("제작 속도가 필요 속도에 못 미치면 danger", () => {
    const digest = derivePreSerializationBuffer({ ...stage0Input, productionPacePerWeek: 0.2 });
    expect(digest.requiredPacePerWeek).toBe(0.5);
    expect(digest.riskLevel).toBe("danger");
  });

  it("0단계 경고 문구는 부족 회차와 시작까지 남은 일수를 포함한다", () => {
    const warning = preSerializationBufferWarning(derivePreSerializationBuffer(stage0Input), bt);
    expect(warning?.tone).toBe("warning");
    expect(warning?.title).toContain("2회 부족");
    expect(warning?.reason).toContain("28일");
    expect(warning?.reason).toContain("판정할 수 없는 회차 1개");
  });
});

describe("연재 시작일 해석 (연재 캘린더 연동)", () => {
  it("시즌 계획이 없으면 게시 캘린더 예약이 시작일이다", () => {
    const digest = derivePreSerializationBuffer({
      episodes: [{ episodeId: "e1", state: "publish-ready", plannedReleaseAt: "2026-12-01" }],
      releasePlans: [{ episodeId: "e1", status: "scheduled", scheduledAt: "2026-11-04T00:00:00.000Z" }],
      today: TODAY,
    });
    expect(digest.launchDate).toBe("2026-11-04");
    expect(digest.launchSource).toBe("release-plan");
  });

  it("예약도 없으면 회차 게시 계획, 그것도 없으면 null로 정직하게 둔다", () => {
    const fromEpisode = derivePreSerializationBuffer({
      episodes: [{ episodeId: "e1", state: "publish-ready", plannedReleaseAt: "2026-12-01" }],
      today: TODAY,
    });
    expect(fromEpisode.launchSource).toBe("episode-plan");
    const none = derivePreSerializationBuffer({ episodes: [], today: TODAY });
    expect(none.launchDate).toBeNull();
    expect(none.daysUntilLaunch).toBeNull();
    expect(none.requiredPacePerWeek).toBeNull();
  });
});

describe("derivePreSerializationBuffer — 연재 중 소진", () => {
  it("제작 속도가 소비를 따라가면 소진 예상일이 없다(safe)", () => {
    const digest = derivePreSerializationBuffer({
      episodes: [
        { episodeId: "p1", state: "published", plannedReleaseAt: null },
        { episodeId: "p2", state: "published", plannedReleaseAt: null },
        { episodeId: "r1", state: "publish-ready", plannedReleaseAt: null },
        { episodeId: "r2", state: "publish-ready", plannedReleaseAt: null },
      ],
      today: TODAY,
      productionPacePerWeek: 1,
    });
    expect(digest.phase).toBe("serializing");
    expect(digest.netBurnPerWeek).toBe(0);
    expect(digest.projectedExhaustionDate).toBeNull();
    expect(digest.riskLevel).toBe("safe");
  });

  it("버퍼 1주분이면 danger이고 소진 예상일은 오늘+1주", () => {
    const digest = derivePreSerializationBuffer({
      episodes: [
        { episodeId: "p1", state: "published", plannedReleaseAt: null },
        { episodeId: "r1", state: "publish-ready", plannedReleaseAt: null },
      ],
      today: TODAY,
    });
    expect(digest.riskLevel).toBe("danger");
    expect(digest.projectedExhaustionDate).toBe("2026-10-21");
    const warning = preSerializationBufferWarning(digest, bt);
    expect(warning?.reason).toContain("2026-10-21");
  });
});

describe("episodeFlowPosition — 회차 흐름 0단계 명시", () => {
  it("연재 시작 전 완성 회차는 stage-0-prepared, 제작 중은 stage-0-in-progress", () => {
    expect(episodeFlowPosition("publish-ready", "stage-0")).toBe("stage-0-prepared");
    expect(episodeFlowPosition("final-art-production", "stage-0")).toBe("stage-0-in-progress");
    expect(episodeFlowPosition("publish-ready", "serializing")).toBe("serializing");
    expect(episodeFlowPosition("published", "stage-0")).toBe("published");
    expect(episodeFlowPosition("cancelled", "stage-0")).toBe("unknown");
  });
});

describe("뷰 분리 (PD/운영진 vs 작가)", () => {
  it("운영진 뷰는 소진율·소진 예상일을, 작가 뷰는 그 필드 자체가 없다", () => {
    const digest = derivePreSerializationBuffer(stage0Input);
    const ops = projectPreBufferForViewer(digest, "ops");
    expect(ops.viewer).toBe("ops");
    if (ops.viewer === "ops") {
      expect(ops.netBurnPerWeek).toBe(1);
      expect(ops.projectedExhaustionDate).toBe("2026-12-02");
      expect(ops.riskLevel).toBe("caution");
    }
    const author = projectPreBufferForViewer(digest, "author");
    expect(author.viewer).toBe("author");
    expect("netBurnPerWeek" in author).toBe(false);
    expect("projectedExhaustionDate" in author).toBe(false);
    expect("riskLevel" in author).toBe(false);
    if (author.viewer === "author") expect(author.nextAction).toBe("prepare-next-episode");
  });

  it("역할 렌즈: producer만 운영진 뷰, 이야기·작화는 작가 뷰", () => {
    expect(preBufferViewerForRoleLens("producer")).toBe("ops");
    expect(preBufferViewerForRoleLens("story")).toBe("author");
    expect(preBufferViewerForRoleLens("art")).toBe("author");
  });
});
