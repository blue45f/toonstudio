import { getAuthUserId } from "@/domains/auth/public/session/auth-session-state";

/**
 * 뷰어 읽던 위치 — 이 브라우저에 남기는 로컬 기록.
 *
 * 회차별 진도는 서버 계약에 없어서(2026-10-05 실측) 로컬 저장으로만 신설했다.
 * 계정이 바뀌면 이전 계정의 읽던 위치가 새지 않도록 저장 키를 소유자별로 나눈다
 * (컷츠·캐릭터챗과 같은 소유자 파티션 방식). 서버 동기화가 생기면 이 모듈의
 * 읽기/쓰기 지점만 교체하면 된다.
 */
export interface ReaderProgress {
  /** 마지막으로 읽은 회차 번호 */
  readonly episode: number;
  /** 그 회차에서 읽은 비율 (0~1) */
  readonly ratio: number;
  /** 마지막 기록 시각 (epoch ms) */
  readonly updatedAt: number;
}

const STORAGE_PREFIX = "toonstudio.reader-progress.v1.";
/** 작품 수가 늘어도 저장소가 무한히 커지지 않게 최근 기록만 남긴다. */
const MAX_ENTRIES = 60;

type ProgressMap = Record<string, ReaderProgress>;

function storageKey(): string {
  return `${STORAGE_PREFIX}${getAuthUserId() ?? "guest"}`;
}

function readMap(): ProgressMap {
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const map: ProgressMap = {};
    for (const [slug, value] of Object.entries(parsed)) {
      if (typeof value !== "object" || value === null) continue;
      const record = value as Record<string, unknown>;
      const episode = record.episode;
      const ratio = record.ratio;
      const updatedAt = record.updatedAt;
      if (
        typeof episode === "number" && Number.isInteger(episode) && episode >= 1 &&
        typeof ratio === "number" && Number.isFinite(ratio) &&
        typeof updatedAt === "number" && Number.isFinite(updatedAt)
      ) {
        map[slug] = { episode, ratio: Math.min(1, Math.max(0, ratio)), updatedAt };
      }
    }
    return map;
  } catch {
    return {};
  }
}

function writeMap(map: ProgressMap): void {
  try {
    const entries = Object.entries(map)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_ENTRIES);
    window.localStorage.setItem(storageKey(), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // 저장 공간 부족·시크릿 모드 등에서는 조용히 포기한다. 읽기 자체는 막지 않는다.
  }
}

export function getReaderProgress(slug: string): ReaderProgress | null {
  if (!slug || typeof window === "undefined") return null;
  return readMap()[slug] ?? null;
}

export function setReaderProgress(slug: string, episode: number, ratio: number): void {
  if (!slug || typeof window === "undefined") return;
  if (!Number.isInteger(episode) || episode < 1 || !Number.isFinite(ratio)) return;
  const map = readMap();
  map[slug] = {
    episode,
    ratio: Math.min(1, Math.max(0, ratio)),
    updatedAt: Date.now(),
  };
  writeMap(map);
}

/** 이어보기로 제안할 만한 진도인지 — 시작 직후나 완독 직전은 제안하지 않는다. */
export function isResumable(progress: ReaderProgress | null): boolean {
  return progress !== null && progress.ratio > 0.02 && progress.ratio < 0.98;
}
