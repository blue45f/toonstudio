import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT } from "./studio-live-sync-safety";
import "../studio-panel-status-i18n-r3c07";
import {
  resolveStudioDraftOperationSyncAssistant,
  type StudioDraftOperationSyncAssistantInput,
} from "../studio-draft-operation-sync-assistant-model";

const initialLang = useI18n.getState().lang;

beforeEach(() => { useI18n.setState({ lang: "ko" }); });
afterEach(() => { useI18n.setState({ lang: initialLang }); });

function input(
  overrides: Partial<StudioDraftOperationSyncAssistantInput> = {},
): StudioDraftOperationSyncAssistantInput {
  return {
    liveContextAvailable: true,
    syncPhase: INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT.phase,
    pendingCount: 0,
    persistenceDurability: INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT.persistenceDurability,
    editsDurablyProtected: INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT.editsDurablyProtected,
    mode: "server",
    collaborationSyncPending: false,
    recoveryUpdateCount: 0,
    recoveryExportAvailable: false,
    recoveryExported: false,
    localCheckpointCount: 3,
    localRole: "leader",
    serverRevision: 7,
    hasServerDocument: true,
    hydrated: true,
    hydrationFailed: false,
    saving: false,
    ...overrides,
  };
}

describe("resolveStudioDraftOperationSyncAssistant", () => {
  it("stays quiet while a healthy live context has no work to surface", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "synced",
      persistenceDurability: "durable",
      editsDurablyProtected: true,
    }));

    expect(model.visible).toBe(false);
    expect(model.tone).toBe("success");
    expect(model.serverSummary).toContain("다른 기기에서 이어서 작업");
  });

  it("서버 동기화와 실제 기기 내구 보호가 확인된 경우에만 두 보호 단계를 안내한다", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "synced",
      persistenceDurability: "durable",
      editsDurablyProtected: true,
      localCheckpointCount: 0,
      localRole: null,
    }));

    expect(model.operationSummary).toBe("팀 서버와 이 기기의 복구 저장소에 원고를 보호합니다.");
    expect(model.detail).toBe(model.operationSummary);
    expect(model.visible).toBe(false);
    expect(model.tone).toBe("success");
    expect(model.compactLabel).toBe("변경 동기화 완료");
    expect(model.primaryAction).toBeNull();
    expect(model.deviceSummary).toBe("이 기기의 복구 저장 담당을 확인하고 있습니다.");
    expect(model.serverSummary).toBe("서버 원고 r7까지 확인되어 다른 기기에서 이어서 작업할 수 있습니다.");
  });

  it.each(["checking", "degraded", "unavailable", "not-applicable"] as const)(
    "기기 내구 상태가 %s이면 서버 동기화만으로 기기 내구 보호를 주장하지 않는다",
    (persistenceDurability) => {
      const model = resolveStudioDraftOperationSyncAssistant(input({
        syncPhase: "synced",
        persistenceDurability,
        editsDurablyProtected: true,
        localCheckpointCount: 20,
      }));

      expect(model.operationSummary).toBe("새 변경이 팀 서버에 모두 반영되었습니다.");
      expect(model.detail).not.toContain("복구 저장소");
      expect(model.deviceSummary).toContain("기기 복구 지점 20개");
      expect(model.compactLabel).toBe("변경 동기화 완료");
    },
  );

  it("연산의 두 보호 단계가 준비돼도 별도 서버 초안이 없다는 안내를 유지한다", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "synced",
      persistenceDurability: "durable",
      editsDurablyProtected: true,
      hasServerDocument: false,
      serverRevision: null,
    }));

    expect(model.operationSummary).toBe("팀 서버와 이 기기의 복구 저장소에 원고를 보호합니다.");
    expect(model.serverSummary).toBe("아직 서버 원고가 없습니다. 첫 초안 저장 후 다른 기기에서 이어갈 수 있습니다.");
  });

  it.each<{ label: string; overrides: Partial<StudioDraftOperationSyncAssistantInput> }>([
    { label: "실시간 맥락 없음", overrides: { liveContextAvailable: false } },
    { label: "기기 탭 전용", overrides: { mode: "local" } },
    { label: "연결 방식 미확인", overrides: { mode: null } },
    { label: "원고 불러오기 전", overrides: { hydrated: false } },
    { label: "원고 불러오기 실패", overrides: { hydrationFailed: true } },
    { label: "변경 보호 미확인", overrides: { editsDurablyProtected: false } },
    { label: "대기 연산 존재", overrides: { pendingCount: 1 } },
    { label: "분리된 복구 변경 존재", overrides: { recoveryUpdateCount: 2 } },
    { label: "공동 작업 정리 중", overrides: { collaborationSyncPending: true } },
  ])("$label 상태에는 durable 값만으로 원고의 두 보호 단계를 단정하지 않는다", ({ overrides }) => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "synced",
      persistenceDurability: "durable",
      editsDurablyProtected: true,
      ...overrides,
    }));

    expect(model.operationSummary).not.toContain("복구 저장소");
    expect(model.detail).toBe(model.operationSummary);
  });

  it("surfaces offline operations without calling the server snapshot current", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "offline-queued",
      pendingCount: 3,
      persistenceDurability: "durable",
      editsDurablyProtected: true,
    }));

    expect(model.visible).toBe(true);
    expect(model.tone).toBe("warning");
    expect(model.compactLabel).toBe("오프라인 · 3개 기기 보관");
    expect(model.primaryAction).toBe("retry");
    expect(model.operationSummary).toContain("변경 3개");
    expect(model.operationSummary).toBe("서버가 다시 연결될 때까지 변경 3개를 이 기기의 복구 저장소에 보관합니다. 아직 팀 서버에 반영되지 않았습니다.");
    expect(model.detail).toBe(model.operationSummary);
    expect(model.serverSummary).toContain("대기 변경이 끝난 뒤");
  });

  it.each(["checking", "degraded", "unavailable", "not-applicable"] as const)(
    "오프라인 기기 내구 상태가 %s이면 복구 저장소 보관으로 표시하지 않는다",
    (persistenceDurability) => {
      const model = resolveStudioDraftOperationSyncAssistant(input({
        syncPhase: "offline-queued",
        pendingCount: 3,
        persistenceDurability,
        editsDurablyProtected: true,
      }));

      expect(model.operationSummary).toBe("변경 3개를 서버가 다시 연결될 때까지 이 기기에 보관합니다.");
      expect(model.detail).not.toContain("복구 저장소");
      expect(model.compactLabel).toBe("오프라인 · 3개 기기 보관");
      expect(model.primaryAction).toBe("retry");
    },
  );

  it.each<{ label: string; overrides: Partial<StudioDraftOperationSyncAssistantInput> }>([
    { label: "실시간 맥락 없음", overrides: { liveContextAvailable: false } },
    { label: "기기 탭 전용", overrides: { mode: "local" } },
    { label: "원고 불러오기 전", overrides: { hydrated: false } },
    { label: "원고 불러오기 실패", overrides: { hydrationFailed: true } },
    { label: "변경 보호 미확인", overrides: { editsDurablyProtected: false } },
    { label: "분리된 복구 변경 존재", overrides: { recoveryUpdateCount: 2 } },
  ])("오프라인 $label 상태에는 durable 값만으로 기기 복구 저장소 보호를 주장하지 않는다", ({ overrides }) => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "offline-queued",
      pendingCount: 3,
      persistenceDurability: "durable",
      editsDurablyProtected: true,
      ...overrides,
    }));

    expect(model.operationSummary).not.toContain("복구 저장소");
    expect(model.operationSummary).toContain("변경 3개");
  });

  it.each(["en", "ja"])("%s 화면은 등록한 영어 문구 또는 같은 영어 폴백으로 보호 단계와 대기 수를 안내한다", (lang) => {
    useI18n.setState({ lang });
    const protectedInput = { persistenceDurability: "durable", editsDurablyProtected: true } as const;
    const synced = resolveStudioDraftOperationSyncAssistant(input({ syncPhase: "synced", ...protectedInput }));
    const offline = resolveStudioDraftOperationSyncAssistant(input({ syncPhase: "offline-queued", pendingCount: 3, ...protectedInput }));

    expect(synced.operationSummary).toBe("Your manuscript is protected on the team server and in this device's recovery storage.");
    expect(offline.operationSummary).toBe("Pending changes (3) are kept in this device's recovery storage until the server reconnects. They have not been applied to the team server yet.");
    expect(offline.primaryAction).toBe("retry");
    expect(offline.serverSummary).toContain("대기 변경이 끝난 뒤");
  });

  it("promotes a rejected local frontier to a recovery export", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "recovery-required",
      pendingCount: 4,
      recoveryUpdateCount: 4,
      recoveryExportAvailable: true,
      editsDurablyProtected: false,
    }));

    expect(model.visible).toBe(true);
    expect(model.tone).toBe("danger");
    expect(model.compactLabel).toBe("로컬 변경 복구 필요");
    expect(model.primaryAction).toBe("export-recovery");
    expect(model.primaryActionLabel).toBe("로컬 변경 복구 파일");
    expect(model.operationSummary).toContain("4개");
  });

  it("routes an already exported recovery boundary to non-destructive version review", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "recovery-required",
      recoveryUpdateCount: 2,
      recoveryExportAvailable: true,
      recoveryExported: true,
    }));

    expect(model.primaryAction).toBe("versions");
    expect(model.primaryActionLabel).toBe("버전·복구 확인");
  });

  it("explains that a follower tab does not own persistence", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "read-only-follower",
      localRole: "follower",
    }));

    expect(model.visible).toBe(true);
    expect(model.tone).toBe("warning");
    expect(model.compactLabel).toBe("다른 탭이 동기화 담당");
    expect(model.primaryAction).toBeNull();
    expect(model.deviceSummary).toContain("다른 탭");
  });

  it("does not claim cross-device continuation for a local-tab-only session", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "synced",
      mode: "local",
      persistenceDurability: "durable",
      editsDurablyProtected: true,
    }));

    expect(model.serverSummary).toContain("서버 원고 저장도 완료");
    expect(model.operationSummary).toContain("이 기기 안의 열린 탭");
    // 상시 표시 칩의 완료 라벨도 서버가 아닌 기기 탭을 대상으로 적는다.
    expect(model.compactLabel).toBe("기기 탭 동기화 완료");
    expect(model.headline).toContain("열린 탭끼리");
  });

  it("shows the host save barrier even before detailed live telemetry is available", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      liveContextAvailable: false,
      syncPhase: "initializing",
      collaborationSyncPending: true,
      mode: null,
    }));

    expect(model.visible).toBe(true);
    expect(model.tone).toBe("progress");
    expect(model.compactLabel).toBe("변경 동기화 중");
  });
});
