/**
 * File System Access 공용 래퍼 — 로컬 파일 직접 저장(선택한 파일에 덮어쓰기)과
 * 파일 핸들 영속을 도메인 코드가 안전하게 쓰기 위한 가장 작은 경계다.
 *
 * 배경:
 * - 지금까지 내보내기는 전부 브라우저 다운로드(anchor download)였다. 다운로드
 *   폴더에 사본이 쌓이고, "같은 파일에 다시 저장"이 불가능하다.
 * - 프로젝트 패키지(save-first)만 showSaveFilePicker를 직접 썼지만 핸들을
 *   저장하지 않아 저장할 때마다 위치를 다시 물었다.
 * - 이 모듈은 ① 능력 감지 ② 핸들의 IndexedDB 영속(핸들은 구조화 복제 가능
 *   객체라 문자열 전용인 idb-kv에는 못 넣는다 — 전용 DB를 쓴다) ③ 권한
 *   확인/요청 ④ "저장된 핸들 → 파일 선택기" 순서의 저장 오케스트레이션을
 *   제공한다. 다운로드 폴백은 호출자(예: studio-export)가 맡는다.
 *
 * 설계 원칙:
 * - 저장소 연산은 실패해도 throw 하지 않는다 (idb-kv와 같은 원칙). IndexedDB를
 *   못 쓰는 환경에서는 null/false를 돌려주고 호출자가 폴백을 결정한다.
 * - 파일 선택기와 권한 요청은 사용자 제스처(전환 활성화) 안에서만 성공한다.
 *   호출자는 클릭 핸들러 체인에서 곧바로 이 모듈을 불러야 한다.
 * - 사용자가 선택을 취소(AbortError)한 것은 실패와 구분해 "cancelled"로
 *   돌려준다 — 호출자가 취소 뒤에 다운로드까지 강행하면 사용자 의도를 어긴다.
 */

export interface FileSystemWritableStreamLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

export interface FileSystemHandlePermissionDescriptorLike {
  readonly mode: "read" | "readwrite";
}

export interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableStreamLike>;
  queryPermission?(
    descriptor: FileSystemHandlePermissionDescriptorLike,
  ): Promise<PermissionState>;
  requestPermission?(
    descriptor: FileSystemHandlePermissionDescriptorLike,
  ): Promise<PermissionState>;
}

export interface FilePickerAcceptTypeLike {
  readonly description?: string;
  readonly accept: Readonly<Record<string, readonly string[]>>;
}

export interface SaveFilePickerOptionsLike {
  readonly suggestedName?: string;
  readonly types?: readonly FilePickerAcceptTypeLike[];
}

export interface FileSystemAccessWindowLike {
  showSaveFilePicker?: (
    options?: SaveFilePickerOptionsLike,
  ) => Promise<FileSystemFileHandleLike>;
}

export const FILE_HANDLE_DATABASE_NAME = "toonstudio-fs-handles";
export const FILE_HANDLE_STORE_NAME = "handles";
const FILE_HANDLE_DATABASE_VERSION = 1;

interface CachedConnection {
  readonly factory: IDBFactory;
  readonly promise: Promise<IDBDatabase | null>;
}

let cached: CachedConnection | null = null;

function currentFactory(): IDBFactory | null {
  try {
    return typeof indexedDB !== "undefined" ? indexedDB : null;
  } catch {
    return null;
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  const factory = currentFactory();
  if (!factory) return Promise.resolve(null);
  if (cached && cached.factory === factory) return cached.promise;
  const promise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(FILE_HANDLE_DATABASE_NAME, FILE_HANDLE_DATABASE_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_HANDLE_STORE_NAME)) {
        database.createObjectStore(FILE_HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  cached = { factory, promise };
  return promise;
}

function runHandleStoreRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDatabase().then(
    (database) =>
      new Promise<T | null>((resolve) => {
        if (!database) {
          resolve(null);
          return;
        }
        let request: IDBRequest<T>;
        try {
          const transaction = database.transaction(FILE_HANDLE_STORE_NAME, mode);
          request = run(transaction.objectStore(FILE_HANDLE_STORE_NAME));
        } catch {
          resolve(null);
          return;
        }
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
      }),
  );
}

/** 저장된 파일 핸들을 읽는다. 없거나 읽을 수 없으면 null. */
export async function loadStoredFileHandle(
  key: string,
): Promise<FileSystemFileHandleLike | null> {
  const value = await runHandleStoreRequest<unknown>("readonly", (store) => store.get(key));
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FileSystemFileHandleLike>;
  return typeof candidate.createWritable === "function"
    ? (value as FileSystemFileHandleLike)
    : null;
}

/** 파일 핸들을 키로 저장한다. 성공 여부만 돌려준다. */
export async function storeFileHandle(
  key: string,
  handle: FileSystemFileHandleLike,
): Promise<boolean> {
  const result = await runHandleStoreRequest<IDBValidKey>("readwrite", (store) =>
    store.put(handle, key),
  );
  return result !== null;
}

/** 저장된 파일 핸들을 지운다. 성공 여부만 돌려준다. */
export async function forgetStoredFileHandle(key: string): Promise<boolean> {
  const database = await openDatabase();
  if (!database) return false;
  return new Promise<boolean>((resolve) => {
    try {
      const transaction = database.transaction(FILE_HANDLE_STORE_NAME, "readwrite");
      transaction.objectStore(FILE_HANDLE_STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** File System Access(저장 선택기)를 쓸 수 있는 환경인지 — Chromium 계열 데스크톱이 대표적이다. */
export function isFileSystemAccessSupported(
  targetWindow: FileSystemAccessWindowLike | null | undefined = typeof window !== "undefined"
    ? (window as FileSystemAccessWindowLike)
    : null,
): boolean {
  return typeof targetWindow?.showSaveFilePicker === "function";
}

/** 핸들의 현재 권한을 묻는다. 권한 API가 없는 핸들이면 "granted"로 간주하지 않고 null. */
export async function queryFileHandlePermission(
  handle: FileSystemFileHandleLike,
  mode: "read" | "readwrite" = "readwrite",
): Promise<PermissionState | null> {
  if (typeof handle.queryPermission !== "function") return null;
  try {
    return await handle.queryPermission({ mode });
  } catch {
    return null;
  }
}

/**
 * 핸들 권한을 요청한다. 반드시 사용자 제스처 안에서 불러야 한다.
 * 권한 API가 없는 핸들이면 쓸 수 있는 것으로 간주한다(선택기로 받은 직후 등).
 */
export async function ensureFileHandlePermission(
  handle: FileSystemFileHandleLike,
  mode: "read" | "readwrite" = "readwrite",
): Promise<boolean> {
  const current = await queryFileHandlePermission(handle, mode);
  if (current === "granted") return true;
  if (typeof handle.requestPermission !== "function") return current === null;
  try {
    return (await handle.requestPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

/** 핸들에 Blob을 통째로 덮어쓴다. 실패하면 부분 쓰기를 중단(abort)하고 다시 던진다. */
export async function writeBlobToFileHandle(
  handle: FileSystemFileHandleLike,
  blob: Blob,
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort?.(error);
    } catch {
      // 중단 실패는 원래 오류를 가리지 않는다.
    }
    throw error;
  }
}

export type FilePickerSaveOutcome =
  | Readonly<{ kind: "stored-handle" }>
  | Readonly<{ kind: "picker" }>
  | Readonly<{ kind: "unsupported" }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "denied" }>
  | Readonly<{ kind: "failed"; message: string }>;

export interface FileHandleStoreLike {
  load(key: string): Promise<FileSystemFileHandleLike | null>;
  store(key: string, handle: FileSystemFileHandleLike): Promise<boolean>;
  forget(key: string): Promise<boolean>;
}

const defaultHandleStore: FileHandleStoreLike = {
  load: loadStoredFileHandle,
  store: storeFileHandle,
  forget: forgetStoredFileHandle,
};

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "unknown error";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Blob을 로컬 파일에 저장한다 — 저장된 핸들이 있으면 권한 확인 후 묻지 않고
 * 덮어쓰고, 없으면 저장 선택기를 띄운다(핸들 키가 있으면 선택 결과를 저장해
 * 다음 저장부터 재사용한다). 다운로드 폴백은 하지 않는다 — 호출자가 outcome을
 * 보고 결정한다.
 */
export async function saveBlobWithFilePicker(
  blob: Blob,
  options: {
    readonly suggestedName: string;
    readonly types?: readonly FilePickerAcceptTypeLike[];
    readonly handleKey?: string;
    readonly targetWindow?: FileSystemAccessWindowLike | null;
    readonly handleStore?: FileHandleStoreLike;
  },
): Promise<FilePickerSaveOutcome> {
  const targetWindow =
    options.targetWindow ??
    (typeof window !== "undefined" ? (window as FileSystemAccessWindowLike) : null);
  const store = options.handleStore ?? defaultHandleStore;

  if (options.handleKey) {
    const stored = await store.load(options.handleKey).catch(() => null);
    if (stored) {
      const permission = await queryFileHandlePermission(stored, "readwrite");
      if (permission === "granted" || permission === null) {
        try {
          await writeBlobToFileHandle(stored, blob);
          return Object.freeze({ kind: "stored-handle" });
        } catch {
          await store.forget(options.handleKey).catch(() => false);
          return Object.freeze({ kind: "failed", message: "stored handle write failed" });
        }
      }
      if (permission === "prompt") {
        const granted = await ensureFileHandlePermission(stored, "readwrite");
        if (granted) {
          try {
            await writeBlobToFileHandle(stored, blob);
            return Object.freeze({ kind: "stored-handle" });
          } catch {
            await store.forget(options.handleKey).catch(() => false);
            return Object.freeze({ kind: "failed", message: "stored handle write failed" });
          }
        }
      }
      // denied — 권한이 회수된 핸들은 지우고, 이번 저장은 호출자 폴백에 맡긴다.
      await store.forget(options.handleKey).catch(() => false);
      return Object.freeze({ kind: "denied" });
    }
  }

  if (!isFileSystemAccessSupported(targetWindow)) {
    return Object.freeze({ kind: "unsupported" });
  }

  let handle: FileSystemFileHandleLike;
  try {
    handle = await targetWindow!.showSaveFilePicker!({
      suggestedName: options.suggestedName,
      types: options.types,
    });
  } catch (error) {
    if (isAbortError(error)) return Object.freeze({ kind: "cancelled" });
    return Object.freeze({ kind: "failed", message: errorMessage(error) });
  }

  try {
    await writeBlobToFileHandle(handle, blob);
  } catch (error) {
    return Object.freeze({ kind: "failed", message: errorMessage(error) });
  }
  if (options.handleKey) {
    await store.store(options.handleKey, handle).catch(() => false);
  }
  return Object.freeze({ kind: "picker" });
}
