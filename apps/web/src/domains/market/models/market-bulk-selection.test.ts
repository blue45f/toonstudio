import { describe, expect, it, vi } from "vitest";

import {
  bulkSelectionState,
  planOwnedBulkAction,
  runBulkSequential,
  toggleSelectedId,
} from "./market-bulk-selection";

import type { CreatorMarketplaceOwnedRelease } from "@/shared/lib/creator-marketplace-resource-contract";

function release(
  id: string,
  options: { delisted?: boolean; moderated?: boolean } = {},
): CreatorMarketplaceOwnedRelease {
  return {
    resource: { id } as CreatorMarketplaceOwnedRelease["resource"],
    releaseOrdinal: 1,
    hidden: options.moderated ?? false,
    delistedAt: options.delisted ? "2026-09-08T00:00:00.000Z" : null,
    packageModeration: {
      state: options.moderated ? "hidden" : "active",
      revision: 0,
      hiddenAt: null,
    },
  } as CreatorMarketplaceOwnedRelease;
}

describe("toggleSelectedId", () => {
  it("adds a missing id and removes a present id without duplicates", () => {
    expect(toggleSelectedId([], "a")).toEqual(["a"]);
    expect(toggleSelectedId(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleSelectedId(["a"], "b")).toEqual(["a", "b"]);
  });
});

describe("bulkSelectionState", () => {
  it("reports none/some/all against visible ids only", () => {
    expect(bulkSelectionState([], ["a"])).toBe("none");
    expect(bulkSelectionState(["a", "b"], [])).toBe("none");
    expect(bulkSelectionState(["a", "b"], ["a", "stale"])).toBe("some");
    expect(bulkSelectionState(["a", "b"], ["b", "a"])).toBe("all");
  });
});

describe("planOwnedBulkAction", () => {
  const items = [
    release("listed"),
    release("delisted", { delisted: true }),
    release("hidden-listed", { moderated: true }),
    release("hidden-delisted", { delisted: true, moderated: true }),
    release("unselected", { delisted: true }),
  ];
  const selected = ["listed", "delisted", "hidden-listed", "hidden-delisted"];

  it("relist targets only selected, delisted, non-moderated items", () => {
    const plan = planOwnedBulkAction(items, selected, "relist");
    expect(plan.targets.map((item) => item.resource.id)).toEqual(["delisted"]);
    expect(plan.skippedModerated).toBe(2);
    expect(plan.skippedAlreadyInState).toBe(1);
  });

  it("unlist targets only selected, listed, non-moderated items", () => {
    const plan = planOwnedBulkAction(items, selected, "unlist");
    expect(plan.targets.map((item) => item.resource.id)).toEqual(["listed"]);
    expect(plan.skippedModerated).toBe(2);
    expect(plan.skippedAlreadyInState).toBe(1);
  });

  it("keeps list order regardless of selection order", () => {
    const plan = planOwnedBulkAction(
      [release("b", { delisted: true }), release("a", { delisted: true })],
      ["a", "b"],
      "relist",
    );
    expect(plan.targets.map((item) => item.resource.id)).toEqual(["b", "a"]);
  });
});

describe("runBulkSequential", () => {
  it("runs in order and collects partial failures without stopping", async () => {
    const order: string[] = [];
    const operation = vi.fn(async (id: string) => {
      order.push(id);
      if (id === "b") throw new Error("denied");
    });
    const result = await runBulkSequential(["a", "b", "c"], operation);
    expect(order).toEqual(["a", "b", "c"]);
    expect(result.succeeded).toEqual(["a", "c"]);
    expect(result.failed).toEqual(["b"]);
  });

  it("returns empty groups for no targets", async () => {
    const result = await runBulkSequential<string>([], async () => {});
    expect(result).toEqual({ succeeded: [], failed: [] });
  });
});
