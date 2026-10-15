/**
 * 원고 사본 보관소.
 *
 * "원고에서 보기"가 장면의 원문을 다시 열려면 가져온 원고가 필요하다. 문서(스토리월드 설정)에는
 * 짧은 발췌와 글자 위치만 넣기 때문에, 원고 사본은 이 기기의 보조 저장소에 따로 둔다. 네트워크로
 * 보내지 않는다.
 *
 * 보조 저장소는 키 하나에 1.1MB 한도가 있고 한글은 글자당 3바이트(제어 문자가 많으면 JSON에서 6바이트)라서,
 * 사본을 18만 글자 조각으로 나눠 조각마다 한 키에 저장한다(최대 100만 글자 = 6조각). 조각을 먼저 쓰고 색인을 나중에
 * 갱신하므로, 저장이 중간에 끊겨도 색인이 없는 조각을 가리키지 않는다. 사본은 작품당 최대 6개이고
 * 넘치면 가장 오래된 것부터 비운다.
 *
 * 사본 id는 내용 지문이다. 불러올 때 지문을 다시 계산해 맞는지 확인하므로, 조각이 일부 사라지거나
 * 바뀌면 "손상됨"으로 알리고 엉뚱한 원문을 보여 주지 않는다.
 */
import { storyworldAuxStore } from "../universe-store";
import { MANUSCRIPT_MAX_CHARS } from "./studio-story-manuscript-extractor";
import { manuscriptFingerprint } from "./studio-story-manuscript-project";

export const MANUSCRIPT_STORE_CHUNK_CHARS = 180_000;
export const MANUSCRIPT_STORE_MAX_COPIES = 6;

export interface ManuscriptKeyValueStore {
  load(key: string): Promise<string | null>;
  save(key: string, payload: string): Promise<void>;
}

export interface ManuscriptCopyInfo {
  readonly copyId: string;
  readonly length: number;
  readonly chunks: number;
  readonly savedAtIso: string;
}

export type ManuscriptLoadResult =
  | { readonly status: "ok"; readonly text: string; readonly info: ManuscriptCopyInfo }
  | { readonly status: "missing" }
  | { readonly status: "corrupted"; readonly info: ManuscriptCopyInfo };

function indexKey(scopeKey: string): string {
  return `toonspectrum:storyworld-manuscripts:v1:${scopeKey}`;
}

function chunkKey(scopeKey: string, copyId: string, position: number): string {
  return `${indexKey(scopeKey)}:${copyId}:${position}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIndex(raw: string | null): readonly ManuscriptCopyInfo[] {
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.copies)) return [];
  const rawCopies: readonly unknown[] = value.copies;
  const copies: ManuscriptCopyInfo[] = [];
  for (const item of rawCopies) {
    if (!isRecord(item)) continue;
    const { copyId, length, chunks, savedAtIso } = item;
    if (
      typeof copyId === "string" && copyId.length > 0
      && typeof length === "number" && Number.isSafeInteger(length) && length >= 0 && length <= MANUSCRIPT_MAX_CHARS
      && typeof chunks === "number" && Number.isSafeInteger(chunks) && chunks >= 0 && chunks <= 8
      && typeof savedAtIso === "string"
    ) {
      copies.push({ copyId, length, chunks, savedAtIso });
    }
  }
  return copies.slice(0, MANUSCRIPT_STORE_MAX_COPIES);
}

/** 글자 위치 기준으로 조각을 나눈다. 대리쌍(이모지 등)의 한가운데에서는 자르지 않는다. */
export function splitManuscriptChunks(text: string, size: number = MANUSCRIPT_STORE_CHUNK_CHARS): readonly string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const last = text.charCodeAt(end - 1);
      if (last >= 0xd800 && last <= 0xdbff) end -= 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

export function createManuscriptStore(kv: ManuscriptKeyValueStore) {
  /** 색인을 읽고 고쳐 쓰는 작업을 한 줄로 세운다(저장이 겹쳐도 서로 덮어쓰지 않게). */
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.catch(() => undefined).then(task);
    tail = next;
    return next;
  };

  const readIndex = async (scopeKey: string) => parseIndex(await kv.load(indexKey(scopeKey)));
  const writeIndex = (scopeKey: string, copies: readonly ManuscriptCopyInfo[]) =>
    kv.save(indexKey(scopeKey), JSON.stringify({ version: 1, copies }));
  const blankChunks = async (scopeKey: string, info: ManuscriptCopyInfo) => {
    for (let position = 0; position < info.chunks; position += 1) {
      try {
        await kv.save(chunkKey(scopeKey, info.copyId, position), "");
      } catch {
        // 비우기는 공간을 돌려받으려는 시도일 뿐이다. 실패해도 색인에서 빠졌으므로 다시 읽히지 않는다.
      }
    }
  };

  return {
    list(scopeKey: string): Promise<readonly ManuscriptCopyInfo[]> {
      return readIndex(scopeKey);
    },

    async load(scopeKey: string, copyId: string): Promise<ManuscriptLoadResult> {
      await tail.catch(() => undefined);
      const info = (await readIndex(scopeKey)).find((item) => item.copyId === copyId);
      if (!info) return { status: "missing" };
      const parts: string[] = [];
      for (let position = 0; position < info.chunks; position += 1) {
        const part = await kv.load(chunkKey(scopeKey, copyId, position));
        if (part === null) return { status: "corrupted", info };
        parts.push(part);
      }
      const text = parts.join("");
      if (text.length !== info.length || manuscriptFingerprint(text) !== copyId) return { status: "corrupted", info };
      return { status: "ok", text, info };
    },

    save(scopeKey: string, text: string, savedAtIso: string): Promise<ManuscriptCopyInfo> {
      if (text.length === 0) return Promise.reject(new Error("저장할 원고가 비어 있어요."));
      if (text.length > MANUSCRIPT_MAX_CHARS) {
        return Promise.reject(new Error(`원고가 너무 길어요. ${MANUSCRIPT_MAX_CHARS.toLocaleString("ko-KR")}자 이하로 나눠 넣어 주세요.`));
      }
      return serialize(async () => {
        const copyId = manuscriptFingerprint(text);
        const chunks = splitManuscriptChunks(text);
        for (let position = 0; position < chunks.length; position += 1) {
          await kv.save(chunkKey(scopeKey, copyId, position), chunks[position] ?? "");
        }
        const info: ManuscriptCopyInfo = { copyId, length: text.length, chunks: chunks.length, savedAtIso };
        const before = await readIndex(scopeKey);
        const others = before.filter((item) => item.copyId !== copyId);
        const ordered = [info, ...others].slice(0, MANUSCRIPT_STORE_MAX_COPIES);
        const evicted = [info, ...others].slice(MANUSCRIPT_STORE_MAX_COPIES);
        await writeIndex(scopeKey, ordered);
        for (const old of evicted) await blankChunks(scopeKey, old);
        return info;
      });
    },

    remove(scopeKey: string, copyId: string): Promise<void> {
      return serialize(async () => {
        const before = await readIndex(scopeKey);
        const target = before.find((item) => item.copyId === copyId);
        if (!target) return;
        await writeIndex(scopeKey, before.filter((item) => item.copyId !== copyId));
        await blankChunks(scopeKey, target);
      });
    },
  };
}

export const storyworldManuscriptStore = createManuscriptStore(storyworldAuxStore);
