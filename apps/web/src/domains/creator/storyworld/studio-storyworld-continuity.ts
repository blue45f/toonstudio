/**
 * 스토리월드 연속성 검사 — 인과 엔진(studio-storyworld-causality)이 하지 않는,
 * 데이터로 확정 판정할 수 있는 설정·스토리 불일치만 규칙 검사한다.
 *
 * 엔진은 전제·효과·지식 누설·시간 역행 같은 서사 인과를 본다. 이 검사는 그와
 * 겹치지 않는 행정적 불일치를 본다: 같은 속성의 초기값 충돌, 장면에 없는 인물의
 * 지식 사용·공개·감정 비트, 한 번도 등장하지 않는 인물, 어디에도 참조되지 않는
 * 사실, 활성 장면의 순서 중복. 판정 근거가 없는 추정 검사는 넣지 않는다 —
 * 연령 불일치는 나이 데이터가 스키마에 없어 검사하지 않는다.
 */
import {
  fingerprintStoryworldValue,
  type StoryworldFactDefinition,
  type StoryworldProject,
  type StoryworldScene,
} from "./studio-storyworld-causality";

export type StoryworldContinuityIssueCode =
  | "fact-initial-value-conflict"
  | "knowledge-use-absent"
  | "reveal-to-absent"
  | "emotion-beat-absent"
  | "character-never-appears"
  | "fact-never-referenced"
  | "scene-order-duplicate";

export type StoryworldContinuitySeverity = "error" | "warning" | "info";

export interface StoryworldContinuityTarget {
  readonly kind: "character" | "fact" | "scene";
  readonly id: string;
  readonly sceneId?: string;
}

export interface StoryworldContinuityIssue {
  readonly id: string;
  readonly code: StoryworldContinuityIssueCode;
  readonly severity: StoryworldContinuitySeverity;
  readonly messageKo: string;
  readonly messageEn: string;
  /** 충돌한 데이터의 요약 — 어느 값끼리 어긋났는지 사용자가 바로 확인할 수 있게. */
  readonly evidence: readonly string[];
  readonly target: StoryworldContinuityTarget;
}

const SEVERITY_ORDER: Readonly<Record<StoryworldContinuitySeverity, number>> = {
  error: 0,
  warning: 1,
  info: 2,
};

function issueId(code: string, parts: readonly unknown[]): string {
  return `continuity:${code}:${fingerprintStoryworldValue(parts)}`;
}

function activeScenes(project: StoryworldProject): readonly StoryworldScene[] {
  return project.scenes.filter((scene) => scene.disabled !== true);
}

function checkFactInitialValueConflicts(project: StoryworldProject): StoryworldContinuityIssue[] {
  const groups = new Map<string, StoryworldFactDefinition[]>();
  for (const fact of project.facts) {
    const key = `${fact.subjectId}${fact.key}`;
    const group = groups.get(key) ?? [];
    group.push(fact);
    groups.set(key, group);
  }
  const issues: StoryworldContinuityIssue[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const declared = group.filter((fact) => fact.initialValue !== undefined);
    const distinct = new Map<string, StoryworldFactDefinition>();
    for (const fact of declared) distinct.set(JSON.stringify(fact.initialValue), fact);
    if (distinct.size < 2) continue;
    const first = group[0]!;
    const evidence = [...distinct.values()].map(
      (fact) => `${fact.id} 초기값 ${JSON.stringify(fact.initialValue)}`,
    );
    issues.push({
      id: issueId("fact-initial-value-conflict", [first.subjectId, first.key, evidence]),
      code: "fact-initial-value-conflict",
      severity: "error",
      messageKo: `사실 "${first.label}" 등 ${group.length}개 정의가 같은 속성(${first.subjectId} · ${first.key})에 서로 다른 초기값을 선언했습니다. 어느 쪽이 정본인지 정해야 합니다.`,
      messageEn: `${group.length} fact definitions declare conflicting initial values for the same attribute (${first.subjectId} · ${first.key}). Decide which one is canonical.`,
      evidence,
      target: { kind: "fact", id: first.id },
    });
  }
  return issues;
}

function checkAbsentParticipants(project: StoryworldProject): StoryworldContinuityIssue[] {
  const issues: StoryworldContinuityIssue[] = [];
  const characterName = new Map(project.characters.map((character) => [character.id, character.name]));
  for (const scene of activeScenes(project)) {
    const participants = new Set(scene.participantIds ?? []);
    for (const use of scene.knowledgeUses ?? []) {
      if (participants.has(use.characterId)) continue;
      issues.push({
        id: issueId("knowledge-use-absent", [scene.id, use.characterId, use.factId]),
        code: "knowledge-use-absent",
        severity: "warning",
        messageKo: `장면 "${scene.title}"에서 ${characterName.get(use.characterId) ?? use.characterId}가 지식을 사용하지만 장면 참여자에 없습니다. 참여자에 넣거나 지식 사용을 지워야 합니다.`,
        messageEn: `In scene "${scene.title}", ${use.characterId} uses knowledge but is not a participant. Add them as a participant or remove the knowledge use.`,
        evidence: [`장면 참여자: ${[...participants].join(", ") || "(없음)"}`, `지식 사용 인물: ${use.characterId}`, `사실: ${use.factId}`],
        target: { kind: "scene", id: scene.id, sceneId: scene.id },
      });
    }
    for (const reveal of scene.reveals ?? []) {
      for (const audience of reveal.audiences) {
        if (audience === "reader" || participants.has(audience)) continue;
        issues.push({
          id: issueId("reveal-to-absent", [scene.id, audience, reveal.factId]),
          code: "reveal-to-absent",
          severity: "warning",
          messageKo: `장면 "${scene.title}"에서 사실이 ${characterName.get(audience) ?? audience}에게 공개되지만 그 인물이 장면 참여자에 없습니다.`,
          messageEn: `In scene "${scene.title}", a fact is revealed to ${audience}, who is not a participant of the scene.`,
          evidence: [`장면 참여자: ${[...participants].join(", ") || "(없음)"}`, `공개 대상: ${audience}`, `사실: ${reveal.factId}`],
          target: { kind: "scene", id: scene.id, sceneId: scene.id },
        });
      }
    }
    for (const beat of scene.emotionalBeats ?? []) {
      if (participants.has(beat.characterId)) continue;
      issues.push({
        id: issueId("emotion-beat-absent", [scene.id, beat.characterId, beat.valence, beat.arousal]),
        code: "emotion-beat-absent",
        severity: "warning",
        messageKo: `장면 "${scene.title}"에 ${characterName.get(beat.characterId) ?? beat.characterId}의 감정 비트(감정가 ${beat.valence})가 있지만 그 인물이 장면 참여자에 없습니다.`,
        messageEn: `Scene "${scene.title}" has an emotional beat (valence ${beat.valence}) for ${beat.characterId}, who is not a participant of the scene.`,
        evidence: [`장면 참여자: ${[...participants].join(", ") || "(없음)"}`, `감정 비트 인물: ${beat.characterId}`, `감정가: ${beat.valence}`],
        target: { kind: "scene", id: scene.id, sceneId: scene.id },
      });
    }
  }
  return issues;
}

function checkNeverAppearingCharacters(project: StoryworldProject): StoryworldContinuityIssue[] {
  const scenes = activeScenes(project);
  if (scenes.length === 0) return [];
  const appearing = new Set<string>();
  for (const scene of scenes) for (const id of scene.participantIds ?? []) appearing.add(id);
  return project.characters
    .filter((character) => !appearing.has(character.id))
    .map((character) => ({
      id: issueId("character-never-appears", [character.id]),
      code: "character-never-appears" as const,
      severity: "info" as const,
      messageKo: `캐릭터 "${character.name}"가 활성 장면 ${scenes.length}개 중 어디에도 참여자로 등장하지 않습니다.`,
      messageEn: `Character "${character.name}" does not appear as a participant in any of the ${scenes.length} active scenes.`,
      evidence: [`활성 장면 수: ${scenes.length}`, `등장 장면 수: 0`],
      target: { kind: "character" as const, id: character.id },
    }));
}

function checkNeverReferencedFacts(project: StoryworldProject): StoryworldContinuityIssue[] {
  const referenced = new Set<string>();
  for (const character of project.characters) {
    for (const id of character.initialFactIds ?? []) referenced.add(id);
    for (const id of character.secretFactIds ?? []) referenced.add(id);
  }
  for (const scene of project.scenes) {
    for (const condition of [...(scene.preconditions ?? []), ...(scene.effects ?? [])]) referenced.add(condition.factId);
    for (const use of scene.knowledgeUses ?? []) referenced.add(use.factId);
    for (const reveal of scene.reveals ?? []) referenced.add(reveal.factId);
    for (const setupId of scene.setupIds ?? []) referenced.add(setupId);
    for (const payoffId of scene.payoffIds ?? []) referenced.add(payoffId);
  }
  for (const contract of project.setupContracts ?? []) {
    referenced.add(contract.setupId);
    referenced.add(contract.payoffId);
  }
  return project.facts
    .filter((fact) => !referenced.has(fact.id))
    .map((fact) => ({
      id: issueId("fact-never-referenced", [fact.id]),
      code: "fact-never-referenced" as const,
      severity: "info" as const,
      messageKo: `사실 "${fact.label}"가 어떤 장면·인물·계약에서도 참조되지 않습니다. 미사용 설정이거나 연결이 빠진 상태입니다.`,
      messageEn: `Fact "${fact.label}" is not referenced by any scene, character, or contract. It is either unused or missing its links.`,
      evidence: [`주체: ${fact.subjectId}`, `속성 키: ${fact.key}`],
      target: { kind: "fact" as const, id: fact.id },
    }));
}

function checkDuplicateSceneOrders(project: StoryworldProject): StoryworldContinuityIssue[] {
  const byOrder = new Map<number, StoryworldScene[]>();
  for (const scene of activeScenes(project)) {
    const group = byOrder.get(scene.order) ?? [];
    group.push(scene);
    byOrder.set(scene.order, group);
  }
  const issues: StoryworldContinuityIssue[] = [];
  for (const [order, group] of byOrder) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    issues.push({
      id: issueId("scene-order-duplicate", [order, sorted.map((scene) => scene.id)]),
      code: "scene-order-duplicate",
      severity: "warning",
      messageKo: `활성 장면 ${group.length}개가 같은 순서(${order})를 공유합니다: ${sorted.map((scene) => `"${scene.title}"`).join(", ")}. 순서가 겹치면 회차 배열이 흔들립니다.`,
      messageEn: `${group.length} active scenes share order ${order}: ${sorted.map((scene) => `"${scene.title}"`).join(", ")}. Duplicate order makes the episode sequence ambiguous.`,
      evidence: sorted.map((scene) => `${scene.id} · 순서 ${scene.order}`),
      target: { kind: "scene", id: sorted[0]!.id, sceneId: sorted[0]!.id },
    });
  }
  return issues;
}

/** 프로젝트 전체를 검사한다. 결과는 심각도→코드→대상 순으로 결정적으로 정렬된다. */
export function analyzeStoryworldContinuity(project: StoryworldProject): readonly StoryworldContinuityIssue[] {
  const issues = [
    ...checkFactInitialValueConflicts(project),
    ...checkAbsentParticipants(project),
    ...checkNeverAppearingCharacters(project),
    ...checkNeverReferencedFacts(project),
    ...checkDuplicateSceneOrders(project),
  ];
  return issues.sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || a.code.localeCompare(b.code)
    || a.id.localeCompare(b.id));
}
