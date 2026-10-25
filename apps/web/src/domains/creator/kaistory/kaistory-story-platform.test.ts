import { describe, expect, it } from "vitest";

import {
  compareContiAndStoryEpisode,
  compareContiAndStoryKeywords,
  evaluateStudentExposureStatus,
  resolveStudyCardForViewer,
  validateAppVersionPolicy,
} from "./kaistory-story-platform";

describe("kaistory-story-platform", () => {
  it("콘티 서버와 Story 서버의 언어별 웹툰·만화·소설 해시를 비교해 변경분과 초과분을 분류한다", () => {
    const emptyEntry = {
      contiWebtoon: [],
      serverWebtoon: [],
      contiManga: [],
      serverManga: [],
      contiNovelHash: "",
      serverNovelHash: "",
    };

    const result = compareContiAndStoryEpisode({
      byLang: {
        ko: {
          contiWebtoon: [
            { id: "cut-1", hash: "h1" },
            { id: "cut-2", hash: "h2-new" },
          ],
          serverWebtoon: [
            { id: "cut-1", hash: "h1" },
            { id: "cut-2", hash: "h2-old" },
            { id: "cut-3-orphan", hash: "h3" },
          ],
          contiManga: [{ id: "page-1", hash: "p1" }],
          serverManga: [{ id: "page-1", hash: "p1" }],
          contiNovelHash: "novel-v2",
          serverNovelHash: "novel-v1",
        },
        en: emptyEntry,
        ja: emptyEntry,
        zh: emptyEntry,
        ru: emptyEntry,
      },
    });

    const koDiff = result.find((r) => r.lang === "ko")!;
    expect(koDiff.webtoonStatus).toBe("changed");
    expect(koDiff.uploadTargetIds).toEqual(["cut-2"]);
    expect(koDiff.excessServerAssetIds).toEqual(["cut-3-orphan"]);
    expect(koDiff.novelStatus).toBe("changed");
  });

  it("콘티 서버와 Story 서버 키워드를 비교하고 만화 이미지가 없는 페이지 키워드를 분리한다", () => {
    const kwCheck = compareContiAndStoryKeywords({
      contiEpisodeKeywords: ["중력", "가속도"],
      storyEpisodeKeywords: ["중력"],
      contiPageKeywordsByPage: {
        1: ["자유낙하"],
        2: ["무중력"],
      },
      storyPageKeywordsByPage: {
        1: ["자유낙하"],
      },
      uploadedMangaPageNumbers: new Set([1]),
    });

    expect(kwCheck.contiManagesKeywords).toBe(true);
    expect(kwCheck.isIdentical).toBe(false);
    expect(kwCheck.skippedPagesWithoutMangaImage).toEqual([2]);
    expect(kwCheck.statusMessageKo).toBe("콘티와 다릅니다");
  });

  it("학생 노출 설정과 언어별 서비스 기간을 평가한다", () => {
    const active = evaluateStudentExposureStatus({
      exposedToStudents: true,
      todayIsoDate: "2026-10-26",
      lang: "ko",
      defaultWindow: { startDate: "2026-10-01", endDate: "2026-11-01" },
    });
    expect(active.status).toBe("active");
    expect(active.labelKo).toBe("노출 중");

    const invalid = evaluateStudentExposureStatus({
      exposedToStudents: true,
      todayIsoDate: "2026-10-26",
      lang: "en",
      defaultWindow: { startDate: "2026-10-01", endDate: "2026-11-01" },
      langWindows: {
        en: { startDate: "2026-12-01", endDate: "2026-11-01" },
      },
    });
    expect(invalid.status).toBe("invalid_range");
    expect(invalid.labelKo).toBe("종료일은 시작일 이후여야 합니다.");
  });

  it("학습카드 뷰어 폴백(한국어 카드 대체, 웹툰 카드 대체, 언어별 QR 링크)을 해석한다", () => {
    const card = {
      cardId: "sc-101",
      baseQrLink: "https://www.kaion.kr/materials/101",
      langQrLinks: {
        en: "https://www.kaion.kr/materials/101?lang=en",
      },
      webtoonImageByLang: {
        ko: "/cards/sc-101-webtoon-ko.png",
      },
      mangaImageByLang: {},
      kaitoonVisible: true,
      mangaVisible: true,
    };

    const mangaEn = resolveStudyCardForViewer({
      card,
      viewerMode: "manga",
      lang: "en",
    });
    expect(mangaEn.visible).toBe(true);
    expect(mangaEn.imageUrl).toBe("/cards/sc-101-webtoon-ko.png");
    expect(mangaEn.qrLink).toBe("https://www.kaion.kr/materials/101?lang=en");
    expect(mangaEn.fallbackNoticeKo).toBe("만화 카드 없음 · 한국어 웹툰 카드로 대신");
  });

  it("앱 버전 정책(minVersion vs latestVersion)을 검증하고 역전 설정을 차단한다", () => {
    const blocked = validateAppVersionPolicy({
      latestVersion: "1.0.17",
      minVersion: "1.0.18",
    });
    expect(blocked.canSave).toBe(false);
    expect(blocked.impactSummaryKo).toContain("스토어에 없는 버전을 요구하게 되어");

    const noForce = validateAppVersionPolicy({
      latestVersion: "1.0.17",
      minVersion: "0.0.0",
    });
    expect(noForce.canSave).toBe(true);
    expect(noForce.forceUpdateEnabled).toBe(false);

    const partialForce = validateAppVersionPolicy({
      latestVersion: "1.2.0",
      minVersion: "1.1.0",
    });
    expect(partialForce.canSave).toBe(true);
    expect(partialForce.forceUpdateEnabled).toBe(true);
    expect(partialForce.impactSummaryKo).toContain("1.1.0 미만은 강제 업데이트");
  });
});
