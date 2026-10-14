import { describe, expect, it } from "vitest";

import {
  draftLayerToggleView,
  draftLayerTriState,
  draftLayerViewStorageKey,
  EMPTY_DRAFT_LAYER_VIEW_STATE,
  loadDraftLayerViewState,
  parseDraftLayerViewState,
  pruneDraftLayerViewState,
  saveDraftLayerViewState,
  serializeDraftLayerViewState,
  toggleDraftLayerVisibility,
  type DraftLayerViewStorageLike,
  type DraftVisibilityLayerLike,
} from "./studio-draft-layer-visibility";

type L = DraftVisibilityLayerLike & { readonly name: string };

const LAYERS: readonly L[] = [
  { id: "sketch-a", name: "러프 A", visible: true, isDraft: true },
  { id: "sketch-b", name: "러프 B", visible: false, isDraft: true },
  { id: "ink", name: "선화", visible: true, isDraft: false },
  { id: "color", name: "밑색", visible: false },
];

const byId = (layers: readonly L[], id: string) => layers.find((l) => l.id === id);

describe("draftLayerTriState", () => {
  it("derives none / all-visible / some-visible / all-hidden", () => {
    expect(draftLayerTriState([{ id: "ink", visible: true }])).toBe("none");
    expect(
      draftLayerTriState([
        { id: "a", visible: true, isDraft: true },
        { id: "b", visible: true, isDraft: true },
      ]),
    ).toBe("all-visible");
    expect(draftLayerTriState(LAYERS)).toBe("some-visible");
    expect(
      draftLayerTriState([
        { id: "a", visible: false, isDraft: true },
        { id: "ink", visible: true },
      ]),
    ).toBe("all-hidden");
  });
});

describe("toggleDraftLayerVisibility", () => {
  it("hides only visible drafts and snapshots every draft's prior visibility", () => {
    const result = toggleDraftLayerVisibility(LAYERS, EMPTY_DRAFT_LAYER_VIEW_STATE, 1000);
    expect(result.action).toBe("hidden");
    expect(result.affectedCount).toBe(1);
    expect(byId(result.layers, "sketch-a")?.visible).toBe(false);
    expect(byId(result.layers, "sketch-b")?.visible).toBe(false);
    // non-draft layers untouched (same reference)
    expect(byId(result.layers, "ink")).toBe(byId(LAYERS, "ink"));
    expect(byId(result.layers, "color")).toBe(byId(LAYERS, "color"));
    expect(result.viewState.batchHidden).toBe(true);
    expect(result.viewState.snapshot?.capturedAt).toBe(1000);
    expect(result.viewState.snapshot?.visibilityById).toEqual({
      "sketch-a": true,
      "sketch-b": false,
    });
  });

  it("toggle twice restores the exact original visibility (판정 기준)", () => {
    const first = toggleDraftLayerVisibility(LAYERS, EMPTY_DRAFT_LAYER_VIEW_STATE, 1000);
    const second = toggleDraftLayerVisibility(first.layers, first.viewState, 2000);
    expect(second.action).toBe("restored");
    expect(second.viewState).toBe(EMPTY_DRAFT_LAYER_VIEW_STATE);
    expect(second.layers.map((l) => [l.id, l.visible])).toEqual(
      LAYERS.map((l) => [l.id, l.visible]),
    );
  });

  it("does not touch layers created while drafts are batch-hidden", () => {
    const first = toggleDraftLayerVisibility(LAYERS, EMPTY_DRAFT_LAYER_VIEW_STATE, 1000);
    const withNew: readonly L[] = [
      ...first.layers,
      { id: "sketch-new-visible", name: "새 러프", visible: true, isDraft: true },
      { id: "sketch-new-hidden", name: "새 러프 2", visible: false, isDraft: true },
    ];
    const second = toggleDraftLayerVisibility(withNew, first.viewState, 2000);
    expect(second.action).toBe("restored");
    expect(byId(second.layers, "sketch-a")?.visible).toBe(true);
    expect(byId(second.layers, "sketch-b")?.visible).toBe(false);
    // 중간에 만든 레이어는 현재 상태 유지 (참조도 그대로)
    expect(byId(second.layers, "sketch-new-visible")).toBe(byId(withNew, "sketch-new-visible"));
    expect(byId(second.layers, "sketch-new-hidden")).toBe(byId(withNew, "sketch-new-hidden"));
  });

  it("ignores snapshot entries whose layer was deleted in between", () => {
    const first = toggleDraftLayerVisibility(LAYERS, EMPTY_DRAFT_LAYER_VIEW_STATE, 1000);
    const withoutB = first.layers.filter((l) => l.id !== "sketch-b");
    const second = toggleDraftLayerVisibility(withoutB, first.viewState, 2000);
    expect(second.action).toBe("restored");
    expect(byId(second.layers, "sketch-a")?.visible).toBe(true);
    expect(second.layers).toHaveLength(3);
  });

  it("restores exactly even if a draft was manually re-shown while batch-hidden", () => {
    const first = toggleDraftLayerVisibility(LAYERS, EMPTY_DRAFT_LAYER_VIEW_STATE, 1000);
    const meddled = first.layers.map((l) =>
      l.id === "sketch-b" ? { ...l, visible: true } : l,
    );
    const second = toggleDraftLayerVisibility(meddled, first.viewState, 2000);
    expect(byId(second.layers, "sketch-b")?.visible).toBe(false);
    expect(byId(second.layers, "sketch-a")?.visible).toBe(true);
  });

  it("shows all drafts when every draft was hidden manually (no snapshot)", () => {
    const allHidden: readonly L[] = LAYERS.map((l) =>
      l.isDraft ? { ...l, visible: false } : l,
    );
    const shown = toggleDraftLayerVisibility(allHidden, EMPTY_DRAFT_LAYER_VIEW_STATE, 1000);
    expect(shown.action).toBe("shown");
    expect(shown.affectedCount).toBe(2);
    expect(shown.viewState.batchHidden).toBe(false);
    expect(byId(shown.layers, "sketch-a")?.visible).toBe(true);
    expect(byId(shown.layers, "sketch-b")?.visible).toBe(true);
    // 다음 토글은 숨기기+스냅샷으로 이어진다
    const hidden = toggleDraftLayerVisibility(shown.layers, shown.viewState, 2000);
    expect(hidden.action).toBe("hidden");
    expect(hidden.viewState.snapshot?.visibilityById).toEqual({
      "sketch-a": true,
      "sketch-b": true,
    });
  });

  it("is a noop when there are no draft layers", () => {
    const plain: readonly L[] = [{ id: "ink", name: "선화", visible: true }];
    const result = toggleDraftLayerVisibility(plain, EMPTY_DRAFT_LAYER_VIEW_STATE, 1000);
    expect(result.action).toBe("noop");
    expect(result.layers).toBe(plain);
    expect(result.viewState).toBe(EMPTY_DRAFT_LAYER_VIEW_STATE);
  });

  it("never overwrites the snapshot by hiding twice (기존 원시 연산의 결함 회귀 방지)", () => {
    const first = toggleDraftLayerVisibility(LAYERS, EMPTY_DRAFT_LAYER_VIEW_STATE, 1000);
    // 상태를 들고 다시 토글하면 숨기기가 아니라 복원이어야 한다
    const second = toggleDraftLayerVisibility(first.layers, first.viewState, 1500);
    expect(second.action).toBe("restored");
    expect(byId(second.layers, "sketch-a")?.visible).toBe(true);
  });
});

describe("pruneDraftLayerViewState", () => {
  it("drops deleted layers and clears the state when nothing remains", () => {
    const first = toggleDraftLayerVisibility(LAYERS, EMPTY_DRAFT_LAYER_VIEW_STATE, 1000);
    const pruned = pruneDraftLayerViewState(
      first.viewState,
      LAYERS.filter((l) => l.id !== "sketch-b"),
    );
    expect(pruned.snapshot?.visibilityById).toEqual({ "sketch-a": true });
    const emptied = pruneDraftLayerViewState(first.viewState, [
      { id: "ink", visible: true },
    ]);
    expect(emptied).toBe(EMPTY_DRAFT_LAYER_VIEW_STATE);
    expect(pruneDraftLayerViewState(EMPTY_DRAFT_LAYER_VIEW_STATE, LAYERS)).toBe(
      EMPTY_DRAFT_LAYER_VIEW_STATE,
    );
  });
});

describe("draftLayerToggleView", () => {
  it("offers hide with an easy label while some drafts are visible", () => {
    const view = draftLayerToggleView(LAYERS, EMPTY_DRAFT_LAYER_VIEW_STATE);
    expect(view.mode).toBe("hide");
    expect(view.label).toBe("밑그림 모두 숨기기");
    expect(view.pressed).toBe(false);
    expect(view.disabled).toBe(false);
    expect(view.draftCount).toBe(2);
    expect(view.visibleDraftCount).toBe(1);
  });

  it("offers restore while batch-hidden and disables when there are no drafts", () => {
    const first = toggleDraftLayerVisibility(LAYERS, EMPTY_DRAFT_LAYER_VIEW_STATE, 1000);
    const view = draftLayerToggleView(first.layers, first.viewState);
    expect(view.mode).toBe("restore");
    expect(view.label).toBe("밑그림 다시 보이기");
    expect(view.pressed).toBe(true);

    const none = draftLayerToggleView(
      [{ id: "ink", visible: true }],
      EMPTY_DRAFT_LAYER_VIEW_STATE,
    );
    expect(none.mode).toBe("none");
    expect(none.disabled).toBe(true);
  });
});

describe("view-state separate storage", () => {
  it("round-trips through serialize/parse", () => {
    const first = toggleDraftLayerVisibility(LAYERS, EMPTY_DRAFT_LAYER_VIEW_STATE, 1234);
    const restored = parseDraftLayerViewState(serializeDraftLayerViewState(first.viewState));
    expect(restored).toEqual(first.viewState);
    expect(parseDraftLayerViewState(serializeDraftLayerViewState(EMPTY_DRAFT_LAYER_VIEW_STATE)))
      .toBe(EMPTY_DRAFT_LAYER_VIEW_STATE);
  });

  it("rejects garbage and fixes the batchHidden-without-snapshot contradiction", () => {
    expect(parseDraftLayerViewState(null)).toBe(EMPTY_DRAFT_LAYER_VIEW_STATE);
    expect(parseDraftLayerViewState("{broken")).toBe(EMPTY_DRAFT_LAYER_VIEW_STATE);
    expect(parseDraftLayerViewState(JSON.stringify({ v: 99 }))).toBe(
      EMPTY_DRAFT_LAYER_VIEW_STATE,
    );
    expect(
      parseDraftLayerViewState(
        JSON.stringify({ v: 1, batchHidden: true, snapshot: null }),
      ),
    ).toBe(EMPTY_DRAFT_LAYER_VIEW_STATE);
    // 항목 단위 검증: boolean이 아닌 항목만 버린다
    const partial = parseDraftLayerViewState(
      JSON.stringify({
        v: 1,
        batchHidden: true,
        snapshot: {
          capturedAt: 5,
          visibilityById: { good: true, bad: "yes" },
        },
      }),
    );
    expect(partial.snapshot?.visibilityById).toEqual({ good: true });
  });

  it("keeps scopes separate and survives storage failures", () => {
    const backing = new Map<string, string>();
    const storage: DraftLayerViewStorageLike = {
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => {
        backing.set(k, v);
      },
    };
    const first = toggleDraftLayerVisibility(LAYERS, EMPTY_DRAFT_LAYER_VIEW_STATE, 1000);
    saveDraftLayerViewState("page-1", first.viewState, storage);
    expect(loadDraftLayerViewState("page-1", storage)).toEqual(first.viewState);
    expect(loadDraftLayerViewState("page-2", storage)).toBe(EMPTY_DRAFT_LAYER_VIEW_STATE);
    expect(draftLayerViewStorageKey("page/1 x")).not.toBe(draftLayerViewStorageKey("page-1"));

    const broken: DraftLayerViewStorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => saveDraftLayerViewState("page-1", first.viewState, broken)).not.toThrow();
    expect(loadDraftLayerViewState("page-1", broken)).toBe(EMPTY_DRAFT_LAYER_VIEW_STATE);
  });
});
