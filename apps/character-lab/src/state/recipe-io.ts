/**
 * 레시피 파일 직렬화. 키 정렬·2칸 들여쓰기·끝 개행의 정규형이라 `serialize(deserialize(text)) === text`다.
 * 손상된 JSON·스키마 위반은 한글 사유의 LabFailure로 돌려준다(throw 없음).
 *
 * 브라우저 파일 열기·저장(`recipe-io.browser.ts`)이 쓰는 capability 판정(`openMethodFor`/`saveMethodFor`)과
 * 취소 판정(`isAbortError`)은 순수 함수라 여기 두고 Node 테스트로 검증한다.
 */
import { RECIPE_VERSION, failVisible, parseRecipe, recipeDigest } from "../contracts";
import { stableStringify } from "../shared/stable-json";

import type { CharacterRecipe, ParseRecipeResult } from "../contracts";

export const RECIPE_MIME_TYPE = "application/json";
export const RECIPE_FILE_EXTENSION = ".json";
export const RECIPE_FILE_NAME_PATTERN = /^character-[0-9a-f]{8}\.json$/u;

/** 정규형 JSON 텍스트(키 정렬, 들여쓰기 2, 끝 개행 1) */
export function serializeRecipe(recipe: CharacterRecipe): string {
  const canonical: unknown = JSON.parse(stableStringify(recipe));
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

/**
 * JSON 구문 오류는 `recipe-json-syntax`, 스키마·버전 오류는 parseRecipe의 코드를 그대로 쓴다.
 * v1 파일은 parseRecipe가 v2로 명시 변환하며 성공 결과의 `migratedFrom`(=1)으로 알린다(`recipeMigrationNoticeKo`로 안내문을 만든다).
 * 변환된 레시피를 다시 직렬화하면 입력 텍스트와 달리 `"version": 2`다(무음 변환이 아니라 저장 시 새 형식이 된다).
 */
export function deserializeRecipe(text: string, now?: number): ParseRecipeResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, failure: failVisible("recipe-json-syntax", `레시피 파일이 올바른 JSON이 아닙니다: ${message}`, error, now) };
  }
  return parseRecipe(json, now);
}

/**
 * 낡은 버전의 레시피 파일을 현재 형식으로 변환해 열었을 때 사용자에게 보여 줄 안내(실패가 아니다).
 * 변환이 없었거나 불러오기가 실패한 결과는 null이다. 호출자(불러오기 UI)가 상태 문구로 보인다.
 */
export function recipeMigrationNoticeKo(result: ParseRecipeResult): string | null {
  if (!result.ok || result.migratedFrom === undefined) return null;
  return `레시피 v${result.migratedFrom} 파일을 현재 형식(v${RECIPE_VERSION})으로 변환해 열었습니다. 저장하면 v${RECIPE_VERSION} 파일로 기록됩니다.`;
}

/** `character-<digest 앞 8자리>.json` */
export function recipeFileName(recipe: CharacterRecipe): string {
  return `character-${recipeDigest(recipe).slice(0, 8)}${RECIPE_FILE_EXTENSION}`;
}

// ---- 브라우저 파일 접근 capability 판정(순수) ----

/** File System Access API 존재 여부만 보는 최소 호스트 형태(window 또는 테스트용 객체) */
export interface FileAccessHost {
  readonly showOpenFilePicker?: unknown;
  readonly showSaveFilePicker?: unknown;
}

export type OpenMethod = "file-system-access" | "input-file";
export type SaveMethod = "file-system-access" | "anchor-download";

/** 어떤 열기 경로를 쓸지: `showOpenFilePicker`가 함수면 File System Access, 아니면 `<input type="file">` */
export function openMethodFor(host: FileAccessHost): OpenMethod {
  return typeof host.showOpenFilePicker === "function" ? "file-system-access" : "input-file";
}

/** 어떤 저장 경로를 쓸지: `showSaveFilePicker`가 함수면 File System Access, 아니면 `<a download>` */
export function saveMethodFor(host: FileAccessHost): SaveMethod {
  return typeof host.showSaveFilePicker === "function" ? "file-system-access" : "anchor-download";
}

/** 사용자가 피커를 취소했을 때의 오류(DOMException/Error name "AbortError"). 취소는 실패가 아니라 null 결과다. */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
