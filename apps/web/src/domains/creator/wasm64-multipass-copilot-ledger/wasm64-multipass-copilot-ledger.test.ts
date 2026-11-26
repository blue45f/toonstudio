import { describe, expect, it } from "vitest";
import {
  buildEventMerkleTree,
  canonicalizeLedgerJson,
  computeResourceByteSize,
  cosineSimilarity256,
  createChromeBuiltinAiAdapter,
  createWebtoonMultiPassPipeline,
  embedCreativeText256,
  generateLedgerKeyPair,
  GENESIS_PREV_HASH,
  ImmutableProvenanceLedger,
  OnDeviceCreativeCopilot,
  RenderGraphCycleError,
  sha256HexText,
  tokenizeCreativeText,
  verifyEventInclusionProof,
  verifyLedgerChain,
  WebGpuMultiPassRenderGraph,
  WORKFLOW_STAGE_ORDER,
  type CharacterMemorySheet,
  type ColoringRuleMemory,
  type EpisodeCutMemory,
  type LocalOnDeviceLlmAdapter,
  type ProvenanceAuditEvent,
  type SignedLedgerBlock,
} from "./index";

/* -------------------------------------------------------------------------- */
/* 1. WebGPU Multi-Pass Render Graph & Transient Texture Aliasing Allocator   */
/* -------------------------------------------------------------------------- */

describe("WebGpuMultiPassRenderGraph", () => {
  it("표준 웹툰 5단계 멀티패스 DAG를 위상 정렬하고 일시 VRAM을 50% 이상 절감한다", () => {
    const graph = createWebtoonMultiPassPipeline({
      width: 2048,
      height: 2048,
      includeUnusedDebugPass: true,
    });

    const compiled = graph.compile();

    // 미사용 디버그 패스 및 고아 텍스처가 Dead-Pass Culling으로 제거되어야 한다.
    expect(compiled.culledPasses).toHaveLength(1);
    expect(compiled.culledPasses[0].passId).toBe("pass-debug-wireframe");
    expect(compiled.culledPasses[0].reason).toBe("unread-output");
    expect(compiled.culledResourceIds).toContain("debug-wireframe-orphan");
    expect(compiled.executionOrder).not.toContain("pass-debug-wireframe");

    // 위상 정렬 불변식: 모든 생산자 패스가 소비자 패스보다 앞서 실행되어야 한다.
    const indexOf = (passId: string): number => compiled.executionOrder.indexOf(passId);
    expect(indexOf("pass-gbuffer")).toBe(0);
    expect(indexOf("pass-shadow-depth")).toBeLessThan(indexOf("pass-shadow-filter"));
    expect(indexOf("pass-shadow-filter")).toBeLessThan(indexOf("pass-gi-radiance"));
    expect(indexOf("pass-gi-radiance")).toBeLessThan(indexOf("pass-cel-lighting"));
    expect(indexOf("pass-cel-lighting")).toBeLessThan(indexOf("pass-cel-ink-merge"));
    expect(indexOf("pass-outline-ink")).toBeLessThan(indexOf("pass-cel-ink-merge"));
    expect(indexOf("pass-cel-ink-merge")).toBeLessThan(indexOf("pass-bloom-extract"));
    expect(indexOf("pass-bloom-extract")).toBeLessThan(indexOf("pass-bloom-blur-h"));
    expect(indexOf("pass-bloom-blur-h")).toBeLessThan(indexOf("pass-bloom-blur-v"));
    expect(indexOf("pass-bloom-blur-v")).toBeLessThan(indexOf("pass-final-composite"));
    expect(indexOf("pass-screentone-fx")).toBeLessThan(indexOf("pass-final-composite"));
    expect(indexOf("pass-final-composite")).toBe(compiled.executionOrder.length - 1);

    // 일시 VRAM 에일리어싱으로 50% 이상 피크 메모리 절감 증명
    const plan = compiled.memoryPlan;
    expect(plan.logicalTransientCount).toBe(13);
    expect(plan.physicalSlotCount).toBeLessThan(plan.logicalTransientCount);
    expect(plan.reuseCount).toBeGreaterThanOrEqual(6);
    expect(plan.reductionPercent).toBeGreaterThanOrEqual(50);
    expect(plan.aliasedPeakBytes).toBeLessThan(plan.unaliasedPeakBytes * 0.5);

    // 같은 물리 슬롯을 공유하는 리소스들은 생존 구간이 단 1패스도 겹치지 않아야 한다.
    for (let s = 0; s < plan.slots.length; s += 1) {
      const assigned = plan.slots[s].assignedResources;
      for (let i = 1; i < assigned.length; i += 1) {
        expect(assigned[i - 1].lastPassIndex).toBeLessThan(assigned[i].firstPassIndex);
      }
    }

    // RAW 논리 배리어와 물리 슬롯 재사용 에일리어스 배리어가 모두 삽입되어야 한다.
    const rawBarriers = compiled.barriers.filter(
      (b) => !b.isAliasBarrier && b.kind === "read-after-write",
    );
    const aliasBarriers = compiled.barriers.filter((b) => b.isAliasBarrier);
    expect(rawBarriers.length).toBeGreaterThanOrEqual(15);
    expect(aliasBarriers.length).toBe(plan.reuseCount);
  });

  it("순환 의존(A -> B -> C -> A)을 탐지해 RenderGraphCycleError를 던진다", () => {
    const graph = new WebGpuMultiPassRenderGraph();
    graph
      .addResource({ id: "r-a", label: "A", kind: "texture-2d", lifetime: "transient", width: 512, height: 512, format: "rgba8unorm" })
      .addResource({ id: "r-b", label: "B", kind: "texture-2d", lifetime: "transient", width: 512, height: 512, format: "rgba8unorm" })
      .addResource({ id: "r-c", label: "C", kind: "texture-2d", lifetime: "transient", width: 512, height: 512, format: "rgba8unorm" })
      .addResource({ id: "out", label: "Out", kind: "texture-2d", lifetime: "swapchain-output", width: 512, height: 512, format: "rgba8unorm" })
      .addPass({
        id: "pass-a",
        label: "A",
        stage: "gbuffer",
        inputs: [{ resourceId: "r-c", access: "read", usage: "sampled-texture" }],
        outputs: [{ resourceId: "r-a", access: "write", usage: "color-attachment" }],
      })
      .addPass({
        id: "pass-b",
        label: "B",
        stage: "cel-outline",
        inputs: [{ resourceId: "r-a", access: "read", usage: "sampled-texture" }],
        outputs: [{ resourceId: "r-b", access: "write", usage: "color-attachment" }],
      })
      .addPass({
        id: "pass-c",
        label: "C",
        stage: "composite",
        inputs: [{ resourceId: "r-b", access: "read", usage: "sampled-texture" }],
        outputs: [
          { resourceId: "r-c", access: "write", usage: "color-attachment" },
          { resourceId: "out", access: "write", usage: "color-attachment" },
        ],
      });

    let caught: unknown;
    try {
      graph.compile();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RenderGraphCycleError);
    const cycleErr = caught as RenderGraphCycleError;
    expect(cycleErr.cyclePath.length).toBeGreaterThanOrEqual(4);
    expect(cycleErr.cyclePath[0]).toBe(cycleErr.cyclePath[cycleErr.cyclePath.length - 1]);
  });

  it("다중 쓰기 자원에서 RAW/WAR 배리어를 생성하고 실행 콜백을 위상 순으로 호출한다", () => {
    const graph = new WebGpuMultiPassRenderGraph();
    const trace: string[] = [];

    graph
      .addResource({ id: "shared-buf", label: "공유 누적 버퍼", kind: "storage-buffer", lifetime: "transient", byteSize: 4096 })
      .addResource({ id: "final-tex", label: "출력", kind: "texture-2d", lifetime: "swapchain-output", width: 256, height: 256, format: "rgba8unorm" })
      .addPass({
        id: "p1-init",
        label: "초기화",
        stage: "gbuffer",
        inputs: [],
        outputs: [{ resourceId: "shared-buf", access: "write", usage: "storage-write" }],
        execute: (ctx) => trace.push(`${ctx.executionIndex}:${ctx.passId}`),
      })
      .addPass({
        id: "p2-read",
        label: "참조",
        stage: "gi-shadow",
        inputs: [{ resourceId: "shared-buf", access: "read", usage: "storage-read" }],
        outputs: [],
        afterPassIds: ["p1-init"],
        execute: (ctx) => trace.push(`${ctx.executionIndex}:${ctx.passId}`),
      })
      .addPass({
        id: "p3-overwrite",
        label: "덮어쓰기",
        stage: "composite",
        inputs: [],
        outputs: [
          { resourceId: "shared-buf", access: "write", usage: "storage-write" },
          { resourceId: "final-tex", access: "write", usage: "color-attachment" },
        ],
        execute: (ctx) => trace.push(`${ctx.executionIndex}:${ctx.passId}`),
      });

    const compiled = graph.compile();
    const report = graph.executeCompiledGraph(compiled);

    expect(trace).toEqual(["0:p1-init", "1:p2-read", "2:p3-overwrite"]);
    expect(report.executedPasses).toHaveLength(3);
    expect(
      compiled.barriers.some(
        (b) => b.kind === "read-after-write" && b.fromPassId === "p1-init" && b.toPassId === "p2-read",
      ),
    ).toBe(true);
    expect(
      compiled.barriers.some(
        (b) => b.kind === "write-after-read" && b.fromPassId === "p2-read" && b.toPassId === "p3-overwrite",
      ),
    ).toBe(true);
    expect(computeResourceByteSize({ id: "t", label: "t", kind: "texture-2d", lifetime: "transient", width: 300, height: 100, format: "rgba8unorm" })).toBe(1280 * 100);
  });

  it("8K+(8192x16384) 세로 웹툰 캔버스에서 가상 타일 VRAM 예산을 강제한다", () => {
    const graph = createWebtoonMultiPassPipeline({ width: 2048, height: 2048 });
    const compiled = graph.compile();
    const maxBudgetBytes = 256 * 1024 * 1024; // 256 MiB

    const tilePlan = graph.enforceVirtualTileBudget(compiled, {
      canvasWidthPx: 8192,
      canvasHeightPx: 16384,
      tileSizePx: 1024,
      maxTransientVramBytes: maxBudgetBytes,
    });

    expect(tilePlan.requiresVirtualTiling).toBe(true);
    expect(tilePlan.tilesX).toBe(8);
    expect(tilePlan.tilesY).toBe(16);
    expect(tilePlan.totalTiles).toBe(128);
    expect(tilePlan.withinBudget).toBe(true);
    expect(tilePlan.peakBatchVramBytes).toBeLessThanOrEqual(maxBudgetBytes);
    expect(tilePlan.fullFrameUnaliasedBytes).toBeGreaterThan(maxBudgetBytes * 10);
    expect(tilePlan.effectiveReductionPercent).toBeGreaterThan(95);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Always-On Local On-Device Creative Copilot with Incremental Memory      */
/* -------------------------------------------------------------------------- */

function buildSampleCreatorArchive(): {
  readonly cuts: readonly EpisodeCutMemory[];
  readonly characters: readonly CharacterMemorySheet[];
  readonly colorRules: readonly ColoringRuleMemory[];
} {
  const characters: CharacterMemorySheet[] = [
    {
      characterId: "char-seojin",
      name: "서진",
      traits: ["관찰력 예리함", "왼손잡이", "비 오는 날 두통"],
      speechStyle: "건조한 반말·단문, 감정 숨김",
      signaturePaletteTokens: ["oklch(0.32 0.04 245)", "oklch(0.86 0.03 85)"],
      lineWeightRule: "외곽선 2.4px, 눈동자 하이라이트 0.9px 고정",
      firstSeenEpisode: 1,
    },
    {
      characterId: "char-harin",
      name: "하린",
      traits: ["기자 출신", "빠른 판단", "필름 카메라 휴대"],
      speechStyle: "또렷한 존댓말·질문형 리듬",
      signaturePaletteTokens: ["oklch(0.54 0.12 35)", "oklch(0.92 0.02 75)"],
      lineWeightRule: "머리카락 끝선 가늘게 테이퍼 1.1px",
      firstSeenEpisode: 2,
    },
  ];

  const colorRules: ColoringRuleMemory[] = [
    {
      ruleId: "rule-rain-alley-backlight",
      title: "비 오는 골목 역광 야경",
      stage: "lighting",
      mood: "긴장·야간 역광 림라이트",
      paletteTokens: ["oklch(0.24 0.05 250)", "oklch(0.74 0.14 68)", "oklch(0.42 0.06 230)"],
      guidance: "배경 채도를 낮추고 가로등 역광 림라이트만 인물 어깨와 우산 테두리에 얇게 얹는다.",
      sourceEpisodeNumber: 4,
    },
    {
      ruleId: "rule-dawn-flatting",
      title: "새벽 지하철 밑색 분리",
      stage: "flatting",
      mood: "차가운 새벽 정적",
      paletteTokens: ["oklch(0.82 0.03 220)", "oklch(0.36 0.04 240)"],
      guidance: "인물 코트와 전철 유리 반사의 명도 차를 25% 이상 벌려 실루엣이 뭉개지지 않게 한다.",
      sourceEpisodeNumber: 6,
    },
  ];

  const cuts: EpisodeCutMemory[] = [
    {
      memoryId: "ep4-cut12",
      episodeNumber: 4,
      episodeTitle: "젖은 골목의 목격자",
      cutNumber: 12,
      stage: "lighting",
      summary: "가로등 역광 아래 서진이 우산을 내리며 하린과 처음 대치하는 클로즈업",
      characters: ["서진", "하린"],
      dialogueSample: "그 필름, 여기서 넘기지 마.",
      dialogueTone: "건조한 단문·낮은 긴장",
      pacingBeats: 4,
      panelHeightPx: 1850,
      lightingMood: "가로등 주황 역광 + 젖은 아스팔트 푸른 반사광",
      paletteTokens: ["oklch(0.24 0.05 250)", "oklch(0.74 0.14 68)"],
      lineWeightNote: "전경 우산 테두리 2.8px, 배경 골목 건물 0.8px로 거리감 분리",
      tags: ["역광", "대치", "비", "우산", "클라이맥스"],
      recordedAtIso: "2026-10-12T10:00:00Z",
    },
    {
      memoryId: "ep7-cut03",
      episodeNumber: 7,
      episodeTitle: "막차와 빈 좌석",
      cutNumber: 3,
      stage: "storyboard",
      summary: "지하철 창밖 불빛이 길게 흐르며 침묵 속 3박 세로 여백으로 클리프행어 진입",
      characters: ["서진"],
      dialogueSample: "이미 늦었어.",
      dialogueTone: "짧은 독백·정적",
      pacingBeats: 3,
      panelHeightPx: 2200,
      lightingMood: "형광등 상단광 + 창문 잔상",
      lineWeightNote: "인물 실루엣 2.2px, 창밖 배경 모션블러 처리",
      tags: ["스크롤 호흡", "침묵", "클리프행어", "콘티"],
      recordedAtIso: "2026-10-28T10:00:00Z",
    },
    {
      memoryId: "ep9-cut18",
      episodeNumber: 9,
      episodeTitle: "인화실의 비밀",
      cutNumber: 18,
      stage: "lettering",
      summary: "암실 붉은 조명 아래 하린이 사진 뒷면 메모를 읽어주는 긴박한 대화",
      characters: ["하린", "서진"],
      dialogueSample: "선배, 이 날짜가 왜 4화 밤이랑 겹치죠?",
      dialogueTone: "또렷한 존댓말·빠른 추궁",
      pacingBeats: 5,
      panelHeightPx: 1500,
      lightingMood: "암실 적색 단광",
      tags: ["대사", "말풍선", "추궁", "식자"],
      recordedAtIso: "2026-11-10T10:00:00Z",
    },
  ];

  return { cuts, characters, colorRules };
}

describe("OnDeviceCreativeCopilot", () => {
  it("작가 이전 회차를 증분 인덱싱하고 6개 작업 단계별 출처 인용 한국어 제안을 0클라우드 토큰으로 반환한다", async () => {
    const archive = buildSampleCreatorArchive();
    const copilot = new OnDeviceCreativeCopilot();

    const stats = copilot.indexEpisode({
      episodeNumber: 4,
      episodeTitle: "젖은 골목의 목격자",
      cuts: [archive.cuts[0]],
      characters: archive.characters,
      colorRules: [archive.colorRules[0]],
    });
    expect(stats.cutCount).toBe(1);
    expect(stats.characterCount).toBe(2);
    expect(stats.colorRuleCount).toBe(1);

    // 이후 회차 7화·9화 증분 추가
    copilot.indexCutMemory(archive.cuts[1]);
    copilot.indexCutMemory(archive.cuts[2]);
    copilot.upsertColorRule(archive.colorRules[1]);

    const updatedStats = copilot.getMemoryStats();
    expect(updatedStats.episodeCount).toBe(3);
    expect(updatedStats.cutCount).toBe(3);
    expect(updatedStats.totalIndexedDocs).toBe(7);

    // 광원 단계 질의: 4화 12컷 역광 선례 + 서진 캐릭터 + 배색 규칙 인용 검증
    const lightingAdvice = await copilot.advise({
      stage: "lighting",
      query: "비 오는 밤 골목에서 서진이 우산 쓰고 역광으로 마주 서는 컷",
      activeCharacters: ["서진"],
      currentPaletteTokens: ["oklch(0.65 0.22 140)"],
      locale: "ko",
    });

    expect(lightingAdvice.cloudTokensUsed).toBe(0);
    expect(lightingAdvice.estimatedServerCostKrw).toBe(0);
    expect(lightingAdvice.provider).toBe("local-hybrid-rag");
    expect(lightingAdvice.nextStage).toBe("lettering");
    expect(lightingAdvice.retrievalLatencyMs).toBeLessThan(50);
    expect(lightingAdvice.retrievedCitations.length).toBeGreaterThanOrEqual(3);
    expect(lightingAdvice.retrievedCitations[0].episodeNumber).toBe(4);
    expect(lightingAdvice.suggestions.some((s) => s.headline.includes("4화 12컷"))).toBe(true);
    expect(lightingAdvice.suggestions.some((s) => s.actionableNote.includes("건조한 반말"))).toBe(true);
    expect(lightingAdvice.suggestions.some((s) => s.category === "palette")).toBe(true);

    // 모든 6개 단계(storyboard -> publish)에서 정상 동작 검증
    for (let i = 0; i < WORKFLOW_STAGE_ORDER.length; i += 1) {
      const stage = WORKFLOW_STAGE_ORDER[i];
      const res = await copilot.advise({
        stage,
        query: "서진 하린 지하철 대치 컷 호흡과 대사 점검",
        activeCharacters: ["서진", "하린"],
        currentPacingBeats: 7,
      });
      expect(res.stage).toBe(stage);
      expect(res.suggestions.length).toBeGreaterThanOrEqual(2);
      expect(res.cloudTokensUsed).toBe(0);
      expect(res.estimatedServerCostKrw).toBe(0);
    }

    // 스냅샷 내보내기/복원 및 특정 회차 증분 삭제 검증
    const snapshot = copilot.exportSnapshot();
    const restored = new OnDeviceCreativeCopilot();
    restored.importSnapshot(snapshot);
    expect(restored.getMemoryStats().totalIndexedDocs).toBe(7);

    const removedCount = restored.removeEpisode(4);
    expect(removedCount).toBe(2); // 4화 컷 1개 + 4화 배색 규칙 1개
    expect(restored.getMemoryStats().cutCount).toBe(2);
    expect(restored.getMemoryStats().colorRuleCount).toBe(1);
  });

  it("하이브리드 토크나이저·256차원 임베딩과 선택적 Chrome Built-in AI 로컬 훅 및 폴백을 검증한다", async () => {
    const tokens = tokenizeCreativeText("역광에서 서진의 외곽선 강약 lighting");
    expect(tokens).toContain("역광");
    expect(tokens).toContain("lighting");

    const v1 = embedCreativeText256("비 오는 골목 역광 림라이트 조명");
    const v2 = embedCreativeText256("야경 역광에서 림라이트 광원 대비");
    const v3 = embedCreativeText256("모바일 말풍선 폰트 식자 가독성");
    expect(cosineSimilarity256(v1, v2)).toBeGreaterThan(cosineSimilarity256(v1, v3));

    const archive = buildSampleCreatorArchive();
    const mockWindowAi = {
      ai: {
        languageModel: {
          capabilities: async () => ({ available: "readily" }),
          create: async () => ({
            prompt: async (promptText: string) =>
              `로컬 보강 메모: ${promptText.includes("4화 12컷") ? "4화 12컷 역광 각도를 15도 높여 우산 그림자를 정리하세요." : "기존 톤을 유지하세요."}`,
            destroy: () => undefined,
          }),
        },
      },
    };

    const copilotWithChromeAi = new OnDeviceCreativeCopilot({
      localLlmAdapter: createChromeBuiltinAiAdapter(mockWindowAi),
    });
    copilotWithChromeAi.indexCutMemory(archive.cuts[0]);

    const res = await copilotWithChromeAi.advise({
      stage: "lighting",
      query: "역광 우산 컷 조명",
      locale: "ko",
    });
    expect(res.provider).toBe("chrome-builtin-ai");
    expect(res.llmRefinementNote).toContain("4화 12컷");
    expect(res.cloudTokensUsed).toBe(0);

    // 로컬 LLM이 오류를 던져도 결정론적 RAG 제안으로 안전하게 폴백
    const failingAdapter: LocalOnDeviceLlmAdapter = {
      providerName: "webllm-local",
      isAvailable: () => true,
      generateGroundedNote: async () => {
        throw new Error("WebGPU 컨텍스트 일시 손실");
      },
    };
    const fallbackCopilot = new OnDeviceCreativeCopilot({ localLlmAdapter: failingAdapter });
    fallbackCopilot.indexCutMemory(archive.cuts[0]);
    const fallbackRes = await fallbackCopilot.advise({
      stage: "lighting",
      query: "역광 조명",
      locale: "en",
    });
    expect(fallbackRes.provider).toBe("local-hybrid-rag");
    expect(fallbackRes.llmRefinementNote).toBeNull();
    expect(fallbackRes.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(fallbackRes.cloudTokensUsed).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Zero-Fee Append-Only Cryptographic Provenance & License Audit Ledger    */
/* -------------------------------------------------------------------------- */

function makeAuditEvent(
  eventId: string,
  eventKind: ProvenanceAuditEvent["eventKind"],
  overrides: Partial<ProvenanceAuditEvent> = {},
): ProvenanceAuditEvent {
  return {
    eventId,
    eventKind,
    workId: "work-seoul-rain",
    episodeId: "ep-10",
    actorId: "creator-hj",
    recordedAtIso: "2026-11-26T09:00:00Z",
    subjectId: `subj-${eventId}`,
    subjectLabel: `대상 ${eventId}`,
    contentSha256Hex: "a".repeat(64),
    ...overrides,
  };
}

describe("ImmutableProvenanceLedger", () => {
  it("다중 블록 원장 기록, 전체 체인 무결성 검증, 단일 이벤트 머클 포함 증명을 ₩0 수수료로 수행한다", async () => {
    const ledger = await ImmutableProvenanceLedger.create({
      ledgerId: "ledger-seoul-rain-ep10",
      workId: "work-seoul-rain",
      creatorId: "creator-hj",
      preferredAlgorithm: "ECDSA-P256",
      createdAtIso: "2026-11-26T08:00:00Z",
    });

    const genesis = ledger.getBlocks()[0];
    expect(genesis.header.blockIndex).toBe(0);
    expect(genesis.header.prevHash).toBe(GENESIS_PREV_HASH);
    expect(genesis.header.feeModel).toBe("zero-fee-local-hash-chain");

    const block1Events: ProvenanceAuditEvent[] = [
      makeAuditEvent("evt-layer-01", "layer-create", {
        subjectId: "layer-ink-main",
        subjectLabel: "인물 메인 선화 레이어",
        contentSha256Hex: await sha256HexText("stroke-vector-v1"),
      }),
      makeAuditEvent("evt-font-01", "font-license", {
        subjectId: "font-pretendard-std",
        subjectLabel: "Pretendard Regular",
        licenseCode: "OFL-1.1",
        commercialAllowed: true,
        contentSha256Hex: await sha256HexText("ofl-1.1-license-digest"),
      }),
      makeAuditEvent("evt-3d-01", "asset-3d-license", {
        subjectId: "asset-alley-glb",
        subjectLabel: "비 오는 골목 3D 배경",
        licenseCode: "COMMERCIAL-STUDIO-SEAT",
        commercialAllowed: true,
        contentSha256Hex: await sha256HexText("alley-glb-sha256"),
      }),
      makeAuditEvent("evt-ai-01", "ai-assist", {
        subjectId: "ai-flat-cleanup",
        subjectLabel: "밑색 경계 정리 보조",
        aiAssistDisclosure: {
          tool: "toonstudio-local-rag-assist",
          scope: "flat-color-guide",
          humanContributionRatio: 0.94,
        },
        contentSha256Hex: await sha256HexText("ai-step-01"),
      }),
      makeAuditEvent("evt-layer-02", "layer-edit", {
        subjectId: "layer-lighting-rim",
        subjectLabel: "역광 림라이트 레이어",
        contentSha256Hex: await sha256HexText("rim-light-pass-v2"),
      }),
    ];

    const block1 = await ledger.appendBlock(block1Events, {
      timestampIso: "2026-11-26T08:15:00Z",
    });
    expect(block1.header.blockIndex).toBe(1);
    expect(block1.header.prevHash).toBe(genesis.blockHash);
    expect(block1.leafHashes).toHaveLength(5);

    const block2Events: ProvenanceAuditEvent[] = [
      makeAuditEvent("evt-export-01", "export-checkpoint", {
        subjectId: "ep10-master-slice",
        subjectLabel: "10화 출고 마스터 슬라이스",
        contentSha256Hex: await sha256HexText("ep10-master-png-bundle"),
      }),
    ];
    const block2 = await ledger.appendBlock(block2Events, {
      timestampIso: "2026-11-26T08:30:00Z",
    });
    expect(block2.header.prevHash).toBe(block1.blockHash);

    // 전체 체인 무결성 통과
    const integrity = await ledger.verifyLedgerIntegrity();
    expect(integrity.valid).toBe(true);
    expect(integrity.totalBlocks).toBe(3);
    expect(integrity.totalEvents).toBe(6);
    expect(integrity.verifiedBlocks).toBe(3);
    expect(integrity.tamperedBlockIndices).toEqual([]);
    expect(integrity.networkFeeKrw).toBe(0);
    expect(integrity.gasUsed).toBe(0);

    // 홀수 개(5개) 이벤트 블록의 모든 이벤트에 대해 머클 포함 증명 생성·검증
    for (let i = 0; i < block1Events.length; i += 1) {
      const ev = block1Events[i];
      const proof = await ledger.generateEventInclusionProof(1, ev.eventId);
      const proofCheck = await verifyEventInclusionProof(ev, proof);
      expect(proofCheck.valid).toBe(true);
      expect(proofCheck.leafHashMatches).toBe(true);
      expect(proofCheck.merkleRootMatches).toBe(true);
      expect(proofCheck.blockHashMatches).toBe(true);
      expect(proofCheck.signatureValid).toBe(true);
    }

    // 1바이트 이벤트 변조 시 머클 포함 증명 즉시 실패
    const targetEvent = block1Events[2];
    const validProof = await ledger.generateEventInclusionProof(1, targetEvent.eventId);
    const mutatedEvent: ProvenanceAuditEvent = {
      ...targetEvent,
      licenseCode: "COMMERCIAL-STUDIO-SEAU", // 마지막 1바이트 T -> U 변조
    };
    const mutatedCheck = await verifyEventInclusionProof(mutatedEvent, validProof);
    expect(mutatedCheck.valid).toBe(false);
    expect(mutatedCheck.leafHashMatches).toBe(false);
    expect(mutatedCheck.merkleRootMatches).toBe(false);

    // 감사 번들 내보내기 요약 검증
    const bundle = ledger.exportAuditBundle("2026-11-26T09:00:00Z");
    expect(bundle.ledgerMode).toBe("zero-fee-local-cryptographic-hash-chain");
    expect(bundle.commercialExportClear).toBe(true);
    expect(bundle.nonCommercialAssetIds).toEqual([]);
    expect(bundle.aiAssistEventCount).toBe(1);
    expect(bundle.averageHumanContributionRatio).toBe(0.94);
    expect(bundle.networkFeeKrw).toBe(0);
    expect(bundle.gasUsed).toBe(0);
  });

  it("어느 블록·어느 필드의 단 1바이트 위변조도 정확한 블록 번호와 필드로 특정한다", async () => {
    const ledger = await ImmutableProvenanceLedger.create({
      ledgerId: "ledger-tamper-audit",
      workId: "work-tamper-test",
      creatorId: "creator-hj",
      preferredAlgorithm: "Ed25519",
    });

    await ledger.appendBlock([
      makeAuditEvent("evt-b1-1", "layer-create"),
      makeAuditEvent("evt-b1-2", "font-license", {
        subjectId: "font-restricted",
        licenseCode: "PERSONAL-ONLY",
        commercialAllowed: false,
      }),
    ]);
    await ledger.appendBlock([
      makeAuditEvent("evt-b2-1", "layer-edit"),
      makeAuditEvent("evt-b2-2", "asset-3d-license", { commercialAllowed: true }),
    ]);
    await ledger.appendBlock([makeAuditEvent("evt-b3-1", "export-checkpoint")]);

    // 비상업 라이선스 경고 탐지 확인
    const bundle = ledger.exportAuditBundle();
    expect(bundle.commercialExportClear).toBe(false);
    expect(bundle.nonCommercialAssetIds).toEqual(["font-restricted"]);

    const cloneBlocks = (): SignedLedgerBlock[] =>
      JSON.parse(JSON.stringify(ledger.getBlocks())) as SignedLedgerBlock[];

    // 공격 1: 블록 #2의 두 번째 이벤트 페이로드 1바이트 변조
    const attack1 = cloneBlocks();
    attack1[2] = {
      ...attack1[2],
      events: [
        attack1[2].events[0],
        { ...attack1[2].events[1], subjectLabel: "대상 evt-b2-3" },
      ],
    };
    const report1 = await verifyLedgerChain(attack1);
    expect(report1.valid).toBe(false);
    expect(report1.tamperedBlockIndices).toEqual([2]);
    expect(
      report1.findings.some(
        (f) => f.blockIndex === 2 && f.field === "eventPayload" && f.eventId === "evt-b2-2",
      ),
    ).toBe(true);
    expect(report1.findings.some((f) => f.blockIndex === 2 && f.field === "merkleRootHex")).toBe(
      true,
    );

    // 공격 2: 블록 #1의 서명 1문자 변조
    const attack2 = cloneBlocks();
    const origSig = attack2[1].signatureBase64Url;
    const flippedChar = origSig[0] === "A" ? "B" : "A";
    attack2[1] = {
      ...attack2[1],
      signatureBase64Url: `${flippedChar}${origSig.slice(1)}`,
    };
    const report2 = await verifyLedgerChain(attack2);
    expect(report2.valid).toBe(false);
    expect(report2.tamperedBlockIndices).toEqual([1]);
    expect(report2.findings.some((f) => f.blockIndex === 1 && f.field === "signature")).toBe(true);

    // 공격 3: 공격자가 블록 #1 이벤트를 변조하고 머클 루트·블록 해시까지 재계산(개인키 없이 위조 시도)
    const attack3 = cloneBlocks();
    const forgedEvents: ProvenanceAuditEvent[] = [
      attack3[1].events[0],
      { ...attack3[1].events[1], commercialAllowed: true }, // 비상업을 상업 허용으로 위조
    ];
    const forgedTree = await buildEventMerkleTree(forgedEvents);
    const forgedHeader = {
      ...attack3[1].header,
      merkleRootHex: forgedTree.merkleRootHex,
    };
    const forgedBlockHash = await sha256HexText(
      `toonstudio:ledger:block:v1:${canonicalizeLedgerJson(forgedHeader)}`,
    );
    attack3[1] = {
      ...attack3[1],
      header: forgedHeader,
      events: forgedEvents,
      leafHashes: forgedTree.leafHashes,
      blockHash: forgedBlockHash,
    };
    const report3 = await verifyLedgerChain(attack3);
    expect(report3.valid).toBe(false);
    // 블록 #1은 개인키 서명 불일치로 적발, 블록 #2는 prevHash 연쇄 단절로 적발!
    expect(report3.tamperedBlockIndices).toEqual([1, 2]);
    expect(report3.findings.some((f) => f.blockIndex === 1 && f.field === "signature")).toBe(true);
    expect(report3.findings.some((f) => f.blockIndex === 2 && f.field === "prevHash")).toBe(true);

    // 키 페어 생성 및 정규 JSON 결정론 검증
    const kp = await generateLedgerKeyPair("ECDSA-P256");
    expect(kp.algorithm).toBe("ECDSA-P256");
    expect(canonicalizeLedgerJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });
});
