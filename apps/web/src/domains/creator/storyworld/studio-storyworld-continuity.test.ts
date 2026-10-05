import { describe, expect, it } from "vitest";

import type {
  StoryworldCharacter,
  StoryworldFactDefinition,
  StoryworldProject,
  StoryworldScene,
} from "./studio-storyworld-causality";
import { analyzeStoryworldContinuity } from "./studio-storyworld-continuity";
import {
  EMPTY_STORYWORLD_ISSUE_DISPOSITIONS,
  clearStoryworldIssueDisposition,
  parseStoryworldIssueDispositions,
  storyworldIssueDispositionKey,
  upsertStoryworldIssueDisposition,
} from "./studio-storyworld-issue-dispositions";

function character(id: string, extra: Partial<StoryworldCharacter> = {}): StoryworldCharacter {
  return { id, name: id, ...extra };
}

function fact(id: string, extra: Partial<StoryworldFactDefinition> = {}): StoryworldFactDefinition {
  return { id, label: id, subjectId: "world", key: id, ...extra };
}

function scene(id: string, order: number, extra: Partial<StoryworldScene> = {}): StoryworldScene {
  return { id, title: id, order, ...extra };
}

function project(partial: Partial<StoryworldProject>): StoryworldProject {
  return {
    schemaVersion: 1,
    id: "continuity-test",
    title: "연속성 테스트",
    characters: [],
    facts: [],
    scenes: [],
    ...partial,
  };
}

describe("analyzeStoryworldContinuity", () => {
  it("같은 속성에 서로 다른 초기값을 선언한 사실 정의를 충돌로 잡는다", () => {
    const issues = analyzeStoryworldContinuity(project({
      facts: [
        fact("fact-gate-a", { subjectId: "gate", key: "state", initialValue: "sealed", label: "문 상태 A" }),
        fact("fact-gate-b", { subjectId: "gate", key: "state", initialValue: "open", label: "문 상태 B" }),
        fact("fact-other", { subjectId: "gate", key: "guard", initialValue: "jin" }),
      ],
      scenes: [scene("s1", 10, {
        participantIds: [],
        preconditions: [{ factId: "fact-other", comparator: "equals", value: "jin" }],
        effects: [{ factId: "fact-gate-a", op: "set", value: "open" }],
      })],
    }));
    const conflict = issues.find((issue) => issue.code === "fact-initial-value-conflict");
    expect(conflict?.severity).toBe("error");
    expect(conflict?.evidence.join(" ")).toContain("fact-gate-a");
    expect(conflict?.evidence.join(" ")).toContain("fact-gate-b");
    expect(conflict?.target).toEqual({ kind: "fact", id: "fact-gate-a" });
    // 초기값이 같으면 충돌이 아니다.
    const calm = analyzeStoryworldContinuity(project({
      facts: [
        fact("f1", { subjectId: "gate", key: "state", initialValue: "sealed" }),
        fact("f2", { subjectId: "gate", key: "state", initialValue: "sealed" }),
      ],
    }));
    expect(calm.some((issue) => issue.code === "fact-initial-value-conflict")).toBe(false);
  });

  it("장면에 없는 인물의 지식 사용·공개·감정 비트를 각각 잡는다", () => {
    const issues = analyzeStoryworldContinuity(project({
      characters: [character("hero"), character("ghost")],
      facts: [fact("fact-secret")],
      scenes: [scene("s1", 10, {
        participantIds: ["hero"],
        knowledgeUses: [{ characterId: "ghost", factId: "fact-secret" }],
        reveals: [{ factId: "fact-secret", audiences: ["reader", "ghost"] }],
        emotionalBeats: [{ characterId: "ghost", valence: -0.5, arousal: 0.8 }],
      })],
    }));
    const codes = issues.map((issue) => issue.code);
    expect(codes).toContain("knowledge-use-absent");
    expect(codes).toContain("reveal-to-absent");
    expect(codes).toContain("emotion-beat-absent");
    for (const issue of issues.filter((item) => item.code.endsWith("-absent"))) {
      expect(issue.target.sceneId).toBe("s1");
      expect(issue.evidence.length).toBeGreaterThan(0);
    }
  });

  it("참여자이면 부재 검사가 없고, 독자 공개는 인물 공개로 세지 않는다", () => {
    const issues = analyzeStoryworldContinuity(project({
      characters: [character("hero")],
      facts: [fact("fact-secret")],
      scenes: [scene("s1", 10, {
        participantIds: ["hero"],
        knowledgeUses: [{ characterId: "hero", factId: "fact-secret" }],
        reveals: [{ factId: "fact-secret", audiences: ["reader"] }],
        emotionalBeats: [{ characterId: "hero", valence: 0.5, arousal: 0.4 }],
      })],
    }));
    expect(issues.map((issue) => issue.code)).not.toContain("knowledge-use-absent");
    expect(issues.map((issue) => issue.code)).not.toContain("reveal-to-absent");
    expect(issues.map((issue) => issue.code)).not.toContain("emotion-beat-absent");
  });

  it("한 번도 등장하지 않는 캐릭터와 어디에도 참조되지 않는 사실을 안내한다", () => {
    const issues = analyzeStoryworldContinuity(project({
      characters: [character("hero"), character("unused")],
      facts: [fact("fact-used"), fact("fact-orphan")],
      scenes: [scene("s1", 10, {
        participantIds: ["hero"],
        effects: [{ factId: "fact-used", op: "set", value: true }],
      })],
    }));
    expect(issues.find((issue) => issue.code === "character-never-appears")?.target)
      .toEqual({ kind: "character", id: "unused" });
    expect(issues.find((issue) => issue.code === "fact-never-referenced")?.target)
      .toEqual({ kind: "fact", id: "fact-orphan" });
    // 장면이 없으면 미등장 검사는 하지 않는다 (전부 미등장이 되는 무의미한 결과 방지).
    const empty = analyzeStoryworldContinuity(project({ characters: [character("hero")] }));
    expect(empty.some((issue) => issue.code === "character-never-appears")).toBe(false);
  });

  it("활성 장면의 순서 중복만 잡고 비활성 장면은 세지 않는다", () => {
    const issues = analyzeStoryworldContinuity(project({
      scenes: [
        scene("s1", 10),
        scene("s2", 10),
        scene("s3", 10, { disabled: true }),
        scene("s4", 20),
      ],
    }));
    const duplicates = issues.filter((issue) => issue.code === "scene-order-duplicate");
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.evidence).toHaveLength(2);
  });

  it("결과는 결정적이고 심각도 순으로 정렬된다", () => {
    const input = project({
      characters: [character("unused")],
      facts: [
        fact("fa", { subjectId: "gate", key: "state", initialValue: 1 }),
        fact("fb", { subjectId: "gate", key: "state", initialValue: 2 }),
      ],
      scenes: [scene("s1", 10, { participantIds: [] })],
    });
    const first = analyzeStoryworldContinuity(input);
    const second = analyzeStoryworldContinuity(input);
    expect(first.map((issue) => issue.id)).toEqual(second.map((issue) => issue.id));
    expect(first[0]?.severity).toBe("error");
  });
});

describe("storyworld issue dispositions", () => {
  it("해결/무시 기록을 넣고 지우며 직렬화 왕복이 보존된다", () => {
    let doc = { ...EMPTY_STORYWORLD_ISSUE_DISPOSITIONS, scopeKey: "scope-1" };
    doc = upsertStoryworldIssueDisposition(doc, {
      issueKey: "issue-1", status: "ignored", note: "의도된 연출", updatedAtIso: "2026-10-06T00:00:00.000Z",
    });
    doc = upsertStoryworldIssueDisposition(doc, {
      issueKey: "issue-1", status: "resolved", updatedAtIso: "2026-10-06T01:00:00.000Z",
    });
    expect(doc.dispositions).toHaveLength(1);
    expect(doc.dispositions[0]?.status).toBe("resolved");
    expect(doc.dispositions[0]?.note).toBeUndefined();
    const restored = parseStoryworldIssueDispositions(
      JSON.stringify({ version: 1, dispositions: doc.dispositions }),
      "scope-1",
    );
    expect(restored.dispositions).toEqual(doc.dispositions);
    doc = clearStoryworldIssueDisposition(doc, "issue-1");
    expect(doc.dispositions).toEqual([]);
    expect(storyworldIssueDispositionKey("scope-1")).toContain("scope-1");
    expect(() => parseStoryworldIssueDispositions(JSON.stringify({ version: 9, dispositions: [] }), "s")).toThrow();
  });
});
