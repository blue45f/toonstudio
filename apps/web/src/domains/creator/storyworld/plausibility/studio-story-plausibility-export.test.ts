import { describe, expect, it } from "vitest";

import type { LoreNameFinding } from "../../planning/studio-lore-name-check";
import {
  buildPlausibilityExport,
  plausibilityExportFileName,
  plausibilityExportToJson,
  plausibilityExportToMarkdown,
  redactPlausibilityText,
  PLAUSIBILITY_EXPORT_FORMAT,
  PLAUSIBILITY_EXPORT_VERSION,
} from "./studio-story-plausibility-export";
import { GOLDEN_STORIES, makeStory } from "./studio-story-plausibility-golden-fixtures";
import { applyPlausibilityDispositions, buildPlausibilityReport } from "./studio-story-plausibility-report";

const NOW = "2026-10-15T09:30:00.000Z";

function reportOf(id: string) {
  const story = GOLDEN_STORIES.find((item) => item.id === id);
  if (!story) throw new Error(`골든 이야기가 없습니다: ${id}`);
  return buildPlausibilityReport({ project: story.project, generatedAtIso: NOW, ...(story.extras ? { extras: story.extras } : {}) });
}

/** 원고 인용에 연락처·이메일이 섞여 있는 이름 표기 발견이 하나 있는 리포트. */
function reportWithSensitiveQuote() {
  const project = makeStory("q", "인용", {
    scenes: [{ id: "s1", title: "시장", order: 10, participantIds: ["haeun"] }],
  });
  const text = "하운이 말했다. 연락은 010-1234-5678 또는 haeun@example.com 으로 줘. https://example.com/a?token=abc";
  const start = text.indexOf("하운");
  const finding: LoreNameFinding = {
    id: "v1", code: "name-variant", severity: "warning", start, end: start + 2, found: "하운", suggestion: "하은", sourceId: "haeun", message: "표기가 달라요",
  };
  return buildPlausibilityReport({
    project,
    generatedAtIso: NOW,
    extras: { nameChecks: [{ sceneId: "s1", text, findings: [finding] }] },
  });
}

describe("가림 처리", () => {
  it.each([
    ["휴대전화", "연락은 010-1234-5678 로", "010-1234"],
    ["국가번호 전화", "+82 10-1234-5678 입니다", "1234-5678"],
    ["유선 전화", "02-123-4567 로 걸어", "123-4567"],
    ["주민등록번호 모양", "번호는 900101-1234567 이다", "1234567"],
    ["카드번호 모양", "카드 1234 5678 9012 3456 사용", "9012 3456"],
    ["이메일", "메일은 haeun@example.com 이다", "example.com"],
    ["주소", "https://example.com/path?token=secret 에서", "secret"],
    ["긴 토큰", "키는 abcdEFGHijklMNOP0123456789abcdEFGHijkl 였다", "abcdEFGHijklMNOP"],
    ["파일 경로", "파일 /Users/haeun/Documents/secret/story.txt 를 열었다", "Documents"],
  ])("%s는 [가림]으로 바꾼다", (_name, input, leaked) => {
    const output = redactPlausibilityText(input);
    expect(output).toContain("[가림]");
    expect(output).not.toContain(leaked);
  });

  it("이야기 속 숫자와 날짜는 지우지 않는다", () => {
    const text = "2025-10-15에 3화 12번째 장면, 순서 30, 시간 값 20 이야기";
    expect(redactPlausibilityText(text)).toBe(text);
  });

  it("긴 문장은 상한에서 잘라 말줄임표를 붙인다", () => {
    const output = redactPlausibilityText("가".repeat(900), 100);
    expect(Array.from(output)).toHaveLength(101);
    expect(output.endsWith("…")).toBe(true);
  });
});

describe("중간 문서와 JSON", () => {
  const report = reportOf("g-knowledge-leak");
  const doc = buildPlausibilityExport({ report, view: applyPlausibilityDispositions(report, []) });

  it("형식 이름과 버전, 생성 시각, 점검 범위, 요약을 담는다", () => {
    expect(doc.format).toBe(PLAUSIBILITY_EXPORT_FORMAT);
    expect(doc.formatVersion).toBe(PLAUSIBILITY_EXPORT_VERSION);
    expect(doc.generatedAtIso).toBe(NOW);
    expect(doc.project.title).toBe("범인을 먼저 아는 탐정");
    expect(doc.scope).toEqual({ label: "전체 장면", sceneCount: 3 });
    expect(doc.summary.score.value).toBe(report.summary.score.value);
    expect(doc.summary.score.formula).toBe(report.summary.score.formula);
    expect(doc.summary.score.totalPenalty).toBe(100 - report.summary.score.value);
    expect(doc.summary.coverage.percent).toBe(report.summary.coverage.percent);
    expect(doc.summary.trust).toBe("medium");
    expect(doc.summary.trustLabel).toBe("보통");
    expect(doc.limits).toEqual(report.limits);
  });

  it("발견은 설명·질문·근거·해결 선택지를 가진다", () => {
    expect(doc.findings).toHaveLength(1);
    const [finding] = doc.findings;
    expect(finding).toMatchObject({ severity: "error", severityLabel: "오류", confidence: "certain", confidenceLabel: "확정", categoryLabel: "정보" });
    expect(finding?.title).toBe("아직 모르는 일을 아는 것처럼 행동해요");
    expect(finding?.question.length).toBeGreaterThan(0);
    expect(finding?.evidence.length).toBeGreaterThan(0);
    expect(finding?.scenes).toEqual(["추궁"]);
    expect(finding?.resolutionOptions.length).toBeGreaterThan(0);
    expect(finding).not.toHaveProperty("disposition");
  });

  it("JSON은 그대로 다시 읽히고 같은 입력에서 같은 글자가 나온다", () => {
    const json = plausibilityExportToJson(doc);
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(doc)));
    expect(plausibilityExportToJson(buildPlausibilityExport({ report, view: applyPlausibilityDispositions(report, []) }))).toBe(json);
    expect(json.endsWith("\n")).toBe(true);
  });

  it("저장소 열쇠나 내부 경로는 내보내지 않는다", () => {
    const json = plausibilityExportToJson(doc);
    expect(json).not.toMatch(/toonspectrum:|toonstudio:|localStorage|\/tmp\//u);
  });
});

describe("처리 기록 반영", () => {
  const report = reportOf("g-premature-reveal");
  const finding = report.findings[0];

  it("해결함은 처리한 항목으로 옮기되 지우지 않고 점수에서 뺀다", () => {
    if (!finding) throw new Error("발견이 필요합니다.");
    const view = applyPlausibilityDispositions(report, [{ issueKey: finding.dispositionKey, status: "intended", note: "일부러 미리 알려요" }]);
    const doc = buildPlausibilityExport({ report, view });
    expect(doc.findings).toEqual([]);
    expect(doc.handled).toHaveLength(1);
    expect(doc.handled[0]?.disposition).toEqual({ status: "intended", label: "의도된 설정", note: "일부러 미리 알려요" });
    expect(doc.summary.score.value).toBe(100);
    expect(doc.summary.handledCounts.intended).toBe(1);
  });

  it("나중에는 확인할 항목에 남고 점수에 반영된다", () => {
    if (!finding) throw new Error("발견이 필요합니다.");
    const view = applyPlausibilityDispositions(report, [{ issueKey: finding.dispositionKey, status: "deferred" }]);
    const doc = buildPlausibilityExport({ report, view });
    expect(doc.findings).toHaveLength(1);
    expect(doc.findings[0]?.disposition?.label).toBe("나중에");
    expect(doc.handled).toEqual([]);
    expect(doc.summary.score.value).toBe(report.summary.score.value);
  });

  it("처리 메모의 연락처도 가린다", () => {
    if (!finding) throw new Error("발견이 필요합니다.");
    const view = applyPlausibilityDispositions(report, [{ issueKey: finding.dispositionKey, status: "ignored", note: "010-9999-8888 담당자와 상의" }]);
    const json = plausibilityExportToJson(buildPlausibilityExport({ report, view }));
    expect(json).not.toContain("9999-8888");
    expect(json).toContain("[가림]");
  });
});

describe("원고 인용", () => {
  const report = reportWithSensitiveQuote();
  const view = applyPlausibilityDispositions(report, []);

  it("인용 안의 연락처·이메일·주소를 가리고 강조 구간만 남긴다", () => {
    const json = plausibilityExportToJson(buildPlausibilityExport({ report, view }));
    expect(json).toContain("하운");
    for (const leaked of ["1234-5678", "haeun@example.com", "token=abc", "example.com"]) expect(json).not.toContain(leaked);
    const doc = buildPlausibilityExport({ report, view });
    expect(doc.findings[0]?.evidence[0]?.quote?.highlighted).toBe("하운");
  });

  it("includeQuotes=false이면 인용을 아예 넣지 않는다", () => {
    const doc = buildPlausibilityExport({ report, view, includeQuotes: false });
    expect(doc.findings[0]?.evidence.every((item) => item.quote === undefined)).toBe(true);
    expect(plausibilityExportToMarkdown(doc)).not.toContain("원고 인용");
  });
});

describe("Markdown", () => {
  const report = reportOf("g-unpaid-setup");
  const view = applyPlausibilityDispositions(report, []);
  const markdown = plausibilityExportToMarkdown(buildPlausibilityExport({ report, view, scopeLabel: "1화" }));

  it("생성 시각·범위·커버리지·점수·계산식을 머리에 보여 준다", () => {
    expect(markdown).toContain("# 개연성 점검 리포트 — 거두지 않은 우산");
    expect(markdown).toContain("2026-10-15 09:30 UTC");
    expect(markdown).toContain("점검 범위: 1화");
    expect(markdown).toContain(`점검 가능 범위(커버리지): **${report.summary.coverage.percent}%**`);
    expect(markdown).toContain(`개연성 점수: **${report.summary.score.value} / 100**`);
    expect(markdown).toContain("## 점수 계산식");
    expect(markdown).toContain("오류 건수 × 15");
    expect(markdown).toContain("| 범주 | 오류 | 확정 경고 | 추정 경고 | 제안 | 감점 | 상한 적용 |");
    expect(markdown).toContain(`100 − ${100 - report.summary.score.value} = **${report.summary.score.value}점**`);
  });

  it("발견을 범주별로 묶고 해결 선택지가 자동 적용이 아님을 밝힌다", () => {
    expect(markdown).toContain("## 확인할 항목");
    expect(markdown).toContain("### 복선과 회수 (1건)");
    expect(markdown).toContain("#### 1. [오류 · 확정] 심어 둔 복선을 아직 거두지 않았어요");
    expect(markdown).toContain("해결 선택지 (자동으로 적용되지 않아요)");
    expect(markdown).toContain("작가님께 드리는 질문");
  });

  it("점검 출처와 한계를 빠짐없이 적는다", () => {
    expect(markdown).toContain("## 점검 출처");
    expect(markdown).toContain("연결 안 됨");
    expect(markdown).toContain("## 이 리포트의 한계");
    expect(markdown).toContain("입력하지 않은 칸은 '문제 없음'이 아니라 '점검 불가'입니다.");
  });

  it("서식으로 읽힐 글자는 이스케이프한다", () => {
    const project = makeStory("md", "A|B *굵게* <b>", {
      facts: [{ id: "never", label: "표|시 *별* `코드`", subjectId: "world", key: "never" }],
      scenes: [{
        id: "s1", title: "장면 [1]", order: 10, timeIndex: 1, participantIds: ["haeun"],
        preconditions: [{ factId: "never", comparator: "equals", value: true }],
      }],
    });
    const tricky = buildPlausibilityReport({ project, generatedAtIso: NOW });
    const out = plausibilityExportToMarkdown(buildPlausibilityExport({ report: tricky, view: applyPlausibilityDispositions(tricky, []) }));
    expect(out).toContain("A\\|B \\*굵게\\* \\<b\\>");
    expect(out).toContain("표\\|시 \\*별\\* \\`코드\\`");
    expect(out).not.toMatch(/[^\\]<b>/u);
  });

  it("같은 입력이면 같은 글자가 나온다", () => {
    expect(plausibilityExportToMarkdown(buildPlausibilityExport({ report, view, scopeLabel: "1화" }))).toBe(markdown);
  });

  it("발견이 없는 리포트는 빈 목록을 안내한다", () => {
    const clean = GOLDEN_STORIES.find((story) => story.kind === "clean");
    if (!clean) throw new Error("깨끗한 이야기가 필요합니다.");
    const cleanReport = buildPlausibilityReport({ project: clean.project, generatedAtIso: NOW });
    const out = plausibilityExportToMarkdown(buildPlausibilityExport({ report: cleanReport, view: applyPlausibilityDispositions(cleanReport, []) }));
    expect(out).toContain("해당하는 항목이 없어요.");
    expect(out).toContain("**100 / 100**");
  });
});

describe("파일 이름", () => {
  it("작품 제목 없이 생성 날짜(UTC)만 쓴다", () => {
    expect(plausibilityExportFileName("2026-10-15T23:59:59.000Z", "md")).toBe("story-plausibility-report-20261015.md");
    expect(plausibilityExportFileName("2026-10-15T00:00:00.000Z", "json")).toBe("story-plausibility-report-20261015.json");
    expect(plausibilityExportFileName("날짜 아님", "md")).toBe("story-plausibility-report-undated.md");
  });
});
