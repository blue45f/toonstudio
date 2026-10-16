/**
 * 숨긴 의견 표시 — 작가가 "이 의견은 대표 목록에서 빼고 싶다"고 한 응답 id 를 이 브라우저에만 기억한다.
 *
 * 응답 데이터 자체는 저장하지 않는다(파일이 정본이다). 숨김은 표시 설정일 뿐이라
 * 집계 숫자를 바꾸지 않고, 파일로 내보내지도 않으며, 서버로 보내지도 않는다.
 * 저장소가 막혀 있거나 값이 깨졌으면 숨김 없이 시작하고 화면은 그대로 동작한다.
 */
import { z } from "zod";

export const READER_FEEDBACK_HIDDEN_KEY = "toonspectrum:reader-feedback-hidden:v1";
export const READER_FEEDBACK_HIDDEN_MAX = 1_000;

const hiddenSchema = z.strictObject({
  version: z.literal(1),
  ids: z.array(z.string().regex(/^[A-Za-z0-9._:-]{1,80}$/u)).max(READER_FEEDBACK_HIDDEN_MAX),
});

/** 읽기에 필요한 Storage 의 일부. */
export type HiddenStorageReader = Pick<Storage, "getItem">;
export type HiddenStorageWriter = Pick<Storage, "setItem">;

/** 저장된 숨김 id. 없거나 깨졌거나 크기 제한을 넘으면 빈 집합이다. */
export function loadHiddenResponseIds(storage: HiddenStorageReader | null | undefined): ReadonlySet<string> {
  if (!storage) return new Set<string>();
  try {
    const raw = storage.getItem(READER_FEEDBACK_HIDDEN_KEY);
    if (!raw || raw.length > 120_000) return new Set<string>();
    const parsed = hiddenSchema.safeParse(JSON.parse(raw));
    return parsed.success ? new Set(parsed.data.ids) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

/** 숨김 id 를 저장한다. 상한을 넘으면 오래 전에 숨긴 것부터 잊는다. 저장하지 못하면 false. */
export function saveHiddenResponseIds(storage: HiddenStorageWriter | null | undefined, ids: ReadonlySet<string>): boolean {
  if (!storage) return false;
  try {
    const kept = [...ids].slice(-READER_FEEDBACK_HIDDEN_MAX);
    storage.setItem(READER_FEEDBACK_HIDDEN_KEY, JSON.stringify({ version: 1, ids: kept }));
    return true;
  } catch {
    return false;
  }
}

/** 숨김을 켜거나 끈 새 집합. 입력 집합은 바꾸지 않는다. */
export function toggleHiddenResponseId(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
}
