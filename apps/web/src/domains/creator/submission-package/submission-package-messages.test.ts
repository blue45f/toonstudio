import { describe, expect, it } from "vitest";

import {
  describeSubmissionIssue,
  resolveSubmissionLocale,
  SUBMISSION_COMPLETENESS_LABELS,
} from "./submission-package-messages";
import { evaluateSubmissionPackage } from "./submission-package-preflight";
import { completeDraft, episodeOf, failedPage, readyPage, sheetOf } from "./submission-package.test-fixture";
import {
  SUBMISSION_ISSUE_CODES,
  SUBMISSION_PACKAGE_LIMITS,
  type SubmissionIssue,
  type SubmissionIssueCode,
} from "./submission-package-types";

const HANGUL = /[가-힣]/u;

/** 코드마다 문구에 들어가는 값을 모두 채운 견본 이슈. */
function sample(code: SubmissionIssueCode): SubmissionIssue {
  return {
    code,
    severity: "warning",
    target: { kind: "package" },
    params: {
      field: "logline",
      max: 1_000,
      length: 1_200,
      required: 3,
      actual: 2,
      number: 4,
      missing: "3, 5",
      name: "p1.png",
      bytes: 6_000_000,
      count: 2,
      label: "네이버",
      expected: 690,
      found: "720, 1080",
      widths: "690, 720",
    },
  };
}

describe("점검 문구", () => {
  it("모든 이슈 코드가 한국어·영어 제목과 안내를 가진다", () => {
    for (const code of SUBMISSION_ISSUE_CODES) {
      for (const locale of ["ko", "en"] as const) {
        const text = describeSubmissionIssue(sample(code), locale);
        expect(text.title.trim().length, `${code}/${locale} title`).toBeGreaterThan(0);
        expect(text.hint.trim().length, `${code}/${locale} hint`).toBeGreaterThan(0);
        expect(text.title, `${code}/${locale}`).not.toContain("undefined");
        expect(text.hint, `${code}/${locale}`).not.toContain("undefined");
      }
    }
  });

  it("영어 문구에는 한글이 섞이지 않는다(사용자가 넣은 값 제외)", () => {
    for (const code of SUBMISSION_ISSUE_CODES) {
      const issue: SubmissionIssue = { ...sample(code), params: { ...sample(code).params, label: "Naver", name: "p1.png", field: "logline" } };
      const text = describeSubmissionIssue(issue, "en");
      expect(HANGUL.test(text.title), `${code} title: ${text.title}`).toBe(false);
      expect(HANGUL.test(text.hint), `${code} hint: ${text.hint}`).toBe(false);
    }
  });

  it("값이 문구에 그대로 들어간다", () => {
    const tooFew = describeSubmissionIssue(sample("episodes-too-few"), "ko");
    expect(tooFew.title).toBe("쓸 수 있는 회차가 2화예요 — 투고에는 최소 3화가 필요해요");
    const mismatch = describeSubmissionIssue(sample("width-mismatch"), "ko");
    expect(mismatch.title).toBe("2장이 네이버 690px이 아니에요 (현재 720, 1080px)");
    const big = describeSubmissionIssue(sample("page-too-large"), "en");
    expect(big.title).toBe("“p1.png” is too large at 5.7MB (max 1KB)");
  });

  it("글자 수 초과 문구는 어느 칸인지 사람이 읽는 이름으로 말한다", () => {
    const plain: SubmissionIssue = { ...sample("text-too-long"), params: { field: "logline", max: 1_000, length: 1_200 } };
    expect(describeSubmissionIssue(plain, "ko").title).toBe("로그라인이(가) 너무 길어요 (1200자 / 최대 1000자)");
    const character: SubmissionIssue = { ...sample("text-too-long"), params: { field: "character.personality", max: 1_500, length: 1_700, name: "한도깨" } };
    expect(describeSubmissionIssue(character, "ko").title).toContain("캐릭터 성격(한도깨)");
    expect(describeSubmissionIssue(character, "en").title).toContain("Character personality (한도깨)");
  });

  it("투고처 용량·폭 기준은 앱의 일반 기준값이고 최신 안내를 확인하라고 말한다", () => {
    expect(describeSubmissionIssue(sample("platform-file-over"), "ko").hint).toContain("투고처의 최신 안내를 확인");
    expect(describeSubmissionIssue(sample("platform-episode-over"), "en").hint).toContain("current guidelines");
    expect(describeSubmissionIssue(sample("width-mismatch"), "ko").hint).toContain("투고처의 최신 안내가 우선");
  });

  it("앱이 정한 상한이라는 점을 숨기지 않는다", () => {
    expect(describeSubmissionIssue(sample("package-too-large"), "ko").hint).toContain("앱이 정한 값");
    expect(describeSubmissionIssue(sample("page-too-large"), "en").hint).toContain("set by the app");
  });
});

describe("점검 결과가 만드는 실제 문구", () => {
  it("실제 점검 결과의 모든 이슈를 두 언어로 문구로 바꿀 수 있다", () => {
    const draft = completeDraft({
      title: "",
      logline: "",
      synopsis: "",
      authorName: "",
      characters: [sheetOf("a", { personality: "" })],
      episodes: [
        episodeOf(1, [readyPage({ id: "a", width: 720, size: SUBMISSION_PACKAGE_LIMITS.softFileBytes + 1 }), failedPage({ id: "b", failure: "unsupported" })]),
        episodeOf(2, []),
        episodeOf(2, [readyPage({ id: "c" })]),
      ],
    });
    const report = evaluateSubmissionPackage({ draft, platform: { label: "네이버 도전만화", maxFileBytes: 1_000, maxEpisodeBytes: 1_000 } });
    expect(report.issues.length).toBeGreaterThan(8);
    for (const issue of report.issues) {
      for (const locale of ["ko", "en"] as const) {
        const text = describeSubmissionIssue(issue, locale);
        expect(text.title.length).toBeGreaterThan(0);
        expect(text.title).not.toContain("undefined");
        expect(text.title).not.toContain("NaN");
      }
    }
  });
});

describe("언어 선택과 구성 라벨", () => {
  it("한국어 계열만 한국어, 나머지는 영어로 고른다", () => {
    expect(resolveSubmissionLocale("ko")).toBe("ko");
    expect(resolveSubmissionLocale("ko-KR")).toBe("ko");
    expect(resolveSubmissionLocale("KO_kr")).toBe("ko");
    expect(resolveSubmissionLocale("en")).toBe("en");
    expect(resolveSubmissionLocale("ja")).toBe("en");
    expect(resolveSubmissionLocale(null)).toBe("en");
    expect(resolveSubmissionLocale(undefined)).toBe("en");
  });

  it("구성 항목 라벨은 한국어·영어가 모두 있다", () => {
    for (const label of Object.values(SUBMISSION_COMPLETENESS_LABELS)) {
      expect(HANGUL.test(label.ko)).toBe(true);
      expect(HANGUL.test(label.en)).toBe(false);
    }
  });
});
