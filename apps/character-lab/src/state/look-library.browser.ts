/**
 * 브라우저 전용 "내 룩" 바인딩(2026-10-23 S-1): localStorage 저장소와 `.look.json` 파일 내보내기·가져오기.
 * 테스트 파일은 이 모듈을 import하지 않는다(브라우저 검증 필요) — 저장·용량·손상·파일 형식 로직은 `look-library.ts`가 Node 시험을 받는다.
 *
 * - 저장소: `window.localStorage`(접근 자체가 SecurityError를 던질 수 있어 잡아서 한글 사유로 돌려준다). 저장소가 없으면 파일 내보내기만 쓸 수 있다.
 * - 파일: File System Access API가 있으면 쓰고, 없으면 `<a download>`·`<input type="file">`로 대신한다(판정은 `recipe-io.ts`의 순수 함수).
 *   사용자 취소(AbortError)는 null, 그 밖의 오류는 그대로 throw한다(호출자가 failure로 보인다 — `recipe-io.browser.ts`와 같은 규약).
 */
import { failVisible } from "../contracts";

import { LOOK_FILE_MIME, createLookLibraryStore, lookFileName, serializeLookFile, storageFailure } from "./look-library";
import { isAbortError, openMethodFor, saveMethodFor } from "./recipe-io";

import type { CharacterLook, LabFailure } from "../contracts";
import type { LookLibraryStore } from "./look-library";
import type { SaveMethod } from "./recipe-io";
import type { PickerWindow } from "./recipe-io.browser";

const LOOK_PICKER_TYPES = [{ description: "캐릭터 룩(JSON)", accept: { [LOOK_FILE_MIME]: [".json"] } }];

export type BrowserLookStoreResult = { readonly ok: true; readonly store: LookLibraryStore } | { readonly ok: false; readonly failure: LabFailure };

/** localStorage 위의 내 룩 저장소. 저장소를 쓸 수 없으면 한글 사유(파일 내보내기 안내)를 돌려준다. */
export function createBrowserLookLibraryStore(win: Window = window): BrowserLookStoreResult {
  let storage: Storage | null;
  try {
    storage = win.localStorage;
  } catch (error) {
    return { ok: false, failure: storageFailure(error, Date.now()) };
  }
  if (!storage) {
    return { ok: false, failure: failVisible("look-storage-unavailable", "이 브라우저에는 저장소(localStorage)가 없어 내 룩을 보관할 수 없습니다. 파일로 내보내 보관하세요.", undefined, Date.now()) };
  }
  return { ok: true, store: createLookLibraryStore(storage, () => Date.now()) };
}

function downloadWithAnchor(doc: Document, name: string, text: string): void {
  const blob = new Blob([text], { type: LOOK_FILE_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  doc.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // 클릭 처리 뒤 revoke(동기 revoke는 일부 브라우저에서 다운로드가 취소된다)
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** 룩을 `<id>.look.json` 파일로 저장한다. 취소하면 null, 아니면 사용한 경로. */
export async function saveLookFile(look: CharacterLook, win: Window & PickerWindow = window as Window & PickerWindow): Promise<SaveMethod | null> {
  const name = lookFileName(look);
  const text = serializeLookFile(look);
  if (saveMethodFor(win) === "file-system-access" && win.showSaveFilePicker) {
    try {
      const handle = await win.showSaveFilePicker({ suggestedName: name, types: LOOK_PICKER_TYPES });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return "file-system-access";
    } catch (error) {
      if (isAbortError(error)) return null;
      throw error;
    }
  }
  downloadWithAnchor(win.document, name, text);
  return "anchor-download";
}

export interface OpenedLookFile {
  readonly name: string;
  readonly text: string;
}

function openWithInput(doc: Document): Promise<OpenedLookFile | null> {
  return new Promise((resolve, reject) => {
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = `${LOOK_FILE_MIME},.json`;
    input.style.display = "none";
    const cleanup = (): void => {
      input.remove();
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      file
        .text()
        .then((text) => resolve({ name: file.name, text }))
        .catch((error: unknown) => reject(error instanceof Error ? error : new Error(String(error))));
    });
    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });
    doc.body.append(input);
    input.click();
  });
}

/** `.look.json` 파일을 연다(내용 검사는 `importLookFileText`). 취소하면 null. */
export async function openLookFile(win: Window & PickerWindow = window as Window & PickerWindow): Promise<OpenedLookFile | null> {
  if (openMethodFor(win) === "file-system-access" && win.showOpenFilePicker) {
    try {
      const [handle] = await win.showOpenFilePicker({ multiple: false, types: LOOK_PICKER_TYPES });
      if (!handle) return null;
      const file = await handle.getFile();
      return { name: file.name, text: await file.text() };
    } catch (error) {
      if (isAbortError(error)) return null;
      throw error;
    }
  }
  return openWithInput(win.document);
}
