import { describe, expect, it } from "vitest";

import {
  answerCutReadinessQuestion,
  approveAiProposal,
  buildStoryGraphLayout,
  convertConfirmedDecisionsToProposals,
  countPendingProposals,
  createEmptyCutReadinessSlots,
  createStoryLivingSpecState,
  createStoryNode,
  createStoryNodeId,
  cycleStoryThreeView,
  draftAiProposal,
  editAndApproveAiProposal,
  enqueuePendingAiProposal,
  evaluateCutReadiness,
  evaluateDriftBadges,
  extractMeetingDecisions,
  formatStoryNodeKey,
  parseStoryNodeId,
  proposeReviewQuickFix,
  recordCanvasContentChange,
  rejectAiProposal,
  runIncrementalSixPerspectiveReview,
  submitAiProposal,
  syncCutDriftBadge,
  toggleCutReadinessSlotVisibility,
  triageReviewFinding,
  updateCutReadinessSlot,
} from "./studio-story-living-spec-store";

function createSampleState() {
  const arc = createStoryNode({
    id: createStoryNodeId("ARC", "ARC-01"),
    title: "옥상의 진실",
    summary: "1부 핵심 갈등 아크",
    order: 0,
  });
  const charHajin = createStoryNode({
    id: createStoryNodeId("CHAR", "CHAR-01"),
    title: "하진",
    summary: "주인공",
    order: 1,
  });
  const locRooftop = createStoryNode({
    id: createStoryNodeId("LOC", "LOC-01"),
    title: "학교 옥상",
    summary: "주 배경 장소",
    order: 2,
  });
  const cut1 = createStoryNode({
    id: createStoryNodeId("CUT", "EP01-C01"),
    title: "옥상 문이 열리는 순간",
    summary: "하진이 문을 밀고 들어선다.",
    parentKey: arc.key,
    order: 3,
    cutSlots: createEmptyCutReadinessSlots({
      location: "학교 옥상",
      timeLighting: "노을 역광",
      actors: ["하진"],
      emotionalBeat: "긴장",
      cameraAngleLens: "바스트샷 50mm",
      keyAction: "문을 밀고 시선을 고정함",
      keyDialogue: "여기 있었구나.",
      propsAndContinuity: "왼손 붕대 유지",
      openQuestions: [
        {
          id: "q-rule",
          slot: "foreshadowOrRuleRef",
          question: "이 컷에서 암시할 복선이나 세계관 규칙은 무엇인가요?",
          options: ["RULE-01 야간 출입 금기", "복선 없음"],
          aiRecommendedIndex: 0,
        },
      ],
    }),
    dialogueLines: ["여기 있었구나."],
  });
  const cut2 = createStoryNode({
    id: createStoryNodeId("CUT", "EP01-C02"),
    title: "대치하는 시선",
    summary: "긴 대사와 미확인 소재가 섞인 컷",
    parentKey: arc.key,
    order: 4,
    cutSlots: createEmptyCutReadinessSlots({
      location: "미등록 지하실",
      actors: ["미등록 인물"],
      cameraAngleLens: "바스트샷 50mm",
    }),
    dialogueLines: [
      "이 문장은 모바일 세로 스크롤 화면에서 한 말풍선 기준 권장 글자 수를 훨씬 넘겨 독자의 가독성을 떨어뜨리는 매우 긴 설명 대사입니다.",
    ],
    rightsAssets: [
      { id: "asset-1", name: "핀터레스트 참고사진", license: "reference-only", sourceRef: "ref://board" },
    ],
    sensitiveCues: ["self-harm"],
  });
  const cut3 = createStoryNode({
    id: createStoryNodeId("CUT", "EP01-C03"),
    title: "같은 앵글 반복 컷",
    summary: "연속 3컷째 같은 카메라 앵글",
    parentKey: arc.key,
    order: 5,
    cutSlots: createEmptyCutReadinessSlots({
      location: "학교 옥상",
      actors: ["하진"],
      emotionalBeat: "결의",
      keyAction: "주먹을 쥠",
      cameraAngleLens: "바스트샷 50mm",
    }),
  });

  return createStoryLivingSpecState({
    projectId: "proj-living-spec",
    targetRating: "12+",
    nodes: [arc, charHajin, locRooftop, cut1, cut2, cut3],
    edges: [
      { id: "e-1", fromKey: arc.key, toKey: cut1.key, relation: "parent" },
      { id: "e-2", fromKey: cut1.key, toKey: cut2.key, relation: "follows" },
    ],
  });
}

describe("studio-story-living-spec-store", () => {
  it("formats and parses StoryNodeId prefixes cleanly", () => {
    const id = createStoryNodeId("BEAT", "EP01-B04");
    expect(formatStoryNodeKey(id)).toBe("BEAT:EP01-B04");
    expect(parseStoryNodeId("BEAT:EP01-B04")).toEqual({ prefix: "BEAT", code: "EP01-B04" });
    expect(parseStoryNodeId("CHAR-A12")).toEqual({ prefix: "CHAR", code: "CHAR-A12" });
    expect(parseStoryNodeId("INVALID")).toBeNull();
  });

  it("evaluates 9-slot cut readiness, hides unneeded slots, and answers open questions", () => {
    let state = createSampleState();
    const cut1Key = "CUT:EP01-C01";
    const initialCut = state.nodes.find((n) => n.key === cut1Key)!;
    expect(evaluateCutReadiness(initialCut.cutSlots!).label).toBe("8/9");

    // 불필요한 슬롯 숨기기
    state = toggleCutReadinessSlotVisibility(state, cut1Key, "foreshadowOrRuleRef");
    const afterHide = state.nodes.find((n) => n.key === cut1Key)!;
    expect(evaluateCutReadiness(afterHide.cutSlots!).label).toBe("8/8");
    expect(evaluateCutReadiness(afterHide.cutSlots!).percent).toBe(100);

    // 다시 표시 후 객관식 질문 카드로 채우기
    state = toggleCutReadinessSlotVisibility(state, cut1Key, "foreshadowOrRuleRef");
    state = answerCutReadinessQuestion(state, cut1Key, "q-rule", 0, "2026-11-20T09:00:00.000Z");
    const afterAnswer = state.nodes.find((n) => n.key === cut1Key)!;
    expect(afterAnswer.cutSlots?.foreshadowOrRuleRef).toBe("RULE-01 야간 출입 금기");
    expect(afterAnswer.cutSlots?.openQuestions).toHaveLength(0);
    expect(evaluateCutReadiness(afterAnswer.cutSlots!).label).toBe("9/9");
  });

  it("enforces Draft -> PendingProposal -> Approve / EditThenApprove / Reject with WorkLog", () => {
    // 빈 문서 최초 생성 단축 경로 확인
    const emptyState = createStoryLivingSpecState({ projectId: "empty-proj" });
    const bootstrapped = draftAiProposal(emptyState, {
      targetEntityId: "ARC:ARC-01",
      op: "create",
      source: "studio_chat",
      title: "최초 아크",
      rationale: "빈 문서 시작 초안",
      proposedSnapshot: { id: createStoryNodeId("ARC", "ARC-01"), title: "최초 아크", summary: "시작" },
      allowEmptyDocShortcut: true,
    });
    expect(bootstrapped.nodes).toHaveLength(1);
    expect(bootstrapped.workLog.at(-1)?.action).toBe("bootstrap_committed");

    // 기존 문서에서는 Draft -> Pending 동안 원문을 절대 덮어쓰지 않음
    let state = createSampleState();
    state = draftAiProposal(state, {
      id: "prop-1",
      targetEntityId: "CUT:EP01-C01",
      op: "update",
      source: "studio_chat",
      title: "1컷 대사 다듬기",
      rationale: "감정선 강화",
      proposedSnapshot: { title: "옥상 문이 거칠게 열림", summary: "수정 제안 요약" },
    });
    expect(countPendingProposals(state)).toBe(0);
    expect(state.nodes.find((n) => n.key === "CUT:EP01-C01")?.title).toBe("옥상 문이 열리는 순간");

    state = submitAiProposal(state, "prop-1");
    expect(countPendingProposals(state)).toBe(1);

    // EditThenApprove -> '내가 고친 내용' 플래그와 WorkLog 기록
    state = editAndApproveAiProposal(state, "prop-1", {
      title: "작가가 직접 다듬은 1컷 제목",
      summary: "직접 수정한 요약",
    });
    expect(countPendingProposals(state)).toBe(0);
    expect(state.nodes.find((n) => n.key === "CUT:EP01-C01")?.title).toBe("작가가 직접 다듬은 1컷 제목");
    const editedProposal = state.proposals.find((p) => p.id === "prop-1")!;
    expect(editedProposal.userEdited).toBe(true);
    expect(editedProposal.status).toBe("approved");
    expect(state.workLog.at(-1)?.action).toBe("proposal_edited_approved");
    expect(state.workLog.at(-1)?.userEdited).toBe(true);

    // Approve & Reject 경로 검증
    state = enqueuePendingAiProposal(state, {
      id: "prop-2",
      targetEntityId: "CUT:EP01-C03",
      op: "update",
      source: "external_mcp",
      title: "3컷 요약 보강",
      rationale: "MCP 제안",
      proposedSnapshot: { summary: "주먹을 쥐며 고개를 든다." },
    });
    state = approveAiProposal(state, "prop-2");
    expect(state.nodes.find((n) => n.key === "CUT:EP01-C03")?.summary).toBe("주먹을 쥐며 고개를 든다.");

    state = enqueuePendingAiProposal(state, {
      id: "prop-3",
      targetEntityId: "CUT:EP01-C03",
      op: "delete",
      source: "studio_chat",
      title: "3컷 삭제 제안",
      rationale: "불필요한 컷",
    });
    state = rejectAiProposal(state, "prop-3");
    expect(state.nodes.some((n) => n.key === "CUT:EP01-C03")).toBe(true);
    expect(state.proposals.find((p) => p.id === "prop-3")?.status).toBe("rejected");
  });

  it("extracts PD/assistant meeting decisions (확정/미정/기각) and queues only confirmed items", () => {
    let state = createSampleState();
    const notes = [
      "[확정] PD: EP01-C01 노을 역광을 더 강하게 잡기로 합의",
      "[미정] 어시: 교복 젖은 표현은 추후 논의",
      "[기각] PD: 옥상 추락 엔딩안은 반려",
    ].join("\n");

    const decisions = extractMeetingDecisions(
      notes,
      "meeting-2026-11-20",
      state.nodes.map((n) => n.key),
    );
    expect(decisions).toHaveLength(3);
    expect(decisions.map((d) => d.status)).toEqual(["confirmed", "undecided", "rejected"]);
    expect(decisions[0]?.speaker).toBe("PD");
    expect(decisions[0]?.targetEntityId).toBe("CUT:EP01-C01");
    expect(decisions[0]?.quote).toContain("노을 역광");

    state = convertConfirmedDecisionsToProposals(state, decisions);
    expect(countPendingProposals(state)).toBe(1);
    expect(state.proposals[0]?.source).toBe("meeting_decision");
    expect(state.proposals[0]?.evidenceCitations[0]?.quote).toContain("노을 역광");
  });

  it("tracks content-hash storyboard drift badges and clears them on sync", () => {
    let state = createSampleState();
    expect(evaluateDriftBadges(state).every((badge) => !badge.isStale)).toBe(true);

    // 대본 슬롯 수정 시 드리프트 감지
    state = updateCutReadinessSlot(state, "CUT:EP01-C01", "timeLighting", "폭우 야간 조명");
    expect(state.driftBadges["CUT:EP01-C01"]?.isStale).toBe(true);

    // 재동기화 시 배지 해제
    state = syncCutDriftBadge(state, "CUT:EP01-C01");
    expect(state.driftBadges["CUT:EP01-C01"]?.isStale).toBe(false);

    // 캔버스 해시 변경 시 다시 드리프트 감지
    state = recordCanvasContentChange(state, "CUT:EP01-C01", "canvas-hash-changed-999");
    expect(state.driftBadges["CUT:EP01-C01"]?.isStale).toBe(true);
  });

  it("runs incremental 6-perspective review and preserves resolved/deferred verdicts for unchanged nodes", () => {
    let state = createSampleState();
    state = runIncrementalSixPerspectiveReview(state, "2026-11-20T10:00:00.000Z");

    const perspectivesFound = new Set(state.reviewFindings.map((f) => f.perspective));
    expect(perspectivesFound.has("narrative_pacing")).toBe(true);
    expect(perspectivesFound.has("continuity_lore")).toBe(true);
    expect(perspectivesFound.has("visual_directing")).toBe(true);
    expect(perspectivesFound.has("dialogue_readability")).toBe(true);
    expect(perspectivesFound.has("rights_bom")).toBe(true);
    expect(perspectivesFound.has("content_rating")).toBe(true);

    // Cut 2의 Rights BOM 항목을 resolved, 대사 가독성 항목을 deferred로 판정
    const rightsFinding = state.reviewFindings.find(
      (f) => f.targetNodeKey === "CUT:EP01-C02" && f.perspective === "rights_bom",
    )!;
    const dialogueFinding = state.reviewFindings.find(
      (f) => f.targetNodeKey === "CUT:EP01-C02" && f.perspective === "dialogue_readability",
    )!;
    state = triageReviewFinding(state, rightsFinding.id, "resolved");
    state = triageReviewFinding(state, dialogueFinding.id, "deferred");

    // Cut 3만 수정(Cut 2는 해시 불변, Cut 3은 Cut 2의 뒤쪽이므로 Cut 2 재평가 대상 아님)
    state = updateCutReadinessSlot(state, "CUT:EP01-C03", "cameraAngleLens", "하이앵글 와이드 28mm");
    expect(
      state.reviewFindings.some((f) => f.targetNodeKey === "CUT:EP01-C03" && f.isStale),
    ).toBe(true);

    // 증분 재검수 실행
    state = runIncrementalSixPerspectiveReview(state, "2026-11-20T10:05:00.000Z");
    expect(state.lastReviewReport?.preservedNodeKeys).toContain("CUT:EP01-C02");
    expect(state.lastReviewReport?.reevaluatedNodeKeys).toContain("CUT:EP01-C03");

    // 해시 불변 노드(Cut 2)의 resolved / deferred 판정이 초기화되지 않고 완벽히 보존됨
    expect(state.reviewFindings.find((f) => f.id === rightsFinding.id)?.status).toBe("resolved");
    expect(state.reviewFindings.find((f) => f.id === dialogueFinding.id)?.status).toBe("deferred");
    // Cut 3의 반복 카메라 경고는 해소됨
    expect(
      state.reviewFindings.some(
        (f) => f.targetNodeKey === "CUT:EP01-C03" && f.ruleCode === "repetitive-camera-cadence",
      ),
    ).toBe(false);

    // 선택형 보완 제안이 승인 대기 큐로 들어가는지 검증
    const pacingFinding = state.reviewFindings.find(
      (f) => f.targetNodeKey === "CUT:EP01-C02" && f.quickFixOptions.length > 0,
    )!;
    state = proposeReviewQuickFix(state, pacingFinding.id, 0);
    expect(countPendingProposals(state)).toBe(1);
    expect(state.proposals[0]?.source).toBe("review_fix");
  });

  it("cycles 3 views and lays out 150 nodes deterministically", () => {
    expect(cycleStoryThreeView("graph")).toBe("directory");
    expect(cycleStoryThreeView("directory")).toBe("document");
    expect(cycleStoryThreeView("document")).toBe("graph");
    expect(cycleStoryThreeView("graph", true)).toBe("document");

    const nodes = Array.from({ length: 150 }, (_, idx) =>
      createStoryNode({
        id: createStoryNodeId("CUT", `C-${idx + 1}`),
        title: `컷 ${idx + 1}`,
        order: idx,
      }),
    );
    const layout = buildStoryGraphLayout(nodes);
    expect(layout).toHaveLength(150);
    expect(layout[0]?.x).toBe(layout[1]?.x);
    expect(layout[1]!.y).toBeGreaterThan(layout[0]!.y);
  });
});
