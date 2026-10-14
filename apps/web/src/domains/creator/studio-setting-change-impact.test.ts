import { describe, expect, it } from "vitest";

import type { StudioStoryBible } from "./studio-story-bible";
import type { StudioPromisePayoffLedger } from "./studio-promise-payoff-ledger";
import {
  acknowledgeAllStudioSettingChanges,
  acknowledgeStudioSettingChange,
  adaptStudioPromisePayoffLedgerToImpactForeshadows,
  buildStudioSettingChangeNotices,
  diffStudioStoryBible,
  summarizeStudioSettingChangeImpacts,
  type StudioSettingChangeReferenceSources,
} from "./studio-setting-change-impact";

const PREVIOUS: StudioStoryBible = {
  projectId: "project-1",
  characters: [
    {
      id: "char-seoha",
      name: "윤서하",
      aliases: ["서하"],
      defaultCostumeId: "costume-school",
      defaultAppearanceId: "look-short",
    },
    {
      id: "char-minjae",
      name: "민재",
      aliases: [],
      defaultCostumeId: "costume-work",
      defaultAppearanceId: null,
    },
  ],
  locations: [{ id: "loc-tower", name: "시계탑" }],
  facts: [
    {
      id: "fact-key",
      label: "황동 열쇠의 존재",
      characterIds: ["char-seoha"],
      locationId: "loc-tower",
    },
  ],
};

const NEXT: StudioStoryBible = {
  ...PREVIOUS,
  characters: [
    {
      id: "char-seoha",
      name: "윤서하",
      aliases: ["서하"],
      defaultCostumeId: "costume-raincoat",
      defaultAppearanceId: "look-short",
    },
    PREVIOUS.characters[1]!,
  ],
  facts: [
    {
      id: "fact-key",
      label: "황동 열쇠는 가짜다",
      characterIds: ["char-seoha", "char-minjae"],
      locationId: "loc-tower",
    },
  ],
};

const SOURCES: StudioSettingChangeReferenceSources = {
  episodeScenes: [
    {
      sceneId: "scene-3-1",
      episode: 3,
      episodeLabel: "3화",
      characterId: "char-seoha",
      costumeId: "costume-school",
      appearanceId: "look-short",
      knownFactIds: ["fact-key"],
      locationId: "loc-tower",
    },
    {
      sceneId: "scene-5-2",
      episode: 5,
      episodeLabel: "5화",
      characterId: "char-minjae",
      costumeId: "costume-work",
      appearanceId: null,
      knownFactIds: [],
      locationId: null,
    },
  ],
  assetUses: [
    {
      assetId: "asset-poster",
      assetLabel: "키 비주얼 포스터",
      characterIds: ["char-seoha"],
      factIds: [],
      locationIds: [],
      costumeIds: ["costume-school"],
      appearanceIds: [],
    },
    {
      assetId: "asset-bg-tower",
      assetLabel: "시계탑 배경",
      characterIds: [],
      factIds: [],
      locationIds: ["loc-tower"],
      costumeIds: [],
      appearanceIds: [],
    },
  ],
  foreshadows: [
    {
      entryId: "promise-key",
      title: "황동 열쇠의 정체",
      episode: 3,
      sceneId: "scene-3-1",
      linkRole: "seed",
    },
    {
      entryId: "promise-rain",
      title: "장마의 시작",
      episode: 5,
      sceneId: "scene-5-2",
      linkRole: "seed",
    },
  ],
};

describe("diffStudioStoryBible", () => {
  it("사실 내용 변경과 기본 의상 변경을 각각 잡는다", () => {
    const changes = diffStudioStoryBible(PREVIOUS, NEXT);
    expect(changes.map((change) => change.kind)).toEqual([
      "fact-updated",
      "character-costume-changed",
    ]);
    const costume = changes[1]!;
    expect(costume.beforeCostumeId).toBe("costume-school");
    expect(costume.targetLabel).toBe("윤서하");
  });

  it("변경이 없으면 빈 목록이다", () => {
    expect(diffStudioStoryBible(PREVIOUS, PREVIOUS)).toEqual([]);
  });

  it("삭제는 error 심각도로 잡고 추가는 무시한다", () => {
    const removed: StudioStoryBible = {
      ...PREVIOUS,
      locations: [],
      facts: [],
      characters: [...PREVIOUS.characters, {
        id: "char-new",
        name: "신규",
        aliases: [],
        defaultCostumeId: null,
        defaultAppearanceId: null,
      }],
    };
    const changes = diffStudioStoryBible(PREVIOUS, removed);
    expect(changes.map((change) => change.kind)).toEqual([
      "fact-removed",
      "location-removed",
    ]);
    expect(changes.every((change) => change.severity === "error")).toBe(true);
  });

  it("같은 변경은 같은 id를 만든다 (중복 알림 방지)", () => {
    const first = diffStudioStoryBible(PREVIOUS, NEXT);
    const second = diffStudioStoryBible(PREVIOUS, NEXT);
    expect(first.map((change) => change.id)).toEqual(
      second.map((change) => change.id),
    );
  });
});

describe("buildStudioSettingChangeNotices", () => {
  it("사실 변경은 아는 장면·복선까지 전파된다", () => {
    const notices = buildStudioSettingChangeNotices(PREVIOUS, NEXT, SOURCES);
    const factNotice = notices.find((notice) => notice.change.kind === "fact-updated")!;
    const kinds = factNotice.impacts.map((impact) => `${impact.kind}:${impact.refId}`);
    expect(kinds).toContain("episode:scene-3-1");
    expect(kinds).toContain("foreshadow:promise-key");
    expect(kinds).not.toContain("episode:scene-5-2");
    expect(kinds).not.toContain("foreshadow:promise-rain");
  });

  it("의상 변경은 옛 기본 의상을 입은 장면과 그 의상 기준 에셋을 잡는다", () => {
    const notices = buildStudioSettingChangeNotices(PREVIOUS, NEXT, SOURCES);
    const costumeNotice = notices.find(
      (notice) => notice.change.kind === "character-costume-changed",
    )!;
    const episode = costumeNotice.impacts.find((impact) => impact.kind === "episode")!;
    expect(episode.refId).toBe("scene-3-1");
    expect(episode.reasonKo).toContain("변경 전 기본 의상");
    const asset = costumeNotice.impacts.find((impact) => impact.kind === "asset")!;
    expect(asset.refId).toBe("asset-poster");
  });

  it("영향이 없는 변경은 알림으로 만들지 않는다", () => {
    const renamed: StudioStoryBible = {
      ...PREVIOUS,
      locations: [{ id: "loc-tower", name: "낡은 시계탑" }],
    };
    const notices = buildStudioSettingChangeNotices(PREVIOUS, renamed, {
      episodeScenes: [],
      assetUses: [],
      foreshadows: [],
    });
    expect(notices).toEqual([]);
    const withScenes = buildStudioSettingChangeNotices(PREVIOUS, renamed, SOURCES);
    expect(withScenes).toHaveLength(1);
    expect(withScenes[0]!.impacts.map((impact) => impact.refId)).toEqual([
      "scene-3-1",
      "asset-bg-tower",
      "promise-key",
    ]);
  });
});

describe("acknowledgement", () => {
  it("확인 전까지 요약의 미확인 수가 유지되고 확인하면 줄어든다", () => {
    const notices = buildStudioSettingChangeNotices(PREVIOUS, NEXT, SOURCES);
    const before = summarizeStudioSettingChangeImpacts(notices, []);
    expect(before.unacknowledgedCount).toBe(notices.length);
    expect(before.totalImpactCount).toBeGreaterThan(0);

    const acked = acknowledgeStudioSettingChange(notices, [], notices[0]!.change.id);
    const after = summarizeStudioSettingChangeImpacts(notices, acked);
    expect(after.unacknowledgedCount).toBe(notices.length - 1);

    const all = acknowledgeAllStudioSettingChanges(notices, acked);
    expect(summarizeStudioSettingChangeImpacts(notices, all).unacknowledgedCount).toBe(0);
  });

  it("없는 id 확인은 무시한다", () => {
    const notices = buildStudioSettingChangeNotices(PREVIOUS, NEXT, SOURCES);
    expect(acknowledgeStudioSettingChange(notices, [], "nope")).toEqual([]);
  });
});

describe("adaptStudioPromisePayoffLedgerToImpactForeshadows", () => {
  it("원장의 seed·단서·회수 링크를 모두 펼친다", () => {
    const link = (episode: number, sceneId: string) => ({
      id: `link-${episode}-${sceneId}`,
      episode,
      sceneId,
      label: "",
      note: "",
    });
    const entry = {
      id: "promise-1",
      kind: "foreshadow" as const,
      title: "열쇠 약속",
      summary: "",
      status: "seed" as const,
      urgency: "normal" as const,
      owner: "",
      visibility: "team" as const,
      spoilerLevel: "mild" as const,
      dueEpisode: null,
      seed: link(3, "scene-3-1"),
      foreshadows: [link(7, "scene-7-1")],
      payoff: null,
      intentionalNonPayoffReason: "",
    };
    const ledger = {
      version: 1 as const,
      currentEpisode: 3,
      entries: [entry],
    } as unknown as StudioPromisePayoffLedger;
    const refs = adaptStudioPromisePayoffLedgerToImpactForeshadows(ledger);
    expect(refs.map((ref) => `${ref.linkRole}:${ref.sceneId}`)).toEqual([
      "seed:scene-3-1",
      "foreshadow:scene-7-1",
    ]);
    expect(refs[0]!.title).toBe("열쇠 약속");
  });
});
