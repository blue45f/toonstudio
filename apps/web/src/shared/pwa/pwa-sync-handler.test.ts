import { describe, expect, it, vi } from "vitest";

import {
  getRegisteredPwaSyncHandler,
  listRegisteredPwaOutboxSyncKinds,
  registerPwaOutboxSyncHandler,
  registerPwaOutboxSyncHandlerForKind,
} from "./pwa-sync-handler";

function item(kind: string) {
  return {
    id: `id-${kind}`,
    kind,
    label: kind,
    payload: {},
    createdAt: 1,
    updatedAt: 1,
    attempts: 0,
    status: "queued" as const,
  };
}

describe("pwa-sync-handler", () => {
  it("미등록 kind는 kind를 포함한 오류로 다음 시도를 유도한다", async () => {
    await expect(getRegisteredPwaSyncHandler()(item("note"))).rejects.toThrow(
      "no-sync-handler:note",
    );
  });

  it("kind별 핸들러가 폴백보다 우선한다", async () => {
    const kindHandler = vi.fn(async () => undefined);
    const fallbackHandler = vi.fn(async () => undefined);
    const releaseKind = registerPwaOutboxSyncHandlerForKind("note", kindHandler);
    const releaseFallback = registerPwaOutboxSyncHandler(fallbackHandler);
    try {
      await getRegisteredPwaSyncHandler()(item("note"));
      expect(kindHandler).toHaveBeenCalledTimes(1);
      expect(fallbackHandler).not.toHaveBeenCalled();
      await getRegisteredPwaSyncHandler()(item("comment"));
      expect(fallbackHandler).toHaveBeenCalledTimes(1);
    } finally {
      releaseKind();
      releaseFallback();
    }
  });

  it("해제 후에는 다시 미등록 오류가 난다", async () => {
    const release = registerPwaOutboxSyncHandlerForKind("note", async () => undefined);
    release();
    await expect(getRegisteredPwaSyncHandler()(item("note"))).rejects.toThrow(
      "no-sync-handler:note",
    );
    expect(listRegisteredPwaOutboxSyncKinds()).not.toContain("note");
  });
});
