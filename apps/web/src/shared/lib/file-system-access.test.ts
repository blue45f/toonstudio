import "fake-indexeddb/auto";

import { describe, expect, it, vi } from "vitest";

import {
  chooseSaveFileTarget,
  ensureFileHandlePermission,
  forgetStoredFileHandle,
  isFileSystemAccessSupported,
  loadStoredFileHandle,
  queryFileHandlePermission,
  saveBlobWithFilePicker,
  storeFileHandle,
  writeBlobToFileHandle,
  type FileHandleStoreLike,
  type FileSystemFileHandleLike,
  type FileSystemWritableStreamLike,
} from "./file-system-access";

function createWritableMock(failWrite = false): {
  writable: FileSystemWritableStreamLike;
  written: Blob[];
  closed: () => boolean;
  aborted: () => boolean;
} {
  const written: Blob[] = [];
  let closedFlag = false;
  let abortedFlag = false;
  const writable: FileSystemWritableStreamLike = {
    write: async (data: Blob) => {
      if (failWrite) throw new Error("disk full");
      written.push(data);
    },
    close: async () => {
      closedFlag = true;
    },
    abort: async () => {
      abortedFlag = true;
    },
  };
  return { writable, written, closed: () => closedFlag, aborted: () => abortedFlag };
}

function createHandleMock(options: {
  permission?: PermissionState;
  requestResult?: PermissionState;
  failWrite?: boolean;
  withPermissionApi?: boolean;
} = {}): {
  handle: FileSystemFileHandleLike;
  writableState: ReturnType<typeof createWritableMock>;
  requestCalls: () => number;
} {
  const writableState = createWritableMock(options.failWrite);
  let requestCalls = 0;
  const handle: FileSystemFileHandleLike = {
    kind: "file",
    name: "memory.toonstudio",
    createWritable: async () => writableState.writable,
  };
  if (options.withPermissionApi !== false) {
    handle.queryPermission = async () => options.permission ?? "granted";
    handle.requestPermission = async () => {
      requestCalls += 1;
      return options.requestResult ?? "granted";
    };
  }
  return { handle, writableState, requestCalls: () => requestCalls };
}

function createMemoryStore(initial?: FileSystemFileHandleLike | null): {
  store: FileHandleStoreLike;
  forgotten: string[];
  storedKeys: string[];
} {
  let value = initial ?? null;
  const forgotten: string[] = [];
  const storedKeys: string[] = [];
  const store: FileHandleStoreLike = {
    load: async () => value,
    store: async (key, handle) => {
      storedKeys.push(key);
      value = handle;
      return true;
    },
    forget: async (key) => {
      forgotten.push(key);
      value = null;
      return true;
    },
  };
  return { store, forgotten, storedKeys };
}

const blob = new Blob(["psd-bytes"], { type: "application/octet-stream" });

describe("isFileSystemAccessSupported", () => {
  it("피커 함수가 있으면 true, 없으면 false다", () => {
    expect(isFileSystemAccessSupported({ showSaveFilePicker: async () => createHandleMock().handle })).toBe(true);
    expect(isFileSystemAccessSupported({})).toBe(false);
    expect(isFileSystemAccessSupported(null)).toBe(false);
    expect(isFileSystemAccessSupported(undefined)).toBe(false);
  });
});

describe("권한 헬퍼", () => {
  it("queryPermission이 없는 핸들은 null을 돌려준다", async () => {
    const { handle } = createHandleMock({ withPermissionApi: false });
    await expect(queryFileHandlePermission(handle)).resolves.toBeNull();
  });

  it("이미 granted면 요청 없이 true다", async () => {
    const { handle, requestCalls } = createHandleMock({ permission: "granted" });
    await expect(ensureFileHandlePermission(handle)).resolves.toBe(true);
    expect(requestCalls()).toBe(0);
  });

  it("prompt면 요청해서 granted를 받으면 true, denied면 false다", async () => {
    const granted = createHandleMock({ permission: "prompt", requestResult: "granted" });
    await expect(ensureFileHandlePermission(granted.handle)).resolves.toBe(true);
    expect(granted.requestCalls()).toBe(1);

    const denied = createHandleMock({ permission: "prompt", requestResult: "denied" });
    await expect(ensureFileHandlePermission(denied.handle)).resolves.toBe(false);
  });

  it("권한 API가 전혀 없는 핸들은 쓸 수 있는 것으로 간주한다", async () => {
    const { handle } = createHandleMock({ withPermissionApi: false });
    await expect(ensureFileHandlePermission(handle)).resolves.toBe(true);
  });
});

describe("writeBlobToFileHandle", () => {
  it("쓰고 닫는다", async () => {
    const { handle, writableState } = createHandleMock();
    await writeBlobToFileHandle(handle, blob);
    expect(writableState.written).toEqual([blob]);
    expect(writableState.closed()).toBe(true);
  });

  it("쓰기 실패 시 abort를 시도하고 오류를 다시 던진다", async () => {
    const { handle, writableState } = createHandleMock({ failWrite: true });
    await expect(writeBlobToFileHandle(handle, blob)).rejects.toThrow("disk full");
    expect(writableState.aborted()).toBe(true);
  });
});

describe("saveBlobWithFilePicker", () => {
  it("저장된 핸들의 권한이 granted면 묻지 않고 덮어쓴다", async () => {
    const { handle, writableState } = createHandleMock({ permission: "granted" });
    const memory = createMemoryStore(handle);
    const picker = vi.fn();
    const outcome = await saveBlobWithFilePicker(blob, {
      suggestedName: "a.psd",
      handleKey: "k1",
      handleStore: memory.store,
      targetWindow: { showSaveFilePicker: picker },
    });
    expect(outcome).toEqual({ kind: "stored-handle" });
    expect(writableState.written).toEqual([blob]);
    expect(picker).not.toHaveBeenCalled();
  });

  it("저장된 핸들이 prompt면 권한을 요청한 뒤 쓴다", async () => {
    const { handle, writableState, requestCalls } = createHandleMock({
      permission: "prompt",
      requestResult: "granted",
    });
    const memory = createMemoryStore(handle);
    const outcome = await saveBlobWithFilePicker(blob, {
      suggestedName: "a.psd",
      handleKey: "k1",
      handleStore: memory.store,
      targetWindow: {},
    });
    expect(outcome).toEqual({ kind: "stored-handle" });
    expect(requestCalls()).toBe(1);
    expect(writableState.written).toEqual([blob]);
  });

  it("저장된 핸들의 권한이 회수됐으면 핸들을 지우고 denied를 돌려준다", async () => {
    const { handle } = createHandleMock({ permission: "prompt", requestResult: "denied" });
    const memory = createMemoryStore(handle);
    const outcome = await saveBlobWithFilePicker(blob, {
      suggestedName: "a.psd",
      handleKey: "k1",
      handleStore: memory.store,
      targetWindow: {},
    });
    expect(outcome).toEqual({ kind: "denied" });
    expect(memory.forgotten).toEqual(["k1"]);
  });

  it("저장된 핸들 쓰기가 실패하면 핸들을 지우고 failed를 돌려준다", async () => {
    const { handle } = createHandleMock({ permission: "granted", failWrite: true });
    const memory = createMemoryStore(handle);
    const outcome = await saveBlobWithFilePicker(blob, {
      suggestedName: "a.psd",
      handleKey: "k1",
      handleStore: memory.store,
      targetWindow: {},
    });
    expect(outcome.kind).toBe("failed");
    expect(memory.forgotten).toEqual(["k1"]);
  });

  it("지원되지 않는 환경이면 unsupported다", async () => {
    const outcome = await saveBlobWithFilePicker(blob, {
      suggestedName: "a.psd",
      targetWindow: {},
    });
    expect(outcome).toEqual({ kind: "unsupported" });
  });

  it("피커로 저장하면 핸들을 저장해 다음에 재사용할 수 있게 한다", async () => {
    const { handle, writableState } = createHandleMock();
    const memory = createMemoryStore(null);
    const outcome = await saveBlobWithFilePicker(blob, {
      suggestedName: "a.psd",
      handleKey: "k2",
      handleStore: memory.store,
      targetWindow: { showSaveFilePicker: async () => handle },
    });
    expect(outcome).toEqual({ kind: "picker" });
    expect(writableState.written).toEqual([blob]);
    expect(memory.storedKeys).toEqual(["k2"]);
  });

  it("사용자가 피커를 취소하면 cancelled이며 다운로드로 이어지지 않게 구분된다", async () => {
    const outcome = await saveBlobWithFilePicker(blob, {
      suggestedName: "a.psd",
      targetWindow: {
        showSaveFilePicker: async () => {
          throw new DOMException("user cancelled", "AbortError");
        },
      },
    });
    expect(outcome).toEqual({ kind: "cancelled" });
  });

  it("피커 자체가 실패하면 failed다", async () => {
    const outcome = await saveBlobWithFilePicker(blob, {
      suggestedName: "a.psd",
      targetWindow: {
        showSaveFilePicker: async () => {
          throw new Error("SecurityError: must be called from a user gesture");
        },
      },
    });
    expect(outcome.kind).toBe("failed");
  });
});

describe("chooseSaveFileTarget", () => {
  it("저장된 핸들이 있으면 선택기 없이 그 핸들을 대상으로 돌려준다", async () => {
    const { handle } = createHandleMock({ permission: "granted" });
    const memory = createMemoryStore(handle);
    const picker = vi.fn();
    const target = await chooseSaveFileTarget({
      suggestedName: "a.psd",
      handleKey: "k1",
      handleStore: memory.store,
      targetWindow: { showSaveFilePicker: picker },
    });
    expect(target.kind).toBe("file-handle");
    expect(picker).not.toHaveBeenCalled();
  });

  it("저장된 핸들의 권한이 거부되면 핸들을 지우고 denied다", async () => {
    const { handle } = createHandleMock({ permission: "prompt", requestResult: "denied" });
    const memory = createMemoryStore(handle);
    const target = await chooseSaveFileTarget({
      suggestedName: "a.psd",
      handleKey: "k1",
      handleStore: memory.store,
      targetWindow: {},
    });
    expect(target).toEqual({ kind: "denied" });
    expect(memory.forgotten).toEqual(["k1"]);
  });

  it("지원되지 않으면 picker-unavailable, 취소하면 cancelled다", async () => {
    await expect(
      chooseSaveFileTarget({ suggestedName: "a.psd", targetWindow: {} }),
    ).resolves.toEqual({ kind: "picker-unavailable" });
    await expect(
      chooseSaveFileTarget({
        suggestedName: "a.psd",
        targetWindow: {
          showSaveFilePicker: async () => {
            throw new DOMException("user cancelled", "AbortError");
          },
        },
      }),
    ).resolves.toEqual({ kind: "cancelled" });
  });

  it("선택기로 고른 핸들은 저장돼 다음 대상 확정에서 재사용된다", async () => {
    const { handle } = createHandleMock();
    const memory = createMemoryStore(null);
    const target = await chooseSaveFileTarget({
      suggestedName: "a.psd",
      handleKey: "k9",
      handleStore: memory.store,
      targetWindow: { showSaveFilePicker: async () => handle },
    });
    expect(target.kind).toBe("file-handle");
    expect(memory.storedKeys).toEqual(["k9"]);
  });
});

describe("핸들 저장소 (IndexedDB)", () => {
  it("없는 키는 null, 핸들이 아닌 값은 걸러서 null이다", async () => {
    await expect(loadStoredFileHandle("missing-key")).resolves.toBeNull();
    // 구조화 복제 가능한 값만 저장할 수 있어, 핸들 형태가 아닌 값을 넣어 필터를 확인한다.
    const standIn = { name: "not-a-handle" } as unknown as FileSystemFileHandleLike;
    await expect(storeFileHandle("plain", standIn)).resolves.toBe(true);
    await expect(loadStoredFileHandle("plain")).resolves.toBeNull();
    await expect(forgetStoredFileHandle("plain")).resolves.toBe(true);
  });
});
