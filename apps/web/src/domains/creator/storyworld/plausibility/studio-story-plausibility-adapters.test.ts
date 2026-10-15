import { describe, expect, it } from "vitest";

import { createForeshadowSeed } from "../../planning/studio-foreshadow-ledger";
import type { LoreNameFinding } from "../../planning/studio-lore-name-check";
import type { StudioPromisePayoffWarning, StudioPromisePayoffWarningCode } from "../../studio-promise-payoff-ledger";
import { analyzeStoryworldContinuity } from "../studio-storyworld-continuity";
import type { StoryworldProject } from "../studio-storyworld-causality";
import { adaptContinuityIssues } from "./studio-story-plausibility-adapters";
import {
  adaptForeshadowLedger,
  adaptLoreIssues,
  adaptNameChecks,
  adaptPromiseLedger,
} from "./studio-story-plausibility-adapters-planning";
import { createPlausibilityContext } from "./studio-story-plausibility-context";
import { DOJIN, HAEUN, makeStory } from "./studio-story-plausibility-golden-fixtures";
import { directionJosa, josa, objectJosa, subjectJosa, topicJosa } from "./studio-story-plausibility-text";

const continuityProject: StoryworldProject = makeStory("c", "연속성", {
  characters: [HAEUN, DOJIN, { id: "mina", name: "미나" }],
  facts: [
    { id: "f1", label: "열쇠가 있다", subjectId: "haeun", key: "key", initialValue: true },
    { id: "f2", label: "열쇠가 없다", subjectId: "haeun", key: "key", initialValue: false },
    { id: "f3", label: "쓰이지 않는 설정", subjectId: "dojin", key: "unused" },
  ],
  scenes: [
    {
      id: "s1", title: "첫 장면", order: 10, participantIds: ["haeun"],
      knowledgeUses: [{ characterId: "dojin", factId: "f1" }],
      reveals: [{ factId: "f1", audiences: ["mina", "reader"] }],
      emotionalBeats: [{ characterId: "mina", valence: -0.5, arousal: 0.5 }],
    },
    { id: "s2", title: "둘째 장면", order: 10, participantIds: ["haeun"] },
  ],
});

function continuityFindings() {
  const ctx = createPlausibilityContext(continuityProject);
  return adaptContinuityIssues(ctx, analyzeStoryworldContinuity(continuityProject));
}

describe("연속성 검사 어댑터", () => {
  it("일곱 가지 코드를 모두 작가의 범주로 옮긴다", () => {
    const findings = continuityFindings();
    const byCode = new Map(findings.map((finding) => [finding.source.code, finding]));
    expect([...byCode.keys()].sort()).toEqual([
      "character-never-appears",
      "emotion-beat-absent",
      "fact-initial-value-conflict",
      "fact-never-referenced",
      "knowledge-use-absent",
      "reveal-to-absent",
      "scene-order-duplicate",
    ]);
    expect(byCode.get("fact-initial-value-conflict")).toMatchObject({ category: "setting-rules", severity: "error", confidence: "certain" });
    expect(byCode.get("knowledge-use-absent")).toMatchObject({ category: "information", severity: "warning" });
    expect(byCode.get("reveal-to-absent")).toMatchObject({ category: "information", severity: "warning" });
    expect(byCode.get("emotion-beat-absent")).toMatchObject({ category: "emotion", severity: "warning" });
    expect(byCode.get("scene-order-duplicate")).toMatchObject({ category: "time-place", severity: "warning" });
    expect(byCode.get("character-never-appears")).toMatchObject({ category: "character-consistency", severity: "suggestion" });
    expect(byCode.get("fact-never-referenced")).toMatchObject({ category: "setting-rules", severity: "suggestion" });
  });

  it("처리 기록 열쇠로 원래 이슈 id를 그대로 쓴다", () => {
    const issues = analyzeStoryworldContinuity(continuityProject);
    const ids = new Set(issues.map((issue) => issue.id));
    for (const finding of continuityFindings()) {
      expect(ids.has(finding.dispositionKey)).toBe(true);
      expect(finding.source.originalId).toBe(finding.dispositionKey);
    }
  });

  it("문장은 해요체이고 내부 id 대신 작가가 붙인 이름을 쓴다", () => {
    for (const finding of continuityFindings()) {
      expect(finding.message).not.toMatch(/습니다|합니다/u);
      expect(finding.message).not.toMatch(/\bf[123]\b|haeun|dojin|mina|\bs[12]\b/u);
      for (const evidence of finding.evidence) expect(evidence.label).not.toMatch(/\bf[123]\b|\bhaeun\b|\bdojin\b|\bmina\b/u);
    }
    const knowledge = continuityFindings().find((finding) => finding.source.code === "knowledge-use-absent");
    expect(knowledge?.message).toBe("‘첫 장면’ 장면에서 도진이 알고 있는 사실을 쓰지만, 장면 참여자에 들어 있지 않아요.");
    const order = continuityFindings().find((finding) => finding.source.code === "scene-order-duplicate");
    expect(order?.message).toContain("‘첫 장면’, ‘둘째 장면’");
    expect(order?.message).toContain("같은 순서(10)");
  });

  it("설정 충돌은 개수와 주체 이름을 말하고, 근거에 값을 나란히 보여 준다", () => {
    const conflict = continuityFindings().find((finding) => finding.source.code === "fact-initial-value-conflict");
    expect(conflict?.message).toBe("‘열쇠가 있다’ 등 2개 설정이 ‘하은’의 같은 속성(key)에 서로 다른 처음 값을 적었어요.");
    expect(conflict?.evidence.map((item) => item.label)).toEqual(["열쇠가 있다 · 처음 값 true", "열쇠가 없다 · 처음 값 false"]);
  });

  it("고치는 곳은 안내만 하고 문서를 바꾸지 않는다", () => {
    for (const finding of continuityFindings()) {
      expect(finding.options.length).toBeGreaterThan(0);
      for (const option of finding.options) expect(["open-settings", "info", "copy", "open-questionnaire"]).toContain(option.action.kind);
    }
  });
});

describe("복선 장부·약속 장부 어댑터", () => {
  const ctx = createPlausibilityContext(makeStory("l", "장부", {
    scenes: [
      { id: "s1", title: "1화 장면", order: 10, episodeNumber: 1, participantIds: ["haeun"] },
      { id: "s2", title: "3화 장면", order: 20, episodeNumber: 3, participantIds: ["haeun"] },
    ],
  }));
  const episodes = [
    { episodeId: "ep-1", episodeNumber: 1, title: "시작" },
    { episodeId: "ep-3", episodeNumber: 3, title: "고비" },
  ];
  const seed = createForeshadowSeed({
    id: "seed-1",
    projectId: "p",
    title: "숨긴 편지",
    plantedIn: { episodeId: "ep-1" },
    expectedPayoff: { fromEpisodeId: "ep-3", toEpisodeId: "ep-3" },
    now: "2026-10-15T00:00:00.000Z",
  });

  it("회수 기한이 지난 복선은 확정 경고, 곧 거둘 복선은 제안이다", () => {
    const overdue = adaptForeshadowLedger(ctx, { overdue: [seed], dueSoon: [], episodes, totalCount: 1 });
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toMatchObject({ category: "foreshadowing", severity: "warning", confidence: "certain", source: { module: "foreshadow-ledger", code: "overdue" } });
    expect(overdue[0]?.message).toBe("‘숨긴 편지’ 복선을 3화까지 거두기로 했는데 아직 회수하지 않았어요.");
    expect(overdue[0]?.sceneIds).toEqual(["s1"]);
    expect(overdue[0]?.options.every((option) => option.action.kind === "info")).toBe(true);
    const soon = adaptForeshadowLedger(ctx, { overdue: [], dueSoon: [seed], episodes, totalCount: 1 });
    expect(soon[0]).toMatchObject({ severity: "suggestion", source: { code: "due-soon" } });
  });

  it("약속·회수 장부 코드를 심각도별로 나눈다", () => {
    const warning = (code: StudioPromisePayoffWarningCode): StudioPromisePayoffWarning => ({ code, severity: "normal", entryId: "e1", message: "원문" });
    const codes: readonly StudioPromisePayoffWarningCode[] = [
      "PAYOFF_BEFORE_SEED", "OVERDUE", "FORESHADOW_BEFORE_SEED", "MISSING_PAYOFF", "DUE_NOW", "MISSING_SEED", "UNSCHEDULED_PAYOFF",
    ];
    const result = adaptPromiseLedger(ctx, {
      warnings: codes.map(warning),
      entryTitles: { e1: "우산" },
      totalCount: 1,
    });
    const bySeverity = result.map((finding) => `${finding.source.code}:${finding.severity}`);
    expect(bySeverity).toEqual([
      "PAYOFF_BEFORE_SEED:error",
      "OVERDUE:warning",
      "FORESHADOW_BEFORE_SEED:warning",
      "MISSING_PAYOFF:warning",
      "DUE_NOW:suggestion",
      "MISSING_SEED:suggestion",
    ]);
    expect(result.every((finding) => finding.category === "foreshadowing" && finding.evidence[0]?.label === "우산")).toBe(true);
  });
});

describe("설정 검증 어댑터", () => {
  const ctx = createPlausibilityContext(makeStory("lore", "설정", { scenes: [] }));

  it("겹친 이름은 오류 범주 그대로 설정·규칙으로 옮기고, 영문 원문은 한글 문장으로 바꾼다", () => {
    const findings = adaptLoreIssues(ctx, [
      { code: "lore-name-collision", severity: "error", message: 'The name "별빛" is used by both character "하은" and place "기억 시장".', affectedIds: ["a", "b"] },
      { code: "lore-event-undated", severity: "warning", message: "x", affectedIds: ["ev1"] },
      { code: "알 수 없는 코드", severity: "warning", message: "x", affectedIds: [] },
    ]);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ category: "setting-rules", severity: "error", confidence: "certain" });
    expect(findings[0]?.message).toBe("이름 ‘별빛’이 인물 ‘하은’과 장소 ‘기억 시장’에 함께 쓰이고 있어요.");
    expect(findings[1]).toMatchObject({ severity: "suggestion", title: "시기가 없는 사건이 있어요" });
  });
});

describe("이름 표기 검사 어댑터", () => {
  const ctx = createPlausibilityContext(makeStory("n", "이름", {
    scenes: [{ id: "s1", title: "시장", order: 10, participantIds: ["haeun"] }],
  }));
  const text = `${"가".repeat(60)}하운이 걸었다.${"나".repeat(60)}`;
  const start = text.indexOf("하운");
  const variant: LoreNameFinding = {
    id: "v1", code: "name-variant", severity: "warning", start, end: start + 2, found: "하운", suggestion: "하은", sourceId: "haeun", message: "표기가 달라요",
  };

  it("원고에서 찾은 위치 둘레의 짧은 인용과 강조 구간을 만든다", () => {
    const findings = adaptNameChecks(ctx, [{ sceneId: "s1", text, findings: [variant] }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ category: "character-consistency", severity: "warning", confidence: "heuristic" });
    const quote = findings[0]?.evidence[0]?.quote;
    expect(quote).toBeDefined();
    if (!quote) return;
    expect(quote.text.startsWith("…")).toBe(true);
    expect(quote.text.endsWith("…")).toBe(true);
    expect(Array.from(quote.text).length).toBeLessThanOrEqual(24 + 2 + 24 + 2);
    expect(Array.from(quote.text).slice(quote.highlightStart, quote.highlightEnd).join("")).toBe("하운");
    expect(findings[0]?.options[0]?.action).toEqual({ kind: "copy", text: "하은" });
  });

  it("리포트에 원고 전체를 담지 않는다", () => {
    const findings = adaptNameChecks(ctx, [{ sceneId: "s1", text, findings: [variant] }]);
    expect(JSON.stringify(findings)).not.toContain("가".repeat(40));
  });

  it("한 리포트에 담는 이름 표기 발견은 40건으로 제한한다", () => {
    const many: LoreNameFinding[] = Array.from({ length: 90 }, (_, i) => ({ ...variant, id: `v${i}`, start: i, end: i + 2 }));
    expect(adaptNameChecks(ctx, [{ sceneId: "s1", text, findings: many }])).toHaveLength(40);
  });

  it("상한에 걸려도 표기 흔들림(경고)이 미등록 후보(제안)보다 먼저 담긴다", () => {
    const noise: LoreNameFinding[] = Array.from({ length: 60 }, (_, i) => ({
      ...variant, id: `u${i}`, code: "unregistered-name", suggestion: null, sourceId: null, start: i, end: i + 2,
    }));
    const findings = adaptNameChecks(ctx, [{ sceneId: "s1", text, findings: [...noise, variant] }]);
    expect(findings).toHaveLength(40);
    expect(findings[0]?.severity).toBe("warning");
    expect(findings.filter((finding) => finding.severity === "warning")).toHaveLength(1);
  });

  it("별칭 혼용과 미등록 후보는 제안으로 낮춘다", () => {
    const findings = adaptNameChecks(ctx, [{
      sceneId: "s1",
      text,
      findings: [
        { ...variant, id: "a", code: "name-alias-mix" },
        { ...variant, id: "u", code: "unregistered-name", suggestion: null, sourceId: null },
      ],
    }]);
    expect(findings.map((finding) => finding.severity)).toEqual(["suggestion", "suggestion"]);
    expect(findings.map((finding) => finding.category)).toEqual(["character-consistency", "setting-rules"]);
  });
});

describe("한국어 조사 도우미", () => {
  it("받침 유무에 맞는 조사를 고른다", () => {
    expect(subjectJosa("하은")).toBe("하은이");
    expect(subjectJosa("나라")).toBe("나라가");
    expect(topicJosa("도진")).toBe("도진은");
    expect(topicJosa("하나")).toBe("하나는");
    expect(objectJosa("문")).toBe("문을");
    expect(objectJosa("열쇠")).toBe("열쇠를");
    expect(josa("", "이", "가")).toBe("가");
  });

  it("한글이 아닌 글자로 끝나면 받침이 없는 쪽을 쓴다", () => {
    expect(subjectJosa("A1")).toBe("A1가");
    expect(topicJosa("?")).toBe("?는");
  });

  it("방향 조사는 받침이 없거나 ㄹ이면 ‘로’, 그 밖에는 ‘으로’다", () => {
    expect(directionJosa("시장")).toBe("시장으로");
    expect(directionJosa("금고")).toBe("금고로");
    expect(directionJosa("서울")).toBe("서울로");
    expect(directionJosa("")).toBe("로");
    expect(directionJosa("Room")).toBe("Room로");
  });
});
