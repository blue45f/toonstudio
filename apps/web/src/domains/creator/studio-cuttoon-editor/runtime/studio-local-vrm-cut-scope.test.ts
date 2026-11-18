import { describe, expect, it } from "vitest";

import { canStoreStudioLocalVrmCut, studioProjectHasLocalVrmCut } from "./studio-local-vrm-cut-scope";

const own = { namedDocument: true, workId: null, remixId: null, shared: false, joined: false, draftStatus: "local", peerCount: 0 } as const;
const fixedLayer = { bg3dScene: { pinnedVersionedCut: { source: { linkedVrm: { characters: [] } } } } };

describe("로컬 소유 원고의 고정 VRM 컷", () => {
  it("자동 라이브 룸을 가진 소유자 원고는 쓸 수 있지만 협업·공유 전환 중에는 쓸 수 없다", () => {
    expect(canStoreStudioLocalVrmCut(own)).toBe(true);
    const rejected = [{ namedDocument: false }, { workId: "work" }, { remixId: "remix" },
      { shared: true }, { joined: true }, { peerCount: 1 }, { draftStatus: "ready" }, { draftStatus: "provisioning" }] as const;
    for (const scope of rejected) expect(canStoreStudioLocalVrmCut({ ...own, ...scope })).toBe(false);
  });

  it("공유 전에 현재 페이지·다른 페이지·마스터의 고정 원본을 모두 검사한다", () => {
    const empty = { elements: [] }, pinned = { elements: [fixedLayer] };
    for (const project of [{ pagesList: [pinned] }, { pagesList: [empty, pinned] }, { pagesList: [empty], master: pinned }]) {
      expect(studioProjectHasLocalVrmCut(project)).toBe(true);
    }
    expect(studioProjectHasLocalVrmCut({ pagesList: [{ elements: [{ vrmScene: {} }, { bg3dScene: { pinnedVersionedCut: { source: {} } } }] }] })).toBe(false);
  });
});
