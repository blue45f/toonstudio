/**
 * Story Living Spec AI 변경 제안 게이트 상태 머신 및 회의록 결정 추출기.
 */

import {
  appendStoryWorkLog,
  computeStoryNodeContentHash,
  createEmptyCutReadinessSlots,
  createStoryNode,
  findStoryNodeIndex,
  parseStoryNodeId,
  refreshStoryDriftAndStaleFindings,
} from "./studio-story-living-spec-core";
import type {
  AiChangeProposal,
  CreateAiProposalInput,
  MeetingDecisionItem,
  MeetingDecisionStatus,
  ProposalOp,
  StoryLivingNode,
  StoryLivingSpecState,
  StoryNodeSnapshot,
} from "./studio-story-living-spec-types";

function applySnapshotToNodes(
  nodes: readonly StoryLivingNode[],
  op: ProposalOp,
  targetEntityId: string,
  snapshot: StoryNodeSnapshot | undefined,
  now: string,
): readonly StoryLivingNode[] {
  const existingIdx = findStoryNodeIndex(nodes, targetEntityId);
  if (op === "delete") {
    return existingIdx < 0 ? nodes : nodes.filter((_, i) => i !== existingIdx);
  }
  if (op === "create") {
    const parsed = snapshot?.id ?? parseStoryNodeId(targetEntityId) ?? { prefix: "CUT", code: targetEntityId };
    const created = createStoryNode({
      id: parsed,
      title: snapshot?.title ?? targetEntityId,
      summary: snapshot?.summary ?? "",
      parentKey: snapshot?.parentKey ?? null,
      order: snapshot?.order ?? nodes.length,
      cutSlots: snapshot?.cutSlots,
      dialogueLines: snapshot?.dialogueLines,
      rightsAssets: snapshot?.rightsAssets,
      sensitiveCues: snapshot?.sensitiveCues,
      updatedAt: now,
    });
    return existingIdx >= 0
      ? nodes.map((node, i) => (i === existingIdx ? created : node))
      : [...nodes, created];
  }
  if (existingIdx < 0) return nodes;
  const current = nodes[existingIdx];
  if (!current || !snapshot) return nodes;
  const mergedSlots = snapshot.cutSlots
    ? {
        ...(current.cutSlots ?? createEmptyCutReadinessSlots()),
        ...snapshot.cutSlots,
      }
    : current.cutSlots;
  const nextNodeBase = {
    ...current,
    title: snapshot.title !== undefined ? snapshot.title.trim() : current.title,
    summary: snapshot.summary !== undefined ? snapshot.summary.trim() : current.summary,
    parentKey: snapshot.parentKey !== undefined ? snapshot.parentKey : current.parentKey,
    order: snapshot.order !== undefined ? snapshot.order : current.order,
    cutSlots: mergedSlots,
    dialogueLines: snapshot.dialogueLines ?? current.dialogueLines,
    rightsAssets: snapshot.rightsAssets ?? current.rightsAssets,
    sensitiveCues: snapshot.sensitiveCues ?? current.sensitiveCues,
    updatedAt: now,
  };
  const updated: StoryLivingNode = {
    ...nextNodeBase,
    contentHash: computeStoryNodeContentHash(nextNodeBase),
  };
  return nodes.map((node, i) => (i === existingIdx ? updated : node));
}

function snapshotFromNode(node: StoryLivingNode | undefined): StoryNodeSnapshot | undefined {
  if (!node) return undefined;
  return {
    id: node.id,
    title: node.title,
    summary: node.summary,
    parentKey: node.parentKey,
    order: node.order,
    cutSlots: node.cutSlots,
    dialogueLines: node.dialogueLines,
    rightsAssets: node.rightsAssets,
    sensitiveCues: node.sensitiveCues,
  };
}

/** Draft 단계로 제안을 생성한다. 빈 문서 최초 생성 시에만 단축 커밋을 허용한다. */
export function draftAiProposal(
  state: StoryLivingSpecState,
  input: CreateAiProposalInput,
): StoryLivingSpecState {
  const now = input.createdAt ?? "2026-11-20T00:00:00.000Z";
  const proposalId = input.id ?? `prop-${state.sequence}-${state.proposals.length + 1}`;
  if (input.allowEmptyDocShortcut && state.nodes.length === 0 && input.op === "create") {
    const nodes = applySnapshotToNodes(state.nodes, "create", input.targetEntityId, input.proposedSnapshot, now);
    const refreshed = refreshStoryDriftAndStaleFindings(state, nodes);
    return {
      ...state,
      ...refreshed,
      nodes,
      selectedNodeKey: nodes[0]?.key ?? null,
      sequence: state.sequence + 1,
      workLog: appendStoryWorkLog(state, {
        at: now,
        actor: "ai_proposal",
        action: "bootstrap_committed",
        targetEntityId: input.targetEntityId,
        summary: `빈 문서 최초 초안(${input.title})을 즉시 반영했습니다.`,
        proposalId,
      }),
    };
  }
  const existingIdx = findStoryNodeIndex(state.nodes, input.targetEntityId);
  const existingNode = existingIdx >= 0 ? state.nodes[existingIdx] : undefined;
  const proposal: AiChangeProposal = {
    id: proposalId,
    targetEntityId: existingNode?.key ?? input.targetEntityId,
    op: input.op,
    source: input.source,
    title: input.title.trim(),
    rationale: input.rationale.trim(),
    beforeSnapshot: snapshotFromNode(existingNode),
    proposedSnapshot: input.proposedSnapshot,
    userEdited: false,
    status: "draft",
    evidenceCitations: input.evidenceCitations ? [...input.evidenceCitations] : [],
    createdAt: now,
  };
  return {
    ...state,
    proposals: [...state.proposals, proposal],
    sequence: state.sequence + 1,
    workLog: appendStoryWorkLog(state, {
      at: now,
      actor: "ai_proposal",
      action: "proposal_drafted",
      targetEntityId: proposal.targetEntityId,
      summary: `AI 변경 초안(${proposal.title})을 작성했습니다.`,
      proposalId: proposal.id,
    }),
  };
}

/** Draft → PendingProposal(탭 파란 점 활성) 전이. */
export function submitAiProposal(
  state: StoryLivingSpecState,
  proposalId: string,
  now = "2026-11-20T00:00:00.000Z",
): StoryLivingSpecState {
  const target = state.proposals.find((item) => item.id === proposalId);
  if (!target || target.status !== "draft") return state;
  return {
    ...state,
    proposals: state.proposals.map((item) =>
      item.id === proposalId ? { ...item, status: "pending" } : item,
    ),
    sequence: state.sequence + 1,
    workLog: appendStoryWorkLog(state, {
      at: now,
      actor: "ai_proposal",
      action: "proposal_submitted",
      targetEntityId: target.targetEntityId,
      summary: `승인 대기 제안(${target.title})이 도착했습니다.`,
      proposalId,
    }),
  };
}

/** Draft를 거쳐 즉시 승인 대기(PendingProposal) 큐에 올리는 단축 도우미. */
export function enqueuePendingAiProposal(
  state: StoryLivingSpecState,
  input: CreateAiProposalInput,
): StoryLivingSpecState {
  const now = input.createdAt ?? "2026-11-20T00:00:00.000Z";
  const proposalId = input.id ?? `prop-${state.sequence}-${state.proposals.length + 1}`;
  const drafted = draftAiProposal(state, { ...input, id: proposalId, createdAt: now });
  if (input.allowEmptyDocShortcut && state.nodes.length === 0 && input.op === "create") {
    return drafted;
  }
  return submitAiProposal(drafted, proposalId, now);
}

export function approveAiProposal(
  state: StoryLivingSpecState,
  proposalId: string,
  now = "2026-11-20T00:00:00.000Z",
): StoryLivingSpecState {
  const target = state.proposals.find((item) => item.id === proposalId);
  if (!target || target.status !== "pending") return state;
  const nodes = applySnapshotToNodes(
    state.nodes,
    target.op,
    target.targetEntityId,
    target.proposedSnapshot,
    now,
  );
  const refreshed = refreshStoryDriftAndStaleFindings(state, nodes);
  return {
    ...state,
    ...refreshed,
    nodes,
    proposals: state.proposals.map((item) =>
      item.id === proposalId ? { ...item, status: "approved", resolvedAt: now } : item,
    ),
    sequence: state.sequence + 1,
    workLog: appendStoryWorkLog(state, {
      at: now,
      actor: "creator",
      action: "proposal_approved",
      targetEntityId: target.targetEntityId,
      summary: `제안(${target.title})을 그대로 승인해 반영했습니다.`,
      userEdited: false,
      proposalId,
    }),
  };
}

export function editAndApproveAiProposal(
  state: StoryLivingSpecState,
  proposalId: string,
  editedSnapshot: StoryNodeSnapshot,
  now = "2026-11-20T00:00:00.000Z",
): StoryLivingSpecState {
  const target = state.proposals.find((item) => item.id === proposalId);
  if (!target || target.status !== "pending") return state;
  const mergedEdit: StoryNodeSnapshot = {
    ...target.proposedSnapshot,
    ...editedSnapshot,
  };
  const nodes = applySnapshotToNodes(state.nodes, target.op, target.targetEntityId, mergedEdit, now);
  const refreshed = refreshStoryDriftAndStaleFindings(state, nodes);
  return {
    ...state,
    ...refreshed,
    nodes,
    proposals: state.proposals.map((item) =>
      item.id === proposalId
        ? {
            ...item,
            status: "approved",
            userEdited: true,
            userEditedSnapshot: mergedEdit,
            resolvedAt: now,
          }
        : item,
    ),
    sequence: state.sequence + 1,
    workLog: appendStoryWorkLog(state, {
      at: now,
      actor: "creator",
      action: "proposal_edited_approved",
      targetEntityId: target.targetEntityId,
      summary: `제안(${target.title})을 직접 수정해 반영했습니다(내가 고친 내용).`,
      userEdited: true,
      proposalId,
    }),
  };
}

export function rejectAiProposal(
  state: StoryLivingSpecState,
  proposalId: string,
  now = "2026-11-20T00:00:00.000Z",
): StoryLivingSpecState {
  const target = state.proposals.find((item) => item.id === proposalId);
  if (!target || target.status !== "pending") return state;
  return {
    ...state,
    proposals: state.proposals.map((item) =>
      item.id === proposalId ? { ...item, status: "rejected", resolvedAt: now } : item,
    ),
    sequence: state.sequence + 1,
    workLog: appendStoryWorkLog(state, {
      at: now,
      actor: "creator",
      action: "proposal_rejected",
      targetEntityId: target.targetEntityId,
      summary: `제안(${target.title})을 거절했습니다.`,
      proposalId,
    }),
  };
}

export function countPendingProposals(state: StoryLivingSpecState): number {
  return state.proposals.filter((item) => item.status === "pending").length;
}

const NODE_REF_REGEX = /\b(?:ARC|EP|BEAT|CUT|CHAR|LOC|RULE)(?::|-)[A-Za-z0-9-]+\b/u;

/** PD·어시스턴트 회의록 원문에서 확정/미정/기각 결정과 원문 인용을 추출한다. */
export function extractMeetingDecisions(
  rawNotes: string,
  sourceDocId: string,
  knownNodeKeys: readonly string[] = [],
): readonly MeetingDecisionItem[] {
  const lines = rawNotes
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const items: MeetingDecisionItem[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    let status: MeetingDecisionStatus | null = null;
    if (/^(?:\[확정\]|확정:|결정:|합의:)/u.test(line) || /(?:확정|결정함|하기로\s*합의|반영\s*확정)/u.test(line)) {
      status = "confirmed";
    } else if (/^(?:\[기각\]|기각:|반려:|취소:)/u.test(line) || /(?:기각|반려|폐기|철회)/u.test(line)) {
      status = "rejected";
    } else if (/^(?:\[미정\]|미정:|보류:)/u.test(line) || /(?:미정|보류|추후\s*논의|재검토)/u.test(line)) {
      status = "undecided";
    }
    if (!status) continue;

    const speakerMatch = /^(?:\[(?:확정|미정|기각)\]\s*)?([가-힣A-Za-z0-9]{1,12})\s*[:：]\s*(.+)$/u.exec(line);
    const speaker =
      speakerMatch && !/^(?:확정|미정|기각|결정|합의|보류|반려|취소)$/u.test(speakerMatch[1] ?? "")
        ? speakerMatch[1]
        : undefined;
    const cleanedSummary = (speakerMatch?.[2] ?? line)
      .replace(/^(?:\[(?:확정|미정|기각)\]|(?:확정|미정|기각|결정|합의|보류|반려|취소)\s*[:：])\s*/u, "")
      .trim();

    const refMatch = NODE_REF_REGEX.exec(line);
    const matchedKey =
      refMatch
        ? (knownNodeKeys.find((key) => key.endsWith(refMatch[0]) || key === refMatch[0]) ?? refMatch[0])
        : (knownNodeKeys.find((key) => line.includes(key.split(":")[1] ?? key)) ?? null);

    items.push({
      id: `md-${sourceDocId}-${i + 1}`,
      status,
      summary: cleanedSummary,
      targetEntityId: matchedKey,
      speaker,
      quote: line,
      sourceDocId,
    });
  }
  return items;
}

/** 추출된 회의록 결정 중 '확정' 항목만 비파괴 승인 대기 제안으로 변환한다. */
export function convertConfirmedDecisionsToProposals(
  state: StoryLivingSpecState,
  decisions: readonly MeetingDecisionItem[],
  now = "2026-11-20T00:00:00.000Z",
): StoryLivingSpecState {
  const confirmed = decisions.filter((item) => item.status === "confirmed");
  if (confirmed.length === 0) return state;
  let nextState = state;
  for (const decision of confirmed) {
    const targetId = decision.targetEntityId ?? nextState.selectedNodeKey ?? nextState.nodes[0]?.key;
    if (!targetId) continue;
    const existingIdx = findStoryNodeIndex(nextState.nodes, targetId);
    const existing = existingIdx >= 0 ? nextState.nodes[existingIdx] : undefined;
    nextState = enqueuePendingAiProposal(nextState, {
      targetEntityId: existing?.key ?? targetId,
      op: existing ? "update" : "create",
      source: "meeting_decision",
      title: `회의 확정 반영: ${decision.summary.slice(0, 36)}`,
      rationale: decision.speaker
        ? `${decision.speaker} 의견 확정 사항을 기획 문서에 반영합니다.`
        : "회의록 확정 결정을 기획 문서에 반영합니다.",
      proposedSnapshot: existing
        ? { summary: existing.summary ? `${existing.summary} / ${decision.summary}` : decision.summary }
        : { title: decision.summary.slice(0, 48), summary: decision.summary },
      evidenceCitations: [{ sourceDocId: decision.sourceDocId, quote: decision.quote }],
      createdAt: now,
    });
  }
  return {
    ...nextState,
    workLog: appendStoryWorkLog(nextState, {
      at: now,
      actor: "meeting_sync",
      action: "meeting_extracted",
      targetEntityId: nextState.projectId,
      summary: `회의록에서 확정 ${confirmed.length}건을 승인 대기 제안으로 옮겼습니다.`,
    }),
  };
}
