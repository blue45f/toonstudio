// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_COMFYUI_HTTP_URL,
  buildComfyUiControlNetWorkflow,
  createCharacterDnaLock,
  deriveDeterministicCharacterSeed,
  executeComfyUiBridgeJob,
  getSampleWebNovelScript,
  isLoopbackEndpoint,
  maskApiKey,
  match3dBackgroundSet,
  parseWebNovelTo3dBlockingSheet,
  validateByokConfig,
  type ComfyUiWebSocketLike,
} from "../comfyui-manyfast-bridge";
import {
  SUPPORTED_LOCALIZATION_LANGS,
  buildPdfX1aPrintPackage,
  composeJapaneseTategaki,
  convertRgbToCmykWithTac,
  createSampleGlossaryEntries,
  createSampleLocalizationPanels,
  detectAndClassifyBalloonRegions,
  fitTextIntoBalloon,
  generateCleanupInpaintMasks,
  generateCropMarkGeometry,
  mapSfxToVectorPreset,
  runMantraLetrLocalizationPipeline,
  translateWithLockedGlossary,
} from "../mantra-letr-localization-engine";
import {
  SYNC_STUDIO_SURFACES,
  addReviewCommentPin,
  computeAvatarDistance,
  computeRetryBackoffMs,
  createInitialProximityReviewTable,
  createInitialScreenShareSignalState,
  createMemorySnapshotStore,
  createOfflineFirstSyncBridge,
  evaluateProximityChannels,
  moveProximityParticipant,
  resolveSyncConflict,
  toggleReviewCommentPinResolved,
  transitionScreenShareState,
  updateSharedCutPointer,
} from "../studio-offline-first-sync-bridge";
import { StudioLocalizationAiSyncPanel } from "../StudioLocalizationAiSyncPanel";
import { StudioLocalizationPanel } from "../../studio-shell/StudioLocalizationPanel";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// T-035: 로컬 ComfyUI WebSocket(127.0.0.1:8188) + BYOK 브리지
// ---------------------------------------------------------------------------
describe("T-035 · 로컬 ComfyUI WebSocket + BYOK 브리지", () => {
  it("1. 루프백 주소만 로컬 ComfyUI 엔드포인트로 허용한다", () => {
    expect(isLoopbackEndpoint("http://127.0.0.1:8188")).toBe(true);
    expect(isLoopbackEndpoint("ws://localhost:8188/ws")).toBe(true);
    expect(isLoopbackEndpoint("https://api.paid-cloud.example.com")).toBe(false);
    expect(isLoopbackEndpoint("not-a-url")).toBe(false);
  });

  it("2. BYOK API 키를 마스킹하고 외부 유료 자동 호출 옵션을 차단한다", () => {
    expect(maskApiKey("sk-secret-9876543210")).toBe("sk-***10");
    expect(maskApiKey("short")).toBe("***");
    expect(maskApiKey("")).toBeNull();

    const unsafe = validateByokConfig({
      provider: "byok-openai-compatible",
      endpointUrl: "https://api.example.com",
      apiKey: "sk-12345678",
      autoPaidCallsAllowed: true,
      requireExplicitUserTrigger: false,
    });
    expect(unsafe.valid).toBe(false);
    expect(unsafe.blockedPaidAutoCall).toBe(true);
    expect(unsafe.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("3. 캐릭터 DNA 시드 잠금은 동일 특성에서 결정론적 시드를 생성한다", () => {
    const dna1 = createCharacterDnaLock({ name: "서연", appearanceTokens: ["흑발", "교복"] });
    const dna2 = createCharacterDnaLock({ name: "서연", appearanceTokens: ["흑발", "교복"] });
    const dnaOther = createCharacterDnaLock({ name: "현우", appearanceTokens: ["은발", "코트"] });
    expect(dna1.seed).toBe(dna2.seed);
    expect(dna1.seed).not.toBe(dnaOther.seed);
    expect(deriveDeterministicCharacterSeed("서연")).toBeGreaterThan(0);
  });

  it("4. ControlNet(Lineart/OpenPose) + IPAdapter 워크플로 그래프를 생성한다", () => {
    const dna = createCharacterDnaLock({ name: "서연", appearanceTokens: ["ponytail"] });
    const graph = buildComfyUiControlNetWorkflow({
      positivePrompt: "학교 옥상 노을 배경",
      controlNetMode: "openpose",
      characterDna: dna,
    });
    expect(graph.seed).toBe(dna.seed);
    expect(graph.usesCharacterDna).toBe(true);
    expect(graph.nodeCount).toBe(13);
    expect(graph.prompt["4"]?.class_type).toBe("ControlNetLoader");
    expect(graph.prompt["13"]?.class_type).toBe("IPAdapterApply");
    expect(graph.prompt["8"]?.inputs.seed).toBe(dna.seed);
  });

  it("5. 로컬 ComfyUI 미연결 시 Dry-Run 폴백하고 외부 유료 자동 호출은 0건을 보장한다", async () => {
    const offlineResult = await executeComfyUiBridgeJob(
      { positivePrompt: "옥상 컷", controlNetMode: "lineart" },
      {
        httpUrl: DEFAULT_COMFYUI_HTTP_URL,
        fetchImpl: async () => {
          throw new Error("ECONNREFUSED");
        },
      },
    );
    expect(offlineResult.ok).toBe(true);
    expect(offlineResult.mode).toBe("dry-run-fallback");
    expect(offlineResult.fallbackUsed).toBe(true);
    expect(offlineResult.externalPaidAutoCallsCount).toBe(0);
    expect(offlineResult.estimatedCostKrw).toBe(0);

    const paidBlocked = await executeComfyUiBridgeJob(
      { positivePrompt: "유료 차단 확인", controlNetMode: "depth" },
      {
        byokConfig: {
          provider: "byok-gemini",
          endpointUrl: "https://generativelanguage.googleapis.com",
          apiKey: "gm-test-key-0001",
          autoPaidCallsAllowed: true,
          requireExplicitUserTrigger: true,
        },
      },
    );
    expect(paidBlocked.mode).toBe("blocked-paid-guard");
    expect(paidBlocked.externalPaidAutoCallsCount).toBe(0);
  });

  it("6. 로컬 ComfyUI가 응답하면 루프백 WebSocket 진행률을 스트리밍하고 완료 산출물을 반환한다", async () => {
    const progressStages: string[] = [];
    const result = await executeComfyUiBridgeJob(
      { positivePrompt: "선화 클린업 테스트", controlNetMode: "lineart" },
      {
        httpUrl: DEFAULT_COMFYUI_HTTP_URL,
        fetchImpl: async (url) => {
          if (url.endsWith("/system_stats")) return { ok: true, status: 200, json: async () => ({ system: { os: "local" } }) };
          return { ok: true, status: 200, json: async () => ({ prompt_id: "local-prompt-77" }) };
        },
        webSocketFactory: () => {
          const socket: ComfyUiWebSocketLike = {
            onopen: null,
            onmessage: null,
            onerror: null,
            onclose: null,
            close: vi.fn(),
          };
          queueMicrotask(() => {
            socket.onmessage?.({ data: JSON.stringify({ type: "progress", data: { value: 12, max: 24, node: "8" } }) });
            socket.onmessage?.({
              data: JSON.stringify({
                type: "executed",
                data: { node: "10", output: { images: [{ filename: "cut_01_local.png" }] } },
              }),
            });
          });
          return socket;
        },
        onProgress: (ev) => progressStages.push(ev.stage),
      },
    );
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("local-websocket");
    expect(result.connected).toBe(true);
    expect(result.externalPaidAutoCallsCount).toBe(0);
    expect(result.outputArtifacts[0]?.filename).toBe("cut_01_local.png");
    expect(progressStages).toEqual(["health-check", "queued", "executing", "completed"]);
  });
});

// ---------------------------------------------------------------------------
// T-037: ManyFast 한국어 웹소설 → 3D 자동 컷 블로킹 엔진
// ---------------------------------------------------------------------------
describe("T-037 · ManyFast 웹소설 → 3D 자동 컷 블로킹 엔진", () => {
  it("7. 한국어 웹소설 원문에서 컷·화자·대사·캐릭터 DNA 시드를 자동 추출한다", () => {
    const sheet = parseWebNovelTo3dBlockingSheet(getSampleWebNovelScript());
    expect(sheet.cuts.length).toBe(5);
    expect(sheet.cast.map((c) => c.name)).toEqual(expect.arrayContaining(["서연", "현우", "지민"]));
    expect(sheet.totalEstimatedScrollPx).toBeGreaterThan(5000);
    expect(sheet.cuts[1]?.dialogueText).toContain("흑요석 던전");
  });

  it("8. 문장 감정·동작 단서에 따라 클로즈업/풀샷/로우앵글/더치틸트 샷을 추론한다", () => {
    const script = [
      "[장면 1 · 흑요석 던전]",
      '현우가 차가운 눈빛으로 속삭였다. "물러서."',
      "서연은 거대한 마수를 올려다보았다.",
      "지민이 전속력으로 달려 검기를 휘둘렀다!",
      "바닥이 쾅 울리며 충격파가 퍼졌다.",
    ].join("\n");
    const sheet = parseWebNovelTo3dBlockingSheet(script);
    expect(sheet.cuts[0]?.cameraShot).toBe("closeup");
    expect(sheet.cuts[1]?.cameraAngle).toBe("low-angle");
    expect(sheet.cuts[2]?.cameraShot).toBe("full-shot");
    expect(sheet.cuts[3]?.cameraAngle).toBe("dutch-tilt");
  });

  it("9. 한국어 배경 키워드와 시간대 표현을 3D 배경 세트·조명에 매칭한다", () => {
    const alley = match3dBackgroundSet("비 오는 밤 골목길 가로등 아래");
    expect(alley.setId).toBe("bg3d-rainy-alley");
    expect(alley.timeOfDay).toBe("night");

    const hall = match3dBackgroundSet("제국 알현실 대리석 왕좌 앞");
    expect(hall.setId).toBe("bg3d-royal-throne-hall");
  });

  it("10. 배치된 모든 3D 캐릭터 좌표는 바닥 접지(y = 0)와 비겹침 간격을 유지한다", () => {
    const sheet = parseWebNovelTo3dBlockingSheet(getSampleWebNovelScript());
    const twoShotCut = sheet.cuts.find((c) => c.characters.length >= 2);
    expect(twoShotCut).toBeDefined();
    for (const cut of sheet.cuts) {
      for (const ch of cut.characters) {
        expect(ch.position.y).toBe(0);
      }
      if (cut.characters.length === 2) {
        const [a, b] = cut.characters;
        expect(Math.abs((a?.position.x ?? 0) - (b?.position.x ?? 0))).toBeGreaterThan(1.0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// T-038: Mantra / LETR 6단계 AI 다국어 현지화 파이프라인
// ---------------------------------------------------------------------------
describe("T-038 · Mantra / LETR 6단계 다국어 현지화 파이프라인", () => {
  it("11. 7개국어(한·영·일·중·스페인·태국·인니) 전체에 대해 6단계 파이프라인을 완료한다", () => {
    const panels = createSampleLocalizationPanels();
    const glossary = createSampleGlossaryEntries();
    for (const lang of SUPPORTED_LOCALIZATION_LANGS) {
      const result = runMantraLetrLocalizationPipeline({ panels, targetLang: lang, glossary });
      expect(result.stages).toHaveLength(6);
      expect(result.items).toHaveLength(panels.length);
      expect(result.glossaryComplianceRate).toBe(100);
    }
  });

  it("12. ① 말풍선 OCR 분류와 읽기 방향(세로 웹툰 vs 일본 RTL) 정렬을 수행한다", () => {
    const raw = [
      { id: "left", cutNumber: 1, x: 40, y: 100, width: 180, height: 100, sourceText: "왼쪽 말풍선" },
      { id: "right", cutNumber: 1, x: 380, y: 110, width: 180, height: 100, sourceText: "오른쪽 말풍선" },
    ];
    const rtl = detectAndClassifyBalloonRegions(raw, "manga-rtl");
    const ltr = detectAndClassifyBalloonRegions(raw, "comic-ltr");
    expect(rtl[0]?.id).toBe("right");
    expect(ltr[0]?.id).toBe("left");
  });

  it("13. ② 배경 복잡도에 따라 과금 0원 로컬 클린업 마스크 전략을 자동 배정한다", () => {
    const regions = detectAndClassifyBalloonRegions(createSampleLocalizationPanels(), "vertical-webtoon");
    const masks = generateCleanupInpaintMasks(regions);
    const byId = new Map(masks.map((m) => [m.regionId, m]));
    expect(byId.get("cut-1-b1")?.strategy).toBe("solid-fill");
    expect(byId.get("cut-3-b1")?.strategy).toBe("patch-match-local");
    expect(byId.get("cut-2-sfx")?.strategy).toBe("local-comfyui-inpaint");
    expect(masks.every((m) => m.costKrw === 0)).toBe(true);
  });

  it("14. ③ 작품 고유명사 용어집을 강제 잠금해 번역 일관성을 100% 유지한다", () => {
    const glossary = createSampleGlossaryEntries();
    const en = translateWithLockedGlossary("현우야, 정말 오늘 밤 흑요석 던전 혼자 들어갈 셈이야?", "ko", "en", glossary);
    const ja = translateWithLockedGlossary("둘 다 멈춰! 제국 알현실 긴급 소환령이 떨어졌어!", "ko", "ja", glossary);
    expect(en.translatedText).toContain("Hyunwoo");
    expect(en.translatedText).toContain("Obsidian Dungeon");
    expect(ja.translatedText).toContain("帝国謁見の間");
    expect(en.glossaryComplianceRate).toBe(100);
  });

  it("15. ④ 말풍선 내부 폭·높이에 맞춰 폰트 크기를 자동 최적화하고 넘침을 탐지한다", () => {
    const fits = fitTextIntoBalloon("b1", "Even if you stop me, my blade will not halt.", 240, 130, "en", "speech");
    expect(fits.overflow).toBe(false);
    expect(fits.fontSizePx).toBeGreaterThanOrEqual(12);

    const overflow = fitTextIntoBalloon(
      "b2",
      "This is an extraordinarily long monologue that cannot possibly fit inside a tiny speech bubble without compression or resizing.",
      70,
      40,
      "en",
      "speech",
    );
    expect(overflow.overflow).toBe(true);
  });

  it("16. ⑤ 효과음(SFX) 벡터 치환과 ⑥ 국가별 검열·읽기 방향 QA를 검사한다", () => {
    const sfxJa = mapSfxToVectorPreset("쾅!", "ja");
    const sfxTh = mapSfxToVectorPreset("두근두근", "th");
    expect(sfxJa.localizedSfx).toBe("ドゴォン!");
    expect(sfxJa.warpCurve).toBe("burst");
    expect(sfxTh.localizedSfx).toBe("ตึกตัก");

    const cnQa = runMantraLetrLocalizationPipeline({
      panels: [{ id: "p-blood", cutNumber: 1, x: 40, y: 40, width: 280, height: 140, sourceText: "피 묻은 해골이 나타났다" }],
      targetLang: "zh",
    });
    expect(cnQa.qaFindings.some((f) => f.code.startsWith("QA_CN_CENSOR"))).toBe(true);

    const jpWrongDir = runMantraLetrLocalizationPipeline({
      panels: createSampleLocalizationPanels(),
      targetLang: "ja",
      readingFlow: "comic-ltr",
      glossary: createSampleGlossaryEntries(),
    });
    expect(jpWrongDir.qaFindings.some((f) => f.code === "QA_JP_READING_DIR")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-039: 일본 세로쓰기(縦書き) + 루비 후리가나 + 세로 중 가로
// ---------------------------------------------------------------------------
describe("T-039 · 일본 세로쓰기 + 루비 후리가나 + 세로 중 가로 조판", () => {
  it("17. 3가지 루비 문법을 파싱하고 vertical-rl 스타일 계약을 생성한다", () => {
    const res = composeJapaneseTategaki("｜東京《とうきょう》と[黒曜石|こくようせき]の今夜(こんや)");
    expect(res.rubyCount).toBe(3);
    expect(res.cssStyle.writingMode).toBe("vertical-rl");
    expect(res.tokens.filter((t) => t.kind === "ruby")).toHaveLength(3);
  });

  it("18. 1~2자리 숫자·!?·2글자 약어는 세로 중 가로(TCY) 처리하고 3자리 숫자는 경고한다", () => {
    const res = composeJapaneseTategaki("24階!? AI起動 2026年");
    const tcyValues = res.tokens.filter((t) => t.kind === "tcy").map((t) => t.value);
    expect(tcyValues).toEqual(["24", "!?", "AI"]);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("19. 세로 말줄임표(︙) 정규화 및 JIS 금칙 문자(kinsoku)를 집계한다", () => {
    const res = composeJapaneseTategaki("待って...本当に、行くの？");
    const textCombined = res.tokens.map((t) => (t.kind === "text" ? t.value : "")).join("");
    expect(textCombined).toContain("︙");
    expect(res.kinsokuCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// T-040: 단행본 CMYK 3mm 도련 + 재단선 + ICC + 300 DPI PDF/X-1a
// ---------------------------------------------------------------------------
describe("T-040 · 단행본 인쇄 CMYK 3mm 도련 · 재단선 · PDF/X-1a 검수", () => {
  it("20. RGB→CMYK 분판과 총 잉크량(TAC)을 정확히 계산한다", () => {
    expect(convertRgbToCmykWithTac(0, 0, 0)).toEqual({ c: 0, m: 0, y: 0, k: 100, tacPercent: 100 });
    expect(convertRgbToCmykWithTac(255, 255, 255)).toEqual({ c: 0, m: 0, y: 0, k: 0, tacPercent: 0 });
    const mid = convertRgbToCmykWithTac(40, 80, 160);
    expect(mid.tacPercent).toBe(mid.c + mid.m + mid.y + mid.k);
  });

  it("21. 8개 모서리 재단선과 4개 레지스트레이션 마크(총 12선, 0.25pt)를 생성한다", () => {
    const marks = generateCropMarkGeometry(128, 182, 3);
    expect(marks).toHaveLength(12);
    expect(marks.filter((m) => m.kind === "corner-crop")).toHaveLength(8);
    expect(marks.filter((m) => m.kind === "registration-target")).toHaveLength(4);
    expect(marks.every((m) => m.strokePt === 0.25)).toBe(true);
  });

  it("22. 300 DPI·3mm 도련·JapanColor2001Coated 정상 통과 및 위반 항목 차단을 검증한다", () => {
    const okPkg = buildPdfX1aPrintPackage({
      documentTitle: "흑요석 연대기 1권",
      trimPresetId: "jp-b6-tankobon",
      bleedMm: 3,
      dpi: 300,
    });
    expect(okPkg.passed).toBe(true);
    expect(okPkg.pdfxVersion).toBe("PDF/X-1a:2001");
    expect(okPkg.bleedBoxMm).toEqual({ width: 134, height: 188 });
    expect(okPkg.iccProfile.id).toBe("JapanColor2001Coated");

    const badPkg = buildPdfX1aPrintPackage({
      documentTitle: "위반 원고",
      trimPresetId: "kr-a5-book",
      iccProfileId: "SWOP2006",
      bleedMm: 1,
      dpi: 150,
      maxSampledTacPercent: 340,
      rgbObjectsRemaining: 2,
      allFontsEmbedded: false,
      transparencyFlattened: false,
    });
    expect(badPkg.passed).toBe(false);
    expect(badPkg.blockingCount).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// T-036 / T-043: 4대 스튜디오 통합 오프라인 우선(Local-First) 동기화 브리지
// ---------------------------------------------------------------------------
describe("T-036 · T-043 · 4대 스튜디오 오프라인 우선 동기화 브리지", () => {
  it("23. 오프라인 중에도 Plotr·Tooning Plus·Character Chat·Virtual Studio 변경을 로컬에 즉시 기록한다", async () => {
    const store = createMemorySnapshotStore();
    const bridge = createOfflineFirstSyncBridge("proj-w10", { store, initialNetwork: "offline" });

    for (const surface of SYNC_STUDIO_SURFACES) {
      bridge.enqueueLocalMutation({ surface, entityId: "item-1", patch: { rev: 1, ok: true }, nowMs: 1000 });
    }
    // 동일 엔티티 추가 수정 시 큐 병합(coalescing) 확인
    bridge.enqueueLocalMutation({ surface: "plotr", entityId: "item-1", patch: { rev: 2 }, nowMs: 1050 });
    expect(bridge.getState().queue).toHaveLength(4);

    const skipped = await bridge.syncNow({ pushOperations: async () => ({ acceptedOpIds: [] }) }, { nowMs: 1100 });
    expect(skipped.skippedOffline).toBe(true);
    expect(bridge.getState().records["plotr::item-1"]?.payload.rev).toBe(2);
  });

  it("24. 온라인 복귀 시 낙관적 동기화 반영 및 실패 시 지수 백오프 재시도를 예약한다", async () => {
    const bridge = createOfflineFirstSyncBridge("proj-sync", { initialNetwork: "online" });
    bridge.enqueueLocalMutation({ surface: "tooning-plus", entityId: "cut-09", patch: { balloons: 4 }, nowMs: 1000 });

    const failedCycle = await bridge.syncNow(
      { pushOperations: async () => { throw new Error("API 503"); } },
      { nowMs: 2000 },
    );
    expect(failedCycle.retried).toBe(1);
    expect(bridge.getState().networkStatus).toBe("degraded");
    expect(computeRetryBackoffMs(1)).toBe(2000);
    expect(computeRetryBackoffMs(3)).toBe(8000);

    const okCycle = await bridge.syncNow(
      { pushOperations: async (ops) => ({ acceptedOpIds: ops.map((o) => o.opId) }) },
      { nowMs: 5000 },
    );
    expect(okCycle.synced).toBe(1);
    expect(bridge.getState().queue).toHaveLength(0);
  });

  it("25. 필드 단위 충돌 머지 및 local-wins / remote-wins 전략이 결정론적으로 동작한다", () => {
    const local = { surface: "character-chat" as const, entityId: "c1", lamport: 5, updatedAtMs: 2000, actorId: "me", payload: { tone: "단호", hair: "흑발" } };
    const remote = { surface: "character-chat" as const, entityId: "c1", lamport: 4, updatedAtMs: 1900, actorId: "peer", payload: { tone: "온화", weapon: "검" } };

    const merged = resolveSyncConflict(local, remote, "field-level-merge", 3000);
    expect(merged.hadConflict).toBe(true);
    expect(merged.record.payload).toEqual({ tone: "단호", hair: "흑발", weapon: "검" });

    const remoteWin = resolveSyncConflict(local, remote, "remote-wins", 3000);
    expect(remoteWin.record.payload.tone).toBe("온화");
  });

  it("26. 수동 검토(manual-review) 충돌을 보관했다가 사용자 선택으로 해소한다", async () => {
    const bridge = createOfflineFirstSyncBridge("proj-manual", { initialNetwork: "online" });
    bridge.enqueueLocalMutation({ surface: "plotr", entityId: "scene-1", patch: { title: "로컬 제목" }, nowMs: 1000 });

    const cycle = await bridge.syncNow(
      {
        pushOperations: async (ops) => ({
          acceptedOpIds: ops.map((o) => o.opId),
          remoteUpdates: [
            { surface: "plotr", entityId: "scene-1", lamport: 2, updatedAtMs: 1200, actorId: "pd", payload: { title: "원격 제목" } },
          ],
        }),
      },
      { strategy: "manual-review", nowMs: 1500 },
    );
    expect(cycle.manualConflicts).toBe(1);
    const conflictId = bridge.getState().conflicts[0]?.conflictId ?? "";
    expect(bridge.resolveManualConflict(conflictId, "remote", 2000)).toBe(true);
    expect(bridge.getState().records["plotr::scene-1"]?.payload.title).toBe("원격 제목");
  });
});

// ---------------------------------------------------------------------------
// T-044: 가상 스튜디오 근접 원고 합평 테이블 & 화면공유 시그널링 상태 머신
// ---------------------------------------------------------------------------
describe("T-044 · 가상 스튜디오 근접 원고 합평 테이블 & 화면공유 FSM", () => {
  it("27. 아바타 거리에 따라 합평 테이블 자동 결합과 음성 감쇠 게인을 계산한다", () => {
    const initial = createInitialProximityReviewTable("ep-12");
    const eval1 = evaluateProximityChannels(initial);
    expect(eval1.joinedTableIds).toEqual(["p-pd", "p-line"]);
    expect(eval1.outsideTableIds).toEqual(["p-color"]);
    expect(computeAvatarDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);

    const moved = moveProximityParticipant(initial, "p-color", 0.2, -0.5);
    const eval2 = evaluateProximityChannels(moved);
    expect(eval2.joinedTableIds).toContain("p-color");
    expect(eval2.activeVoicePairCount).toBe(3);
  });

  it("28. 공동 컷 포인터 좌표 클램핑과 합평 코멘트 핀 추가·해결 토글을 처리한다", () => {
    let table = createInitialProximityReviewTable("ep-12");
    table = updateSharedCutPointer(table, {
      participantId: "p-line",
      participantName: "박서윤 작가",
      cutId: "cut-01",
      normX: 1.4,
      normY: -0.2,
      updatedAtMs: 5000,
    });
    const ptr = table.pointers.find((p) => p.participantId === "p-line");
    expect(ptr?.normX).toBe(1);
    expect(ptr?.normY).toBe(0);

    table = addReviewCommentPin(table, {
      cutId: "cut-03",
      normX: 0.5,
      normY: 0.5,
      authorId: "p-color",
      authorName: "이민지 채색",
      category: "lighting",
      body: "역광 톤 보정",
      createdAtIso: "2026-11-21T12:10:00.000Z",
    });
    expect(table.commentPins).toHaveLength(3);
    table = toggleReviewCommentPinResolved(table, "pin-1");
    expect(table.commentPins.find((p) => p.id === "pin-1")?.resolved).toBe(true);
  });

  it("29. 화면공유 시그널링 상태 머신이 전이 규칙과 중복 발표자 차단을 보장한다", () => {
    let s = createInitialScreenShareSignalState();
    const r1 = transitionScreenShareState(s, { type: "request-share", presenterId: "p-pd", presenterName: "김도윤 PD" });
    expect(r1.ok).toBe(true);
    s = r1.state;

    // 중복 발표자 탈취 차단
    const hijack = transitionScreenShareState(s, { type: "request-share", presenterId: "p-line", presenterName: "박서윤 작가" });
    expect(hijack.ok).toBe(false);

    s = transitionScreenShareState(s, { type: "offer-created", offerSdpHash: "offer-1" }).state;
    s = transitionScreenShareState(s, { type: "ice-candidate-added" }).state;
    s = transitionScreenShareState(s, { type: "answer-received", answerSdpHash: "answer-1" }).state;
    expect(s.status).toBe("streaming");
    expect(s.iceCandidateCount).toBe(1);

    s = transitionScreenShareState(s, { type: "pause" }).state;
    expect(s.status).toBe("paused");
    s = transitionScreenShareState(s, { type: "resume" }).state;
    expect(s.status).toBe("streaming");
    s = transitionScreenShareState(s, { type: "stop" }).state;
    expect(s.status).toBe("ended");
  });
});

// ---------------------------------------------------------------------------
// UI 통합 및 StudioLocalizationPanel 지연 마운트 검증
// ---------------------------------------------------------------------------
describe("UI · StudioLocalizationAiSyncPanel 4분할 탭 & 지연 마운트 통합", () => {
  it("30. 4분할 탭 전환과 일본 세로쓰기·PDF/X-1a·3D 콘티·로컬 AI/합평 인터랙션을 렌더링한다", async () => {
    render(<StudioLocalizationAiSyncPanel projectId="proj-ui-1" />);

    expect(screen.getByRole("tab", { name: "글로벌 식자·현지화" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/① 말풍선 OCR 감지·분류/u)).toBeTruthy();

    // 탭 2: 일본 세로쓰기 + 단행본 인쇄
    fireEvent.click(screen.getByRole("tab", { name: "일본 세로·단행본 인쇄" }));
    const jpPreview = screen.getByTestId("jp-tategaki-preview");
    expect(jpPreview.style.writingMode).toBe("vertical-rl");
    expect(jpPreview.querySelector("ruby")).not.toBeNull();
    expect(jpPreview.querySelector('[data-tcy="true"]')).not.toBeNull();
    expect(screen.getByText("인쇄 출고 가능")).toBeTruthy();

    // 탭 3: 소설→3D 자동 콘티
    fireEvent.click(screen.getByRole("tab", { name: "소설→3D 자동 콘티" }));
    expect(screen.getByText(/CUT #1/u)).toBeTruthy();

    // 탭 4: 로컬 AI·협업 동기화
    fireEvent.click(screen.getByRole("tab", { name: "로컬 AI·협업 동기화" }));
    expect(screen.getByText(/외부 유료 자동 호출 0건 보장/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /로컬 연결 \/ Dry-Run 실행/u }));
    await waitFor(() => {
      expect(screen.getByText(/생성된 ComfyUI ControlNet 워크플로 JSON/u)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "테이블로 이동" }));
    expect(screen.getByText(/테이블 결합 3명/u)).toBeTruthy();
  });

  it("31. 인쇄 DPI를 150으로 낮추면 즉시 PDF/X-1a 프리플라이트 차단이 표시된다", () => {
    render(<StudioLocalizationAiSyncPanel projectId="proj-ui-2" />);
    fireEvent.click(screen.getByRole("tab", { name: "일본 세로·단행본 인쇄" }));
    fireEvent.change(screen.getByLabelText("출력 해상도 (DPI)"), { target: { value: "150" } });
    expect(screen.getByText(/보완 필요 1건/u)).toBeTruthy();
  });

  it("32. StudioLocalizationPanel 접이식 진입점은 닫혀 있다가 열 때 지연 마운트된다", async () => {
    render(<StudioLocalizationPanel projectId="proj-lazy-1" />);
    const disclosure = screen.getByTestId("localization-ai-sync-pro-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-localization-ai-sync-panel")).toBeNull();

    await act(async () => {
      disclosure.open = true;
      fireEvent(disclosure, new Event("toggle"));
      await vi.dynamicImportSettled();
    });

    await waitFor(() => {
      expect(screen.getByTestId("studio-localization-ai-sync-panel")).toBeTruthy();
    });
  });
});
