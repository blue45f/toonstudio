import { describe, expect, it } from "vitest";

import { analyzeStoryworldProject, type StoryworldProject, type StoryworldScene } from "../studio-storyworld-causality";
import { ANSWERED_NONE, GOLDEN_STORIES, HAEUN, makeStory } from "./studio-story-plausibility-golden-fixtures";
import {
  PLAUSIBILITY_DEFAULT_MAX_FINDINGS,
  PLAUSIBILITY_LIMITS,
  PLAUSIBILITY_SCORE_FORMULA,
  PLAUSIBILITY_SCORE_WEIGHTS,
  applyPlausibilityDispositions,
  buildPlausibilityReport,
  filterPlausibilityFindings,
  groupPlausibilityFindings,
  sceneIdsForEpisodes,
  summarizePlausibility,
} from "./studio-story-plausibility-report";
import { PLAUSIBILITY_CATEGORY_IDS } from "./studio-story-plausibility-types";

const NOW = "2026-10-15T00:00:00.000Z";

/** 각 장면이 아직 일어나지 않은 사실을 전제로 해서, 장면마다 확정 오류(missing-precondition)가 하나씩 생기는 이야기. */
function brokenStory(sceneCount: number): StoryworldProject {
  const scenes: StoryworldScene[] = Array.from({ length: sceneCount }, (_, i) => ({
    id: `s${i + 1}`,
    title: `장면 ${i + 1}`,
    order: (i + 1) * 10,
    timeIndex: i + 1,
    locationId: "집",
    participantIds: ["haeun"],
    episodeNumber: Math.floor(i / 5) + 1,
    preconditions: [{ factId: "never", comparator: "equals", value: true }],
  }));
  return makeStory("broken", "깨진 이야기", {
    facts: [{ id: "never", label: "일어나지 않는 일", subjectId: "world", key: "never" }],
    scenes,
  });
}

describe("리포트 만들기: 기본 모양", () => {
  it("장면이 없는 문서는 발견 0, 점검 범위 0%, 점수 100, 신뢰 낮음이다", () => {
    const report = buildPlausibilityReport({ project: makeStory("empty", "빈 이야기", { scenes: [] }), generatedAtIso: NOW });
    expect(report.findings).toEqual([]);
    expect(report.summary.counts).toEqual({ total: 0, error: 0, warning: 0, suggestion: 0 });
    expect(report.summary.coverage.percent).toBe(0);
    expect(report.summary.coverage.sceneCount).toBe(0);
    expect(report.summary.score.value).toBe(100);
    expect(report.summary.trust).toBe("low");
    expect(report.version).toBe(1);
    expect(report.generatedAtIso).toBe(NOW);
    expect(report.projectTitle).toBe("빈 이야기");
    expect(report.scopeSceneIds).toBeNull();
  });

  it("리포트에는 한계 안내와 점수 공식이 항상 들어 있다", () => {
    const report = buildPlausibilityReport({ project: brokenStory(2), generatedAtIso: NOW });
    expect(report.limits).toBe(PLAUSIBILITY_LIMITS);
    expect(report.limits.length).toBeGreaterThanOrEqual(5);
    expect(report.summary.score.formula).toBe(PLAUSIBILITY_SCORE_FORMULA);
    expect(report.summary.score.formula).toContain("× 15");
    expect(report.summary.score.formula).toContain("최대 40점");
  });

  it("9개 범주를 모두 요약에 담고, 범주별 건수의 합이 전체와 같다", () => {
    const report = buildPlausibilityReport({ project: brokenStory(3), generatedAtIso: NOW });
    expect(report.summary.byCategory.map((item) => item.category)).toEqual([...PLAUSIBILITY_CATEGORY_IDS]);
    expect(report.summary.byCategory.reduce((sum, item) => sum + item.total, 0)).toBe(report.summary.counts.total);
    expect(report.summary.counts.error).toBe(3);
  });

  it("원래 이슈 id를 처리 기록 열쇠로 그대로 쓴다(두 화면이 기록을 공유한다)", () => {
    const project = brokenStory(2);
    const analysis = analyzeStoryworldProject(project);
    const report = buildPlausibilityReport({ project, generatedAtIso: NOW, analysis });
    const engineIds = new Set(analysis.issues.map((issue) => issue.id));
    const fromEngine = report.findings.filter((finding) => finding.source.module === "causality");
    expect(fromEngine.length).toBeGreaterThan(0);
    for (const finding of fromEngine) {
      expect(engineIds.has(finding.dispositionKey)).toBe(true);
      expect(finding.dispositionKey).toBe(finding.source.originalId);
    }
  });

  it("개연성 축이 아닌 엔진 이슈(제작·접근성·권리)는 리포트에 넣지 않는다", () => {
    const project = makeStory("prod", "제작 위험", {
      scenes: [{
        id: "s1", title: "장면", order: 10, timeIndex: 1, locationId: "집", participantIds: ["haeun"],
        assets: [{ assetId: "a1", label: "배경", licenseStatus: "restricted" }],
      }],
    });
    const analysis = analyzeStoryworldProject(project);
    const outside = new Set(
      analysis.issues
        .filter((issue) => issue.axis === "production" || issue.axis === "accessibility" || issue.axis === "rights-provenance")
        .map((issue) => issue.id),
    );
    expect(outside.size).toBeGreaterThan(0);
    const report = buildPlausibilityReport({ project, generatedAtIso: NOW, analysis });
    expect(report.findings.filter((finding) => finding.source.originalId !== undefined && outside.has(finding.source.originalId))).toEqual([]);
  });
});

describe("리포트 만들기: 결정성과 크기 상한", () => {
  it("같은 입력은 같은 리포트를 낸다", () => {
    const project = brokenStory(12);
    const first = buildPlausibilityReport({ project, generatedAtIso: NOW });
    const second = buildPlausibilityReport({ project, generatedAtIso: NOW });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("장면 배열의 순서를 섞어도 발견 id와 순서가 같다", () => {
    const project = brokenStory(9);
    const shuffled: StoryworldProject = { ...project, scenes: [...project.scenes].reverse() };
    const a = buildPlausibilityReport({ project, generatedAtIso: NOW });
    const b = buildPlausibilityReport({ project: shuffled, generatedAtIso: NOW });
    expect(b.findings.map((finding) => finding.id)).toEqual(a.findings.map((finding) => finding.id));
    expect(b.summary).toEqual(a.summary);
  });

  it("리포트 시각은 입력으로만 정해지고 다른 값에 새어 들어가지 않는다", () => {
    const project = brokenStory(3);
    const a = buildPlausibilityReport({ project, generatedAtIso: "2026-01-01T00:00:00.000Z" });
    const b = buildPlausibilityReport({ project, generatedAtIso: "2030-12-31T23:59:59.000Z" });
    expect({ ...a, generatedAtIso: "" }).toEqual({ ...b, generatedAtIso: "" });
  });

  it("발견이 상한을 넘으면 상한까지만 남기고 넘친 건수를 알린다(심각한 것 먼저)", () => {
    const project = brokenStory(30);
    const full = buildPlausibilityReport({ project, generatedAtIso: NOW });
    expect(full.findings.length).toBeGreaterThanOrEqual(30);
    const capped = buildPlausibilityReport({ project, generatedAtIso: NOW, maxFindings: 7 });
    expect(capped.findings).toHaveLength(7);
    expect(capped.summary.omittedCount).toBe(full.findings.length - 7);
    expect(capped.findings.map((finding) => finding.id)).toEqual(full.findings.slice(0, 7).map((finding) => finding.id));
    expect(full.summary.omittedCount).toBe(0);
  });

  it("기본 상한은 400건이고, 0 이하를 넘겨도 최소 1건은 남긴다", () => {
    expect(PLAUSIBILITY_DEFAULT_MAX_FINDINGS).toBe(400);
    const report = buildPlausibilityReport({ project: brokenStory(4), generatedAtIso: NOW, maxFindings: 0 });
    expect(report.findings).toHaveLength(1);
  });

  it("발견마다 근거는 8개, 글자 수에는 상한이 있다", () => {
    const longTitle = "긴".repeat(400);
    const project = makeStory("long", "긴 제목", {
      facts: [{ id: "never", label: longTitle, subjectId: "world", key: "never" }],
      scenes: [{
        id: "s1", title: longTitle, order: 10, timeIndex: 1, locationId: "집", participantIds: ["haeun"],
        preconditions: [{ factId: "never", comparator: "equals", value: true }],
      }],
    });
    const report = buildPlausibilityReport({ project, generatedAtIso: NOW });
    expect(report.findings.length).toBeGreaterThan(0);
    for (const finding of report.findings) {
      expect(finding.evidence.length).toBeLessThanOrEqual(8);
      expect(Array.from(finding.title).length).toBeLessThanOrEqual(80);
      expect(Array.from(finding.message).length).toBeLessThanOrEqual(640);
      expect(Array.from(finding.question).length).toBeLessThanOrEqual(320);
      for (const evidence of finding.evidence) expect(Array.from(evidence.label).length).toBeLessThanOrEqual(80);
    }
  });

  it("장면 256개짜리 문서도 한 번에 만들 수 있고 결과가 상한 안에 든다", () => {
    const started = Date.now();
    const report = buildPlausibilityReport({ project: brokenStory(256), generatedAtIso: NOW });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(report.findings.length).toBeLessThanOrEqual(PLAUSIBILITY_DEFAULT_MAX_FINDINGS);
    expect(report.summary.counts.error).toBeGreaterThanOrEqual(256);
    expect(report.summary.coverage.sceneCount).toBe(256);
  });
});

describe("리포트 만들기: 점검 범위", () => {
  it("범위를 고르면 그 장면에 걸린 발견만 남고, 점검 가능 범위도 그 장면만 센다", () => {
    const project = brokenStory(10);
    const all = buildPlausibilityReport({ project, generatedAtIso: NOW });
    const scoped = buildPlausibilityReport({ project, generatedAtIso: NOW, scopeSceneIds: ["s2", "s3"] });
    expect(scoped.findings.length).toBeGreaterThan(0);
    expect(scoped.findings.length).toBeLessThan(all.findings.length);
    for (const finding of scoped.findings) expect(finding.sceneIds.some((id) => id === "s2" || id === "s3")).toBe(true);
    expect(scoped.summary.coverage.sceneCount).toBe(2);
    expect(scoped.scopeSceneIds).toEqual(["s2", "s3"]);
  });

  it("빈 범위는 아무것도 점검하지 않는다", () => {
    const report = buildPlausibilityReport({ project: brokenStory(4), generatedAtIso: NOW, scopeSceneIds: [] });
    expect(report.findings).toEqual([]);
    expect(report.summary.coverage.sceneCount).toBe(0);
  });

  it("회차 번호로 범위를 만든다(사용 중인 장면만, 번호 없는 장면은 제외)", () => {
    const project: StoryworldProject = {
      ...brokenStory(7),
      scenes: brokenStory(7).scenes.map((scene, index) => (index === 1 ? { ...scene, disabled: true } : index === 2 ? { ...scene, episodeNumber: undefined } : scene)),
    };
    expect(sceneIdsForEpisodes(project, [1])).toEqual(["s1", "s4", "s5"]);
    expect(sceneIdsForEpisodes(project, [2])).toEqual(["s6", "s7"]);
    expect(sceneIdsForEpisodes(project, [9])).toEqual([]);
  });
});

describe("점수와 요약", () => {
  it("점수는 100에서 범주별 감점을 뺀 값이고, 범주마다 40점이 상한이다", () => {
    const report = buildPlausibilityReport({ project: brokenStory(6), generatedAtIso: NOW });
    const errors = report.summary.counts.error;
    expect(errors).toBe(6);
    const term = report.summary.score.terms.find((item) => item.errors > 0);
    expect(term?.rawPenalty).toBe(errors * PLAUSIBILITY_SCORE_WEIGHTS.error);
    expect(term?.penalty).toBe(PLAUSIBILITY_SCORE_WEIGHTS.categoryCap);
    expect(report.summary.score.value).toBe(100 - report.summary.score.terms.reduce((sum, item) => sum + item.penalty, 0));
    expect(report.summary.score.terms).toHaveLength(PLAUSIBILITY_CATEGORY_IDS.length);
  });

  it("가중치가 공식 문구와 같은 숫자를 쓴다", () => {
    expect(PLAUSIBILITY_SCORE_WEIGHTS).toEqual({ error: 15, certainWarning: 6, heuristicWarning: 3, suggestion: 1, categoryCap: 40 });
    expect(PLAUSIBILITY_SCORE_FORMULA).toContain("× 15");
    expect(PLAUSIBILITY_SCORE_FORMULA).toContain("× 6");
    expect(PLAUSIBILITY_SCORE_FORMULA).toContain("× 3");
    expect(PLAUSIBILITY_SCORE_FORMULA).toContain("× 1");
  });

  it("확정 경고는 6점, 추정 경고는 3점, 제안은 1점을 뺀다", () => {
    const certainWarning = GOLDEN_STORIES.find((story) => story.id === "g-time-regression");
    const heuristicWarning = GOLDEN_STORIES.find((story) => story.id === "g-unprepared-resolution");
    const suggestion = GOLDEN_STORIES.find((story) => story.id === "g-motive-gap");
    expect(certainWarning && heuristicWarning && suggestion).toBeTruthy();
    const score = (story: typeof certainWarning) => story
      ? buildPlausibilityReport({ project: story.project, generatedAtIso: NOW, ...(story.extras ? { extras: story.extras } : {}) }).summary.score.value
      : -1;
    expect(score(certainWarning)).toBe(94);
    expect(score(heuristicWarning)).toBe(97);
    expect(score(suggestion)).toBe(99);
  });

  it("점검 가능 범위에 따라 신뢰 안내가 달라진다", () => {
    const low = summarizePlausibility([], { sceneCount: 3, coveredCells: 3, totalCells: 27, percent: 11, items: [] });
    const medium = summarizePlausibility([], { sceneCount: 3, coveredCells: 15, totalCells: 27, percent: 56, items: [] });
    const high = summarizePlausibility([], { sceneCount: 3, coveredCells: 25, totalCells: 27, percent: 93, items: [] });
    expect([low.trust, medium.trust, high.trust]).toEqual(["low", "medium", "high"]);
  });

  it("답을 모두 채운 깨끗한 장면은 점검 가능 범위가 100%다", () => {
    const project = makeStory("full", "다 채운 이야기", {
      scenes: [{
        id: "s1", title: "장면", order: 10, timeIndex: 1, locationId: "집", participantIds: ["haeun"], plausibility: ANSWERED_NONE,
      }],
    });
    const report = buildPlausibilityReport({ project, generatedAtIso: NOW });
    expect(report.summary.coverage.percent).toBe(100);
    expect(report.summary.trust).toBe("high");
  });

  it("비어 있는 이야기와 입력된 이야기의 출처 표시가 다르다(없음과 비어 있음을 구분)", () => {
    const report = buildPlausibilityReport({ project: brokenStory(2), generatedAtIso: NOW });
    const byId = new Map(report.sources.map((source) => [source.id, source]));
    expect(byId.get("causality")?.status).toBe("used");
    expect(byId.get("foreshadow-ledger")?.status).toBe("unavailable");
    expect(byId.get("name-check")?.status).toBe("unavailable");
    const withExtras = buildPlausibilityReport({
      project: brokenStory(2),
      generatedAtIso: NOW,
      extras: {
        foreshadow: { overdue: [], dueSoon: [], episodes: [], totalCount: 0 },
        lore: { issues: [], entryCount: 4 },
        nameChecks: [],
      },
    });
    const extraById = new Map(withExtras.sources.map((source) => [source.id, source]));
    expect(extraById.get("foreshadow-ledger")?.status).toBe("empty");
    expect(extraById.get("lore")?.status).toBe("used");
    expect(extraById.get("name-check")?.status).toBe("empty");
  });
});

describe("필터와 묶음", () => {
  const report = buildPlausibilityReport({
    project: GOLDEN_STORIES.find((story) => story.id === "g-knowledge-leak")?.project ?? brokenStory(1),
    generatedAtIso: NOW,
  });
  const mixed = [
    ...report.findings,
    ...buildPlausibilityReport({ project: GOLDEN_STORIES.find((story) => story.id === "g-time-regression")?.project ?? brokenStory(1), generatedAtIso: NOW }).findings,
    ...buildPlausibilityReport({ project: GOLDEN_STORIES.find((story) => story.id === "g-motive-gap")?.project ?? brokenStory(1), generatedAtIso: NOW }).findings,
  ];

  it("심각도·범주·검색어 필터는 서로 겹쳐서 적용된다", () => {
    expect(mixed.map((finding) => finding.severity).sort()).toEqual(["error", "suggestion", "warning"]);
    expect(filterPlausibilityFindings(mixed, {})).toHaveLength(3);
    expect(filterPlausibilityFindings(mixed, { severity: "all", category: "all", query: "  " })).toHaveLength(3);
    expect(filterPlausibilityFindings(mixed, { severity: "error" })).toHaveLength(1);
    expect(filterPlausibilityFindings(mixed, { category: "time-place" })).toHaveLength(1);
    expect(filterPlausibilityFindings(mixed, { severity: "error", category: "time-place" })).toHaveLength(0);
    expect(filterPlausibilityFindings(mixed, { query: "시간이 거꾸로" })).toHaveLength(1);
  });

  it("검색어는 제목·설명·질문·근거 이름에서 찾고 대소문자를 가리지 않는다", () => {
    expect(filterPlausibilityFindings(mixed, { query: "추궁" }).map((finding) => finding.source.code)).toEqual(["knowledge-leak"]);
    expect(filterPlausibilityFindings(mixed, { query: "범인은 도진이다" })).toHaveLength(1);
    expect(filterPlausibilityFindings(mixed, { query: "KNOWLEDGE-LEAK" })).toHaveLength(1);
    expect(filterPlausibilityFindings(mixed, { query: "없는 말" })).toHaveLength(0);
  });

  it("범주 순서대로 묶고, 비어 있는 범주는 뺀다", () => {
    const groups = groupPlausibilityFindings(mixed);
    expect(groups.map((group) => group.category)).toEqual(["motive", "information", "time-place"]);
    expect(groups.every((group) => group.findings.length > 0 && group.label.length > 0)).toBe(true);
    expect(groupPlausibilityFindings([])).toEqual([]);
  });
});

describe("처리 기록 겹치기", () => {
  const project = brokenStory(5);
  const report = buildPlausibilityReport({ project, generatedAtIso: NOW });
  const [first, second, third, fourth] = report.findings;

  it("기록이 없으면 모든 발견이 미처리로 남고 건수와 점수는 그대로다", () => {
    const view = applyPlausibilityDispositions(report, []);
    expect(view.open).toHaveLength(report.findings.length);
    expect(view.handled).toEqual([]);
    expect(view.summary.counts).toEqual(report.summary.counts);
    expect(view.summary.score.value).toBe(report.summary.score.value);
  });

  it("해결함·의도된 설정·무시함은 건수와 점수에서 빼고, 나중에는 세되 접어 둔다", () => {
    if (!first || !second || !third || !fourth) throw new Error("테스트용 발견이 부족합니다.");
    const view = applyPlausibilityDispositions(report, [
      { issueKey: first.dispositionKey, status: "resolved" },
      { issueKey: second.dispositionKey, status: "intended", note: "일부러 이렇게 썼어요" },
      { issueKey: third.dispositionKey, status: "ignored" },
      { issueKey: fourth.dispositionKey, status: "deferred" },
    ]);
    expect(view.handled).toHaveLength(4);
    expect(view.open).toHaveLength(report.findings.length - 4);
    expect(view.handledCounts).toEqual({ resolved: 1, intended: 1, deferred: 1, ignored: 1 });
    expect(view.counted).toHaveLength(report.findings.length - 3);
    expect(view.counted.some((finding) => finding.id === fourth.id)).toBe(true);
    expect(view.counted.some((finding) => finding.id === first.id)).toBe(false);
    expect(view.summary.counts.total).toBe(report.findings.length - 3);
    expect(view.summary.score.value).toBeGreaterThanOrEqual(report.summary.score.value);
    expect(view.handled.find((item) => item.status === "intended")?.note).toBe("일부러 이렇게 썼어요");
    expect(view.handled.find((item) => item.status === "resolved")).not.toHaveProperty("note");
  });

  it("처리한 항목도 사라지지 않는다: 접은 목록에 모두 남아 있다", () => {
    const view = applyPlausibilityDispositions(report, report.findings.map((finding) => ({ issueKey: finding.dispositionKey, status: "resolved" as const })));
    expect(view.open).toEqual([]);
    expect(view.handled.map((item) => item.finding.id)).toEqual(report.findings.map((finding) => finding.id));
    expect(view.summary.counts.total).toBe(0);
    expect(view.summary.score.value).toBe(100);
  });

  it("리포트 객체는 바꾸지 않는다", () => {
    const before = JSON.stringify(report);
    applyPlausibilityDispositions(report, [{ issueKey: report.findings[0]?.dispositionKey ?? "", status: "resolved" }]);
    expect(JSON.stringify(report)).toBe(before);
  });

  it("처리 기록의 열쇠가 다른 이야기의 발견에는 영향이 없다", () => {
    const view = applyPlausibilityDispositions(report, [{ issueKey: "다른:열쇠", status: "resolved" }]);
    expect(view.open).toHaveLength(report.findings.length);
  });
});

describe("의미 필드가 비어 있는 문서", () => {
  it("의미 필드가 없는 장면만 있는 문서에서는 질문 기반 경고를 만들지 않는다", () => {
    const project = makeStory("bare", "뼈대", {
      characters: [HAEUN],
      scenes: Array.from({ length: 12 }, (_, i) => ({ id: `s${i + 1}`, title: `장면 ${i + 1}`, order: (i + 1) * 10 })),
    });
    const report = buildPlausibilityReport({ project, generatedAtIso: NOW });
    expect(report.findings.filter((finding) => finding.severity !== "suggestion")).toEqual([]);
    expect(report.summary.coverage.percent).toBe(0);
    expect(report.summary.trust).toBe("low");
  });
});
