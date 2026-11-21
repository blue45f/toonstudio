// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureStudioProjectPlanning,
  readStudioProjectPlanning,
  saveStudioEpisodePlan,
} from "../planning/studio-planning-store";
import { isDeferredEcosystemModule, loadEcosystemModule } from "./studio-ecosystem-lazy-registry";
import {
  STUDIO_EXPANDED_TOOL_COMMIT_EVENT,
  TOP15_LIVE_ENGINE_ADAPTER_IDS,
  commitDialoguePagesToLivePlanning,
  commitUnderpaintingJob,
  dispatchCanvasZoneDragTransfer,
  enterUnderpaintingMarkingWorkflow,
  executeLiveEngineAdapterAndCommit,
  readDialoguePagesFromLivePlanning,
  readExpandedLiveWorkspace,
  readProjectStoryLivingSpecRecord,
  studioExpandedWorkspaceStorageKey,
  studioStoryLivingSpecStorageKey,
  subscribeExpandedToolCommits,
  updateUnderpaintingBatchCuts,
  writeExpandedLiveWorkspace,
  writeProjectStoryLivingSpecRecord,
  type ExpandedToolCommitEnvelope,
} from "./studio-expanded-tool-live-adapters";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("studio-expanded-tool-live-adapters", () => {
  it.each(["unavailable", "malformed"])("읽지 않은 fallback은 정상 원본이 복구돼도 덮어쓰기나 갱신 이벤트 권한을 얻지 않는다: %s", (readFailure) => {
    const projectId = "project-read-recovered";
    const workspaceKey = studioExpandedWorkspaceStorageKey(projectId);
    const storyKey = studioStoryLivingSpecStorageKey(projectId);
    writeExpandedLiveWorkspace({ ...readExpandedLiveWorkspace(projectId, null), activeCutId: "original-cut" });
    writeProjectStoryLivingSpecRecord(projectId, readProjectStoryLivingSpecRecord(projectId, null));
    const originalWorkspace = localStorage.getItem(workspaceKey);
    const originalStory = localStorage.getItem(storyKey);
    const getItem = Storage.prototype.getItem;
    const unreadKeys = new Set([workspaceKey, storyKey]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (unreadKeys.delete(key)) {
        if (readFailure === "unavailable") throw new Error("일시적 읽기 실패");
        return "{broken-json";
      }
      return getItem.call(this, key);
    });
    const memoryWorkspace = { ...readExpandedLiveWorkspace(projectId), activeCutId: "memory-cut" };
    const memoryStory = { ...readProjectStoryLivingSpecRecord(projectId), updatedAt: "2099-01-01T00:00:00.000Z" };
    const target = { dispatchEvent: vi.fn(() => true) };
    expect(writeExpandedLiveWorkspace(memoryWorkspace)).toBe(memoryWorkspace);
    expect(writeProjectStoryLivingSpecRecord(projectId, memoryStory, { target }).state).toEqual(memoryStory.state);
    expect(localStorage.getItem(workspaceKey)).toBe(originalWorkspace);
    expect(localStorage.getItem(storyKey)).toBe(originalStory);
    expect(target.dispatchEvent).not.toHaveBeenCalled();
    writeExpandedLiveWorkspace({ ...readExpandedLiveWorkspace(projectId), activeCutId: "reloaded-cut" });
    writeProjectStoryLivingSpecRecord(projectId, readProjectStoryLivingSpecRecord(projectId), { target });
    expect(readExpandedLiveWorkspace(projectId).activeCutId).toBe("reloaded-cut");
    expect(target.dispatchEvent).toHaveBeenCalledOnce();
  });

  it("다른 작품 및 손상된 작업 사본을 기본값으로 덮어쓰지 않는다", () => {
    const projectId = "project-protected";
    const workspaceKey = studioExpandedWorkspaceStorageKey(projectId);
    const storyKey = studioStoryLivingSpecStorageKey(projectId);
    const foreignWorkspace = JSON.stringify(readExpandedLiveWorkspace("foreign", null));
    const foreignStory = JSON.stringify(readProjectStoryLivingSpecRecord("foreign", null));
    for (const original of ["{broken-json", foreignWorkspace]) {
      localStorage.setItem(workspaceKey, original);
      const fallback = readExpandedLiveWorkspace(projectId);
      expect(fallback.projectId).toBe(projectId);
      writeExpandedLiveWorkspace(fallback);
      expect(localStorage.getItem(workspaceKey)).toBe(original);
    }
    for (const original of ["{broken-json", foreignStory]) {
      localStorage.setItem(storyKey, original);
      const fallback = readProjectStoryLivingSpecRecord(projectId);
      expect(fallback.state.projectId).toBe(projectId);
      writeProjectStoryLivingSpecRecord(projectId, fallback);
      expect(localStorage.getItem(storyKey)).toBe(original);
    }
  });

  it("기획 봉투와 중첩 state의 작품 ID가 모두 맞아야 저장하고 다른 작품 쓰기를 거절한다", () => {
    const projectId = "project-scoped";
    const storyKey = studioStoryLivingSpecStorageKey(projectId);
    const record = readProjectStoryLivingSpecRecord(projectId, null);
    writeProjectStoryLivingSpecRecord(projectId, record);
    expect(readProjectStoryLivingSpecRecord(projectId).state).toEqual(record.state);
    const original = localStorage.getItem(storyKey);
    writeProjectStoryLivingSpecRecord(projectId, { ...record, projectId: "foreign" });
    writeProjectStoryLivingSpecRecord(projectId, { ...record, state: { ...record.state, projectId: "foreign" } });
    expect(localStorage.getItem(storyKey)).toBe(original);
    const forged = JSON.stringify({ ...record, state: { ...record.state, projectId: "foreign" } });
    localStorage.setItem(storyKey, forged);
    expect(readProjectStoryLivingSpecRecord(projectId).state.projectId).toBe(projectId);
    writeProjectStoryLivingSpecRecord(projectId, record);
    expect(localStorage.getItem(storyKey)).toBe(forged);
  });

  it("저장·읽기 거부 때 기존 원본을 남기고 메모리 작업 결과를 돌려준다", () => {
    const projectId = "project-quota";
    const workspace = readExpandedLiveWorkspace(projectId, null);
    const story = readProjectStoryLivingSpecRecord(projectId, null);
    writeExpandedLiveWorkspace(workspace);
    writeProjectStoryLivingSpecRecord(projectId, story);
    const originalWorkspace = localStorage.getItem(studioExpandedWorkspaceStorageKey(projectId));
    const originalStory = localStorage.getItem(studioStoryLivingSpecStorageKey(projectId));
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("저장 거부"); });
    const memory = { ...workspace, activeCutId: "edited-cut" };
    expect(writeExpandedLiveWorkspace(memory)).toBe(memory);
    expect(writeProjectStoryLivingSpecRecord(projectId, story).state).toEqual(story.state);
    expect(localStorage.getItem(studioExpandedWorkspaceStorageKey(projectId))).toBe(originalWorkspace);
    expect(localStorage.getItem(studioStoryLivingSpecStorageKey(projectId))).toBe(originalStory);
    setItem.mockClear();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("읽기 거부"); });
    writeExpandedLiveWorkspace(memory);
    writeProjectStoryLivingSpecRecord(projectId, story);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("Top 15 엔진 라이브 어댑터 15종 전체가 실제 모듈을 실행·영속 저장하고 commit 이벤트를 브로드캐스트한다", async () => {
    expect(TOP15_LIVE_ENGINE_ADAPTER_IDS).toHaveLength(15);
    const projectId = "proj-top15-engines";
    const received: ExpandedToolCommitEnvelope[] = [];
    const unsubscribe = subscribeExpandedToolCommits((env) => received.push(env));

    try {
      for (const loaderId of TOP15_LIVE_ENGINE_ADAPTER_IDS) {
        const mod = await loadEcosystemModule(loaderId);
        expect(isDeferredEcosystemModule(mod), loaderId).toBe(false);
        if (isDeferredEcosystemModule(mod)) continue;

        const outcome = executeLiveEngineAdapterAndCommit(projectId, loaderId, mod);
        expect(outcome.report.status, `${loaderId}: ${outcome.report.errorMessage ?? ""}`).toBe("ok");
        expect(outcome.commitRecord, loaderId).not.toBeNull();
        expect(outcome.workspace.engineCommits[loaderId]?.badgeTextKo).toBeTruthy();
      }

      const persisted = readExpandedLiveWorkspace(projectId);
      expect(Object.keys(persisted.engineCommits)).toHaveLength(15);
      expect(received).toHaveLength(15);
      expect(received.every((item) => item.projectId === projectId)).toBe(true);
    } finally {
      unsubscribe();
    }
  }, 20_000);

  it("Rive 상태머신 어댑터는 2D 조이스틱(X/Y) · ViewModel(스크롤·음성) · SFX 트리거를 실스토어에 커밋한다", async () => {
    const projectId = "proj-rive-live";
    const mod = await loadEcosystemModule("planned-rive-state-machine");
    if (isDeferredEcosystemModule(mod)) throw new Error("Rive 모듈 로드 실패");

    const outcome = executeLiveEngineAdapterAndCommit(projectId, "planned-rive-state-machine", mod, {
      joystickX: 80,
      joystickY: -50,
      scrollPct: 75,
      voicePct: 60,
      sfxTrigger: "impact_sfx",
    });

    expect(outcome.report.status).toBe("ok");
    const saved = readExpandedLiveWorkspace(projectId).engineCommits["planned-rive-state-machine"];
    expect(saved?.payload).toMatchObject({
      joystickX: 0.8,
      joystickY: -0.5,
      scroll01: 0.75,
      voice01: 0.6,
      sfxTrigger: "impact_sfx",
    });
    expect(saved?.badgeTextKo).toContain("impact_sfx");
  });

  it("4구역 양방향 드래그 전송이 선택 항목·일관성 소재 스트립·활성 컷을 실스토어에 동기화한다", () => {
    const projectId = "proj-zone-drag";
    const events: ExpandedToolCommitEnvelope[] = [];
    const onEvent = (event: Event) => {
      if (event instanceof CustomEvent) events.push(event.detail as ExpandedToolCommitEnvelope);
    };
    window.addEventListener(STUDIO_EXPANDED_TOOL_COMMIT_EVENT, onEvent);

    try {
      dispatchCanvasZoneDragTransfer(projectId, {
        itemId: "char-hajin",
        label: "하진 캐릭터",
        kind: "character",
        fromZone: "character-dock",
        toZone: "canvas-stage",
      });
      dispatchCanvasZoneDragTransfer(projectId, {
        itemId: "char-hajin",
        label: "하진 캐릭터",
        kind: "character",
        fromZone: "canvas-stage",
        toZone: "consistency-strip",
      });
      const finalState = dispatchCanvasZoneDragTransfer(projectId, {
        itemId: "cut-04",
        label: "4컷 옥상",
        kind: "cut",
        fromZone: "canvas-stage",
        toZone: "cut-timeline",
      });

      expect(finalState.selectionItems.some((item) => item.id === "char-hajin")).toBe(true);
      expect(finalState.consistencySlots.some((slot) => slot.name === "하진 캐릭터")).toBe(true);
      expect(finalState.activeCutId).toBe("cut-04");
      expect(events).toHaveLength(3);
    } finally {
      window.removeEventListener(STUDIO_EXPANDED_TOOL_COMMIT_EVENT, onEvent);
    }
  });

  it("언더페인팅 2장 이상 연속 배치 시 '마킹하러 가기' 워크플로우와 Multiply 선화 잠금 + 3층 출력을 영속 저장한다", () => {
    const projectId = "proj-underpainting";
    const batched = updateUnderpaintingBatchCuts(projectId, ["cut-01", "cut-02", "cut-03"]);
    expect(batched.underpainting.batchCutIds).toHaveLength(3);
    expect(batched.underpainting.batchWorkflowStage).toBe("ready-to-mark");
    expect(batched.underpainting.lineartBlendMode).toBe("multiply");
    expect(batched.underpainting.lineartLocked).toBe(true);

    const marking = enterUnderpaintingMarkingWorkflow(projectId);
    expect(marking.underpainting.batchWorkflowStage).toBe("marking");

    const completed = commitUnderpaintingJob(projectId, {
      cutId: "cut-01",
      lineartLayerId: "layer-lineart",
      characterPalettes: {},
      markingStrokes: [{ cutId: "cut-01", label: "A", normalizedXY: [0.5, 0.5] }],
      outputMode: "base_shadow_highlight",
      shadingLevel: "cel_highlight",
      propagateFromFirstCut: true,
      shadowOpacity: 0.48,
      highlightOpacity: 0.58,
    });

    expect(completed.underpainting.batchWorkflowStage).toBe("completed");
    expect(completed.underpainting.outputLayers.map((layer) => layer.role)).toEqual([
      "lineart",
      "highlight-mask",
      "shadow",
      "base",
    ]);
    const reloaded = readExpandedLiveWorkspace(projectId);
    expect(reloaded.underpainting.outputLayers[0]?.locked).toBe(true);
    expect(reloaded.underpainting.outputLayers[0]?.blendMode).toBe("multiply");
  });

  it("대사 일괄 찾기·바꾸기가 실제 studio-planning-store와 양방향으로 읽고 쓴다", () => {
    const projectId = "proj-dialogue-sync";
    const initial = ensureStudioProjectPlanning(localStorage, projectId, "2026-11-20T09:00:00.000Z");
    const plan = initial.plans[0]!;
    saveStudioEpisodePlan(localStorage, projectId, {
      ...plan,
      logline: "서연이 옥상에서 오래된 편지를 발견한다.",
      synopsis: "서연은 망설임 없이 봉투를 연다.",
      turningPoints: ["서연의 결심"],
    });

    const livePages = readDialoguePagesFromLivePlanning(projectId);
    expect(livePages).toHaveLength(1);
    expect(livePages[0]?.elements.map((e) => e.text)).toContain("서연이 옥상에서 오래된 편지를 발견한다.");

    const updatedPages = livePages.map((page) => ({
      ...page,
      elements: page.elements.map((el) => ({
        ...el,
        text: typeof el.text === "string" ? el.text.replaceAll("서연", "지안") : el.text,
      })),
    }));
    commitDialoguePagesToLivePlanning(projectId, updatedPages, 3);

    const updatedPlanning = readStudioProjectPlanning(localStorage, projectId);
    expect(updatedPlanning?.plans[0]?.logline).toBe("지안이 옥상에서 오래된 편지를 발견한다.");
    expect(updatedPlanning?.plans[0]?.synopsis).toBe("지안은 망설임 없이 봉투를 연다.");
    expect(updatedPlanning?.plans[0]?.turningPoints).toEqual(["지안의 결심"]);
  });

  it("라이브 어댑터 소스가 800줄 이하이며 금지 패턴(원시 색상·any·@ts-ignore·eslint-disable)이 0건이다", () => {
    const file = resolve(__dirname, "./studio-expanded-tool-live-adapters.ts");
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n").length;
    expect(lines).toBeLessThanOrEqual(800);
    expect(src).not.toContain("@ts-ignore");
    expect(src).not.toContain("@ts-nocheck");
    expect(src).not.toContain("eslint-disable");
    expect(src).not.toMatch(/:\s*any\b/u);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  });
});
