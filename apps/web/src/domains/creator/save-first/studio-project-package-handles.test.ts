import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FileSystemFileHandleLike } from "@/shared/lib/file-system-access";

import { chooseStudioProjectPackageSaveTarget } from "./studio-project-package";

// 프로젝트 패키지 저장 대상 선택의 핸들 재사용 계약을 고정한다.
// 공유 모듈의 IDB 저장소 자체는 file-system-access.test.ts가 검증하므로,
// 여기서는 저장소를 인메모리로 바꿔 패키지 쪽 배선(먼저 조회·고른 뒤 저장)만 본다.

const mockHandles = new Map<string, FileSystemFileHandleLike>();

vi.mock("@/shared/lib/file-system-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/file-system-access")>();
  return {
    ...actual,
    loadStoredFileHandle: async (key: string) => mockHandles.get(key) ?? null,
    storeFileHandle: async (key: string, handle: FileSystemFileHandleLike) => {
      mockHandles.set(key, handle);
      return true;
    },
    forgetStoredFileHandle: async (key: string) => mockHandles.delete(key),
  };
});

const HANDLE_KEY = "project-package:proj-1";

function fakeHandle(name: string): FileSystemFileHandleLike {
  return {
    kind: "file",
    name,
    createWritable: async () => ({
      write: async () => undefined,
      close: async () => undefined,
    }),
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
  };
}

function pickerWindow(handle: FileSystemFileHandleLike | null) {
  return {
    showSaveFilePicker: handle ? vi.fn(async () => handle) : undefined,
  };
}

beforeEach(() => {
  mockHandles.clear();
});

describe("chooseStudioProjectPackageSaveTarget 핸들 재사용", () => {
  it("저장된 핸들이 있으면 선택기를 띄우지 않고 그 파일을 대상으로 돌려준다", async () => {
    mockHandles.set(HANDLE_KEY, fakeHandle("saved.toonstudio"));
    const picker = pickerWindow(fakeHandle("picked.toonstudio"));
    const target = await chooseStudioProjectPackageSaveTarget(
      "작품.toonstudio",
      picker as unknown as Window,
      HANDLE_KEY,
    );
    expect(target.kind).toBe("file-handle");
    expect(picker.showSaveFilePicker).not.toHaveBeenCalled();
  });

  it("저장된 핸들이 없으면 선택기로 고르고, 고른 핸들을 키에 저장한다", async () => {
    const picker = pickerWindow(fakeHandle("picked.toonstudio"));
    const target = await chooseStudioProjectPackageSaveTarget(
      "작품.toonstudio",
      picker as unknown as Window,
      HANDLE_KEY,
    );
    expect(target.kind).toBe("file-handle");
    expect(picker.showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(mockHandles.get(HANDLE_KEY)?.name).toBe("picked.toonstudio");
  });

  it("handleKey가 없으면 기존 동작 그대로다(핸들을 저장하지 않는다)", async () => {
    const picker = pickerWindow(fakeHandle("picked.toonstudio"));
    const target = await chooseStudioProjectPackageSaveTarget(
      "작품.toonstudio",
      picker as unknown as Window,
    );
    expect(target.kind).toBe("file-handle");
    expect(mockHandles.size).toBe(0);
  });

  it("선택기가 없으면 다운로드 대상으로 폴백한다", async () => {
    const target = await chooseStudioProjectPackageSaveTarget(
      "작품.toonstudio",
      {} as Window,
      HANDLE_KEY,
    );
    expect(target.kind).toBe("download");
  });
});
