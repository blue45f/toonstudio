import { describe, expect, it } from "vitest";

import type { StoryworldProject } from "../studio-storyworld-causality";
import { normalizeStoryworldProject } from "../studio-storyworld-document";
import { PLAUSIBILITY_EXAMPLE_PROJECT } from "./studio-story-plausibility-example";
import { runPlausibilityCheck, type PlausibilityRunDeps } from "./studio-story-plausibility-run";
import { ALL_SCENES_SCOPE, availableEpisodeNumbers, describeScope, normalizeScope, scopeSceneIds } from "./studio-story-plausibility-scope";
import { PLAUSIBILITY_UNDO_LIMIT, popUndo, pushUndo, type PlausibilityUndoEntry } from "./studio-story-plausibility-undo";
import { ARCADIA_FIXTURE } from "./studio-story-plausibility-run.fixtures";

const NOW = new Date("2026-10-15T09:30:00.000Z");

function deps(overrides: Partial<PlausibilityRunDeps> = {}): PlausibilityRunDeps {
  return {
    now: () => NOW,
    storage: null,
    loadManuscript: async () => ({ status: "missing" }),
    yieldToHost: () => Promise.resolve(),
    ...overrides,
  };
}

describe("예시 이야기", () => {
  it("저장·불러오기 검증을 통과하는 올바른 문서다", () => {
    expect(normalizeStoryworldProject(JSON.parse(JSON.stringify(PLAUSIBILITY_EXAMPLE_PROJECT)))).toEqual(PLAUSIBILITY_EXAMPLE_PROJECT);
  });

  it("심어 둔 문제 네 가지를 정확히 보여 주고 다른 발견은 만들지 않는다", async () => {
    const { report } = await runPlausibilityCheck(
      { project: PLAUSIBILITY_EXAMPLE_PROJECT, workId: null, scopeKey: "ex", scopeSceneIds: null },
      deps(),
    );
    expect(report.findings.map((finding) => `${finding.category}:${finding.source.code}`).sort()).toEqual([
      "character-consistency:age-mismatch",
      "coincidence:unprepared-resolution",
      "information:knowledge-leak",
      "motive:motive-gap",
    ]);
    expect(report.summary.counts).toEqual({ total: 4, error: 2, warning: 1, suggestion: 1 });
  });
});

describe("점검 실행", () => {
  it("시각은 주입한 시계의 값이고 같은 입력이면 같은 리포트다", async () => {
    const input = { project: PLAUSIBILITY_EXAMPLE_PROJECT, workId: null, scopeKey: "ex", scopeSceneIds: null } as const;
    const first = await runPlausibilityCheck(input, deps());
    const second = await runPlausibilityCheck(input, deps());
    expect(first.report.generatedAtIso).toBe(NOW.toISOString());
    expect(JSON.stringify(first.report)).toBe(JSON.stringify(second.report));
    expect(first.notices).toEqual([]);
  });

  it("범위를 넘기면 그 장면의 발견만 담는다", async () => {
    const { report } = await runPlausibilityCheck(
      { project: PLAUSIBILITY_EXAMPLE_PROJECT, workId: null, scopeKey: "ex", scopeSceneIds: ["s4"] },
      deps(),
    );
    expect(report.findings.map((finding) => finding.source.code)).toEqual(["knowledge-leak"]);
    expect(report.summary.coverage.sceneCount).toBe(1);
  });

  it("원고 사본을 읽어 이름 표기 검사에 쓰고, 읽은 사본만 돌려준다", async () => {
    const { project, copyId, text } = ARCADIA_FIXTURE;
    const loaded: string[] = [];
    const result = await runPlausibilityCheck(
      { project, workId: null, scopeKey: "scope", scopeSceneIds: null },
      deps({
        loadManuscript: async (scopeKey, id) => {
          loaded.push(`${scopeKey}:${id}`);
          return { status: "ok", text, info: { copyId: id, length: text.length, chunks: 1, savedAtIso: NOW.toISOString() } };
        },
      }),
    );
    expect(loaded).toEqual([`scope:${copyId}`]);
    expect(result.manuscripts.get(copyId)).toBe(text);
    expect(result.report.findings.some((finding) => finding.source.module === "name-check" && finding.source.code === "name-variant")).toBe(true);
  });

  it("손상되었거나 없는 사본은 건너뛰고 작가의 말로 알린다", async () => {
    const { project } = ARCADIA_FIXTURE;
    const corrupted = await runPlausibilityCheck(
      { project, workId: null, scopeKey: "scope", scopeSceneIds: null },
      deps({ loadManuscript: async (_scope, id) => ({ status: "corrupted", info: { copyId: id, length: 1, chunks: 1, savedAtIso: "" } }) }),
    );
    expect(corrupted.notices.join(" ")).toContain("손상되어");
    expect(corrupted.manuscripts.size).toBe(0);
    const missing = await runPlausibilityCheck({ project, workId: null, scopeKey: "scope", scopeSceneIds: null }, deps());
    expect(missing.notices.join(" ")).toContain("찾지 못했어요");
  });

  it("사본 보관소가 던져도 나머지로 리포트를 만든다", async () => {
    const { project } = ARCADIA_FIXTURE;
    const result = await runPlausibilityCheck(
      { project, workId: null, scopeKey: "scope", scopeSceneIds: null },
      deps({ loadManuscript: async () => { throw new Error("저장소를 열 수 없어요"); } }),
    );
    expect(result.report.version).toBe(1);
    expect(result.notices[0]).toContain("건너뛰었어요");
  });

  it("취소하면 AbortError로 멈춘다", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runPlausibilityCheck(
      { project: ARCADIA_FIXTURE.project, workId: null, scopeKey: "s", scopeSceneIds: null, signal: controller.signal },
      deps(),
    )).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("점검 범위", () => {
  const project: StoryworldProject = {
    ...PLAUSIBILITY_EXAMPLE_PROJECT,
    scenes: PLAUSIBILITY_EXAMPLE_PROJECT.scenes.map((scene, index) => ({
      ...scene,
      ...(index < 4 ? { episodeNumber: 1 } : index < 7 ? { episodeNumber: 2 } : {}),
      ...(index === 5 ? { disabled: true } : {}),
    })),
  };

  it("사용 중인 장면이 속한 회차만 모은다", () => {
    expect(availableEpisodeNumbers(project)).toEqual([1, 2]);
  });

  it("회차·장면 범위를 장면 id 목록으로 바꾸고, 전체는 null이다", () => {
    expect(scopeSceneIds(project, ALL_SCENES_SCOPE)).toBeNull();
    expect(scopeSceneIds(project, { kind: "episodes", episodeNumbers: [2] })).toEqual(["s5", "s7"]);
    expect(scopeSceneIds(project, { kind: "scenes", sceneIds: ["s2", "s8"] })).toEqual(["s2", "s8"]);
  });

  it("문서에서 사라진 회차·장면은 걸러 내고, 남은 것이 없으면 전체로 돌아간다", () => {
    expect(normalizeScope(project, { kind: "episodes", episodeNumbers: [9, 1, 1] })).toEqual({ kind: "episodes", episodeNumbers: [1] });
    expect(normalizeScope(project, { kind: "episodes", episodeNumbers: [9] })).toEqual(ALL_SCENES_SCOPE);
    expect(normalizeScope(project, { kind: "scenes", sceneIds: ["s6", "없음"] })).toEqual(ALL_SCENES_SCOPE);
    expect(normalizeScope(project, { kind: "scenes", sceneIds: ["s1", "없음", "s1"] })).toEqual({ kind: "scenes", sceneIds: ["s1"] });
  });

  it("범위를 사람이 읽는 말로 적는다", () => {
    expect(describeScope(project, ALL_SCENES_SCOPE)).toBe("전체 장면");
    expect(describeScope(project, { kind: "episodes", episodeNumbers: [1, 2] })).toBe("1화, 2화 (장면 6개)");
    expect(describeScope(project, { kind: "scenes", sceneIds: ["s1", "s2"] })).toBe("고른 장면 2개");
  });
});

describe("되돌리기 목록", () => {
  const entry = (n: number): PlausibilityUndoEntry => ({ kind: "disposition", label: `처리 ${n}`, issueKey: `k${n}`, previous: null });

  it("가장 최근 항목부터 꺼내고, 비어 있으면 null이다", () => {
    let stack: readonly PlausibilityUndoEntry[] = [];
    stack = pushUndo(stack, entry(1));
    stack = pushUndo(stack, entry(2));
    const first = popUndo(stack);
    expect(first.entry?.label).toBe("처리 2");
    expect(popUndo(first.rest).entry?.label).toBe("처리 1");
    expect(popUndo([]).entry).toBeNull();
    expect(popUndo([]).rest).toEqual([]);
  });

  it("20개까지만 기억한다", () => {
    let stack: readonly PlausibilityUndoEntry[] = [];
    for (let i = 0; i < PLAUSIBILITY_UNDO_LIMIT + 5; i += 1) stack = pushUndo(stack, entry(i));
    expect(stack).toHaveLength(PLAUSIBILITY_UNDO_LIMIT);
    expect(stack[0]?.label).toBe("처리 5");
    expect(pushUndo([entry(1)], entry(2), 1)).toHaveLength(1);
  });
});
