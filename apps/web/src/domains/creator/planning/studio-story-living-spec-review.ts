/**
 * Story Living Spec 웹툰 6관점 증분 자동 검수 및 트리아지 엔진.
 */

import { appendStoryWorkLog, createEmptyCutReadinessSlots } from "./studio-story-living-spec-core";
import { enqueuePendingAiProposal } from "./studio-story-living-spec-proposals";
import {
  STORY_REVIEW_PERSPECTIVE_LABELS_KO,
  type ReviewFindingStatus,
  type ReviewPerspective,
  type ReviewQuickFixOption,
  type ReviewSeverity,
  type StoryLivingNode,
  type StoryLivingSpecState,
  type StoryReviewFinding,
} from "./studio-story-living-spec-types";

function evaluateNodeFindings(
  node: StoryLivingNode,
  state: StoryLivingSpecState,
  cutNeighbors: { readonly prevCamera?: string; readonly prev2Camera?: string },
  knownCharacterNames: ReadonlySet<string>,
  knownLocationNames: ReadonlySet<string>,
): readonly StoryReviewFinding[] {
  const findings: StoryReviewFinding[] = [];
  const push = (
    perspective: ReviewPerspective,
    severity: ReviewSeverity,
    ruleCode: string,
    title: string,
    message: string,
    quote: string,
    quickFixOptions: readonly ReviewQuickFixOption[] = [],
  ) => {
    findings.push({
      id: `${perspective}:${node.key}:${ruleCode}`,
      perspective,
      severity,
      ruleCode,
      targetNodeKey: node.key,
      evaluatedNodeHash: node.contentHash,
      title,
      message,
      quote,
      status: "open",
      isStale: false,
      quickFixOptions,
    });
  };

  // 1. 서사·페이싱
  if (node.id.prefix === "CUT") {
    const slots = node.cutSlots ?? createEmptyCutReadinessSlots();
    if (!slots.emotionalBeat?.trim() && !slots.keyAction?.trim()) {
      push(
        "narrative_pacing",
        "warning",
        "missing-beat-action",
        "컷의 감정 목표와 핵심 동작이 비어 있습니다",
        "독자 시선을 다음 컷으로 이끌 감정 목표나 중심 동작을 최소 하나 채워 주세요.",
        `${node.id.code} · ${node.title}`,
        [
          {
            label: "긴장감 고조 동작 보강",
            summary: "감정 목표를 긴장감으로 채우고 반응 동작을 추가합니다.",
            patch: { cutSlots: { ...slots, emotionalBeat: "팽팽한 긴장감", keyAction: "시선을 고정하며 한 걸음 다가섬" } },
          },
          {
            label: "여운·호흡 컷으로 지정",
            summary: "감정 목표를 여운으로 두고 침묵 연출을 기록합니다.",
            patch: { cutSlots: { ...slots, emotionalBeat: "정적과 여운", keyAction: "인물이 말없이 고개를 돌림" } },
          },
        ],
      );
    }
  } else if (!node.summary.trim()) {
    push(
      "narrative_pacing",
      "suggestion",
      "empty-node-summary",
      "노드 요약 설명이 비어 있습니다",
      "핵심 사건이나 역할을 한 문장으로 적어 두면 회차 간 페이싱 점검이 쉬워집니다.",
      `${node.id.code} · ${node.title}`,
    );
  }

  // 2. 설정·일관성
  if (node.id.prefix === "CUT" && node.cutSlots) {
    const unknownActors = (node.cutSlots.actors ?? []).filter(
      (actor) => knownCharacterNames.size > 0 && !knownCharacterNames.has(actor.trim()),
    );
    if (unknownActors.length > 0) {
      push(
        "continuity_lore",
        "critical",
        "unregistered-actor",
        `스토리 바이블에 없는 인물(${unknownActors.join(", ")})이 등장합니다`,
        "인물 노드를 새로 등록하거나 표기를 바이블 정본 이름으로 맞춰 설정 충돌을 막아 주세요.",
        `등장인물: ${unknownActors.join(", ")}`,
      );
    }
    if (
      node.cutSlots.location?.trim() &&
      knownLocationNames.size > 0 &&
      !knownLocationNames.has(node.cutSlots.location.trim())
    ) {
      push(
        "continuity_lore",
        "warning",
        "unregistered-location",
        `미등록 장소(${node.cutSlots.location})가 사용되었습니다`,
        "장소(LOC) 설정과 연결하면 배경·조명 연속성을 자동으로 추적할 수 있습니다.",
        `장소: ${node.cutSlots.location}`,
      );
    }
  }

  // 3. 연출 다양성
  if (node.id.prefix === "CUT" && node.cutSlots) {
    const cam = node.cutSlots.cameraAngleLens?.trim();
    if (!cam) {
      push(
        "visual_directing",
        "suggestion",
        "missing-camera-angle",
        "카메라 앵글과 렌즈가 미지정입니다",
        "샷 크기와 앵글을 미리 정해 두면 3D 배경 배치와 콘티 속도가 빨라집니다.",
        `${node.id.code} · ${node.title}`,
        [
          {
            label: "바스트샷 50mm 표준 적용",
            summary: "대화 중심 표준 바스트샷 구도를 제안합니다.",
            patch: { cutSlots: { ...node.cutSlots, cameraAngleLens: "아이레벨 바스트샷 50mm" } },
          },
          {
            label: "로우앵글 클로즈업 35mm 적용",
            summary: "감정 압박감을 높이는 로우앵글 클로즈업을 제안합니다.",
            patch: { cutSlots: { ...node.cutSlots, cameraAngleLens: "로우앵글 클로즈업 35mm" } },
          },
        ],
      );
    } else if (cam === cutNeighbors.prevCamera && cam === cutNeighbors.prev2Camera) {
      push(
        "visual_directing",
        "warning",
        "repetitive-camera-cadence",
        `동일한 앵글(${cam})이 3컷 연속 반복됩니다`,
        "시각적 단조로움을 피하려면 클로즈업, 부감, 리버스샷 등으로 시점을 전환해 보세요.",
        `연속 앵글: ${cam}`,
        [
          {
            label: "리버스샷 오버더숄더로 전환",
            summary: "상대 인물 어깨 너머 구도로 리듬을 바꿉니다.",
            patch: { cutSlots: { ...node.cutSlots, cameraAngleLens: "오버더숄더 리버스샷 50mm" } },
          },
          {
            label: "하이앵글 와이드 28mm로 환기",
            summary: "공간감을 열어 주며 긴장을 환기합니다.",
            patch: { cutSlots: { ...node.cutSlots, cameraAngleLens: "하이앵글 와이드 28mm" } },
          },
        ],
      );
    }
  }

  // 4. 대사 가독성
  const lines = [
    ...(node.dialogueLines ?? []),
    ...(node.cutSlots?.keyDialogue?.trim() ? [node.cutSlots.keyDialogue.trim()] : []),
  ];
  const uniqueLines = Array.from(new Set(lines.filter((line) => line.length > 0)));
  const longest = uniqueLines.reduce((max, line) => Math.max(max, line.length), 0);
  const totalChars = uniqueLines.reduce((sum, line) => sum + line.length, 0);
  if (longest > 45 || totalChars > 95 || uniqueLines.length > 3) {
    push(
      "dialogue_readability",
      longest > 65 || uniqueLines.length > 4 ? "critical" : "warning",
      "dense-mobile-dialogue",
      "모바일 세로 스크롤 기준 한 컷 대사가 깁니다",
      `최장 ${longest}자 · 총 ${totalChars}자(${uniqueLines.length}개 말풍선)입니다. 40자 안팎으로 나누면 가독성이 크게 좋아집니다.`,
      uniqueLines[0] ?? node.title,
      uniqueLines[0]
        ? [
            {
              label: "핵심 문장 36자로 압축",
              summary: "모바일 말풍선 2줄 분량으로 줄인 대사를 제안합니다.",
              patch: {
                dialogueLines: [uniqueLines[0].slice(0, 36).trim()],
                ...(node.cutSlots
                  ? { cutSlots: { ...node.cutSlots, keyDialogue: uniqueLines[0].slice(0, 36).trim() } }
                  : {}),
              },
            },
          ]
        : [],
    );
  }

  // 5. 권리·Rights BOM
  for (const asset of node.rightsAssets ?? []) {
    if (asset.license === "reference-only") {
      push(
        "rights_bom",
        "critical",
        `rights-ref-only-${asset.id}`,
        `참고 전용 소재(${asset.name})가 상업 출고 컷에 연결되었습니다`,
        "참고 전용 자료는 직접 포함할 수 없습니다. 상업 라이선스가 확인된 소재로 교체해 주세요.",
        `소재: ${asset.name} (${asset.sourceRef ?? "출처 미기재"})`,
      );
    } else if (asset.license === "unverified" || asset.license === "attribution-required") {
      push(
        "rights_bom",
        "warning",
        `rights-check-${asset.id}`,
        asset.license === "unverified"
          ? `라이선스 미확인 소재(${asset.name}) 점검이 필요합니다`
          : `출처 표기 필수 소재(${asset.name})가 포함되어 있습니다`,
        asset.license === "unverified"
          ? "출고 전 Rights BOM에서 상업 사용 허가 여부를 확정해 주세요."
          : "회차 말미 또는 크레딧 표기에 필수 출처 문구를 등록해 주세요.",
        `소재: ${asset.name}`,
      );
    }
  }

  // 6. 심의·등급
  const cues = node.sensitiveCues ?? [];
  if (cues.length > 0 && state.targetRating !== "19+") {
    const severeCue = cues.find((cue) => cue === "sexual-explicit" || cue === "self-harm");
    const requiresUpgrade =
      severeCue !== undefined ||
      (state.targetRating === "all" && (cues.includes("violence-graphic") || cues.includes("profanity-strong")));
    if (requiresUpgrade) {
      push(
        "content_rating",
        severeCue ? "critical" : "warning",
        `rating-mismatch-${cues.join("-")}`,
        `목표 등급(${state.targetRating}) 기준을 넘는 민감 연출 요소가 있습니다`,
        "플랫폼 심의 반려를 피하려면 표현 수위를 낮추거나 작품 목표 연령 등급을 조정해 주세요.",
        `감지 요소: ${cues.join(", ")}`,
      );
    }
  }

  return findings;
}

/**
 * 웹툰 6관점 증분 자동 검수.
 * 노드 해시가 이전 검수와 동일하면 기존 해결(resolved)·보류(deferred) 판정을 유지하고,
 * 변경된 노드와 인접 영향 노드만 다시 평가한다.
 */
export function runIncrementalSixPerspectiveReview(
  state: StoryLivingSpecState,
  now = "2026-11-20T00:00:00.000Z",
): StoryLivingSpecState {
  const knownCharacterNames = new Set(
    state.nodes.filter((node) => node.id.prefix === "CHAR").map((node) => node.title.trim()),
  );
  const knownLocationNames = new Set(
    state.nodes.filter((node) => node.id.prefix === "LOC").map((node) => node.title.trim()),
  );

  // 설정(CHAR/LOC) 변경 시 참조하는 CUT은 일관성 재검수 대상에 포함
  const changedKeys = new Set<string>();
  for (const node of state.nodes) {
    if (state.reviewNodeHashes[node.key] !== node.contentHash) {
      changedKeys.add(node.key);
    }
  }
  const loreChanged = state.nodes.some(
    (node) => (node.id.prefix === "CHAR" || node.id.prefix === "LOC") && changedKeys.has(node.key),
  );
  const orderedCuts = state.nodes
    .filter((node) => node.id.prefix === "CUT")
    .sort((a, b) => a.order - b.order);
  const cutNeighborsByKey = new Map<string, { prevCamera?: string; prev2Camera?: string }>();
  for (let i = 0; i < orderedCuts.length; i += 1) {
    const cut = orderedCuts[i];
    if (!cut) continue;
    const prev = orderedCuts[i - 1];
    const prev2 = orderedCuts[i - 2];
    cutNeighborsByKey.set(cut.key, {
      prevCamera: prev?.cutSlots?.cameraAngleLens?.trim(),
      prev2Camera: prev2?.cutSlots?.cameraAngleLens?.trim(),
    });
    if ((prev && changedKeys.has(prev.key)) || (prev2 && changedKeys.has(prev2.key))) {
      changedKeys.add(cut.key);
    }
  }

  const existingByNode = new Map<string, StoryReviewFinding[]>();
  for (const finding of state.reviewFindings) {
    const bucket = existingByNode.get(finding.targetNodeKey) ?? [];
    bucket.push(finding);
    existingByNode.set(finding.targetNodeKey, bucket);
  }

  const preservedNodeKeys: string[] = [];
  const reevaluatedNodeKeys: string[] = [];
  const nextFindings: StoryReviewFinding[] = [];
  const nextNodeHashes: Record<string, string> = {};

  for (const node of state.nodes) {
    nextNodeHashes[node.key] = node.contentHash;
    const mustReevaluate =
      changedKeys.has(node.key) || (loreChanged && node.id.prefix === "CUT");
    if (!mustReevaluate) {
      preservedNodeKeys.push(node.key);
      const preserved = existingByNode.get(node.key) ?? [];
      for (const finding of preserved) {
        nextFindings.push(finding.isStale ? { ...finding, isStale: false } : finding);
      }
      continue;
    }
    reevaluatedNodeKeys.push(node.key);
    const computed = evaluateNodeFindings(
      node,
      state,
      cutNeighborsByKey.get(node.key) ?? {},
      knownCharacterNames,
      knownLocationNames,
    );
    nextFindings.push(...computed);
  }

  const openCount = nextFindings.filter((item) => item.status === "open").length;
  const resolvedCount = nextFindings.filter((item) => item.status === "resolved").length;
  const deferredCount = nextFindings.filter((item) => item.status === "deferred").length;

  return {
    ...state,
    reviewFindings: nextFindings,
    reviewNodeHashes: nextNodeHashes,
    lastReviewReport: {
      evaluatedAt: now,
      preservedNodeKeys,
      reevaluatedNodeKeys,
      openCount,
      resolvedCount,
      deferredCount,
    },
    sequence: state.sequence + 1,
  };
}

export function triageReviewFinding(
  state: StoryLivingSpecState,
  findingId: string,
  status: ReviewFindingStatus,
  now = "2026-11-20T00:00:00.000Z",
): StoryLivingSpecState {
  const target = state.reviewFindings.find((item) => item.id === findingId);
  if (!target || target.status === status) return state;
  const statusLabel = status === "resolved" ? "해결" : status === "deferred" ? "보류" : "재오픈";
  return {
    ...state,
    reviewFindings: state.reviewFindings.map((item) =>
      item.id === findingId ? { ...item, status } : item,
    ),
    sequence: state.sequence + 1,
    workLog: appendStoryWorkLog(state, {
      at: now,
      actor: "review_engine",
      action: "review_triaged",
      targetEntityId: target.targetNodeKey,
      summary: `검수 항목(${target.title}) 상태를 ${statusLabel}로 바꿨습니다.`,
    }),
  };
}

export function proposeReviewQuickFix(
  state: StoryLivingSpecState,
  findingId: string,
  optionIndex: number,
  now = "2026-11-20T00:00:00.000Z",
): StoryLivingSpecState {
  const finding = state.reviewFindings.find((item) => item.id === findingId);
  const option = finding?.quickFixOptions[optionIndex];
  if (!finding || !option) return state;
  return enqueuePendingAiProposal(state, {
    targetEntityId: finding.targetNodeKey,
    op: "update",
    source: "review_fix",
    title: `${STORY_REVIEW_PERSPECTIVE_LABELS_KO[finding.perspective]} 보완: ${option.label}`,
    rationale: option.summary,
    proposedSnapshot: option.patch,
    evidenceCitations: [{ sourceDocId: `review:${finding.perspective}`, quote: finding.quote }],
    createdAt: now,
  });
}
