import { describe, expect, it } from "vitest";

import {
  buildSubmissionCharactersMarkdown,
  buildSubmissionCoverMarkdown,
  buildSubmissionSynopsisMarkdown,
  type SubmissionCoverInput,
} from "./submission-package-cover";
import { planSubmissionPackageLayout } from "./submission-package-layout";
import { evaluateSubmissionPackage } from "./submission-package-preflight";
import { completeDraft, episodeOf, readyPage, sheetOf } from "./submission-package.test-fixture";
import type { SubmissionPackageDraft, SubmissionPackageLocale } from "./submission-package-types";

const GENERATED_AT = new Date("2026-10-15T09:30:00.000Z");

function inputOf(
  draft: SubmissionPackageDraft = completeDraft(),
  options: { locale?: SubmissionPackageLocale; includeCoverPdf?: boolean } = {},
): SubmissionCoverInput {
  const report = evaluateSubmissionPackage({ draft });
  const layout = planSubmissionPackageLayout(draft, { includeCoverPdf: options.includeCoverPdf ?? false });
  return { draft, report, layout, locale: options.locale ?? "ko", generatedAt: GENERATED_AT };
}

describe("표지 Markdown", () => {
  it("제목·작가·만든 날·구성 요약과 로그라인·시놉시스·회차 표를 담는다", () => {
    const markdown = buildSubmissionCoverMarkdown(inputOf());
    expect(markdown).toContain("# 달빛 아래 편의점");
    expect(markdown).toContain("- 작가: 밤토끼");
    expect(markdown).toContain("- 만든 날: 2026-10-15");
    expect(markdown).toContain("- 구성: 회차 3화 · 이미지 6장 · 합계 15KB · 캐릭터 시트 1개");
    expect(markdown).toContain("- 가로 폭 점검 기준: 네이버 690px");
    expect(markdown).toContain("## 로그라인\n\n> 야간 편의점 알바생이 밤마다 찾아오는 손님들의 사연을 듣는다.");
    expect(markdown).toContain("> 첫 손님은 길을 잃은 도깨비다.\n>\n> 두 번째 손님은 시간을 파는 상인이다.");
    expect(markdown).toContain("| 회차 | 제목 | 쪽 | 가로 폭(px) | 용량 | 메모 |");
    expect(markdown).toContain("| 1화 | 1화 제목 | 2 | 690 | 5KB | — |");
  });

  it("묶음 구성은 실제로 담기는 파일과 같다", () => {
    const withoutPdf = buildSubmissionCoverMarkdown(inputOf());
    expect(withoutPdf).toContain("`cover.md`");
    expect(withoutPdf).toContain("`synopsis.md`");
    expect(withoutPdf).toContain("`characters.md`");
    expect(withoutPdf).toContain("`manifest.json`");
    expect(withoutPdf).toContain("`episodes/ep-001/` — 1화 원고 이미지 2장");
    expect(withoutPdf).not.toContain("cover.pdf");
    expect(buildSubmissionCoverMarkdown(inputOf(completeDraft(), { includeCoverPdf: true }))).toContain("`cover.pdf`");
  });

  it("갖추지 못한 구성을 맨 위에 알리고 점검 결과 목록에 경고를 싣는다", () => {
    const markdown = buildSubmissionCoverMarkdown(inputOf(completeDraft({ logline: "", synopsis: "", characters: [] })));
    expect(markdown).toContain("> **아직 갖추지 못한 구성**: 로그라인, 시놉시스, 캐릭터 시트");
    expect(markdown).toContain("## 로그라인\n\n_작성하지 않음_");
    expect(markdown).toContain("담긴 캐릭터 시트가 없어요.");
    expect(markdown).toContain("알릴 내용이 3건 있어요.");
    expect(markdown).toContain("- 로그라인이 비어 있어요");
  });

  it("문제가 없으면 점검 결과는 한 줄로 끝난다", () => {
    expect(buildSubmissionCoverMarkdown(inputOf())).toContain("## 만들기 전 점검\n\n막는 문제도, 알릴 문제도 없었어요.");
  });

  it("사용자가 적은 글은 이스케이프해서 HTML·제목·표 구조를 깨지 못한다", () => {
    const draft = completeDraft({
      title: "<img src=x onerror=alert(1)>",
      authorName: "**굵게|작가**",
      logline: "# 가짜 제목\n- 가짜 목록",
      episodes: [
        episodeOf(1, [readyPage({ id: "a" })], { title: "a|b", note: "[링크](http://evil)" }),
        episodeOf(2, [readyPage({ id: "b" })]),
        episodeOf(3, [readyPage({ id: "c" })]),
      ],
    });
    const markdown = buildSubmissionCoverMarkdown(inputOf(draft));
    expect(markdown).not.toContain("<img");
    expect(markdown).toContain("# &lt;img src=x onerror=alert(1)&gt;");
    expect(markdown).toContain("- 작가: \\*\\*굵게\\|작가\\*\\*");
    expect(markdown).toContain("> \\# 가짜 제목\n> \\- 가짜 목록");
    expect(markdown).toContain("| 1화 | a\\|b | 1 | 690 | 1KB | \\[링크\\](http://evil) |");
  });

  it("같은 입력은 같은 글을 내고, 날짜가 올바르지 않으면 거부한다", () => {
    expect(buildSubmissionCoverMarkdown(inputOf())).toBe(buildSubmissionCoverMarkdown(inputOf()));
    expect(() => buildSubmissionCoverMarkdown({ ...inputOf(), generatedAt: new Date("nope") })).toThrow("valid date");
  });

  it("영어 표지는 영어 라벨과 영어 점검 문구를 쓴다", () => {
    const markdown = buildSubmissionCoverMarkdown(inputOf(completeDraft({ logline: "" }), { locale: "en" }));
    expect(markdown).toContain("- Author: 밤토끼");
    expect(markdown).toContain("- Created on: 2026-10-15");
    expect(markdown).toContain("## Logline\n\n_not written_");
    expect(markdown).toContain("| Episode | Title | Pages | Width (px) | Size | Note |");
    expect(markdown).toContain("The logline is empty");
    expect(markdown).toContain("was not uploaded to any server");
  });

  it("끝맺음에 서버로 올리지 않았다는 점과 투고처 안내 확인을 적는다", () => {
    const markdown = buildSubmissionCoverMarkdown(inputOf());
    expect(markdown).toContain("어떤 서버에도 올리지 않았어요");
    expect(markdown).toContain("투고처의 최신 안내를 확인해 주세요");
  });
});

describe("시놉시스 Markdown", () => {
  it("제목 아래 로그라인과 시놉시스를 인용으로 담는다", () => {
    const markdown = buildSubmissionSynopsisMarkdown(inputOf());
    expect(markdown.startsWith("# 달빛 아래 편의점\n")).toBe(true);
    expect(markdown).toContain("## 로그라인\n\n> 야간 편의점");
    expect(markdown).toContain("## 시놉시스\n\n> 첫 손님은");
  });

  it("비어 있으면 작성하지 않음으로 표시한다", () => {
    expect(buildSubmissionSynopsisMarkdown(inputOf(completeDraft({ synopsis: "" })))).toContain("## 시놉시스\n\n_작성하지 않음_");
  });
});

describe("캐릭터 시트 Markdown", () => {
  const sheet = sheetOf("a", {
    name: "한도깨",
    aliases: ["도깨비", "첫 손님"],
    personality: "겁이 많다.",
    speechStyle: "~하오 체",
    background: "오래된 우물에서 왔다.",
    motivation: "집으로 돌아가기",
    signatureLines: ["길을 알려 주시오.", "고맙소."],
    appearanceNotes: "뿔 하나가 부러져 있다.",
    relations: [
      { withName: "주인공", direction: "outgoing", kind: "friend", label: "단골", note: "" },
      { withName: "상인", direction: "incoming", kind: "rival", label: "", note: "빚이 있다" },
    ],
  });

  it("칸마다 제목을 붙이고 비어 있는 칸은 건너뛴다", () => {
    const markdown = buildSubmissionCharactersMarkdown(inputOf(completeDraft({ characters: [{ ...sheet, speechStyle: "" }] })));
    expect(markdown).toContain("# 캐릭터 시트 — 달빛 아래 편의점");
    expect(markdown).toContain("## 한도깨");
    expect(markdown).toContain("- 별칭: 도깨비, 첫 손님");
    expect(markdown).toContain("### 성격\n\n> 겁이 많다.");
    expect(markdown).toContain("### 배경\n\n> 오래된 우물에서 왔다.");
    expect(markdown).toContain("### 욕망·목표\n\n> 집으로 돌아가기");
    expect(markdown).not.toContain("### 말투");
    expect(markdown).toContain("### 대표 대사\n\n- “길을 알려 주시오.”\n- “고맙소.”");
    expect(markdown).toContain("### 외형 메모\n\n> 뿔 하나가 부러져 있다.");
  });

  it("관계는 방향 화살표와 라벨(없으면 종류 이름)로 적는다", () => {
    const markdown = buildSubmissionCharactersMarkdown(inputOf(completeDraft({ characters: [sheet] })));
    expect(markdown).toContain("### 관계\n\n- → **주인공** (단골)\n- ← **상인** (라이벌) — 빚이 있다");
  });

  it("서술이 전혀 없는 캐릭터는 비어 있다고 알린다", () => {
    const empty = sheetOf("b", { name: "엑스트라", personality: "" });
    expect(buildSubmissionCharactersMarkdown(inputOf(completeDraft({ characters: [empty] })))).toContain("_서술 시트가 아직 비어 있어요._");
  });

  it("캐릭터가 없으면 없다고 알린다", () => {
    expect(buildSubmissionCharactersMarkdown(inputOf(completeDraft({ characters: [] })))).toContain("담긴 캐릭터 시트가 없어요.");
  });

  it("이름과 시트 글도 이스케이프한다", () => {
    const risky = sheetOf("c", { name: "<b>악당</b>", personality: "# 제목\n<script>x</script>" });
    const markdown = buildSubmissionCharactersMarkdown(inputOf(completeDraft({ characters: [risky] })));
    expect(markdown).not.toContain("<script>");
    expect(markdown).not.toContain("<b>");
    expect(markdown).toContain("> \\# 제목");
  });
});
