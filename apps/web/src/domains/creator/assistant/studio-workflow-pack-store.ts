import {
  parseStudioWorkflowPack,
  type StudioWorkflowPack,
} from "./studio-workflow-pack";

import type { SkinToneId } from "./webtoon-color-harmony-assistant";
import type { PerspectiveGuidePreset } from "./webtoon-croquis-pose-guide";
import type { PomodoroMode, WebtoonProductionStage } from "./webtoon-focus-timer";
import type { WebtoonPlatformId } from "./webtoon-platform-spec-validator";
import type { ReaderScrollSpeedProfile } from "./webtoon-scroll-pacing-simulator";

export const CUSTOM_WORKFLOW_PACKS_STORAGE_KEY = "toonstudio:custom-workflow-packs:v1";
const MAX_CUSTOM_PACKS = 24;

export interface WorkflowPackStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function workflowPackStorage(): WorkflowPackStorageLike | null {
  if (typeof globalThis === "undefined") return null;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadCustomStudioWorkflowPacks(
  storage: WorkflowPackStorageLike | null = workflowPackStorage(),
): StudioWorkflowPack[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(CUSTOM_WORKFLOW_PACKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: StudioWorkflowPack[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const normalized = parseStudioWorkflowPack(JSON.stringify(item));
      if (normalized && !seen.has(normalized.id)) {
        seen.add(normalized.id);
        valid.push(normalized);
      }
    }
    return valid.slice(0, MAX_CUSTOM_PACKS);
  } catch {
    return [];
  }
}

export function saveCustomStudioWorkflowPack(
  pack: StudioWorkflowPack,
  storage: WorkflowPackStorageLike | null = workflowPackStorage(),
): StudioWorkflowPack[] {
  const existing = loadCustomStudioWorkflowPacks(storage).filter((entry) => entry.id !== pack.id);
  const next = [pack, ...existing].slice(0, MAX_CUSTOM_PACKS);
  if (storage) {
    try {
      storage.setItem(CUSTOM_WORKFLOW_PACKS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 저장소 용량 초과나 프라이빗 모드에서는 메모리 목록만 반환한다.
    }
  }
  return next;
}

export function deleteCustomStudioWorkflowPack(
  packId: string,
  storage: WorkflowPackStorageLike | null = workflowPackStorage(),
): StudioWorkflowPack[] {
  const next = loadCustomStudioWorkflowPacks(storage).filter((entry) => entry.id !== packId);
  if (storage) {
    try {
      storage.setItem(CUSTOM_WORKFLOW_PACKS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 저장 불가 환경에서는 조용히 무시한다.
    }
  }
  return next;
}

export function buildWorkflowPackFromAssistantState(input: {
  readonly name: string;
  readonly genre?: string;
  readonly platformId: WebtoonPlatformId;
  readonly skinToneId: SkinToneId;
  readonly perspectivePreset: PerspectiveGuidePreset;
  readonly focusStage: WebtoonProductionStage;
  readonly focusPreset: PomodoroMode;
  readonly readerSpeed: ReaderScrollSpeedProfile;
  readonly nowMs?: number;
}): StudioWorkflowPack {
  const trimmedName = input.name.trim() || "내 커스텀 제작 팩";
  const slug = trimmedName
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const timestamp = input.nowMs ?? Date.now();
  return {
    schemaVersion: 1,
    id: `custom-${slug || "pack"}-${timestamp.toString(36)}`,
    name: trimmedName,
    genre: input.genre?.trim() || "커스텀",
    summary: "현재 보조 센터의 플랫폼·피부톤·투시·타이머·페이싱 세팅을 저장한 사용자 팩입니다.",
    platformId: input.platformId,
    skinToneId: input.skinToneId,
    perspectivePreset: input.perspectivePreset,
    focusStage: input.focusStage,
    focusPreset: input.focusPreset,
    readerSpeed: input.readerSpeed,
    rightsBom: [{ assetLabel: "작가 커스텀 워크플로우 프리셋", license: "COMMERCIAL" }],
  };
}
