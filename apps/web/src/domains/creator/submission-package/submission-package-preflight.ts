/**
 * 투고 패키지 — 만들기 전 점검(순수·결정적).
 *
 * 입력은 화면이 모은 초안(작품 소개·회차별 이미지 메타데이터·캐릭터 시트)이고, 출력은 이슈 목록이다.
 * 이슈는 문구가 아니라 `code + params` 로 돌려주고, 사람이 읽는 문구는 `submission-package-messages.ts` 가
 * 한국어·영어로 만든다(화면과 표지가 같은 값을 쓴다).
 *
 * 점검 기준:
 * - 막는 것(error): 작품명 없음, 쓸 수 있는 회차 3화 미만, 빈 회차, 읽을 수 없거나 지원하지 않는 이미지, 글자 수
 *   초과, 회차 번호 중복, 앱이 정한 메모리 상한 초과.
 * - 알리는 것(warning): 가로 폭이 고른 표준폭과 다름, 투고처 용량 기준 초과, 권장 용량 초과, 로그라인·시놉시스·
 *   캐릭터 시트 누락, 회차 번호 건너뜀.
 * 폭 표준은 `studio-webtoon-guides` 의 `WEBTOON_WIDTH_STANDARDS`(네이버 690·카카오 720·웹툰 캔버스 800·고화질
 * 1080)를 그대로 쓴다. 이 표준은 작업용 가이드이며 투고처의 최신 요구를 대신하지 않는다.
 */
import { WEBTOON_WIDTH_STANDARDS } from "../studio-webtoon-guides";

import { codePointLength, normalizeSingleLine, normalizeUserText } from "./submission-package-text";
import {
  SUBMISSION_PACKAGE_LIMITS,
  SUBMISSION_PACKAGE_MIN_EPISODES,
  type SubmissionCharacterSheet,
  type SubmissionCompletenessItem,
  type SubmissionEpisode,
  type SubmissionEpisodeStats,
  type SubmissionIssue,
  type SubmissionIssueCode,
  type SubmissionIssueSeverity,
  type SubmissionIssueTarget,
  type SubmissionPackageDraft,
  type SubmissionPackageLimits,
  type SubmissionPageFile,
  type SubmissionPlatformSizeLimits,
  type SubmissionPreflightReport,
  type SubmissionTargetWidthId,
} from "./submission-package-types";

export interface SubmissionPreflightInput {
  readonly draft: SubmissionPackageDraft;
  /** 선택한 투고처에 기록된 용량 기준. 없으면 플랫폼 용량 점검은 건너뛴다. */
  readonly platform?: SubmissionPlatformSizeLimits | null;
  readonly limits?: SubmissionPackageLimits;
}

const SEVERITY_RANK: Readonly<Record<SubmissionIssueSeverity, number>> = Object.freeze({ error: 0, warning: 1, info: 2 });

/** 폭 점검 기준 id 에 해당하는 표준폭. `any` 이거나 목록에 없으면 null. */
export function submissionTargetWidth(
  id: SubmissionTargetWidthId,
): { readonly id: SubmissionTargetWidthId; readonly width: number; readonly label: string } | null {
  if (id === "any") return null;
  const standard = WEBTOON_WIDTH_STANDARDS.find((entry) => entry.id === id);
  return standard ? { id, width: standard.width, label: standard.label } : null;
}

export function isReadableSubmissionPage(page: SubmissionPageFile): boolean {
  return page.failure === null && page.mime !== null && page.width !== null && page.height !== null;
}

function distinctWidths(pages: readonly SubmissionPageFile[]): number[] {
  const widths = new Set<number>();
  for (const page of pages) {
    if (isReadableSubmissionPage(page) && page.width !== null) widths.add(page.width);
  }
  return [...widths].sort((left, right) => left - right);
}

function readablePages(episode: SubmissionEpisode): SubmissionPageFile[] {
  return episode.pages.filter(isReadableSubmissionPage);
}

export function summarizeSubmissionEpisode(episode: SubmissionEpisode): SubmissionEpisodeStats {
  const readable = readablePages(episode);
  return {
    episodeId: episode.id,
    number: episode.number,
    title: normalizeSingleLine(episode.title),
    pageCount: episode.pages.length,
    readablePageCount: readable.length,
    totalBytes: readable.reduce((sum, page) => sum + page.size, 0),
    widths: distinctWidths(episode.pages),
  };
}

function missingNumbers(numbers: readonly number[]): number[] {
  const sorted = [...new Set(numbers)].sort((left, right) => left - right);
  const missing: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous === undefined || current === undefined) continue;
    for (let value = previous + 1; value < current; value += 1) missing.push(value);
  }
  return missing;
}

const CHARACTER_TEXT_FIELDS = ["personality", "speechStyle", "background", "motivation", "appearanceNotes"] as const;

function characterHasCore(sheet: SubmissionCharacterSheet): boolean {
  return [sheet.personality, sheet.background, sheet.motivation].some((value) => normalizeUserText(value).length > 0);
}

export function evaluateSubmissionPackage(input: SubmissionPreflightInput): SubmissionPreflightReport {
  const limits = input.limits ?? SUBMISSION_PACKAGE_LIMITS;
  const { draft } = input;
  const issues: SubmissionIssue[] = [];
  const add = (
    code: SubmissionIssueCode,
    severity: SubmissionIssueSeverity,
    target: SubmissionIssueTarget,
    params: Readonly<Record<string, string | number>> = {},
  ): void => {
    issues.push({ code, severity, target, params });
  };

  // ── 작품 소개 ────────────────────────────────────────────────────────
  const title = normalizeSingleLine(draft.title);
  const author = normalizeSingleLine(draft.authorName);
  const logline = normalizeUserText(draft.logline);
  const synopsis = normalizeUserText(draft.synopsis);
  if (!title) add("title-missing", "error", { kind: "story", field: "title" });
  const storyFields = [
    { field: "title", value: title, max: limits.titleChars },
    { field: "author", value: author, max: limits.authorChars },
    { field: "logline", value: logline, max: limits.loglineChars },
    { field: "synopsis", value: synopsis, max: limits.synopsisChars },
  ] as const;
  for (const entry of storyFields) {
    const length = codePointLength(entry.value);
    if (length > entry.max) {
      add("text-too-long", "error", { kind: "story", field: entry.field }, { field: entry.field, max: entry.max, length });
    }
  }
  if (!logline) add("logline-missing", "warning", { kind: "story", field: "logline" });
  if (!synopsis) add("synopsis-missing", "warning", { kind: "story", field: "synopsis" });
  if (!author) add("author-missing", "info", { kind: "story", field: "author" });

  // ── 회차 ─────────────────────────────────────────────────────────────
  const episodes = draft.episodes;
  const episodeStats = episodes.map(summarizeSubmissionEpisode);
  const usableEpisodes = episodes.filter((episode) => readablePages(episode).length > 0);
  if (episodes.length > limits.maxEpisodes) {
    add("episodes-too-many", "error", { kind: "episodes" }, { max: limits.maxEpisodes, actual: episodes.length });
  }
  if (usableEpisodes.length < SUBMISSION_PACKAGE_MIN_EPISODES) {
    add(
      "episodes-too-few",
      "error",
      { kind: "episodes" },
      { required: SUBMISSION_PACKAGE_MIN_EPISODES, actual: usableEpisodes.length },
    );
  }

  const numberOwners = new Map<number, string[]>();
  for (const episode of episodes) {
    if (!Number.isSafeInteger(episode.number) || episode.number < 1) {
      add("episode-number-invalid", "error", { kind: "episode", episodeId: episode.id }, { number: Number.isFinite(episode.number) ? String(episode.number) : "" });
    } else {
      numberOwners.set(episode.number, [...(numberOwners.get(episode.number) ?? []), episode.id]);
    }
  }
  for (const [number, owners] of numberOwners) {
    if (owners.length < 2) continue;
    for (const episodeId of owners) add("episode-number-duplicate", "error", { kind: "episode", episodeId }, { number });
  }
  const gaps = missingNumbers([...numberOwners.keys()]);
  if (gaps.length > 0) {
    const shown = gaps.slice(0, 5).join(", ");
    add("episode-number-gap", "warning", { kind: "episodes" }, { missing: gaps.length > 5 ? `${shown}…` : shown });
  }

  const standard = submissionTargetWidth(draft.targetWidth);
  const platform = input.platform ?? null;
  let totalFiles = 0;
  let totalBytes = 0;
  for (const episode of episodes) {
    const episodeTarget: SubmissionIssueTarget = { kind: "episode", episodeId: episode.id };
    const episodeTitle = normalizeSingleLine(episode.title);
    const episodeNote = normalizeUserText(episode.note);
    if (codePointLength(episodeTitle) > limits.episodeTitleChars) {
      add("text-too-long", "error", episodeTarget, { field: "episodeTitle", max: limits.episodeTitleChars, length: codePointLength(episodeTitle) });
    }
    if (codePointLength(episodeNote) > limits.episodeNoteChars) {
      add("text-too-long", "error", episodeTarget, { field: "episodeNote", max: limits.episodeNoteChars, length: codePointLength(episodeNote) });
    }
    if (episode.pages.length === 0) {
      add("episode-empty", "error", episodeTarget, { number: episode.number });
      continue;
    }
    if (episode.pages.length > limits.maxPagesPerEpisode) {
      add("episode-pages-too-many", "error", episodeTarget, { max: limits.maxPagesPerEpisode, actual: episode.pages.length });
    }

    let episodeBytes = 0;
    let oversizedForPlatform = 0;
    for (const page of episode.pages) {
      const pageTarget: SubmissionIssueTarget = { kind: "page", episodeId: episode.id, pageId: page.id };
      if (page.failure === "unsupported") {
        add("page-unsupported", "error", pageTarget, { name: page.name });
        continue;
      }
      if (page.failure === "empty") {
        add("page-empty", "error", pageTarget, { name: page.name });
        continue;
      }
      if (!isReadableSubmissionPage(page)) {
        add("page-unreadable", "error", pageTarget, { name: page.name });
        continue;
      }
      totalFiles += 1;
      totalBytes += page.size;
      episodeBytes += page.size;
      if (page.size > limits.maxFileBytes) {
        add("page-too-large", "error", pageTarget, { name: page.name, bytes: page.size, max: limits.maxFileBytes });
      } else if (page.size > limits.softFileBytes) {
        add("page-large", "warning", pageTarget, { name: page.name, bytes: page.size, max: limits.softFileBytes });
      }
      if (platform?.maxFileBytes !== undefined && page.size > platform.maxFileBytes) oversizedForPlatform += 1;
    }

    if (platform?.maxFileBytes !== undefined && oversizedForPlatform > 0) {
      add("platform-file-over", "warning", episodeTarget, {
        label: platform.label,
        count: oversizedForPlatform,
        max: platform.maxFileBytes,
      });
    }
    if (platform?.maxEpisodeBytes !== undefined && episodeBytes > platform.maxEpisodeBytes) {
      add("platform-episode-over", "warning", episodeTarget, {
        label: platform.label,
        bytes: episodeBytes,
        max: platform.maxEpisodeBytes,
      });
    }
    if (standard) {
      const mismatched = readablePages(episode).filter((page) => page.width !== standard.width);
      if (mismatched.length > 0) {
        add("width-mismatch", "warning", episodeTarget, {
          label: standard.label,
          expected: standard.width,
          count: mismatched.length,
          found: distinctWidths(mismatched).join(", "),
        });
      }
    }
  }

  if (!standard) {
    const widths = new Set<number>();
    for (const episode of episodes) for (const width of distinctWidths(episode.pages)) widths.add(width);
    if (widths.size > 1) {
      add("width-mixed", "warning", { kind: "package" }, { widths: [...widths].sort((a, b) => a - b).join(", ") });
    }
  }

  if (totalFiles > limits.maxFiles) {
    add("package-files-too-many", "error", { kind: "package" }, { max: limits.maxFiles, actual: totalFiles });
  }
  if (totalBytes > limits.maxTotalBytes) {
    add("package-too-large", "error", { kind: "package" }, { bytes: totalBytes, max: limits.maxTotalBytes });
  } else if (totalBytes > limits.softTotalBytes) {
    add("package-large", "warning", { kind: "package" }, { bytes: totalBytes, max: limits.softTotalBytes });
  }

  // ── 캐릭터 시트 ──────────────────────────────────────────────────────
  const characters = draft.characters;
  if (characters.length === 0) add("characters-missing", "warning", { kind: "characters" });
  if (characters.length > limits.maxCharacters) {
    add("characters-too-many", "error", { kind: "characters" }, { max: limits.maxCharacters, actual: characters.length });
  }
  for (const sheet of characters) {
    const target: SubmissionIssueTarget = { kind: "character", characterId: sheet.id };
    const name = normalizeSingleLine(sheet.name);
    if (!characterHasCore(sheet)) add("character-sheet-thin", "warning", target, { name });
    for (const field of CHARACTER_TEXT_FIELDS) {
      const length = codePointLength(normalizeUserText(sheet[field]));
      if (length > limits.characterFieldChars) {
        add("text-too-long", "error", target, { field: `character.${field}`, max: limits.characterFieldChars, length, name });
      }
    }
  }

  const sorted = issues
    .map((issue, index) => ({ issue, index }))
    .sort((left, right) => SEVERITY_RANK[left.issue.severity] - SEVERITY_RANK[right.issue.severity] || left.index - right.index)
    .map((entry) => entry.issue);
  const errorCount = sorted.filter((issue) => issue.severity === "error").length;
  const warningCount = sorted.filter((issue) => issue.severity === "warning").length;
  const infoCount = sorted.filter((issue) => issue.severity === "info").length;

  const hasEmptyEpisode = episodes.some((episode) => episode.pages.length === 0);
  const items: SubmissionCompletenessItem[] = [
    { key: "title", done: title.length > 0, required: true },
    { key: "episodes", done: usableEpisodes.length >= SUBMISSION_PACKAGE_MIN_EPISODES && !hasEmptyEpisode, required: true },
    { key: "logline", done: logline.length > 0, required: true },
    { key: "synopsis", done: synopsis.length > 0, required: true },
    { key: "characters", done: characters.length > 0, required: true },
    { key: "author", done: author.length > 0, required: false },
  ];
  const required = items.filter((item) => item.required);

  return {
    issues: sorted,
    errorCount,
    warningCount,
    infoCount,
    canBuild: errorCount === 0,
    episodeStats,
    totalBytes,
    totalFiles,
    completeness: { done: required.filter((item) => item.done).length, total: required.length, items },
  };
}
