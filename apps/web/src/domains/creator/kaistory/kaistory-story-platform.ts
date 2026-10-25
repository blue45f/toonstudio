/**
 * kaistory-story-platform.ts — KAISTORY `story.kaistory.net` (독자 서비스·콘티 서버 비교 동기화·학생 노출·학습카드 폴백·앱 버전 정책) 순수 모듈.
 *
 * REA 역공학 근거:
 * - Evidence: `ev_aa2cf777622e8de2b631248a669cd7b53cce21a9682a61900c485a8be5a3964e`
 * - 번들: `story.kaistory.net/main.dart.js`
 *
 * 핵심 기능:
 * 1. 콘티 서버 vs Story 서버 비교·동기화 엔진(웹툰·만화·소설·학습카드·표지·키워드 비교 및 차이 업로드/초과 이미지 정리)
 * 2. 학생 노출 설정 및 언어별 서비스 기간(`노출 중`/`노출 예정`/`노출 종료`/`숨김`) 판정기
 * 3. 학습카드 뷰어 폴백 해석기(대상 언어 카드 없을 때 한국어 카드 대체, 만화 카드 없을 때 웹툰 카드 대체, 언어별 교과과정 QR 링크 해석)
 * 4. 앱 버전 정책 검증기(`minVersion` vs `latestVersion` 역전 차단 및 영향 미리보기)
 */

import { KAISTORY_LANG_CODES, type KaistoryLangCode } from "./kaistory-conti-model";

export type KaistorySyncDiffStatus =
  | "new_on_conti"
  | "matched"
  | "changed"
  | "server_only";

export const KAISTORY_SYNC_DIFF_LABELS: Readonly<Record<KaistorySyncDiffStatus, string>> =
  Object.freeze({
    new_on_conti: "새로운",
    matched: "일치",
    changed: "차이",
    server_only: "서버만",
  });

export interface KaistoryAssetDigestItem {
  readonly id: string;
  readonly hash: string;
}

export interface KaistoryContiVsStoryComparison {
  readonly lang: KaistoryLangCode;
  readonly webtoonStatus: KaistorySyncDiffStatus;
  readonly mangaStatus: KaistorySyncDiffStatus;
  readonly novelStatus: KaistorySyncDiffStatus;
  readonly excessServerAssetIds: readonly string[];
  readonly uploadTargetIds: readonly string[];
  readonly summaryKo: string;
}

function compareDigestLists(
  contiItems: readonly KaistoryAssetDigestItem[],
  serverItems: readonly KaistoryAssetDigestItem[],
): {
  readonly status: KaistorySyncDiffStatus;
  readonly uploadIds: readonly string[];
  readonly excessServerIds: readonly string[];
} {
  if (contiItems.length === 0 && serverItems.length === 0) {
    return { status: "matched", uploadIds: [], excessServerIds: [] };
  }
  if (serverItems.length === 0 && contiItems.length > 0) {
    return {
      status: "new_on_conti",
      uploadIds: contiItems.map((i) => i.id),
      excessServerIds: [],
    };
  }
  if (contiItems.length === 0 && serverItems.length > 0) {
    return {
      status: "server_only",
      uploadIds: [],
      excessServerIds: serverItems.map((i) => i.id),
    };
  }

  const serverById = new Map(serverItems.map((s) => [s.id, s.hash]));
  const contiIds = new Set(contiItems.map((c) => c.id));
  const uploadIds: string[] = [];
  for (const c of contiItems) {
    if (serverById.get(c.id) !== c.hash) {
      uploadIds.push(c.id);
    }
  }
  const excessServerIds = serverItems
    .filter((s) => !contiIds.has(s.id))
    .map((s) => s.id);

  if (uploadIds.length === 0 && excessServerIds.length === 0) {
    return { status: "matched", uploadIds: [], excessServerIds: [] };
  }
  return {
    status: "changed",
    uploadIds: Object.freeze(uploadIds),
    excessServerIds: Object.freeze(excessServerIds),
  };
}

/**
 * 콘티 서버의 에피소드 산출물과 Story 서버의 현재 게시본을 언어별로 비교한다.
 */
export function compareContiAndStoryEpisode(input: {
  readonly byLang: Readonly<
    Record<
      KaistoryLangCode,
      {
        readonly contiWebtoon: readonly KaistoryAssetDigestItem[];
        readonly serverWebtoon: readonly KaistoryAssetDigestItem[];
        readonly contiManga: readonly KaistoryAssetDigestItem[];
        readonly serverManga: readonly KaistoryAssetDigestItem[];
        readonly contiNovelHash: string;
        readonly serverNovelHash: string;
      }
    >
  >;
}): readonly KaistoryContiVsStoryComparison[] {
  return Object.freeze(
    KAISTORY_LANG_CODES.map((lang) => {
      const entry = input.byLang[lang];
      const webtoon = compareDigestLists(entry.contiWebtoon, entry.serverWebtoon);
      const manga = compareDigestLists(entry.contiManga, entry.serverManga);
      const novelStatus: KaistorySyncDiffStatus =
        !entry.contiNovelHash && !entry.serverNovelHash
          ? "matched"
          : !entry.serverNovelHash && entry.contiNovelHash
            ? "new_on_conti"
            : !entry.contiNovelHash && entry.serverNovelHash
              ? "server_only"
              : entry.contiNovelHash === entry.serverNovelHash
                ? "matched"
                : "changed";

      const uploadTargetIds = [...webtoon.uploadIds, ...manga.uploadIds];
      const excessServerAssetIds = [...webtoon.excessServerIds, ...manga.excessServerIds];
      const summaryKo =
        uploadTargetIds.length === 0 && excessServerAssetIds.length === 0 && novelStatus === "matched"
          ? `${lang.toUpperCase()}: 모두 동일`
          : `${lang.toUpperCase()}: 변경 ${uploadTargetIds.length}개 · 서버 초과 ${excessServerAssetIds.length}개 · 소설(${KAISTORY_SYNC_DIFF_LABELS[novelStatus]})`;

      return Object.freeze({
        lang,
        webtoonStatus: webtoon.status,
        mangaStatus: manga.status,
        novelStatus,
        excessServerAssetIds: Object.freeze(excessServerAssetIds),
        uploadTargetIds: Object.freeze(uploadTargetIds),
        summaryKo,
      });
    }),
  );
}

/**
 * 콘티 서버 키워드와 Story 서버 키워드를 비교하고, 만화 이미지가 없는 페이지 키워드를 분리한다.
 */
export function compareContiAndStoryKeywords(input: {
  readonly contiEpisodeKeywords: readonly string[];
  readonly storyEpisodeKeywords: readonly string[];
  readonly contiPageKeywordsByPage: Readonly<Record<number, readonly string[]>>;
  readonly storyPageKeywordsByPage: Readonly<Record<number, readonly string[]>>;
  readonly uploadedMangaPageNumbers: ReadonlySet<number>;
}): {
  readonly contiManagesKeywords: boolean;
  readonly isIdentical: boolean;
  readonly skippedPagesWithoutMangaImage: readonly number[];
  readonly statusMessageKo: string;
} {
  const hasAnyContiKeyword =
    input.contiEpisodeKeywords.length > 0 ||
    Object.values(input.contiPageKeywordsByPage).some((list) => list.length > 0);

  if (!hasAnyContiKeyword) {
    return {
      contiManagesKeywords: false,
      isIdentical: true,
      skippedPagesWithoutMangaImage: Object.freeze([]),
      statusMessageKo: "콘티에서 이 화의 키워드를 관리하지 않습니다. story 키워드를 그대로 둡니다.",
    };
  }

  const skippedPages: number[] = [];
  for (const [pageStr, kwList] of Object.entries(input.contiPageKeywordsByPage)) {
    const pageNo = Number(pageStr);
    if (kwList.length > 0 && !input.uploadedMangaPageNumbers.has(pageNo)) {
      skippedPages.push(pageNo);
    }
  }

  const sameArray = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((item, idx) => item === b[idx]);

  let isIdentical = sameArray(input.contiEpisodeKeywords, input.storyEpisodeKeywords);
  if (isIdentical) {
    const allPages = new Set([
      ...Object.keys(input.contiPageKeywordsByPage).map(Number),
      ...Object.keys(input.storyPageKeywordsByPage).map(Number),
    ]);
    for (const pageNo of allPages) {
      if (!input.uploadedMangaPageNumbers.has(pageNo)) continue;
      const cList = input.contiPageKeywordsByPage[pageNo] ?? [];
      const sList = input.storyPageKeywordsByPage[pageNo] ?? [];
      if (!sameArray(cList, sList)) {
        isIdentical = false;
        break;
      }
    }
  }

  return {
    contiManagesKeywords: true,
    isIdentical,
    skippedPagesWithoutMangaImage: Object.freeze(skippedPages.sort((a, b) => a - b)),
    statusMessageKo: isIdentical ? "콘티와 같습니다" : "콘티와 다릅니다",
  };
}

export interface KaistoryDateWindow {
  /** YYYY-MM-DD (비워두면 제한 없음). */
  readonly startDate?: string;
  /** YYYY-MM-DD (비워두면 제한 없음). */
  readonly endDate?: string;
}

export type KaistoryStudentExposureStatus =
  | "hidden"
  | "scheduled"
  | "active"
  | "ended"
  | "invalid_range";

export const KAISTORY_EXPOSURE_STATUS_LABELS: Readonly<
  Record<KaistoryStudentExposureStatus, string>
> = Object.freeze({
  hidden: "숨김",
  scheduled: "노출 예정",
  active: "노출 중",
  ended: "노출 종료",
  invalid_range: "종료일은 시작일 이후여야 합니다.",
});

/**
 * 학생 노출 설정(`학생에게 노출`, `기본 서비스 기간`, `언어별 서비스 기간`)을 평가한다.
 */
export function evaluateStudentExposureStatus(input: {
  readonly exposedToStudents: boolean;
  readonly todayIsoDate: string;
  readonly lang: KaistoryLangCode;
  readonly defaultWindow: KaistoryDateWindow;
  readonly langWindows?: Readonly<Partial<Record<KaistoryLangCode, KaistoryDateWindow>>>;
}): {
  readonly status: KaistoryStudentExposureStatus;
  readonly labelKo: string;
  readonly effectiveWindow: KaistoryDateWindow;
} {
  const langOverride = input.langWindows?.[input.lang];
  const effectiveWindow: KaistoryDateWindow =
    langOverride && (langOverride.startDate || langOverride.endDate)
      ? langOverride
      : input.defaultWindow;

  const start = (effectiveWindow.startDate ?? "").trim();
  const end = (effectiveWindow.endDate ?? "").trim();

  if (start && end && end < start) {
    return {
      status: "invalid_range",
      labelKo: KAISTORY_EXPOSURE_STATUS_LABELS.invalid_range,
      effectiveWindow,
    };
  }

  if (!input.exposedToStudents) {
    return {
      status: "hidden",
      labelKo: KAISTORY_EXPOSURE_STATUS_LABELS.hidden,
      effectiveWindow,
    };
  }

  const today = input.todayIsoDate.trim();
  if (start && today < start) {
    return {
      status: "scheduled",
      labelKo: KAISTORY_EXPOSURE_STATUS_LABELS.scheduled,
      effectiveWindow,
    };
  }
  if (end && today > end) {
    return {
      status: "ended",
      labelKo: KAISTORY_EXPOSURE_STATUS_LABELS.ended,
      effectiveWindow,
    };
  }
  return {
    status: "active",
    labelKo: KAISTORY_EXPOSURE_STATUS_LABELS.active,
    effectiveWindow,
  };
}

export interface KaistoryStudyCardMultilangAsset {
  readonly cardId: string;
  readonly baseQrLink: string;
  readonly langQrLinks: Readonly<Partial<Record<KaistoryLangCode, string>>>;
  readonly webtoonImageByLang: Readonly<Partial<Record<KaistoryLangCode, string>>>;
  readonly mangaImageByLang: Readonly<Partial<Record<KaistoryLangCode, string>>>;
  readonly kaitoonVisible: boolean;
  readonly mangaVisible: boolean;
}

/**
 * 학습카드 뷰어용 이미지·QR 폴백 해석기 (`conti` & `story` 동일 규칙):
 * - 해당 언어 카드가 없으면 한국어(`ko`) 카드로 대신한다 (`한국어 카드로 대신`).
 * - 만화 보기에서 만화 카드가 없으면 웹툰 카드로 대신한다 (`만화 카드 없음 — 웹툰 카드로 대신`).
 * - 언어별 QR 링크가 비어 있으면 기본 카드 링크(`baseQrLink`)를 쓴다.
 */
export function resolveStudyCardForViewer(input: {
  readonly card: KaistoryStudyCardMultilangAsset;
  readonly viewerMode: "webtoon" | "manga";
  readonly lang: KaistoryLangCode;
}): {
  readonly visible: boolean;
  readonly imageUrl: string | null;
  readonly qrLink: string | null;
  readonly fallbackNoticeKo: string;
} {
  const { card, viewerMode, lang } = input;
  if (!card.kaitoonVisible) {
    return {
      visible: false,
      imageUrl: null,
      qrLink: null,
      fallbackNoticeKo: "KAITOON 에서 숨김",
    };
  }
  if (viewerMode === "manga" && !card.mangaVisible) {
    return {
      visible: false,
      imageUrl: null,
      qrLink: null,
      fallbackNoticeKo: "만화보기에서 숨김",
    };
  }

  const qrLink = (card.langQrLinks[lang] ?? card.baseQrLink).trim() || null;

  if (viewerMode === "webtoon") {
    const direct = card.webtoonImageByLang[lang];
    if (direct) {
      return { visible: true, imageUrl: direct, qrLink, fallbackNoticeKo: "정상" };
    }
    const koFallback = card.webtoonImageByLang.ko;
    if (koFallback) {
      return {
        visible: true,
        imageUrl: koFallback,
        qrLink,
        fallbackNoticeKo: "카드 없음 · 한국어 카드로 대신",
      };
    }
  } else {
    const directManga = card.mangaImageByLang[lang];
    if (directManga) {
      return { visible: true, imageUrl: directManga, qrLink, fallbackNoticeKo: "정상" };
    }
    const directWebtoon = card.webtoonImageByLang[lang];
    if (directWebtoon) {
      return {
        visible: true,
        imageUrl: directWebtoon,
        qrLink,
        fallbackNoticeKo: "만화 카드 없음 — 웹툰 카드로 대신",
      };
    }
    const koManga = card.mangaImageByLang.ko;
    if (koManga) {
      return {
        visible: true,
        imageUrl: koManga,
        qrLink,
        fallbackNoticeKo: "만화 카드 없음 · 한국어 카드로 대신",
      };
    }
    const koWebtoon = card.webtoonImageByLang.ko;
    if (koWebtoon) {
      return {
        visible: true,
        imageUrl: koWebtoon,
        qrLink,
        fallbackNoticeKo: "만화 카드 없음 · 한국어 웹툰 카드로 대신",
      };
    }
  }

  return {
    visible: true,
    imageUrl: null,
    qrLink,
    fallbackNoticeKo: qrLink
      ? "카드 이미지 없음 (QR 링크는 준비됨)"
      : "Kaion 등록 전(카드 링크 없음)",
  };
}

function parseSemverTuple(version: string): readonly [number, number, number] | null {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/u);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function compareSemverTuples(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

/**
 * `story.kaistory.net` 관리자 대시보드의 앱 버전 정책(`latestVersion`, `minVersion`)을 검증하고 영향 미리보기를 생성한다.
 */
export function validateAppVersionPolicy(input: {
  readonly latestVersion: string;
  readonly minVersion: string;
}): {
  readonly canSave: boolean;
  readonly forceUpdateEnabled: boolean;
  readonly impactSummaryKo: string;
} {
  const latest = parseSemverTuple(input.latestVersion);
  const min = parseSemverTuple(input.minVersion);

  if (!latest || !min) {
    return {
      canSave: false,
      forceUpdateEnabled: false,
      impactSummaryKo: "1.0.17 형식(숫자와 점)이어야 합니다",
    };
  }

  const cmp = compareSemverTuples(min, latest);
  if (cmp > 0) {
    return {
      canSave: false,
      forceUpdateEnabled: false,
      impactSummaryKo: `최소 버전(${input.minVersion})이 최신 버전(${input.latestVersion})보다 높습니다. 스토어에 없는 버전을 요구하게 되어 모든 사용자가 앱을 쓸 수 없게 됩니다.`,
    };
  }

  const isZeroMin = min[0] === 0 && min[1] === 0 && min[2] === 0;
  if (isZeroMin) {
    return {
      canSave: true,
      forceUpdateEnabled: false,
      impactSummaryKo: `강제 없음 — 최소 버전이 0.0.0 이라 아무도 차단되지 않습니다. ${input.latestVersion} 미만은 권장 팝업이 뜹니다.`,
    };
  }

  if (cmp === 0) {
    return {
      canSave: true,
      forceUpdateEnabled: true,
      impactSummaryKo: `최소 버전과 최신 버전이 같습니다 — ${input.latestVersion} 를 쓰지 않는 모든 사용자가 차단됩니다.`,
    };
  }

  return {
    canSave: true,
    forceUpdateEnabled: true,
    impactSummaryKo: `${input.minVersion} 미만은 강제 업데이트(닫을 수 없는 팝업), ${input.minVersion} 이상 ~ ${input.latestVersion} 미만은 권장 업데이트('나중에' 가능).`,
  };
}
