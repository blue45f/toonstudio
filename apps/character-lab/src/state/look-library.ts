/**
 * "내 룩" 저장소 — 순수 로직(레시피 v3, 2026-10-23 S-1). 브라우저 바인딩(localStorage·파일 피커)은 `look-library.browser.ts`다.
 *
 * - 항목 = look/1 문서(계약 `character-look.ts`·`character-look-recipe.ts`) + 저장 시각 + 썸네일 참조. 범위(전체·의상·색·얼굴·화풍)를 골라 저장한다.
 * - 영속 저장은 주입한 `LookStorageLike`(브라우저는 localStorage)에 정규 JSON 한 키로 둔다. 캐릭터 랩에는 저장소 선례가 없어(레시피는 파일 피커,
 *   `recipe-io.browser.ts`) 작고 동기적인 localStorage를 고르고, 용량 상한(항목 60개·직렬화 1.5M자·썸네일 48K자)을 둔다.
 * - 실패는 throw 없이 한글 사유(LabFailure)로 돌려준다: 이름 비었음·길이·중복(정책에 따라)·가득 참·용량 초과·저장소 쓰기 거부(용량·보안)·손상된 저장본.
 *   손상된 저장본은 지우지 않고 백업 키로 옮긴 뒤 빈 목록으로 시작한다(사용자 데이터 무음 삭제 금지).
 * - `.look.json` 파일 내보내기·가져오기는 계약 `parseCharacterLook`(형식·범위 검사)을 쓰고, 직렬화는 키 정렬 정규형이다.
 */
import { z } from "zod";

import { CHARACTER_LOOK_FILE_SUFFIX, CHARACTER_LOOK_NAME_MAX, characterLookSchema, describeRecipeIssues, extractCharacterLook, failVisible, parseCharacterLook } from "../contracts";
import { stableStringify } from "../shared/stable-json";

import type { CharacterLook, CharacterRecipe, LabCommand, LabFailure, LookLockGroup, LookScope, ParseCharacterLookResult } from "../contracts";

export const LOOK_LIBRARY_FORMAT = "toonstudio.character-lab.look-library/1" as const;
/** localStorage 키(형식 판이 바뀌면 키도 바꾼다) */
export const LOOK_LIBRARY_STORAGE_KEY = "toonstudio.character-lab.look-library.v1";
/** 손상된 저장본을 옮겨 두는 키 */
export const LOOK_LIBRARY_BACKUP_KEY = `${LOOK_LIBRARY_STORAGE_KEY}.corrupt`;
export const LOOK_LIBRARY_MAX_ENTRIES = 60;
/**
 * 직렬화 문자 수 상한. 브라우저 localStorage 한도는 엔진마다 다르지만 원본당 대략 5백만 자 안팎이라 그 30 % 정도로 잡아
 * 다른 기능 몫을 남긴다(한도를 넘는 쓰기는 `look-storage-quota` 사유로 따로 잡는다).
 */
export const LOOK_LIBRARY_MAX_CHARS = 1_500_000;
/** 썸네일 data URL 하나의 문자 수 상한(128 px PNG·WebP면 충분) */
export const LOOK_THUMBNAIL_MAX_CHARS = 48_000;
export const LOOK_FILE_MIME = "application/json";

export type LookThumbnailRef = { readonly kind: "data-url"; readonly dataUrl: string } | { readonly kind: "cache-key"; readonly key: string };

export interface LookLibraryEntry {
  readonly look: CharacterLook;
  /** 처음 저장한 시각(epoch ms) */
  readonly savedAt: number;
  /** 마지막으로 바꾼 시각(이름 변경·덮어쓰기·썸네일) */
  readonly updatedAt: number;
  readonly thumbnail?: LookThumbnailRef;
}

export interface LookLibrary {
  readonly format: typeof LOOK_LIBRARY_FORMAT;
  readonly entries: readonly LookLibraryEntry[];
}

/** 같은 이름이 있을 때: 번호를 붙여 새로 저장 / 그 항목을 덮어쓰기 / 거부 */
export type LookDuplicatePolicy = "rename" | "replace" | "reject";

export type LookLibraryResult = { readonly ok: true; readonly library: LookLibrary; readonly entry: LookLibraryEntry } | { readonly ok: false; readonly failure: LabFailure };

const thumbnailSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("data-url"),
      dataUrl: z
        .string()
        .max(LOOK_THUMBNAIL_MAX_CHARS, `썸네일은 ${LOOK_THUMBNAIL_MAX_CHARS}자 이하여야 합니다.`)
        .regex(/^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/u, "썸네일은 PNG·WebP·JPEG base64 data URL이어야 합니다."),
    })
    .strict(),
  z.object({ kind: z.literal("cache-key"), key: z.string().min(1).max(512) }).strict(),
]);

const entrySchema = z
  .object({
    look: characterLookSchema,
    savedAt: z.number().int().min(0),
    updatedAt: z.number().int().min(0),
    thumbnail: thumbnailSchema.optional(),
  })
  .strict();

/** 저장본 전체 스키마(id 유일·이름 유일·항목 수 상한) */
export const lookLibrarySchema = z
  .object({ format: z.literal(LOOK_LIBRARY_FORMAT), entries: z.array(entrySchema).max(LOOK_LIBRARY_MAX_ENTRIES) })
  .strict()
  .superRefine((library, ctx) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    library.entries.forEach((entry, index) => {
      if (ids.has(entry.look.id)) ctx.addIssue({ code: "custom", message: `룩 id가 중복되었습니다: ${entry.look.id}`, path: ["entries", index, "look", "id"] });
      ids.add(entry.look.id);
      const name = normalizeLookName(entry.look.nameKo);
      if (names.has(name)) ctx.addIssue({ code: "custom", message: `룩 이름이 중복되었습니다: ${entry.look.nameKo}`, path: ["entries", index, "look", "nameKo"] });
      names.add(name);
    });
  });

export function createLookLibrary(): LookLibrary {
  return { format: LOOK_LIBRARY_FORMAT, entries: [] };
}

/** 이름 비교용 정규화(앞뒤 공백 제거·연속 공백 하나·라틴 소문자) */
export function normalizeLookName(nameKo: string): string {
  return nameKo.trim().replace(/\s+/gu, " ").toLowerCase();
}

function fail(code: string, reasonKo: string, now?: number): { readonly ok: false; readonly failure: LabFailure } {
  return { ok: false, failure: failVisible(code, reasonKo, undefined, now) };
}

/** 이름 검사: 공백 정리 뒤 1~40자 */
function cleanName(nameKo: string): string | null {
  const cleaned = nameKo.trim().replace(/\s+/gu, " ");
  return cleaned.length === 0 || cleaned.length > CHARACTER_LOOK_NAME_MAX ? null : cleaned;
}

function nameProblemKo(nameKo: string): string {
  return nameKo.trim().length === 0 ? "룩 이름이 비어 있습니다." : `룩 이름은 ${CHARACTER_LOOK_NAME_MAX}자 이하여야 합니다.`;
}

/** 중복 이름에 붙일 번호 이름: "이름 (2)", "이름 (3)" … (길이 상한을 넘으면 앞부분을 줄인다) */
function numberedName(base: string, taken: ReadonlySet<string>): string {
  for (let n = 2; n < 1000; n += 1) {
    const suffix = ` (${n})`;
    const candidate = `${base.slice(0, CHARACTER_LOOK_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(normalizeLookName(candidate))) return candidate;
  }
  return base;
}

/** 새 항목 id: `look-<저장 시각 36진>-<n>`(목록 안에서 유일, 계약 id 형식) */
function newLookId(library: LookLibrary, now: number): string {
  const taken = new Set(library.entries.map((entry) => entry.look.id));
  const stem = `look-${Math.max(0, Math.floor(now)).toString(36)}`;
  for (let n = 1; ; n += 1) {
    const id = `${stem}-${n}`;
    if (!taken.has(id)) return id;
  }
}

function checkThumbnail(thumbnail: LookThumbnailRef | undefined, now?: number): LabFailure | null {
  if (thumbnail === undefined) return null;
  const parsed = thumbnailSchema.safeParse(thumbnail);
  return parsed.success ? null : failVisible("look-thumbnail-invalid", `썸네일 참조가 올바르지 않습니다: ${describeRecipeIssues(parsed.error.issues)}`, undefined, now);
}

/** 용량 검사를 거쳐 목록을 확정한다. */
function finish(library: LookLibrary, entry: LookLibraryEntry, now?: number): LookLibraryResult {
  if (library.entries.length > LOOK_LIBRARY_MAX_ENTRIES) return fail("look-library-full", `내 룩은 최대 ${LOOK_LIBRARY_MAX_ENTRIES}개까지 저장할 수 있습니다. 쓰지 않는 룩을 지운 뒤 다시 저장하세요.`, now);
  const size = serializeLookLibrary(library).length;
  if (size > LOOK_LIBRARY_MAX_CHARS) return fail("look-library-too-large", `내 룩 저장 용량(${LOOK_LIBRARY_MAX_CHARS.toLocaleString("ko-KR")}자)을 넘습니다(${size.toLocaleString("ko-KR")}자). 썸네일이 큰 룩을 지우거나 범위를 줄여 저장하세요.`, now);
  return { ok: true, library, entry };
}

export interface AddLookOptions {
  readonly now: number;
  readonly onDuplicate?: LookDuplicatePolicy;
  readonly thumbnail?: LookThumbnailRef;
}

/**
 * look/1 문서를 목록에 넣는다(맨 앞). 같은 id가 있으면 새 id를 준다(가져오기). 같은 이름은 정책대로:
 * rename(기본) = "이름 (2)", replace = 그 항목을 덮어씀(id·처음 저장 시각 유지), reject = `look-name-duplicate` 실패.
 */
export function addLookToLibrary(library: LookLibrary, look: CharacterLook, options: AddLookOptions): LookLibraryResult {
  const { now } = options;
  const parsed = characterLookSchema.safeParse(look);
  if (!parsed.success) return fail("look-invalid", `룩 형식이 올바르지 않습니다: ${describeRecipeIssues(parsed.error.issues)}`, now);
  const thumbnailProblem = checkThumbnail(options.thumbnail, now);
  if (thumbnailProblem) return { ok: false, failure: thumbnailProblem };
  const name = cleanName(parsed.data.nameKo);
  if (name === null) return fail("look-name-invalid", nameProblemKo(parsed.data.nameKo), now);
  const policy = options.onDuplicate ?? "rename";
  const duplicate = library.entries.find((entry) => normalizeLookName(entry.look.nameKo) === normalizeLookName(name));
  const thumbnail = options.thumbnail ? { thumbnail: options.thumbnail } : {};
  if (duplicate && policy === "reject") return fail("look-name-duplicate", `같은 이름의 룩이 이미 있습니다: ${duplicate.look.nameKo}`, now);
  if (duplicate && policy === "replace") {
    const entry: LookLibraryEntry = { look: { ...parsed.data, id: duplicate.look.id, nameKo: duplicate.look.nameKo }, savedAt: duplicate.savedAt, updatedAt: now, ...thumbnail };
    const entries = [entry, ...library.entries.filter((item) => item !== duplicate)];
    return finish({ format: LOOK_LIBRARY_FORMAT, entries }, entry, now);
  }
  const taken = new Set(library.entries.map((entry) => normalizeLookName(entry.look.nameKo)));
  const finalName = duplicate ? numberedName(name, taken) : name;
  const idTaken = library.entries.some((entry) => entry.look.id === parsed.data.id);
  const id = idTaken ? newLookId(library, now) : parsed.data.id;
  const entry: LookLibraryEntry = { look: { ...parsed.data, id, nameKo: finalName }, savedAt: now, updatedAt: now, ...thumbnail };
  return finish({ format: LOOK_LIBRARY_FORMAT, entries: [entry, ...library.entries] }, entry, now);
}

export interface SaveLookRequest extends AddLookOptions {
  readonly recipe: CharacterRecipe;
  readonly scope: LookScope;
  readonly nameKo: string;
  readonly locks?: readonly LookLockGroup[];
  readonly seed?: number;
}

/** 지금 레시피의 범위를 뽑아 내 룩으로 저장한다(계약 `extractCharacterLook`). */
export function saveLookToLibrary(library: LookLibrary, request: SaveLookRequest): LookLibraryResult {
  const name = cleanName(request.nameKo);
  if (name === null) return fail("look-name-invalid", nameProblemKo(request.nameKo), request.now);
  let look: CharacterLook;
  try {
    look = extractCharacterLook(request.recipe, request.scope, {
      id: newLookId(library, request.now),
      nameKo: name,
      ...(request.locks ? { locks: request.locks } : {}),
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
    });
  } catch (error) {
    return { ok: false, failure: failVisible("look-extract-failed", `룩을 만들 수 없습니다: ${error instanceof Error ? error.message : String(error)}`, error, request.now) };
  }
  return addLookToLibrary(library, look, request);
}

/** 이름 바꾸기(다른 항목과 같은 이름이면 거부) */
export function renameLookInLibrary(library: LookLibrary, id: string, nameKo: string, now: number): LookLibraryResult {
  const target = library.entries.find((entry) => entry.look.id === id);
  if (!target) return fail("look-not-found", `내 룩에 없는 항목입니다: ${id}`, now);
  const name = cleanName(nameKo);
  if (name === null) return fail("look-name-invalid", nameProblemKo(nameKo), now);
  const clash = library.entries.find((entry) => entry !== target && normalizeLookName(entry.look.nameKo) === normalizeLookName(name));
  if (clash) return fail("look-name-duplicate", `같은 이름의 룩이 이미 있습니다: ${clash.look.nameKo}`, now);
  const entry: LookLibraryEntry = { ...target, look: { ...target.look, nameKo: name }, updatedAt: now };
  return finish({ format: LOOK_LIBRARY_FORMAT, entries: library.entries.map((item) => (item === target ? entry : item)) }, entry, now);
}

/** 썸네일 참조 바꾸기(null이면 지운다) */
export function setLookThumbnail(library: LookLibrary, id: string, thumbnail: LookThumbnailRef | null, now: number): LookLibraryResult {
  const target = library.entries.find((entry) => entry.look.id === id);
  if (!target) return fail("look-not-found", `내 룩에 없는 항목입니다: ${id}`, now);
  const problem = checkThumbnail(thumbnail ?? undefined, now);
  if (problem) return { ok: false, failure: problem };
  const entry: LookLibraryEntry = { look: target.look, savedAt: target.savedAt, updatedAt: now, ...(thumbnail ? { thumbnail } : {}) };
  return finish({ format: LOOK_LIBRARY_FORMAT, entries: library.entries.map((item) => (item === target ? entry : item)) }, entry, now);
}

/** 항목 지우기(없으면 같은 목록) */
export function removeLookFromLibrary(library: LookLibrary, id: string): LookLibrary {
  const entries = library.entries.filter((entry) => entry.look.id !== id);
  return entries.length === library.entries.length ? library : { format: LOOK_LIBRARY_FORMAT, entries };
}

export function findLook(library: LookLibrary, id: string): LookLibraryEntry | undefined {
  return library.entries.find((entry) => entry.look.id === id);
}

/** 화면 목록: 최근에 바꾼 순(같으면 id 순), 범위로 거를 수 있다 */
export function listLibraryLooks(library: LookLibrary, scope?: LookScope): readonly LookLibraryEntry[] {
  return library.entries
    .filter((entry) => scope === undefined || entry.look.scope === scope)
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt || a.look.id.localeCompare(b.look.id));
}

/** 내 룩 적용 명령(history 1단계) */
export function lookApplyCommand(look: CharacterLook): Extract<LabCommand, { readonly type: "look-preset/apply" }> {
  return { type: "look-preset/apply", look };
}

// ---------------------------------------------------------------- 직렬화·저장소

/** 저장용 정규 JSON(키 정렬·한 줄) */
export function serializeLookLibrary(library: LookLibrary): string {
  return stableStringify(library);
}

export type ParseLookLibraryResult = { readonly ok: true; readonly library: LookLibrary } | { readonly ok: false; readonly failure: LabFailure };

export function parseLookLibraryText(text: string, now?: number): ParseLookLibraryResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, failure: failVisible("look-library-json", `저장된 내 룩 목록이 올바른 JSON이 아닙니다: ${error instanceof Error ? error.message : String(error)}`, error, now) };
  }
  if (typeof json !== "object" || json === null || (json as { format?: unknown }).format !== LOOK_LIBRARY_FORMAT) {
    return fail("look-library-format", `내 룩 목록 형식이 아닙니다(format이 ${LOOK_LIBRARY_FORMAT}이어야 합니다).`, now);
  }
  const parsed = lookLibrarySchema.safeParse(json);
  if (!parsed.success) return fail("look-library-invalid", `저장된 내 룩 목록이 올바르지 않습니다: ${describeRecipeIssues(parsed.error.issues)}`, now);
  return { ok: true, library: parsed.data };
}

/** `Storage`의 필요한 부분(브라우저 localStorage, 시험은 Map 기반 가짜) */
export interface LookStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LookLibraryLoadResult {
  readonly library: LookLibrary;
  /** 저장본을 읽지 못했을 때(목록은 빈 목록으로 시작한다) */
  readonly failure?: LabFailure;
}

export interface LookLibraryStore {
  load(): LookLibraryLoadResult;
  save(library: LookLibrary): { readonly ok: true } | { readonly ok: false; readonly failure: LabFailure };
}

/** 저장소 쓰기 예외 → 한글 사유(용량·보안·그 밖) */
export function storageFailure(error: unknown, now?: number): LabFailure {
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  const code = typeof error === "object" && error !== null && "code" in error ? Number((error as { code: unknown }).code) : Number.NaN;
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014) {
    return failVisible("look-storage-quota", "브라우저 저장 공간이 가득 차 내 룩을 저장하지 못했습니다. 쓰지 않는 룩을 지우거나 파일로 내보내세요.", error, now);
  }
  if (name === "SecurityError") return failVisible("look-storage-unavailable", "이 브라우저 설정에서는 저장소를 쓸 수 없어 내 룩을 저장하지 못했습니다(사이트 데이터 차단).", error, now);
  return failVisible("look-storage-failed", `내 룩을 저장하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`, error, now);
}

/** 주입한 저장소 위의 내 룩 저장·불러오기. 손상된 저장본은 백업 키로 옮기고 빈 목록과 사유를 돌려준다. */
export function createLookLibraryStore(storage: LookStorageLike, now: () => number = () => 0): LookLibraryStore {
  return {
    load() {
      let text: string | null;
      try {
        text = storage.getItem(LOOK_LIBRARY_STORAGE_KEY);
      } catch (error) {
        return { library: createLookLibrary(), failure: storageFailure(error, now()) };
      }
      if (text === null) return { library: createLookLibrary() };
      const parsed = parseLookLibraryText(text, now());
      if (parsed.ok) return { library: parsed.library };
      let backup = `원본은 저장소 키 ${LOOK_LIBRARY_BACKUP_KEY}에 옮겨 두었습니다.`;
      try {
        storage.setItem(LOOK_LIBRARY_BACKUP_KEY, text);
        storage.removeItem(LOOK_LIBRARY_STORAGE_KEY);
      } catch (error) {
        backup = `원본을 옮기지 못해 그대로 두었습니다(${storageFailure(error).reasonKo}).`;
      }
      return { library: createLookLibrary(), failure: failVisible(parsed.failure.code, `${parsed.failure.reasonKo} 빈 목록으로 시작합니다. ${backup}`, undefined, now()) };
    },
    save(library) {
      try {
        storage.setItem(LOOK_LIBRARY_STORAGE_KEY, serializeLookLibrary(library));
        return { ok: true };
      } catch (error) {
        return { ok: false, failure: storageFailure(error, now()) };
      }
    },
  };
}

// ---------------------------------------------------------------- .look.json 파일

/** 파일용 정규 JSON(키 정렬·2칸 들여쓰기·끝 개행) */
export function serializeLookFile(look: CharacterLook): string {
  const canonical: unknown = JSON.parse(stableStringify(look));
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

/** `<id>.look.json`(id는 파일 이름에 안전한 소문자 식별자다) */
export function lookFileName(look: CharacterLook): string {
  return `${look.id}${CHARACTER_LOOK_FILE_SUFFIX}`;
}

export function parseLookFileText(text: string, now?: number): ParseCharacterLookResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, failure: failVisible("look-json-syntax", `룩 파일이 올바른 JSON이 아닙니다: ${error instanceof Error ? error.message : String(error)}`, error, now) };
  }
  return parseCharacterLook(json, now);
}

/** 파일 내용을 내 룩에 넣는다(형식·범위 검사 → 이름·id 충돌 처리). */
export function importLookFileText(library: LookLibrary, text: string, options: AddLookOptions): LookLibraryResult {
  const parsed = parseLookFileText(text, options.now);
  if (!parsed.ok) return parsed;
  return addLookToLibrary(library, parsed.look, options);
}
