// 회차 메타데이터 스냅샷 공급 계층.
//
// 수집은 로컬 수동 도구(scripts/crawl-episodes.mjs)만 수행하고, 결과는 번들 스냅샷
// apps/api/data/title-episodes.json 으로 커밋된다. 배포된 API는 catalog-file 과 같은
// 규약으로 부팅 시(첫 상세 요청 시) 한 번 읽어 작품 상세 응답 루트에 episodes 를 붙인다.
// 스냅샷이 없거나 손상됐으면 회차 없이 기존 상세를 그대로 돌려준다(빈 상태가 정직한 폴백).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import type { Title, TitleEpisode, TitleEpisodeEntry } from "@toonstudio/contracts/types";

const CANDIDATES = [
  "apps/api/data/title-episodes.json",
  "apps/api/data/title-episodes.json.gz",
  "data/title-episodes.json",
  "data/title-episodes.json.gz",
  "title-episodes.json",
  "title-episodes.json.gz",
];

type EnvLike = Partial<Record<string, string | undefined>>;

// 환경변수로 경로를 지정하면 그 파일만 사용한다. 미지정이면 번들 후보를 상위 디렉터리까지 찾는다.
export function resolveTitleEpisodesFile(env: EnvLike = process.env): string | null {
  const raw = env.WEBDEX_EPISODES_FILE;
  if (raw) {
    const resolved = path.resolve(raw);
    return existsSync(resolved) ? resolved : null;
  }

  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    for (const relativePath of CANDIDATES) {
      const candidate = path.resolve(dir, relativePath);
      if (existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 웹 경계(title-episodes.ts)와 같은 검증 규칙 — 형식이 어긋난 회차는 버리고,
// 남은 게 없으면 항목 자체를 무효로 본다(지어낸 빈 회차 목록을 공급하지 않기 위해).
export function parseTitleEpisode(value: unknown): TitleEpisode | null {
  if (!isRecord(value)) return null;
  const number = value.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1) return null;
  const episode: { -readonly [K in keyof TitleEpisode]: TitleEpisode[K] } = { number };
  if (typeof value.title === "string" && value.title.trim()) episode.title = value.title;
  if (typeof value.publishedAt === "string" && value.publishedAt.trim()) {
    episode.publishedAt = value.publishedAt;
  }
  if (typeof value.likes === "number" && Number.isFinite(value.likes) && value.likes >= 0) {
    episode.likes = value.likes;
  }
  if (typeof value.thumbnailUrl === "string" && value.thumbnailUrl.trim()) {
    episode.thumbnailUrl = value.thumbnailUrl;
  }
  if (value.status === "published" || value.status === "scheduled") episode.status = value.status;
  return episode;
}

export function parseTitleEpisodeEntry(value: unknown): TitleEpisodeEntry | null {
  if (!isRecord(value) || !Array.isArray(value.episodes)) return null;
  const episodes = value.episodes
    .map(parseTitleEpisode)
    .filter((episode): episode is TitleEpisode => episode !== null)
    .sort((a, b) => a.number - b.number);
  if (episodes.length === 0) return null;
  const entry: { -readonly [K in keyof TitleEpisodeEntry]: TitleEpisodeEntry[K] } = {
    episodes,
    crawledAt: typeof value.crawledAt === "string" ? value.crawledAt : "",
    source: typeof value.source === "string" ? value.source : "",
  };
  if (
    typeof value.totalEpisodes === "number" &&
    Number.isInteger(value.totalEpisodes) &&
    value.totalEpisodes > 0
  ) {
    entry.totalEpisodes = value.totalEpisodes;
  }
  if (value.partial === true) entry.partial = true;
  return entry;
}

// 스냅샷 전체 파싱 — { [titleId]: 항목 } 맵. 작품 id가 비었거나 항목이 무효면 그 작품만 제외.
export function parseTitleEpisodesSnapshot(parsed: unknown): Map<string, TitleEpisodeEntry> {
  const out = new Map<string, TitleEpisodeEntry>();
  if (!isRecord(parsed)) return out;
  for (const [titleId, rawEntry] of Object.entries(parsed)) {
    if (!titleId) continue;
    const entry = parseTitleEpisodeEntry(rawEntry);
    if (entry) out.set(titleId, entry);
  }
  return out;
}

let cachedEntries: Map<string, TitleEpisodeEntry> | null = null;

// 스냅샷 로드(프로세스당 1회 캐시). 파일이 없거나 읽기에 실패하면 빈 맵 — 상세는 회차 없이 나간다.
export function loadTitleEpisodeEntries(env: EnvLike = process.env): Map<string, TitleEpisodeEntry> {
  if (cachedEntries) return cachedEntries;
  const file = resolveTitleEpisodesFile(env);
  if (!file) {
    cachedEntries = new Map();
    return cachedEntries;
  }
  try {
    const raw = file.endsWith(".gz")
      ? gunzipSync(readFileSync(file)).toString("utf8")
      : readFileSync(file, "utf8");
    cachedEntries = parseTitleEpisodesSnapshot(JSON.parse(raw) as unknown);
  } catch {
    cachedEntries = new Map();
  }
  return cachedEntries;
}

// 테스트 전용 — 모듈 캐시를 비운다.
export function resetTitleEpisodesCacheForTests(): void {
  cachedEntries = null;
}

/**
 * 상세 응답에 회차를 붙인다. 스냅샷에 없는 작품이면 원본을 그대로 돌려준다(필드를 만들지 않음).
 * title 은 스토어 원본을 변형하지 않도록 얕은 복사본으로 totalEpisodes 를 병합한다 —
 * 웹의 resolveTotalEpisodes 가 선언값·회차 목록 중 가장 큰 단서를 쓰는 계약과 짝을 이룬다.
 */
export function withTitleEpisodes<T extends { title: Title }>(
  detail: T,
  entries: ReadonlyMap<string, TitleEpisodeEntry>,
): T & { episodes?: TitleEpisode[] } {
  const entry = entries.get(detail.title.id);
  if (!entry) return detail;
  const declared = detail.title.totalEpisodes ?? 0;
  const total = Math.max(declared, entry.totalEpisodes ?? 0);
  return {
    ...detail,
    title: total > declared ? { ...detail.title, totalEpisodes: total } : detail.title,
    episodes: entry.episodes,
  };
}
