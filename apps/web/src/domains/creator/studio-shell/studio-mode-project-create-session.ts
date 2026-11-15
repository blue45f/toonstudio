import { useContext } from "react";
import { UNSAFE_NavigationContext, useLocation } from "react-router-dom";

import type { WebtoonOnboardingSelection } from "@/shared/lib/webtoon-production-onboarding";
import {
  STUDIO_AUXILIARY_WORKSPACE_OPTIONS,
  STUDIO_PROJECT_COLLABORATION_OPTIONS,
  STUDIO_PROJECT_FORMAT_PROFILES,
  STUDIO_PROJECT_PURPOSE_OPTIONS,
  STUDIO_PROJECT_START_POINT_OPTIONS,
} from "../studio-project-format-catalog";
import type {
  StudioProjectCollaboration,
  StudioProjectFormat,
  StudioProjectPurpose,
  StudioProjectStartPoint,
} from "../studio-project-definition";
import type { StudioCreateLane } from "../studio-create-lane";
import type { AuxiliaryKind } from "./studio-mode-project-create-helpers";
import type { StudioCreateStep } from "./useStudioCreateStepFlow";

export interface StudioCreatedWorkReceipt {
  readonly projectId: string;
  readonly documentId: string;
}

export interface StudioCreateSessionDraft {
  readonly formatId: StudioProjectFormat;
  readonly auxiliaryKind: AuxiliaryKind | null;
  readonly templateId: string;
  readonly title: string;
  readonly titleEdited: boolean;
  readonly lane: StudioCreateLane | null;
  readonly startPoint: StudioProjectStartPoint;
  readonly purpose: StudioProjectPurpose;
  readonly collaboration: StudioProjectCollaboration;
  readonly onboardingEnabled: boolean;
  readonly selection: WebtoonOnboardingSelection;
  readonly sizeOverride: { readonly width: string; readonly height: string } | null;
  readonly activeQuickPresetId: string | null;
  readonly step: StudioCreateStep;
  readonly createdReceipt: StudioCreatedWorkReceipt | null;
}

const CREATE_SESSION_STORAGE_PREFIX = "toonstudio:studio-create-session:v1:";
const QUICK_START_SESSION_STORAGE_PREFIX = "toonstudio:studio-quick-start-receipt:v1:";

const memoryNavigatorIds = new WeakMap<object, string>();
let memoryNavigatorSeq = 0;

function getMemoryNavigatorId(navigator: object): string {
  const existing = memoryNavigatorIds.get(navigator);
  if (existing) return existing;
  memoryNavigatorSeq += 1;
  const next = `mem-${memoryNavigatorSeq}`;
  memoryNavigatorIds.set(navigator, next);
  return next;
}

function nextEntryTokenSuffix(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(8);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  memoryNavigatorSeq += 1;
  return `seq-${memoryNavigatorSeq}`;
}

function resolveBrowserEntryToken(locationKey: string): string {
  if (locationKey && locationKey !== "default") return locationKey;
  if (typeof window === "undefined") return "ssr";
  try {
    const rawState = window.history.state;
    const stateRecord = typeof rawState === "object" && rawState !== null
      ? rawState as Record<string, unknown>
      : {};
    if (typeof stateRecord.toonCreateEntryId === "string" && stateRecord.toonCreateEntryId.length > 0) {
      return stateRecord.toonCreateEntryId;
    }
    const generated = `entry-${Date.now().toString(36)}-${nextEntryTokenSuffix()}`;
    if (typeof window.history.replaceState === "function") {
      window.history.replaceState({ ...stateRecord, toonCreateEntryId: generated }, "");
    }
    return generated;
  } catch {
    return locationKey || "default";
  }
}

/**
 * 현재 라우터 히스토리 엔트리의 고유 세션 키를 반환한다.
 * - 브라우저 히스토리에서는 뒤로 가기(`POP`) 시 동일 키가 복원되고 새 진입(`PUSH`) 시 새 키가 발급된다.
 * - 테스트용 `MemoryRouter`에서는 라우터 인스턴스(`navigator`)별로 격리되어 테스트 간 상태 누출이 없다.
 */
export function useStudioHistoryEntrySessionKey(): string {
  const location = useLocation();
  const navigationContext = useContext(UNSAFE_NavigationContext);
  const routeSignature = `${location.pathname}${location.search}`;
  const isRealBrowserLocation = typeof window !== "undefined"
    && window.location.pathname === location.pathname;
  if (isRealBrowserLocation) {
    return `browser:${resolveBrowserEntryToken(location.key)}:${routeSignature}`;
  }
  const navKey = navigationContext?.navigator
    ? getMemoryNavigatorId(navigationContext.navigator)
    : "detached";
  return `${navKey}:${location.key}:${routeSignature}`;
}

function isValidReceipt(value: unknown): value is StudioCreatedWorkReceipt {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.projectId === "string"
    && record.projectId.trim().length > 0
    && typeof record.documentId === "string"
    && record.documentId.trim().length > 0;
}

function isValidCreateStep(value: unknown): value is StudioCreateStep {
  return value === 1 || value === 2 || value === 3;
}

function isValidLane(value: unknown): value is StudioCreateLane | null {
  return value === null
    || value === "idea"
    || value === "storyboard"
    || value === "blank"
    || value === "template";
}

export function readStudioCreateSessionDraft(sessionKey: string): StudioCreateSessionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${CREATE_SESSION_STORAGE_PREFIX}${sessionKey}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const formatValid = STUDIO_PROJECT_FORMAT_PROFILES.some((item) => item.id === record.formatId);
    const auxValid = record.auxiliaryKind === null
      || STUDIO_AUXILIARY_WORKSPACE_OPTIONS.some((item) => item.id === record.auxiliaryKind);
    const startValid = STUDIO_PROJECT_START_POINT_OPTIONS.some((item) => item.id === record.startPoint);
    const purposeValid = STUDIO_PROJECT_PURPOSE_OPTIONS.some((item) => item.id === record.purpose);
    const collabValid = STUDIO_PROJECT_COLLABORATION_OPTIONS.some((item) => item.id === record.collaboration);
    if (
      !formatValid
      || !auxValid
      || !startValid
      || !purposeValid
      || !collabValid
      || typeof record.templateId !== "string"
      || typeof record.title !== "string"
      || typeof record.titleEdited !== "boolean"
      || !isValidLane(record.lane)
      || typeof record.onboardingEnabled !== "boolean"
      || typeof record.selection !== "object"
      || record.selection === null
      || !isValidCreateStep(record.step)
    ) {
      return null;
    }
    const rawSize = record.sizeOverride;
    const sizeOverride = typeof rawSize === "object" && rawSize !== null
      && typeof (rawSize as Record<string, unknown>).width === "string"
      && typeof (rawSize as Record<string, unknown>).height === "string"
      ? {
        width: (rawSize as Record<string, string>).width!,
        height: (rawSize as Record<string, string>).height!,
      }
      : null;
    const selectionRecord = record.selection as Record<string, unknown>;
    if (
      typeof selectionRecord.startingPoint !== "string"
      || typeof selectionRecord.goal !== "string"
      || typeof selectionRecord.teamModel !== "string"
      || typeof selectionRecord.cadence !== "string"
    ) {
      return null;
    }
    return {
      formatId: record.formatId as StudioProjectFormat,
      auxiliaryKind: record.auxiliaryKind as AuxiliaryKind | null,
      templateId: record.templateId,
      title: record.title,
      titleEdited: record.titleEdited,
      lane: record.lane,
      startPoint: record.startPoint as StudioProjectStartPoint,
      purpose: record.purpose as StudioProjectPurpose,
      collaboration: record.collaboration as StudioProjectCollaboration,
      onboardingEnabled: record.onboardingEnabled,
      selection: record.selection as WebtoonOnboardingSelection,
      sizeOverride,
      activeQuickPresetId: typeof record.activeQuickPresetId === "string" ? record.activeQuickPresetId : null,
      step: record.step,
      createdReceipt: isValidReceipt(record.createdReceipt) ? record.createdReceipt : null,
    };
  } catch {
    return null;
  }
}

export function writeStudioCreateSessionDraft(
  sessionKey: string,
  draft: StudioCreateSessionDraft,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${CREATE_SESSION_STORAGE_PREFIX}${sessionKey}`,
      JSON.stringify(draft),
    );
  } catch {
    // sessionStorage 차단·용량 초과 시에도 본 작품 생성 동작은 방해하지 않는다.
  }
}

export function readStudioQuickStartReceipt(
  sessionKey: string,
  itemId: string,
): StudioCreatedWorkReceipt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(
      `${QUICK_START_SESSION_STORAGE_PREFIX}${sessionKey}:${itemId}`,
    );
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidReceipt(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStudioQuickStartReceipt(
  sessionKey: string,
  itemId: string,
  receipt: StudioCreatedWorkReceipt,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${QUICK_START_SESSION_STORAGE_PREFIX}${sessionKey}:${itemId}`,
      JSON.stringify(receipt),
    );
  } catch {
    // sessionStorage 차단 시에도 빠른 시작 본 동작은 유지한다.
  }
}
