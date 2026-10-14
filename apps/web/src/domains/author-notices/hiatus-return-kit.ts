/**
 * 휴재·복귀 키트 (창의 기능 O-3) — 순수 조립 모듈.
 *
 * 원칙 (REPORT O-3):
 * - 휴재 사유·기간·복귀 예정일을 넣으면 공지문 초안(톤 2종)과 작품 페이지
 *   배너 문구가 조립되고, 복귀 시점에는 지난 아크 줄거리·복선 현황으로
 *   '복귀 전 리캡' 소재가 자동 조립된다. 게시 여부는 작가가 결정한다 —
 *   이 모듈은 초안 재료(AuthorNoticeDraftSeed)만 만들고, 저장은 스토어가
 *   항상 draft 상태로만 한다.
 * - 없는 사실을 지어내지 않는다: 줄거리가 비어 있는 회차는 리캡에서
 *   제외하되 개수를 함께 돌려주고, 스포일러 보호(visibility "author")
 *   복선은 독자용 리캡 본문에 넣지 않고 보류 개수만 돌려준다.
 * - 날짜는 YYYY-MM-DD 날짜 키만 받는다. 잘못된 키·기간은 null —
 *   어긋난 복귀일을 공지에 박는 것보다 만들지 않는 쪽이 낫다.
 */

import type { AuthorNoticeDraftSeed } from "./author-notice-types";

/** 휴재 사유 분류 — 공지문의 사유 문장을 조립하는 재료. 세부 사정은 작가가 직접 적는다. */
export type HiatusReasonCategory = "health" | "personal" | "production" | "rest" | "other";

/** 공지 톤 — 플랫폼 공지(격식)와 커뮤니티(친근) 두 갈래. */
export type HiatusNoticeTone = "platform" | "community";

export interface HiatusKitInput {
  readonly workTitle: string;
  readonly authorName: string;
  readonly reasonCategory: HiatusReasonCategory;
  /** 작가가 직접 적은 세부 사유 (선택) — 있으면 본문에 "작가의 말"로 붙는다. */
  readonly reasonDetail?: string;
  /** 휴재 시작일 (YYYY-MM-DD) */
  readonly startsOn: string;
  /** 휴재 기간 (주 단위, 1 이상) */
  readonly weeks: number;
  readonly tone: HiatusNoticeTone;
}

export interface HiatusKit {
  readonly startsOn: string;
  /** 휴재 마지막 날 (시작일 + 기간 - 1일) */
  readonly endsOn: string;
  /** 복귀 예정일 (시작일 + 기간) — 이날 새 회차가 나간다. */
  readonly resumeOn: string;
  readonly weeks: number;
  /** 공지 초안 재료 — 스토어에 넣으면 draft 상태로만 저장된다. */
  readonly seed: AuthorNoticeDraftSeed;
  /** 작품 페이지 배너 문구 (한 줄). */
  readonly bannerText: string;
}

const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function parseDateKey(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(ms);
  // 2026-02-31 같은 존재하지 않는 날짜는 롤오버되므로 역검증한다.
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    return null;
  }
  return ms;
}

function toDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "2026년 11월 2일 (월)" — 로케일에 기대지 않는 고정 표기. */
export function formatKoreanDateLabel(dateKey: string): string {
  const ms = parseDateKey(dateKey);
  if (ms === null) return dateKey;
  const date = new Date(ms);
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${WEEKDAY_LABELS[date.getUTCDay()]})`;
}

function reasonPhrase(category: HiatusReasonCategory, detail: string): string {
  switch (category) {
    case "health":
      return "건강상의 사정으로";
    case "personal":
      return "개인 사정으로";
    case "production":
      return "작품의 완성도를 높이기 위한 재정비가 필요해";
    case "rest":
      return "재충전의 시간을 갖기 위해";
    default:
      return "부득이한 사정으로";
  }
}

/**
 * 휴재 공지 키트 조립. 기간(시작일+주 수)을 넣으면 복귀 예정일을 계산해
 * 공지 초안과 배너 문구를 함께 만든다. 입력이 어긋나면 null.
 */
export function buildHiatusNoticeKit(input: HiatusKitInput): HiatusKit | null {
  const workTitle = input.workTitle.trim();
  const authorName = input.authorName.trim();
  if (!workTitle || !authorName) return null;
  const startMs = parseDateKey(input.startsOn);
  if (startMs === null) return null;
  const weeks = Math.floor(input.weeks);
  if (!Number.isFinite(weeks) || weeks < 1) return null;

  const resumeMs = startMs + weeks * 7 * DAY_MS;
  const endsOn = toDateKey(resumeMs - DAY_MS);
  const resumeOn = toDateKey(resumeMs);
  const detail = (input.reasonDetail ?? "").trim();
  const reason = reasonPhrase(input.reasonCategory, detail);
  const startLabel = formatKoreanDateLabel(input.startsOn);
  const endLabel = formatKoreanDateLabel(endsOn);
  const resumeLabel = formatKoreanDateLabel(resumeOn);

  const seed: AuthorNoticeDraftSeed =
    input.tone === "community"
      ? {
          kind: "hiatus",
          title: `「${workTitle}」 잠시 쉬어 갈게요`,
          body: [
            `안녕하세요, ${authorName}예요.`,
            ``,
            `「${workTitle}」가 ${reason} 잠시 쉬어 가요.`,
            `쉬는 기간은 ${startLabel}부터 ${endLabel}까지, 총 ${weeks}주예요.`,
            `복귀 예정일은 ${resumeLabel} — 이날 새 회차로 돌아올게요.`,
            ...(detail ? [``, `조금 더 적어 두면: ${detail}`] : []),
            ``,
            `기다려 주셔서 늘 고마워요. 잘 쉬고 더 재미있는 이야기로 돌아올게요!`,
          ].join("\n"),
        }
      : {
          kind: "hiatus",
          title: `「${workTitle}」 휴재 안내`,
          body: [
            `안녕하세요, ${authorName}입니다.`,
            ``,
            `「${workTitle}」가 ${reason} 잠시 휴재에 들어갑니다.`,
            `휴재 기간: ${startLabel} ~ ${endLabel} (총 ${weeks}주)`,
            `복귀 예정일: ${resumeLabel} — 이날 새 회차로 찾아뵙겠습니다.`,
            ...(detail ? [``, `작가의 말: ${detail}`] : []),
            ``,
            `기다려 주시는 독자 여러분께 죄송하고 감사한 마음입니다. 더 좋은 작품으로 돌아오겠습니다.`,
          ].join("\n"),
        };

  const bannerText =
    input.tone === "community"
      ? `「${workTitle}」 휴재 중 — ${resumeLabel}에 돌아와요`
      : `「${workTitle}」 휴재 중 · ${resumeLabel} 연재 재개 예정`;

  return Object.freeze({
    startsOn: input.startsOn,
    endsOn,
    resumeOn,
    weeks,
    seed,
    bannerText,
  });
}

/** 리캡 재료 — 회차 줄거리 카드(EpisodeStoryCard)와 구조가 맞는 최소 형태. */
export interface RecapEpisodeInput {
  readonly episodeNumber: number;
  readonly title: string;
  /** 줄거리 한 줄 (시놉시스 goal/logline) — 비어 있으면 리캡에서 제외하고 개수를 센다. */
  readonly goalLine: string;
  /** 마무리 훅 — 마지막 회차의 것이 "끊긴 지점"으로 쓰인다. */
  readonly cliffhangerLine: string;
}

/** 리캡 재료 — 복선 장부 카드(ForeshadowSeed)와 구조가 맞는 최소 형태. */
export interface RecapForeshadowInput {
  readonly title: string;
  readonly status: "planted" | "growing" | "paidOff" | "dropped";
  /** 스포일러 보호: "author"인 복선은 독자용 리캡 본문에 넣지 않는다. */
  readonly visibility: "author" | "team" | "reviewers";
  /** 심은 회차 번호 (알면) */
  readonly plantedEpisodeNumber?: number;
}

export interface ReturnRecapInput {
  readonly workTitle: string;
  readonly authorName: string;
  /** 복귀 예정일 (YYYY-MM-DD, 선택) — 있으면 본문에 날짜를 박는다. */
  readonly resumeOn?: string;
  readonly episodes: readonly RecapEpisodeInput[];
  readonly foreshadows: readonly RecapForeshadowInput[];
  /** 복귀 회차 (알면) */
  readonly nextEpisode?: { readonly episodeNumber: number; readonly title: string } | null;
  /** 리캡에 담을 최근 회차 수 (기본 5) */
  readonly maxEpisodes?: number;
}

export interface ReturnRecapKit {
  /** 복귀 공지 초안 재료 (kind: "resume") — 리캡 본문을 포함한다. */
  readonly seed: AuthorNoticeDraftSeed;
  /** 지난 아크 줄거리 줄 목록 ("12화 「제목」 — 줄거리") */
  readonly storyLines: readonly string[];
  /** 아직 풀리지 않은 복선 줄 목록 */
  readonly openForeshadowLines: readonly string[];
  /** 스포일러 보호로 본문에서 뺀 복선 수 (작가에게만 보인다) */
  readonly withheldSpoilerCount: number;
  /** 줄거리가 비어 리캡에서 제외된 회차 수 */
  readonly skippedEmptySummaryCount: number;
  readonly lastEpisodeNumber: number | null;
}

const DEFAULT_RECAP_EPISODES = 5;

/**
 * 복귀 전 리캡 조립. 지난 회차 줄거리(최근 순 최대 maxEpisodes화) +
 * 마지막 회차의 끊긴 지점 + 미회수 복선 현황으로 복귀 공지 초안을 만든다.
 * 줄거리가 있는 회차가 하나도 없으면 리캡을 만들 수 없어 null.
 */
export function buildReturnRecapKit(input: ReturnRecapInput): ReturnRecapKit | null {
  const workTitle = input.workTitle.trim();
  const authorName = input.authorName.trim();
  if (!workTitle || !authorName) return null;

  const ordered = [...input.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);
  const withSummary = ordered.filter((episode) => episode.goalLine.trim().length > 0);
  const skippedEmptySummaryCount = ordered.length - withSummary.length;
  if (withSummary.length === 0) return null;

  const maxEpisodes =
    Number.isFinite(input.maxEpisodes) && (input.maxEpisodes ?? 0) > 0
      ? Math.floor(input.maxEpisodes as number)
      : DEFAULT_RECAP_EPISODES;
  const recent = withSummary.slice(-maxEpisodes);
  const storyLines = recent.map(
    (episode) => `${episode.episodeNumber}화 「${episode.title.trim()}」 — ${episode.goalLine.trim()}`,
  );
  const lastEpisode = recent[recent.length - 1];
  const cliffhanger = lastEpisode.cliffhangerLine.trim();

  let withheldSpoilerCount = 0;
  const openForeshadowLines: string[] = [];
  for (const seed of input.foreshadows) {
    if (seed.status !== "planted" && seed.status !== "growing") continue;
    if (seed.visibility === "author") {
      withheldSpoilerCount += 1;
      continue;
    }
    const planted =
      seed.plantedEpisodeNumber != null ? ` (${seed.plantedEpisodeNumber}화에 심긴 복선)` : "";
    openForeshadowLines.push(`「${seed.title.trim()}」${planted}`);
  }

  const resumeLabel = input.resumeOn ? formatKoreanDateLabel(input.resumeOn) : null;
  const body = [
    `안녕하세요, ${authorName}입니다.`,
    ``,
    resumeLabel
      ? `기다려 주셔서 감사합니다. 「${workTitle}」가 ${resumeLabel} 돌아옵니다.`
      : `기다려 주셔서 감사합니다. 「${workTitle}」 연재를 다시 시작합니다.`,
    `복귀 전에 지난 이야기를 짧게 정리해 드릴게요.`,
    ``,
    `[복귀 전 리캡 — 지난 이야기]`,
    ...storyLines.map((line) => `· ${line}`),
    ...(cliffhanger
      ? [``, `이야기는 여기서 끊겼습니다: ${lastEpisode.episodeNumber}화는 "${cliffhanger}"(으)로 끝났습니다.`]
      : []),
    ``,
    `[아직 풀리지 않은 이야기]`,
    ...(openForeshadowLines.length > 0
      ? openForeshadowLines.map((line) => `· ${line}`)
      : [`· 새로운 이야기로 이어집니다.`]),
    ...(input.nextEpisode
      ? [``, `복귀 회차는 ${input.nextEpisode.episodeNumber}화 「${input.nextEpisode.title.trim()}」입니다. 기대해 주세요.`]
      : []),
  ].join("\n");

  const seed: AuthorNoticeDraftSeed = {
    kind: "resume",
    title: `「${workTitle}」 연재 재개 안내`,
    body,
  };
  return Object.freeze({
    seed,
    storyLines: Object.freeze(storyLines),
    openForeshadowLines: Object.freeze(openForeshadowLines),
    withheldSpoilerCount,
    skippedEmptySummaryCount,
    lastEpisodeNumber: lastEpisode.episodeNumber,
  });
}

/**
 * 복선 장부 카드 → 리캡 재료 어댑터. 심은 회차는 회차 순서표(episodeOrder)로
 * 번호를 찾는다 — 순서표에 없으면 번호 없이 넣는다(지어내지 않는다).
 */
export function recapForeshadowsFromSeeds(
  seeds: readonly {
    readonly title: string;
    readonly status: RecapForeshadowInput["status"];
    readonly visibility: RecapForeshadowInput["visibility"];
    readonly plantedIn: { readonly episodeId: string };
  }[],
  episodeOrder: readonly string[],
): readonly RecapForeshadowInput[] {
  return seeds.map((seed) => {
    const index = episodeOrder.indexOf(seed.plantedIn.episodeId);
    return {
      title: seed.title,
      status: seed.status,
      visibility: seed.visibility,
      ...(index >= 0 ? { plantedEpisodeNumber: index + 1 } : {}),
    };
  });
}
