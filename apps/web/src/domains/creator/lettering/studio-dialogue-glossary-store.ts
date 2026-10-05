/**
 * Studio Dialogue Glossary Store — 작품별 용어집 텍스트의 영속 저장.
 *
 * 왜 필요한가
 * ----------
 * 용어집(원문 표기 → 정본 표기)은 작품의 자산이다 — 캐릭터 이름·고유명사·말투 규칙은
 * 회차가 바뀌어도, 내일 다시 열어도 그대로여야 한다. 그런데 지금까지 용어집은 번역
 * 패널의 세션 상태(useState(""))에 머물러 새로고침 한 번에 사라졌고, 매번 다시 붙여
 * 넣어야 했다. 이 모듈은 그 텍스트를 작품(workScope) 단위로 localStorage에 남긴다.
 *
 * 경계:
 *  · 정본은 여전히 "자유 텍스트"다. 번역 프롬프트 주입(buildTranslationPrompt)과
 *    번역 메모리의 용어집 파서가 그 텍스트를 그대로 읽는 계약을 깨지 않기 위해,
 *    구조화 규칙을 별도 스키마로 저장하지 않고 텍스트 자체를 저장한다. 행 단위 편집은
 *    split/serialize(studio-translation-glossary)로 텍스트 위에서만 이뤄진다.
 *  · 번역 메모리(studio-translation-memory)와 키를 섞지 않는다. 메모리는 항목 DB이고
 *    이쪽은 작품 설정 텍스트라 수명·형태가 다르다. workScope 격리 방식만 같은 관례를 쓴다.
 *  · 저장소 접근은 전부 실패해도 조용히 빈 값이다 — 저장 실패가 번역 작업을 막으면 안 된다.
 *
 * 저장 매체 (2026-10-06 IndexedDB 이전):
 *  · 정본은 IndexedDB(shared/lib/idb-kv)다. 작품마다 키가 하나씩 느는 성장형
 *    데이터라 localStorage 총량(5MB)을 다른 대형 문서와 나눠 쓰던 구조를 벗어난다.
 *  · 아래 동기 함수(loadStudioDialogueGlossaryText 등)는 구 계약·폴백 전용으로
 *    남긴다. 실제 패널은 비동기 함수(…Async)를 쓰고, 비동기 함수는 작품 키를
 *    처음 읽을 때 구 localStorage 값을 검증 후 이관한 뒤 IDB를 읽는다.
 *  · IndexedDB를 못 쓰는 환경에서는 비동기 함수도 localStorage로 떨어져 기존
 *    동작과 같아진다.
 */
import {
  idbKvGet,
  idbKvRemove,
  idbKvSet,
  migrateLocalStorageValueToIdb,
} from "@/shared/lib/idb-kv";

export const STUDIO_DIALOGUE_GLOSSARY_STORAGE_PREFIX = "toonstudio-studio-dialogue-glossary:v1:";

export function studioDialogueGlossaryStorageKey(workScope: string): string {
  return `${STUDIO_DIALOGUE_GLOSSARY_STORAGE_PREFIX}${workScope}`;
}

/** 작품의 저장된 용어집 텍스트를 읽는다. 없거나 읽을 수 없으면 "". */
export function loadStudioDialogueGlossaryText(
  storage: Pick<Storage, "getItem"> | null | undefined,
  workScope: string | null | undefined
): string {
  if (!storage || !workScope) return "";
  try {
    return storage.getItem(studioDialogueGlossaryStorageKey(workScope)) ?? "";
  } catch {
    return "";
  }
}

/**
 * 작품의 용어집 텍스트를 저장한다. 빈 텍스트면 키 자체를 지운다(빈 작품 설정을
 * 남기지 않는다). workScope가 없으면 작품에 귀속시킬 수 없어 저장하지 않는다.
 */
export function saveStudioDialogueGlossaryText(
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined,
  workScope: string | null | undefined,
  text: string
): void {
  if (!storage || !workScope) return;
  try {
    if (text === "") storage.removeItem(studioDialogueGlossaryStorageKey(workScope));
    else storage.setItem(studioDialogueGlossaryStorageKey(workScope), text);
  } catch {
    // 저장 실패(용량·프라이빗 모드)는 세션 내 사용을 막지 않는다 — 다음 로드에서만 비어 보인다.
  }
}

function browserLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * 작품의 저장된 용어집 텍스트를 IndexedDB에서 읽는다. 처음 읽을 때 구
 * localStorage 값을 검증 후 이관하고(migrateLocalStorageValueToIdb), IDB에
 * 값이 없거나 못 쓰는 환경이면 localStorage 폴백을 읽는다.
 */
export async function loadStudioDialogueGlossaryTextAsync(
  workScope: string | null | undefined
): Promise<string> {
  if (!workScope) return "";
  const key = studioDialogueGlossaryStorageKey(workScope);
  await migrateLocalStorageValueToIdb(key);
  const value = await idbKvGet(key);
  if (value !== null) return value;
  return loadStudioDialogueGlossaryText(browserLocalStorage(), workScope);
}

/**
 * 작품의 용어집 텍스트를 IndexedDB에 저장한다. 빈 텍스트면 양쪽 저장소에서
 * 키를 지운다. IDB 쓰기가 실패하는 환경에서는 localStorage가 정본 역할을
 * 이어받고, IDB에 쓴 뒤에는 낡은 localStorage 사본을 남기지 않는다.
 * 실패해도 throw 하지 않는다 — 저장 실패가 번역 작업을 막으면 안 된다.
 */
export async function saveStudioDialogueGlossaryTextAsync(
  workScope: string | null | undefined,
  text: string
): Promise<void> {
  if (!workScope) return;
  const key = studioDialogueGlossaryStorageKey(workScope);
  const storage = browserLocalStorage();
  try {
    if (text === "") {
      await idbKvRemove(key);
      saveStudioDialogueGlossaryText(storage, workScope, text);
      return;
    }
    const written = await idbKvSet(key, text);
    if (written) {
      try {
        storage?.removeItem(key);
      } catch {
        /* 정리 실패는 무시한다 — IDB 값이 우선한다. */
      }
    } else {
      saveStudioDialogueGlossaryText(storage, workScope, text);
    }
  } catch {
    // 위와 같은 경계: 저장 실패는 세션 내 사용을 막지 않는다.
  }
}
