import { describe, expect, it } from "vitest";

import { WEBTOON_WIDTH_STANDARDS } from "../studio-webtoon-guides";

import { evaluateSubmissionPackage, submissionTargetWidth } from "./submission-package-preflight";
import {
  completeDraft,
  episodeOf,
  failedPage,
  readyPage,
  sheetOf,
  threeEpisodes,
} from "./submission-package.test-fixture";
import {
  SUBMISSION_PACKAGE_LIMITS,
  SUBMISSION_PACKAGE_MIN_EPISODES,
  type SubmissionIssueCode,
  type SubmissionPackageLimits,
} from "./submission-package-types";

function codes(report: ReturnType<typeof evaluateSubmissionPackage>): SubmissionIssueCode[] {
  return report.issues.map((issue) => issue.code);
}

describe("투고 패키지 점검 — 최소 회차", () => {
  it("완성된 3화 초안은 막는 문제도 알릴 문제도 없다", () => {
    const report = evaluateSubmissionPackage({ draft: completeDraft() });
    expect(report.issues).toEqual([]);
    expect(report.canBuild).toBe(true);
    expect(report.completeness).toMatchObject({ done: 5, total: 5 });
    expect(report.totalFiles).toBe(6);
    expect(report.totalBytes).toBe(15_000);
  });

  it(`최소 ${SUBMISSION_PACKAGE_MIN_EPISODES}화가 안 되면 오류로 막고 실제 회차 수를 알린다`, () => {
    const draft = completeDraft({ episodes: completeDraft().episodes.slice(0, 2) });
    const report = evaluateSubmissionPackage({ draft });
    const issue = report.issues.find((entry) => entry.code === "episodes-too-few");
    expect(issue).toMatchObject({ severity: "error", params: { required: 3, actual: 2 } });
    expect(report.canBuild).toBe(false);
    expect(report.completeness.items.find((item) => item.key === "episodes")?.done).toBe(false);
  });

  it("이미지가 없는 회차는 3화로 세지 않고 빈 회차로도 알린다", () => {
    const base = completeDraft();
    const [ep1, ep2] = threeEpisodes(base);
    const draft = completeDraft({ episodes: [ep1, ep2, episodeOf(3, [])] });
    const report = evaluateSubmissionPackage({ draft });
    expect(codes(report)).toEqual(expect.arrayContaining(["episodes-too-few", "episode-empty"]));
    expect(report.issues.find((entry) => entry.code === "episodes-too-few")?.params).toMatchObject({ actual: 2 });
  });

  it("읽을 수 없는 이미지만 있는 회차도 3화로 세지 않는다", () => {
    const base = completeDraft();
    const [ep1, ep2] = threeEpisodes(base);
    const draft = completeDraft({
      episodes: [ep1, ep2, episodeOf(3, [failedPage({ id: "bad", failure: "unreadable" })])],
    });
    const report = evaluateSubmissionPackage({ draft });
    expect(report.issues.find((entry) => entry.code === "episodes-too-few")?.params).toMatchObject({ actual: 2 });
    expect(codes(report)).toContain("page-unreadable");
  });

  it("회차가 아예 없으면 0화로 알린다", () => {
    const report = evaluateSubmissionPackage({ draft: completeDraft({ episodes: [] }) });
    expect(report.issues.find((entry) => entry.code === "episodes-too-few")?.params).toMatchObject({ actual: 0 });
  });
});

describe("투고 패키지 점검 — 회차 번호", () => {
  it("중복 번호는 겹친 회차마다 오류다", () => {
    const base = completeDraft();
    const [ep1, ep2, ep3] = threeEpisodes(base);
    const draft = completeDraft({ episodes: [ep1, { ...ep2, number: 1 }, ep3] });
    const duplicates = evaluateSubmissionPackage({ draft }).issues.filter((issue) => issue.code === "episode-number-duplicate");
    expect(duplicates).toHaveLength(2);
    expect(duplicates.every((issue) => issue.severity === "error")).toBe(true);
  });

  it("번호를 건너뛰면 경고로 빠진 번호를 알리고 막지는 않는다", () => {
    const base = completeDraft();
    const [ep1, ep2, ep3] = threeEpisodes(base);
    const draft = completeDraft({ episodes: [ep1, ep2, { ...ep3, number: 5 }] });
    const report = evaluateSubmissionPackage({ draft });
    expect(report.issues.find((issue) => issue.code === "episode-number-gap")).toMatchObject({ severity: "warning", params: { missing: "3, 4" } });
    expect(report.canBuild).toBe(true);
  });

  it("0 이하·소수 번호는 올바르지 않다", () => {
    const base = completeDraft();
    const [ep1, ep2, ep3] = threeEpisodes(base);
    const draft = completeDraft({ episodes: [{ ...ep1, number: 0 }, { ...ep2, number: 1.5 }, ep3] });
    expect(evaluateSubmissionPackage({ draft }).issues.filter((issue) => issue.code === "episode-number-invalid")).toHaveLength(2);
  });
});

describe("투고 패키지 점검 — 가로 폭 규격", () => {
  it("점검 기준 id 는 표준폭 가이드의 값을 그대로 쓴다(네이버 690·카카오 720)", () => {
    expect(submissionTargetWidth("naver")).toMatchObject({ width: 690 });
    expect(submissionTargetWidth("kakao")).toMatchObject({ width: 720 });
    expect(submissionTargetWidth("any")).toBeNull();
    for (const standard of WEBTOON_WIDTH_STANDARDS) {
      expect(submissionTargetWidth(standard.id)).toMatchObject({ width: standard.width, label: standard.label });
    }
  });

  it("기준 폭과 다른 이미지가 있는 회차는 경고하고 현재 폭을 알린다", () => {
    const draft = completeDraft({
      episodes: [
        episodeOf(1, [readyPage({ id: "a", width: 690 }), readyPage({ id: "b", width: 720 })]),
        episodeOf(2, [readyPage({ id: "c", width: 1080 })]),
        episodeOf(3, [readyPage({ id: "d", width: 690 })]),
      ],
    });
    const mismatches = evaluateSubmissionPackage({ draft }).issues.filter((issue) => issue.code === "width-mismatch");
    expect(mismatches).toHaveLength(2);
    expect(mismatches[0]).toMatchObject({ severity: "warning", target: { kind: "episode", episodeId: "ep-1" }, params: { expected: 690, count: 1, found: "720" } });
    expect(mismatches[1]).toMatchObject({ params: { expected: 690, count: 1, found: "1080" } });
  });

  it("카카오 기준으로 바꾸면 690px 이미지가 어긋난다", () => {
    const report = evaluateSubmissionPackage({ draft: completeDraft({ targetWidth: "kakao" }) });
    const mismatches = report.issues.filter((issue) => issue.code === "width-mismatch");
    expect(mismatches).toHaveLength(3);
    expect(mismatches[0]?.params).toMatchObject({ expected: 720, found: "690" });
    expect(report.canBuild).toBe(true);
  });

  it("기준을 고르지 않으면 폭을 비교하지 않고, 폭이 섞여 있을 때만 알린다", () => {
    const uniform = evaluateSubmissionPackage({ draft: completeDraft({ targetWidth: "any" }) });
    expect(codes(uniform)).not.toContain("width-mismatch");
    expect(codes(uniform)).not.toContain("width-mixed");
    const mixed = completeDraft({
      targetWidth: "any",
      episodes: [
        episodeOf(1, [readyPage({ id: "a", width: 690 })]),
        episodeOf(2, [readyPage({ id: "b", width: 720 })]),
        episodeOf(3, [readyPage({ id: "c", width: 690 })]),
      ],
    });
    expect(evaluateSubmissionPackage({ draft: mixed }).issues.find((issue) => issue.code === "width-mixed")).toMatchObject({ params: { widths: "690, 720" } });
  });

  it("회차별 통계에 가로 폭 목록이 오름차순으로 들어간다", () => {
    const draft = completeDraft({
      episodes: [
        episodeOf(1, [readyPage({ id: "a", width: 720 }), readyPage({ id: "b", width: 690 }), readyPage({ id: "c", width: 690 })]),
        episodeOf(2, [readyPage({ id: "d" })]),
        episodeOf(3, [readyPage({ id: "e" })]),
      ],
    });
    expect(evaluateSubmissionPackage({ draft }).episodeStats[0]).toMatchObject({ pageCount: 3, readablePageCount: 3, widths: [690, 720] });
  });
});

describe("투고 패키지 점검 — 파일 크기", () => {
  const limits: SubmissionPackageLimits = { ...SUBMISSION_PACKAGE_LIMITS, maxFileBytes: 10_000, softFileBytes: 5_000, maxTotalBytes: 40_000, softTotalBytes: 25_000 };

  function draftWithSizes(sizes: readonly number[]) {
    const [first = 1_000, second = 1_000, third = 1_000] = sizes;
    return completeDraft({
      episodes: [
        episodeOf(1, [readyPage({ id: "a", size: first })]),
        episodeOf(2, [readyPage({ id: "b", size: second })]),
        episodeOf(3, [readyPage({ id: "c", size: third })]),
      ],
    });
  }

  it("한 장이 상한을 넘으면 오류, 권장선을 넘으면 경고다", () => {
    const over = evaluateSubmissionPackage({ draft: draftWithSizes([12_000]), limits });
    expect(over.issues.find((issue) => issue.code === "page-too-large")).toMatchObject({ severity: "error", target: { kind: "page", pageId: "a" } });
    expect(over.canBuild).toBe(false);
    const soft = evaluateSubmissionPackage({ draft: draftWithSizes([6_000]), limits });
    expect(soft.issues.find((issue) => issue.code === "page-large")).toMatchObject({ severity: "warning" });
    expect(soft.canBuild).toBe(true);
  });

  it("전체 용량이 상한을 넘으면 오류, 권장선을 넘으면 경고다", () => {
    const over = evaluateSubmissionPackage({ draft: draftWithSizes([9_000, 9_000, 9_000]), limits: { ...limits, maxTotalBytes: 20_000 } });
    expect(over.issues.find((issue) => issue.code === "package-too-large")).toMatchObject({ severity: "error", params: { bytes: 27_000, max: 20_000 } });
    const soft = evaluateSubmissionPackage({ draft: draftWithSizes([4_000, 4_000, 4_000]), limits: { ...limits, softTotalBytes: 10_000 } });
    expect(soft.issues.find((issue) => issue.code === "package-large")).toMatchObject({ severity: "warning" });
    expect(soft.canBuild).toBe(true);
  });

  it("전체 파일 수가 상한을 넘으면 오류다", () => {
    const report = evaluateSubmissionPackage({ draft: completeDraft(), limits: { ...limits, maxFileBytes: 50_000, maxTotalBytes: 500_000, maxFiles: 4 } });
    expect(report.issues.find((issue) => issue.code === "package-files-too-many")).toMatchObject({ severity: "error", params: { max: 4, actual: 6 } });
  });

  it("투고처 용량 기준이 있으면 한 장 기준·회차 합계 기준 초과를 경고로 알린다", () => {
    const draft = draftWithSizes([6_000, 1_000, 1_000]);
    const report = evaluateSubmissionPackage({
      draft,
      limits: { ...limits, softFileBytes: 50_000 },
      platform: { label: "네이버 도전만화", maxFileBytes: 5_000, maxEpisodeBytes: 5_500 },
    });
    expect(report.issues.find((issue) => issue.code === "platform-file-over")).toMatchObject({ severity: "warning", params: { label: "네이버 도전만화", count: 1, max: 5_000 } });
    expect(report.issues.find((issue) => issue.code === "platform-episode-over")).toMatchObject({ params: { bytes: 6_000, max: 5_500 } });
    expect(report.canBuild).toBe(true);
  });

  it("투고처 기준이 없으면 플랫폼 용량 점검을 건너뛴다", () => {
    const report = evaluateSubmissionPackage({ draft: draftWithSizes([30_000_000, 1, 1]), platform: { label: "기준 없음" } });
    expect(codes(report)).not.toContain("platform-file-over");
    expect(codes(report)).not.toContain("platform-episode-over");
  });
});

describe("투고 패키지 점검 — 이미지 판독 실패", () => {
  it("지원하지 않는 형식·읽지 못함·빈 파일을 각각 오류로 알리고 만들 수 없게 한다", () => {
    const base = completeDraft();
    const [ep1, ep2, ep3] = threeEpisodes(base);
    const bad = [
      failedPage({ id: "u", failure: "unsupported", name: "a.gif" }),
      failedPage({ id: "r", failure: "unreadable", name: "b.png" }),
      failedPage({ id: "e", failure: "empty", name: "c.png" }),
    ];
    const draft = completeDraft({ episodes: [{ ...ep1, pages: [...ep1.pages, ...bad] }, ep2, ep3] });
    const report = evaluateSubmissionPackage({ draft });
    expect(codes(report)).toEqual(expect.arrayContaining(["page-unsupported", "page-unreadable", "page-empty"]));
    expect(report.issues.filter((issue) => issue.severity === "error")).toHaveLength(3);
    expect(report.canBuild).toBe(false);
    // 읽을 수 없는 쪽은 용량·개수에 넣지 않는다.
    expect(report.totalFiles).toBe(6);
  });
});

describe("투고 패키지 점검 — 누락 항목 안내", () => {
  it("제목이 없으면 오류, 로그라인·시놉시스·캐릭터 시트가 없으면 경고, 작가명은 정보다", () => {
    const report = evaluateSubmissionPackage({ draft: completeDraft({ title: "  ", logline: "", synopsis: "", authorName: "", characters: [] }) });
    const bySeverity = (severity: string) => report.issues.filter((issue) => issue.severity === severity).map((issue) => issue.code);
    expect(bySeverity("error")).toEqual(["title-missing"]);
    expect(bySeverity("warning")).toEqual(["logline-missing", "synopsis-missing", "characters-missing"]);
    expect(bySeverity("info")).toEqual(["author-missing"]);
    expect(report.canBuild).toBe(false);
    expect(report.completeness.done).toBe(1);
    expect(report.completeness.items.filter((item) => !item.done).map((item) => item.key)).toEqual(["title", "logline", "synopsis", "characters", "author"]);
  });

  it("로그라인·시놉시스·캐릭터 시트가 없어도 3화가 있고 제목이 있으면 만들 수 있다", () => {
    const report = evaluateSubmissionPackage({ draft: completeDraft({ logline: "", synopsis: "", characters: [], authorName: "" }) });
    expect(report.canBuild).toBe(true);
    expect(report.warningCount).toBe(3);
  });

  it("거의 빈 캐릭터 시트는 경고한다", () => {
    const draft = completeDraft({ characters: [sheetOf("a", { personality: "" }), sheetOf("b")] });
    const thin = evaluateSubmissionPackage({ draft }).issues.filter((issue) => issue.code === "character-sheet-thin");
    expect(thin).toHaveLength(1);
    expect(thin[0]).toMatchObject({ target: { kind: "character", characterId: "a" } });
  });

  it("공백뿐인 글은 비어 있는 것으로 센다", () => {
    const report = evaluateSubmissionPackage({ draft: completeDraft({ logline: " \n\t ", synopsis: "‎‮" }) });
    expect(codes(report)).toEqual(expect.arrayContaining(["logline-missing", "synopsis-missing"]));
  });
});

describe("투고 패키지 점검 — 글자 수", () => {
  it("상한을 넘는 글은 자르지 않고 오류로 알린다", () => {
    const limitsSmall: SubmissionPackageLimits = { ...SUBMISSION_PACKAGE_LIMITS, loglineChars: 10, synopsisChars: 20, titleChars: 5 };
    const report = evaluateSubmissionPackage({
      draft: completeDraft({ title: "가나다라마바", logline: "가".repeat(11), synopsis: "나".repeat(21) }),
      limits: limitsSmall,
    });
    const tooLong = report.issues.filter((issue) => issue.code === "text-too-long");
    expect(tooLong.map((issue) => issue.params.field)).toEqual(["title", "logline", "synopsis"]);
    expect(tooLong[1]?.params).toMatchObject({ max: 10, length: 11 });
    expect(report.canBuild).toBe(false);
  });

  it("글자 수는 코드 포인트로 센다", () => {
    const report = evaluateSubmissionPackage({
      draft: completeDraft({ logline: "😀".repeat(5) }),
      limits: { ...SUBMISSION_PACKAGE_LIMITS, loglineChars: 5 },
    });
    expect(codes(report)).not.toContain("text-too-long");
  });

  it("회차 제목·메모와 캐릭터 시트 칸도 상한을 점검한다", () => {
    const base = completeDraft();
    const [ep1, ep2, ep3] = threeEpisodes(base);
    const draft = completeDraft({
      episodes: [{ ...ep1, title: "가".repeat(101), note: "나".repeat(301) }, ep2, ep3],
      characters: [sheetOf("a", { personality: "다".repeat(1_501) })],
    });
    const fields = evaluateSubmissionPackage({ draft }).issues.filter((issue) => issue.code === "text-too-long").map((issue) => issue.params.field);
    expect(fields).toEqual(["episodeTitle", "episodeNote", "character.personality"]);
  });
});

describe("투고 패키지 점검 — 결과 정렬과 한계", () => {
  it("오류, 경고, 정보 순으로 정렬하고 같은 심각도에서는 발생 순서를 지킨다", () => {
    const report = evaluateSubmissionPackage({ draft: completeDraft({ title: "", logline: "", authorName: "", characters: [] }) });
    const severities = report.issues.map((issue) => issue.severity);
    expect(severities).toEqual([...severities].sort((left, right) => ["error", "warning", "info"].indexOf(left) - ["error", "warning", "info"].indexOf(right)));
    expect(report.errorCount + report.warningCount + report.infoCount).toBe(report.issues.length);
  });

  it("회차·캐릭터 수가 상한을 넘으면 오류다", () => {
    const report = evaluateSubmissionPackage({
      draft: completeDraft({ characters: [sheetOf("a"), sheetOf("b"), sheetOf("c")] }),
      limits: { ...SUBMISSION_PACKAGE_LIMITS, maxCharacters: 2, maxEpisodes: 2 },
    });
    expect(codes(report)).toEqual(expect.arrayContaining(["characters-too-many", "episodes-too-many"]));
  });

  it("한 회차의 이미지 수가 상한을 넘으면 오류다", () => {
    const report = evaluateSubmissionPackage({ draft: completeDraft(), limits: { ...SUBMISSION_PACKAGE_LIMITS, maxPagesPerEpisode: 1 } });
    expect(report.issues.filter((issue) => issue.code === "episode-pages-too-many")).toHaveLength(3);
  });

  it("같은 입력은 같은 결과를 낸다", () => {
    const draft = completeDraft({ title: "", characters: [] });
    expect(evaluateSubmissionPackage({ draft })).toEqual(evaluateSubmissionPackage({ draft }));
  });
});
