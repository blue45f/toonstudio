import { describe, expect, it } from "vitest";

import type { SharedLibraryPlacement } from "@toonstudio/contracts/production-shared-library";

import type { StudioAsset } from "./studio-asset-library";
import {
  applyStudioSharedLibraryPlacements,
  buildStudioSharedLibraryViewerContext,
  filterStudioSharedLibraryEntries,
  studioUnifiedScopeForPlacement,
} from "./studio-shared-library";
import {
  buildStudioUnifiedAssetCatalog,
  searchStudioUnifiedAssets,
  type StudioUnifiedAssetItem,
} from "./studio-unified-asset-catalog";

const teamPlacement: SharedLibraryPlacement = {
  scope: "team",
  ownerUserId: "owner-1",
  workId: null,
  workspaceId: "team-1",
  organizationId: null,
};
const orgPlacement: SharedLibraryPlacement = {
  scope: "organization",
  ownerUserId: "owner-1",
  workId: null,
  workspaceId: null,
  organizationId: "org-1",
};

/** 다른 작품(work-b)을 팀(team-1)에서 열고 있는 팀원. */
const sameTeamOtherWork = buildStudioSharedLibraryViewerContext({
  userId: "viewer-1",
  workId: "work-b",
  workspaceId: "team-1",
  teamRole: "member",
});
/** 조직에 연결된 다른 팀(team-2)의 작품을 열고 있는, 조직 구성원이 아닌 팀원. */
const linkedTeamViewer = buildStudioSharedLibraryViewerContext({
  userId: "viewer-2",
  workId: "work-z",
  workspaceId: "team-2",
  teamRole: "member",
  organizationLinkedWorkspaces: { "org-1": ["team-1", "team-2"] },
});
const outsider = buildStudioSharedLibraryViewerContext({
  userId: "viewer-3",
  workId: "work-q",
  workspaceId: "team-9",
  teamRole: "member",
});

function catalogItem(id: string, title: string): StudioUnifiedAssetItem {
  return {
    id,
    category: "scene",
    scope: "studio",
    title,
    description: "",
    categoryLabel: "장면 템플릿",
    keywords: [title],
    badges: [],
    preview: { kind: "none" },
    useMode: "apply",
    useLabel: "장면 배치",
    discoverability: "standard",
    sortPriority: 100,
    source: { kind: "native-tool", value: { id: "bubble", menu: "bubble", title, description: "", keywords: [] } },
  };
}

describe("applyStudioSharedLibraryPlacements (판정 시나리오)", () => {
  const items = [catalogItem("tpl-1", "표준 말풍선 템플릿"), catalogItem("asset-1", "표준 배경")];
  const placements = { "tpl-1": orgPlacement, "asset-1": teamPlacement };

  it("팀 공유 아이템이 같은 팀의 다른 작품에서 바로 보인다", () => {
    const visible = applyStudioSharedLibraryPlacements(items, placements, sameTeamOtherWork);
    const teamItem = visible.find((entry) => entry.id === "asset-1");
    expect(teamItem?.scope).toBe("team");
    expect(teamItem?.badges).toContain("팀 공유");
    // 조직 공유는 이 맥락(연결 없음·구성원 아님)에서는 보이지 않는다.
    expect(visible.find((entry) => entry.id === "tpl-1")).toBeUndefined();
  });

  it("조직 공유 아이템이 조직 연결 팀 전체로 전파된다", () => {
    const visible = applyStudioSharedLibraryPlacements(items, placements, linkedTeamViewer);
    const orgItem = visible.find((entry) => entry.id === "tpl-1");
    expect(orgItem?.scope).toBe("organization");
    expect(orgItem?.badges).toContain("조직 공유");
    // team-1 공유는 team-2 맥락에서 보이지 않는다.
    expect(visible.find((entry) => entry.id === "asset-1")).toBeUndefined();
  });

  it("무관한 팀에서는 공유 아이템이 하나도 보이지 않고, 배치 없는 아이템은 그대로다", () => {
    const plain = catalogItem("plain-1", "내장 아이템");
    const visible = applyStudioSharedLibraryPlacements(
      [...items, plain],
      placements,
      outsider,
    );
    expect(visible.map((entry) => entry.id)).toEqual(["plain-1"]);
  });
});

describe("filterStudioSharedLibraryEntries (브러시 등 구조적 적용)", () => {
  it("팀 공유 브러시가 같은 팀에서 보이고 다른 팀에서 사라진다", () => {
    const brushes = [
      { id: "brush-1", name: "스튜디오 표준 펜", libraryPlacement: teamPlacement },
      { id: "brush-2", name: "내 브러시" },
    ];
    expect(
      filterStudioSharedLibraryEntries(brushes, sameTeamOtherWork).map((entry) => entry.id),
    ).toEqual(["brush-1", "brush-2"]);
    expect(filterStudioSharedLibraryEntries(brushes, outsider).map((entry) => entry.id)).toEqual([
      "brush-2",
    ]);
  });
});

describe("buildStudioUnifiedAssetCatalog sharedLocalAssets", () => {
  const asset: StudioAsset = {
    id: "asset-9",
    name: "표준 배경",
    dataUrl: "data:image/png;base64,AAAA",
    width: 1080,
    height: 800,
    createdAt: 1,
  };

  it("팀 공유로 게시된 에셋이 team 스코프로 카탈로그에 오르고 검색된다", () => {
    const catalog = buildStudioUnifiedAssetCatalog({
      backgrounds: [],
      sceneTemplates: [],
      elements: [],
      objects: [],
      nativeTools: [],
      rasterAssets: [],
      sharedLocalAssets: [{ asset, placement: teamPlacement }],
    });
    const shared = catalog.find((entry) => entry.id === "shared:team:asset-9");
    expect(shared?.scope).toBe("team");
    expect(shared?.libraryPlacement).toEqual(teamPlacement);
    expect(shared?.badges).toContain("팀 공유");
    expect(
      searchStudioUnifiedAssets(catalog, { scope: "team" }).map((entry) => entry.id),
    ).toEqual(["shared:team:asset-9"]);
    expect(searchStudioUnifiedAssets(catalog, { scope: "organization" })).toEqual([]);
  });

  it("조직 공유 에셋은 organization 스코프로 오르고, personal 배치는 공유 표면에 오르지 않는다", () => {
    const catalog = buildStudioUnifiedAssetCatalog({
      backgrounds: [],
      sceneTemplates: [],
      elements: [],
      objects: [],
      nativeTools: [],
      rasterAssets: [],
      sharedLocalAssets: [
        { asset, placement: orgPlacement },
        {
          asset: { ...asset, id: "asset-10" },
          placement: { ...teamPlacement, scope: "personal", workspaceId: null },
        },
      ],
    });
    expect(catalog.map((entry) => entry.id)).toEqual(["shared:organization:asset-9"]);
  });
});

describe("studioUnifiedScopeForPlacement", () => {
  it("maps contract scopes onto catalog scopes", () => {
    expect(studioUnifiedScopeForPlacement(teamPlacement)).toBe("team");
    expect(studioUnifiedScopeForPlacement(orgPlacement)).toBe("organization");
    expect(
      studioUnifiedScopeForPlacement({ ...teamPlacement, scope: "personal", workspaceId: null }),
    ).toBe("mine");
    expect(
      studioUnifiedScopeForPlacement({ ...teamPlacement, scope: "market", workspaceId: null }),
    ).toBeNull();
  });
});
