import { describe, expect, it } from "vitest";

import {
  ARTIFACT_INTAKE_SOURCE_LABELS,
  EMPTY_ARTIFACT_INTAKE_TRAY,
  artifactFromCapture3d,
  artifactFromGeneratedImage,
  artifactFromPlanDraft,
  buildArtifactCutPlacement,
  buildArtifactIntakeTrayFromSources,
  countArtifactIntakeItems,
  createArtifactIntakeTray,
  discardArtifacts,
  enqueueArtifact,
  enqueueArtifacts,
  isArtifactUnused,
  normalizeArtifactIntakeItem,
  parseArtifactIntakeTray,
  placeArtifactOnCut,
  pruneUnusedArtifacts,
  removeArtifactPlacement,
  selectArtifactIntakeItems,
  unusedArtifactPruneCandidates,
} from "./studio-artifact-intake-tray";

const NOW = new Date("2026-10-14T00:00:00.000Z");
const OLD = "2026-09-01T00:00:00.000Z";

function trayWith(...inputs: Parameters<typeof enqueueArtifact>[1][]) {
  return enqueueArtifacts(EMPTY_ARTIFACT_INTAKE_TRAY, inputs, NOW).tray;
}

describe("normalize / create", () => {
  it("페이로드 없는 항목과 카탈로그 밖 출처는 받아들이지 않는다", () => {
    expect(normalizeArtifactIntakeItem({ id: "a", source: "plan-draft" })).toBeNull();
    expect(
      normalizeArtifactIntakeItem({ id: "a", source: "upload", previewSrc: "x.png" }),
    ).toBeNull();
    expect(normalizeArtifactIntakeItem(null)).toBeNull();
  });

  it("제목이 비면 출처 기본 제목을 쓰고 종류를 페이로드로 판정한다", () => {
    const item = normalizeArtifactIntakeItem({
      id: "a",
      source: "capture-3d",
      previewSrc: "cap.png",
      createdAt: OLD,
    });
    expect(item?.title).toBe(ARTIFACT_INTAKE_SOURCE_LABELS["capture-3d"]);
    expect(item?.kind).toBe("image");
    expect(item?.placedPageIds).toEqual([]);
  });

  it("create는 id 중복을 제거하고 최신순으로 정렬한다", () => {
    const tray = createArtifactIntakeTray([
      { id: "old", source: "plan-draft", text: "예전 초안", createdAt: OLD },
      { id: "new", source: "plan-draft", text: "새 초안", createdAt: "2026-10-13T00:00:00.000Z" },
      { id: "old", source: "plan-draft", text: "중복", createdAt: "2026-10-12T00:00:00.000Z" },
    ]);
    expect(tray.items.map((item) => item.id)).toEqual(["new", "old"]);
    expect(parseArtifactIntakeTray(tray).items).toHaveLength(2);
    expect(parseArtifactIntakeTray("깨진 값")).toBe(EMPTY_ARTIFACT_INTAKE_TRAY);
  });
});

describe("enqueue (모드 인입)", () => {
  it("세 모드 어댑터로 만든 산출물이 한 트레이에 쌓인다", () => {
    const tray = buildArtifactIntakeTrayFromSources({
      planDrafts: [{ id: "d1", title: "1화 초안", text: "주인공이 카페에 들어간다." }],
      captures3d: [{ id: "c1", title: "카페 전경", src: "cap.png" }],
      generatedImages: [{ id: "g1", src: "gen.png", prompt: "비 오는 거리" }],
    });
    const counts = countArtifactIntakeItems(tray);
    expect(counts.total).toBe(3);
    expect(counts.unused).toBe(3);
    expect(counts.bySource).toEqual({ "plan-draft": 1, "capture-3d": 1, "generated-image": 1 });
    expect(tray.items.find((item) => item.source === "generated-image")?.title).toBe("비 오는 거리");
    expect(artifactFromPlanDraft({ id: "d1", text: "x" }).sourceRef).toBe("plan:d1");
    expect(artifactFromCapture3d({ id: "c1", src: "s" }).kind).toBe("image");
    expect(artifactFromGeneratedImage({ id: "g1", src: "s" }).source).toBe("generated-image");
  });

  it("같은 원본(sourceRef)의 재인입은 중복으로 쌓이지 않는다", () => {
    const first = enqueueArtifact(
      EMPTY_ARTIFACT_INTAKE_TRAY,
      artifactFromCapture3d({ id: "c1", src: "cap.png" }),
      NOW,
    );
    expect(first.added).toBe(true);
    const second = enqueueArtifact(
      first.tray,
      artifactFromCapture3d({ id: "c1", src: "cap-again.png" }),
      NOW,
    );
    expect(second.added).toBe(false);
    expect(second.tray).toBe(first.tray);
    expect(second.item?.previewSrc).toBe("cap.png");
  });
});

describe("select / count", () => {
  const tray = trayWith(
    { id: "p1", source: "plan-draft", kind: "text", title: "카페 장면 초안", text: "대사가 시작된다" },
    { id: "c1", source: "capture-3d", kind: "image", title: "카페 전경", previewSrc: "cap.png" },
    { id: "g1", source: "generated-image", kind: "image", title: "거리", previewSrc: "gen.png" },
  );

  it("출처·검색으로 좁힌다", () => {
    expect(selectArtifactIntakeItems(tray, { source: "capture-3d" }).map((i) => i.id)).toEqual(["c1"]);
    expect(selectArtifactIntakeItems(tray, { query: "카페" }).map((i) => i.id).sort()).toEqual(["c1", "p1"]);
    expect(selectArtifactIntakeItems(tray, { query: "대사" }).map((i) => i.id)).toEqual(["p1"]);
  });

  it("배치 여부에 따라 미사용만 고를 수 있다", () => {
    const placed = placeArtifactOnCut(tray, "c1", "page-1");
    expect(placed).not.toBeNull();
    expect(
      selectArtifactIntakeItems(placed!.tray, { usage: "unused" }).map((i) => i.id).sort(),
    ).toEqual(["g1", "p1"]);
    expect(countArtifactIntakeItems(placed!.tray).placed).toBe(1);
  });
});

describe("place / remove placement (컷 배치 연결)", () => {
  const tray = trayWith(
    { id: "c1", source: "capture-3d", kind: "image", title: "카페 전경", previewSrc: "cap.png" },
    { id: "p1", source: "plan-draft", kind: "text", title: "초안", text: "본문" },
  );

  it("이미지 산출물은 image-layer, 텍스트 초안은 text-note 배치 지시를 만든다", () => {
    const image = tray.items.find((i) => i.id === "c1")!;
    const text = tray.items.find((i) => i.id === "p1")!;
    expect(buildArtifactCutPlacement(image, "page-1")).toEqual({
      artifactId: "c1",
      pageId: "page-1",
      layerKind: "image-layer",
      title: "카페 전경",
      src: "cap.png",
    });
    expect(buildArtifactCutPlacement(text, "page-1")?.layerKind).toBe("text-note");
    expect(buildArtifactCutPlacement(image, "  ")).toBeNull();
  });

  it("배치는 불변으로 기록되고, 같은 컷 재배치는 트레이 참조가 그대로다", () => {
    const first = placeArtifactOnCut(tray, "c1", "page-1");
    expect(first?.tray).not.toBe(tray);
    expect(first?.tray.items.find((i) => i.id === "c1")?.placedPageIds).toEqual(["page-1"]);
    expect(isArtifactUnused(tray.items.find((i) => i.id === "c1")!)).toBe(true);
    const again = placeArtifactOnCut(first!.tray, "c1", "page-1");
    expect(again?.tray).toBe(first!.tray);
    expect(again?.placement.pageId).toBe("page-1");
    const other = placeArtifactOnCut(first!.tray, "c1", "page-2");
    expect(other?.tray.items.find((i) => i.id === "c1")?.placedPageIds).toEqual(["page-1", "page-2"]);
    expect(placeArtifactOnCut(tray, "없는-id", "page-1")).toBeNull();
    expect(placeArtifactOnCut(tray, "c1", "")).toBeNull();
  });

  it("배치 취소는 그 컷만 빼고, 변화 없으면 원본 참조를 돌려준다", () => {
    const placed = placeArtifactOnCut(tray, "c1", "page-1")!.tray;
    const placed2 = placeArtifactOnCut(placed, "c1", "page-2")!.tray;
    const removed = removeArtifactPlacement(placed2, "c1", "page-1");
    expect(removed.items.find((i) => i.id === "c1")?.placedPageIds).toEqual(["page-2"]);
    expect(removeArtifactPlacement(placed2, "c1", "page-9")).toBe(placed2);
  });
});

describe("prune / discard (미사용 산출물 정리)", () => {
  const tray = trayWith(
    { id: "old-unused", source: "generated-image", previewSrc: "a.png", createdAt: OLD },
    { id: "new-unused", source: "generated-image", previewSrc: "b.png", createdAt: "2026-10-13T00:00:00.000Z" },
    { id: "old-placed", source: "capture-3d", previewSrc: "c.png", createdAt: OLD },
  );
  const placedTray = placeArtifactOnCut(tray, "old-placed", "page-1")!.tray;

  it("정리 후보는 오래된 미사용뿐 — 배치된 것과 최근 것은 남는다", () => {
    expect(unusedArtifactPruneCandidates(placedTray, { now: NOW })).toEqual(["old-unused"]);
    const pruned = pruneUnusedArtifacts(placedTray, { now: NOW });
    expect(pruned.removedIds).toEqual(["old-unused"]);
    expect(pruned.tray.items.map((i) => i.id).sort()).toEqual(["new-unused", "old-placed"]);
  });

  it("keepIds로 후보를 제외할 수 있고, 후보가 없으면 원본 참조다", () => {
    const pruned = pruneUnusedArtifacts(placedTray, { now: NOW, keepIds: ["old-unused"] });
    expect(pruned.removedIds).toEqual([]);
    expect(pruned.tray).toBe(placedTray);
  });

  it("버리기는 지정 항목만 제거한다", () => {
    const discarded = discardArtifacts(placedTray, ["new-unused"]);
    expect(discarded.items.map((i) => i.id).sort()).toEqual(["old-placed", "old-unused"]);
    expect(discardArtifacts(placedTray, ["없는-id"])).toBe(placedTray);
    expect(discardArtifacts(placedTray, [])).toBe(placedTray);
  });
});
