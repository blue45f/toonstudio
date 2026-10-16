/**
 * 투고 패키지 — 쓰던 글의 브라우저 저장.
 *
 * 작품 소개·회차 번호/제목/메모·점검 기준 같은 **글만** 이 브라우저(localStorage)에 프로젝트별로 남긴다.
 * 고른 이미지 파일은 저장하지 않는다(파일은 다시 골라야 한다) — 이미지 바이트가 저장소에 쌓이거나 다른 곳으로
 * 나가지 않게 하려는 의도다. 저장소가 막힌 환경에서도 화면은 메모리 상태로 동작한다.
 */
import { SUBMISSION_PACKAGE_LIMITS, type SubmissionTargetWidthId } from "./submission-package-types";

export const SUBMISSION_DRAFT_STORAGE_VERSION = 1;

export function submissionDraftStorageKey(projectId: string): string {
  return `toonstudio:submission-package:v1:${encodeURIComponent(projectId)}`;
}

export type SubmissionCoverLocaleChoice = "auto" | "ko" | "en";

export interface SubmissionDraftEpisodeMeta {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly note: string;
}

export interface SubmissionDraftText {
  readonly title: string;
  readonly authorName: string;
  readonly logline: string;
  readonly synopsis: string;
  readonly targetWidth: SubmissionTargetWidthId;
  readonly includeCoverPdf: boolean;
  readonly coverLocale: SubmissionCoverLocaleChoice;
  readonly episodes: readonly SubmissionDraftEpisodeMeta[];
  /** 캐릭터를 직접 켜거나 끈 선택. 기록이 없는 캐릭터는 시트에 내용이 있으면 담긴다. */
  readonly characterOverrides: Readonly<Record<string, boolean>>;
}

export interface SubmissionDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const TARGET_WIDTH_IDS: readonly SubmissionTargetWidthId[] = ["naver", "kakao", "canvas", "hires", "any"];
const COVER_LOCALES: readonly SubmissionCoverLocaleChoice[] = ["auto", "ko", "en"];
/** 저장된 글을 읽을 때 한 칸에 허용하는 길이. 점검 상한보다 넉넉하게 두어 사용자가 줄이도록 안내한다. */
const STORED_TEXT_MAX = 20_000;
const STORED_ID_MAX = 200;
const STORED_EPISODES_MAX = SUBMISSION_PACKAGE_LIMITS.maxEpisodes;
const STORED_OVERRIDES_MAX = 500;

export const EMPTY_SUBMISSION_DRAFT_TEXT: SubmissionDraftText = Object.freeze({
  title: "",
  authorName: "",
  logline: "",
  synopsis: "",
  targetWidth: "naver",
  includeCoverPdf: true,
  coverLocale: "auto",
  episodes: Object.freeze([]),
  characterOverrides: Object.freeze({}),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = STORED_TEXT_MAX): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function episodeMeta(value: unknown): SubmissionDraftEpisodeMeta | null {
  if (!isRecord(value)) return null;
  const id = text(value.id, STORED_ID_MAX).trim();
  const { number } = value;
  if (!id || typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) return null;
  return { id, number, title: text(value.title, 500), note: text(value.note, 2_000) };
}

/** 저장된 JSON 문자열에서 유효한 값만 꺼낸다. 깨진 JSON·낯선 모양·다른 버전은 `null`(=저장된 글 없음). */
export function parseSubmissionDraftText(raw: string | null): SubmissionDraftText | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== SUBMISSION_DRAFT_STORAGE_VERSION) return null;
  const targetWidth = TARGET_WIDTH_IDS.find((id) => id === parsed.targetWidth) ?? EMPTY_SUBMISSION_DRAFT_TEXT.targetWidth;
  const coverLocale = COVER_LOCALES.find((id) => id === parsed.coverLocale) ?? EMPTY_SUBMISSION_DRAFT_TEXT.coverLocale;
  const episodes: SubmissionDraftEpisodeMeta[] = [];
  const seen = new Set<string>();
  if (Array.isArray(parsed.episodes)) {
    for (const entry of parsed.episodes.slice(0, STORED_EPISODES_MAX)) {
      const meta = episodeMeta(entry);
      if (meta && !seen.has(meta.id)) {
        seen.add(meta.id);
        episodes.push(meta);
      }
    }
  }
  const overrides: Record<string, boolean> = {};
  if (isRecord(parsed.characterOverrides)) {
    for (const [key, value] of Object.entries(parsed.characterOverrides).slice(0, STORED_OVERRIDES_MAX)) {
      if (typeof value === "boolean" && key.length > 0 && key.length <= STORED_ID_MAX) overrides[key] = value;
    }
  }
  return {
    title: text(parsed.title, 500),
    authorName: text(parsed.authorName, 500),
    logline: text(parsed.logline),
    synopsis: text(parsed.synopsis),
    targetWidth,
    includeCoverPdf: typeof parsed.includeCoverPdf === "boolean" ? parsed.includeCoverPdf : EMPTY_SUBMISSION_DRAFT_TEXT.includeCoverPdf,
    coverLocale,
    episodes,
    characterOverrides: overrides,
  };
}

export function serializeSubmissionDraftText(value: SubmissionDraftText): string {
  return JSON.stringify({ version: SUBMISSION_DRAFT_STORAGE_VERSION, ...value });
}

export function readSubmissionDraftText(storage: SubmissionDraftStorage, projectId: string): SubmissionDraftText | null {
  try {
    return parseSubmissionDraftText(storage.getItem(submissionDraftStorageKey(projectId)));
  } catch {
    return null;
  }
}

/** 저장에 성공했는가. 막히거나 가득 찬 저장소에서는 `false` — 화면은 계속 동작한다. */
export function writeSubmissionDraftText(storage: SubmissionDraftStorage, projectId: string, value: SubmissionDraftText): boolean {
  try {
    storage.setItem(submissionDraftStorageKey(projectId), serializeSubmissionDraftText(value));
    return true;
  } catch {
    return false;
  }
}
