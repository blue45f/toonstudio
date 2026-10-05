// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  FileHandleStoreLike,
  FileSystemFileHandleLike,
  FileSystemWritableStreamLike,
} from "@/shared/lib/file-system-access";

import {
  chooseExportSaveTarget,
  saveExportBlob,
  writeExportBlobToTarget,
} from "./studio-export";

// File System Access 경유 저장(saveExportBlob·2단계 저장)의 분기를 고정한다.
// 미지원·거부·실패에서는 기존 다운로드 흐름으로 폴백하고, 사용자가 취소하면
// 다운로드를 강행하지 않는 것이 계약이다.

function createHandleMock(init: {
  permission?: PermissionState;
  failWrite?: boolean;
} = {}): { handle: FileSystemFileHandleLike; written: string[] } {
  const written: string[] = [];
  const writable: FileSystemWritableStreamLike = {
    write: async (data) => {
      if (init.failWrite) throw new Error("disk full");
      written.push(data instanceof Blob ? await data.text() : String(data));
    },
    close: async () => undefined,
    abort: async () => undefined,
  };
  return {
    written,
    handle: {
      kind: "file",
      name: "picked.psd",
      createWritable: async () => writable,
      queryPermission: async () => init.permission ?? "granted",
      requestPermission: async () => init.permission ?? "granted",
    },
  };
}

function createMemoryStore(
  initial: FileSystemFileHandleLike | null,
): { store: FileHandleStoreLike; forgotten: string[] } {
  const forgotten: string[] = [];
  let current = initial;
  return {
    forgotten,
    store: {
      load: async () => current,
      store: async (_key, handle) => {
        current = handle;
        return true;
      },
      forget: async (key) => {
        forgotten.push(key);
        current = null;
        return true;
      },
    },
  };
}

let createObjectURLSpy: ReturnType<typeof vi.fn>;
let anchorClickSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createObjectURLSpy = vi.fn(() => "blob:mock-url");
  Object.assign(URL, { createObjectURL: createObjectURLSpy, revokeObjectURL: vi.fn() });
  anchorClickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  anchorClickSpy.mockRestore();
  vi.restoreAllMocks();
});

const blob = () => new Blob(["psd-bytes"], { type: "image/vnd.adobe.photoshop" });

describe("saveExportBlob", () => {
  it("선택기를 쓸 수 있으면 파일 핸들로 저장하고 다운로드하지 않는다", async () => {
    const { handle, written } = createHandleMock();
    const outcome = await saveExportBlob(blob(), "layers.psd", {
      targetWindow: { showSaveFilePicker: async () => handle },
    });
    expect(outcome).toBe("file-handle");
    expect(written).toEqual(["psd-bytes"]);
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it("미지원 환경에서는 기존 다운로드로 폴백한다", async () => {
    const outcome = await saveExportBlob(blob(), "layers.psd", { targetWindow: {} });
    expect(outcome).toBe("download");
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
  });

  it("사용자가 취소하면 다운로드를 강행하지 않는다", async () => {
    const outcome = await saveExportBlob(blob(), "layers.psd", {
      targetWindow: {
        showSaveFilePicker: async () => {
          throw new DOMException("user cancelled", "AbortError");
        },
      },
    });
    expect(outcome).toBe("cancelled");
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it("저장된 핸들이 있으면 선택기 없이 덮어쓴다", async () => {
    const { handle, written } = createHandleMock({ permission: "granted" });
    const memory = createMemoryStore(handle);
    const picker = vi.fn();
    const outcome = await saveExportBlob(blob(), "layers.psd", {
      handleKey: "colorize-layers-psd",
      handleStore: memory.store,
      targetWindow: { showSaveFilePicker: picker },
    });
    expect(outcome).toBe("file-handle");
    expect(picker).not.toHaveBeenCalled();
    expect(written).toEqual(["psd-bytes"]);
  });
});

describe("chooseExportSaveTarget + writeExportBlobToTarget", () => {
  it("대상 확정 후 쓰면 file-handle, 쓰기가 실패하면 핸들을 지우고 다운로드로 폴백한다", async () => {
    const good = createHandleMock();
    const memory = createMemoryStore(null);
    const target = await chooseExportSaveTarget("layers.psd", {
      handleKey: "k",
      handleStore: memory.store,
      targetWindow: { showSaveFilePicker: async () => good.handle },
    });
    expect(target.kind).toBe("file-handle");
    await expect(
      writeExportBlobToTarget(blob(), "layers.psd", target, { handleKey: "k", handleStore: memory.store }),
    ).resolves.toBe("file-handle");
    expect(good.written).toEqual(["psd-bytes"]);

    const bad = createHandleMock({ failWrite: true });
    const failingTarget = await chooseExportSaveTarget("layers.psd", {
      handleStore: memory.store,
      targetWindow: { showSaveFilePicker: async () => bad.handle },
    });
    await expect(
      writeExportBlobToTarget(blob(), "layers.psd", failingTarget, {
        handleKey: "k",
        handleStore: memory.store,
      }),
    ).resolves.toBe("download");
    expect(memory.forgotten).toEqual(["k"]);
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
  });

  it("취소된 대상에는 아무것도 쓰지 않는다", async () => {
    const target = await chooseExportSaveTarget("layers.psd", {
      targetWindow: {
        showSaveFilePicker: async () => {
          throw new DOMException("user cancelled", "AbortError");
        },
      },
    });
    expect(target.kind).toBe("cancelled");
    await expect(writeExportBlobToTarget(blob(), "layers.psd", target)).resolves.toBe("cancelled");
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it("미지원 환경에서는 다운로드 대상이 된다", async () => {
    const target = await chooseExportSaveTarget("layers.psd", { targetWindow: {} });
    expect(target.kind).toBe("download");
    await expect(writeExportBlobToTarget(blob(), "layers.psd", target)).resolves.toBe("download");
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
  });
});
