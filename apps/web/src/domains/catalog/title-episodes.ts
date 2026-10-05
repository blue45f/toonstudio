import type { Title } from "@/shared/lib/types";

/**
 * 회차 데이터 계약 (작품 상세·뷰어 공용).
 *
 * 2026-10-05 실측: 카탈로그 API·계약·상세 샤드 어디에도 회차별 데이터가 없다.
 * - `GET /api/titles/:slug` 응답에 회차 필드가 없고, 카탈로그 모듈에 회차 엔드포인트가 없다.
 * - `Title.totalEpisodes`는 타입에만 있으며 카탈로그 60,234작품 중 채워진 작품이 0건이다.
 *
 * 그래서 이 모듈은 "계약이 생기면 그대로 켜지는" 경계만 제공한다. 상세 응답에
 * `episodes` 배열이 실려 오기 시작하면 `resolveTitleEpisodes`가 검증해 넘기고,
 * 그전까지는 undefined를 돌려줘 화면이 정직한 빈 상태를 그리게 한다.
 * 회차 행을 클라이언트에서 지어내는 코드는 두지 않는다.
 */
export interface TitleEpisode {
  /** 1부터 시작하는 회차 번호 */
  readonly number: number;
  /** 회차 제목. 제공되지 않으면 화면은 "N화"로만 표기한다. */
  readonly title?: string;
  /** 공개일 (ISO 날짜 문자열) */
  readonly publishedAt?: string;
  /** 회차 좋아요 수 */
  readonly likes?: number;
  /** 회차 썸네일 이미지 URL */
  readonly thumbnailUrl?: string;
  /** 공개 상태. 없으면 공개로 간주한다. */
  readonly status?: "published" | "scheduled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toEpisode(value: unknown): TitleEpisode | null {
  if (!isRecord(value)) return null;
  const number = value.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1) return null;
  const episode: {
    -readonly [K in keyof TitleEpisode]: TitleEpisode[K];
  } = { number };
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

/**
 * 상세 응답에서 회차 목록을 꺼낸다. 필드가 없거나 형식이 어긋난 항목은 버리고,
 * 남은 게 없으면 undefined — 화면의 빈 상태 신호다.
 */
export function resolveTitleEpisodes(source: unknown): readonly TitleEpisode[] | undefined {
  if (!isRecord(source)) return undefined;
  const raw = source.episodes;
  if (!Array.isArray(raw)) return undefined;
  const episodes = raw
    .map(toEpisode)
    .filter((episode): episode is TitleEpisode => episode !== null)
    .sort((a, b) => a.number - b.number);
  return episodes.length > 0 ? episodes : undefined;
}

export type EpisodeSortOrder = "latest" | "oldest";

/** 정렬 토글용. 입력 순서를 바꾸지 않는다. */
export function sortEpisodes(
  episodes: readonly TitleEpisode[],
  order: EpisodeSortOrder,
): readonly TitleEpisode[] {
  const sorted = [...episodes].sort((a, b) => a.number - b.number);
  return order === "latest" ? sorted.reverse() : sorted;
}

/**
 * 총 회차 수 — 알 수 있는 단서 중 가장 큰 값을 쓴다. 회차 목록이 일부만 실려 와도
 * (예: 공개 예정 1건만) 총수가 목록 길이로 줄어드는 오판을 막기 위해서다.
 * 단서가 하나도 없으면 undefined — 지어내지 않는다.
 */
export function resolveTotalEpisodes(
  title: Pick<Title, "totalEpisodes">,
  episodes?: readonly TitleEpisode[],
): number | undefined {
  let total = 0;
  if (typeof title.totalEpisodes === "number" && title.totalEpisodes > 0) {
    total = Math.max(total, title.totalEpisodes);
  }
  if (episodes && episodes.length > 0) {
    total = Math.max(total, episodes.length, ...episodes.map((episode) => episode.number));
  }
  return total > 0 ? total : undefined;
}
