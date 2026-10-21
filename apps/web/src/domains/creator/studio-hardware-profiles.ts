/**
 * 하드웨어 컨트롤러 프로필 프리셋 + 명령 묶음 내보내기 (B7).
 *
 * `studio-hardware-bridge.ts`가 명령 카탈로그를 로컬 브리지로 노출하는 층이라면,
 * 이 모듈은 그 위에 얹는 "바로 쓸 수 있는 배치" 층이다.
 *
 * - TourBox 프리셋: 다이얼(브러시 크기)·놉(불투명도)·버튼(도구·편집)에 실제
 *   카탈로그 명령 id를 배치한다. TourBox 콘솔은 단축키/명령 매핑을 슬롯 단위로
 *   받으므로 슬롯 id를 안정 문자열로 고정한다.
 * - Stream Deck 프리셋: 3행 × 5열 = 15키 그리드에 명령을 배치하고, 각 키에
 *   아이콘 텍스트(라벨 약어)와 카탈로그 단축키를 함께 싣는다.
 * - 명령 묶음(bundle) 내보내기: 자주 쓰는 명령 집합을 JSON 한 파일로 내보낸다.
 *   내보내기는 카탈로그를 다시 대조해 "실행 가능"한 명령만 남기고, 빠진 id와
 *   실행 불가 id를 dropped로 명시한다 — 존재하지 않는 명령을 조용히 넣지 않는다.
 *
 * 프리셋 명령은 실카탈로그 대조로 고른다: 예를 들어 `file.save-draft`(초안 저장)는
 * 카탈로그가 advertised-only로 표시해 브리지 실행이 거부되므로 프리셋에 넣지 않고,
 * 실행 가능한 `file.checkpoints`·`file.export-backup`으로 대체했다.
 *
 * 모든 산출물은 JSON-safe 순수 데이터다. 실제 기기 전용 소프트웨어(TourBox
 * Console, Stream Deck 앱)가 이 JSON을 각자 포맷으로 변환해 가져가는 것을
 * 전제로 하며, 이 모듈은 기기 드라이버를 포함하지 않는다.
 */

import type { StudioCommandCatalogEntry } from "./studio-command-catalog";
import type { CommandId } from "@toonstudio/studio-command-registry";

import {
  buildHardwareBridgeManifest,
  isHardwareBridgeExecutable,
  STUDIO_HARDWARE_BRIDGE_PROTOCOL,
  STUDIO_HARDWARE_BRIDGE_VERSION,
  type StudioHardwareBridgeCommand,
} from "./studio-hardware-bridge";

/* ------------------------------------------------------------------ 공통 */

export type StudioHardwareProfileDevice = "tourbox" | "stream-deck";

export interface StudioHardwareProfileSlot {
  /** 기기 안에서 안정적인 슬롯 식별자 (예: "dial", "key-1-3"). */
  readonly slot: string;
  /** 슬롯의 물리 종류. dial/knob은 증감 쌍 명령을 받는다. */
  readonly kind: "dial" | "knob" | "button" | "key";
  readonly labelKo: string;
  readonly labelEn: string;
  /** 단일 명령 슬롯의 명령 id. dial/knob에서는 비어 있고 increase/decrease를 쓴다. */
  readonly commandId?: CommandId;
  readonly increaseCommandId?: CommandId;
  readonly decreaseCommandId?: CommandId;
}

export interface StudioHardwareProfile {
  readonly id: string;
  readonly device: StudioHardwareProfileDevice;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly descriptionKo: string;
  readonly slots: readonly StudioHardwareProfileSlot[];
}

/** 프로필 슬롯이 참조하는 모든 명령 id (순서 유지, 중복 제거). */
export function hardwareProfileCommandIds(
  profile: StudioHardwareProfile,
): readonly CommandId[] {
  const seen = new Set<CommandId>();
  const ids: CommandId[] = [];
  for (const slot of profile.slots) {
    for (const id of [slot.commandId, slot.increaseCommandId, slot.decreaseCommandId]) {
      if (id !== undefined && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return Object.freeze(ids);
}

/* ------------------------------------------------------------------ TourBox */

/**
 * TourBox 기본 프리셋 — 그리기 중심 배치.
 * 다이얼 = 브러시 크기 증감, 놉 = 브러시 불투명도 단계, 버튼 = 도구·편집 핵심.
 * 참조 id는 전부 실카탈로그(`studio-command-catalog-base.ts`)에 존재하는 항목이다.
 */
const TOURBOX_SLOTS: readonly StudioHardwareProfileSlot[] = Object.freeze([
    { slot: "dial", kind: "dial", labelKo: "브러시 크기", labelEn: "Brush size", increaseCommandId: "brush.size-increase", decreaseCommandId: "brush.size-decrease" },
    // 불투명도는 카탈로그에서 양방향 스텝 명령(⌥[ · ⌥]) 하나로 선언돼 있어 단일 commandId로 둔다.
    { slot: "knob", kind: "knob", labelKo: "브러시 불투명도", labelEn: "Brush opacity", commandId: "brush.opacity-step" },
    { slot: "button-tall", kind: "button", labelKo: "실행취소", labelEn: "Undo", commandId: "edit.undo" },
    { slot: "button-short", kind: "button", labelKo: "다시실행", labelEn: "Redo", commandId: "edit.redo" },
    { slot: "button-top", kind: "button", labelKo: "펜", labelEn: "Pen", commandId: "tool.pen" },
    { slot: "button-side-1", kind: "button", labelKo: "지우개", labelEn: "Eraser", commandId: "tool.eraser" },
    { slot: "button-side-2", kind: "button", labelKo: "채우기", labelEn: "Fill", commandId: "tool.fill" },
    { slot: "button-c1", kind: "button", labelKo: "스포이트", labelEn: "Eyedropper", commandId: "tool.eyedropper" },
    { slot: "button-c2", kind: "button", labelKo: "앞뒤 색 교체", labelEn: "Swap colours", commandId: "color.swap-primary-secondary" },
    { slot: "dial-press", kind: "button", labelKo: "캔버스 좌우 반전", labelEn: "Flip canvas", commandId: "view.flip-horizontal" },
    { slot: "knob-press", kind: "button", labelKo: "브러시 프리셋", labelEn: "Brush presets", commandId: "brush.preset-browser" },
    { slot: "tour-press", kind: "button", labelKo: "백업", labelEn: "Backup", commandId: "file.export-backup" },
]);

export const STUDIO_TOURBOX_DRAWING_PROFILE: StudioHardwareProfile = Object.freeze({
  id: "tourbox-drawing",
  device: "tourbox",
  nameKo: "TourBox · 그리기 기본",
  nameEn: "TourBox · Drawing basics",
  descriptionKo: "다이얼로 브러시 크기를, 버튼으로 도구와 실행취소를 오가는 그리기 기본 배치입니다.",
  slots: TOURBOX_SLOTS,
});

/* ------------------------------------------------------------------ Stream Deck */

/** Stream Deck 15키(3×5) 프리셋 한 키. iconText는 키 아이콘에 얹을 짧은 표기다. */
export interface StudioStreamDeckKey extends StudioHardwareProfileSlot {
  readonly kind: "key";
  readonly row: number;
  readonly column: number;
  readonly iconText: string;
  readonly commandId: CommandId;
}

export interface StudioStreamDeckProfile extends Omit<StudioHardwareProfile, "slots"> {
  readonly device: "stream-deck";
  readonly rows: 3;
  readonly columns: 5;
  readonly slots: readonly StudioStreamDeckKey[];
}

function deckKey(
  row: number,
  column: number,
  iconText: string,
  labelKo: string,
  labelEn: string,
  commandId: CommandId,
): StudioStreamDeckKey {
  return Object.freeze({
    slot: `key-${row}-${column}`,
    kind: "key",
    row,
    column,
    iconText,
    labelKo,
    labelEn,
    commandId,
  });
}

export const STUDIO_STREAM_DECK_PRODUCTION_PROFILE: StudioStreamDeckProfile = Object.freeze({
  id: "stream-deck-production",
  device: "stream-deck",
  nameKo: "Stream Deck · 제작 기본",
  nameEn: "Stream Deck · Production basics",
  descriptionKo: "저장·내보내기부터 도구·레이어·협업 검수까지 제작 흐름 순서로 배치한 15키 프리셋입니다.",
  rows: 3,
  columns: 5,
  slots: Object.freeze([
    deckKey(1, 1, "기록", "저장 기록", "Save checkpoints", "file.checkpoints"),
    deckKey(1, 2, "보내기", "내보내기", "Export", "file.export"),
    deckKey(1, 3, "취소", "실행취소", "Undo", "edit.undo"),
    deckKey(1, 4, "재실행", "다시실행", "Redo", "edit.redo"),
    deckKey(1, 5, "전체", "전체 화면", "Fullscreen", "view.fullscreen"),
    deckKey(2, 1, "펜", "펜", "Pen", "tool.pen"),
    deckKey(2, 2, "지우개", "지우개", "Eraser", "tool.eraser"),
    deckKey(2, 3, "채우기", "채우기", "Fill", "tool.fill"),
    deckKey(2, 4, "스포이트", "스포이트", "Eyedropper", "tool.eyedropper"),
    deckKey(2, 5, "변형", "변형", "Transform", "tool.transform"),
    deckKey(3, 1, "레이어+", "새 레이어", "New layer", "layer.new-raster"),
    deckKey(3, 2, "병합", "아래와 병합", "Merge down", "layer.merge-down"),
    deckKey(3, 3, "말풍선", "말풍선 넣기", "Add balloon", "insert.balloon"),
    deckKey(3, 4, "댓글", "협업 댓글", "Comments", "collaboration.comments"),
    deckKey(3, 5, "검수", "페이지 검수", "Page review", "collaboration.page-review"),
  ]),
});

export const STUDIO_HARDWARE_PROFILE_PRESETS: readonly StudioHardwareProfile[] = Object.freeze([
  STUDIO_TOURBOX_DRAWING_PROFILE,
  STUDIO_STREAM_DECK_PRODUCTION_PROFILE,
]);

/* ------------------------------------------------------------------ 프로필 검증·직렬화 */

export interface StudioHardwareProfileIssue {
  readonly slot: string;
  readonly commandId: string;
  readonly reason: "unknown-command" | "not-executable" | "duplicate-slot" | "empty-profile";
}

/**
 * 프로필이 실카탈로그와 맞는지 검증한다. 기기를 연결하기 전에 프리셋이
 * 낡았는지(명령 삭제·실행 경로 소실)를 화면에서 알려주기 위한 순수 검사.
 */
export function validateHardwareProfile(
  profile: StudioHardwareProfile,
  catalog: readonly StudioCommandCatalogEntry[],
): readonly StudioHardwareProfileIssue[] {
  const issues: StudioHardwareProfileIssue[] = [];
  const byId = new Map(catalog.map((entry) => [entry.id as string, entry]));
  const seenSlots = new Set<string>();
  if (profile.slots.length === 0) {
    issues.push({ slot: "", commandId: "", reason: "empty-profile" });
  }
  for (const slot of profile.slots) {
    if (seenSlots.has(slot.slot)) {
      issues.push({ slot: slot.slot, commandId: slot.commandId ?? "", reason: "duplicate-slot" });
    }
    seenSlots.add(slot.slot);
    for (const id of [slot.commandId, slot.increaseCommandId, slot.decreaseCommandId]) {
      if (id === undefined) continue;
      const entry = byId.get(id);
      if (!entry) issues.push({ slot: slot.slot, commandId: id, reason: "unknown-command" });
      else if (!isHardwareBridgeExecutable(entry)) {
        issues.push({ slot: slot.slot, commandId: id, reason: "not-executable" });
      }
    }
  }
  return Object.freeze(issues);
}

export interface StudioHardwareProfileExport {
  readonly format: "toonstudio.hardware-profile";
  readonly version: 1;
  readonly bridgeProtocol: string;
  readonly bridgeVersion: number;
  readonly profile: StudioHardwareProfile;
  /** 슬롯이 참조하는 명령의 브리지 매니페스트 항목 (실행 가능 여부 포함). */
  readonly commands: readonly StudioHardwareBridgeCommand[];
  /** 카탈로그에 없어 프로필에서 해석할 수 없는 명령 id. */
  readonly unresolvedCommandIds: readonly string[];
}

/** 프로필 + 참조 명령 매니페스트를 한 JSON으로 묶어 내보낸다. */
export function buildHardwareProfileExport(
  profile: StudioHardwareProfile,
  catalog: readonly StudioCommandCatalogEntry[],
): StudioHardwareProfileExport {
  const manifest = buildHardwareBridgeManifest(catalog);
  const wanted = new Set<string>(hardwareProfileCommandIds(profile));
  const commands = manifest.commands.filter((command) => wanted.has(command.id as string));
  const found = new Set(commands.map((command) => command.id as string));
  return Object.freeze({
    format: "toonstudio.hardware-profile",
    version: 1,
    bridgeProtocol: STUDIO_HARDWARE_BRIDGE_PROTOCOL,
    bridgeVersion: STUDIO_HARDWARE_BRIDGE_VERSION,
    profile,
    commands: Object.freeze(commands),
    unresolvedCommandIds: Object.freeze([...wanted].filter((id) => !found.has(id))),
  });
}

/* ------------------------------------------------------------------ 명령 묶음 내보내기 */

export interface StudioCommandBundleDefinition {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly commandIds: readonly CommandId[];
}

function bundle(
  id: string,
  nameKo: string,
  nameEn: string,
  commandIds: readonly CommandId[],
): StudioCommandBundleDefinition {
  return Object.freeze({ id, nameKo, nameEn, commandIds: Object.freeze([...commandIds]) });
}

/** 자주 쓰는 명령 묶음 프리셋 — 사용자가 골라 통째로 컨트롤러에 내보내는 단위. */
export const STUDIO_COMMAND_BUNDLE_PRESETS: readonly StudioCommandBundleDefinition[] =
  Object.freeze([
    bundle("drawing-essentials", "그리기 필수", "Drawing essentials", [
      "tool.pen",
      "tool.eraser",
      "tool.fill",
      "tool.eyedropper",
      "brush.size-increase",
      "brush.size-decrease",
      "brush.opacity-step",
      "color.swap-primary-secondary",
      "edit.undo",
      "edit.redo",
    ]),
    bundle("finishing-export", "마감·내보내기", "Finishing & export", [
      "file.checkpoints",
      "file.export",
      "file.export-backup",
      "file.publish-preflight",
      "file.publish",
      "view.fullscreen",
    ]),
    bundle("review-collaboration", "검수·협업", "Review & collaboration", [
      "collaboration.comments",
      "collaboration.page-review",
      "collaboration.send-to-compare",
      "collaboration.team",
      "collaboration.ephemeral-board",
    ]),
  ]);

export interface StudioCommandBundleDropped {
  readonly commandId: string;
  readonly reason: "unknown-command" | "not-executable" | "duplicate";
}

export interface StudioCommandBundleExport {
  readonly format: "toonstudio.command-bundle";
  readonly version: 1;
  readonly bundleId: string;
  readonly nameKo: string;
  readonly nameEn: string;
  /** 실행 가능한 명령만, 정의 순서를 유지한다. */
  readonly commands: readonly StudioHardwareBridgeCommand[];
  /** 내보내기에서 빠진 명령과 그 이유 — 조용히 누락하지 않는다. */
  readonly dropped: readonly StudioCommandBundleDropped[];
}

/**
 * 명령 묶음을 내보내기 데이터로 만든다.
 * 알 수 없는 id·중복·실행 불가 명령은 dropped로 명시하고 commands에는 넣지 않는다.
 */
export function buildCommandBundleExport(
  definition: StudioCommandBundleDefinition,
  catalog: readonly StudioCommandCatalogEntry[],
): StudioCommandBundleExport {
  const manifest = buildHardwareBridgeManifest(catalog);
  const byId = new Map(manifest.commands.map((command) => [command.id as string, command]));
  const commands: StudioHardwareBridgeCommand[] = [];
  const dropped: StudioCommandBundleDropped[] = [];
  const seen = new Set<string>();
  for (const id of definition.commandIds) {
    if (seen.has(id)) {
      dropped.push({ commandId: id, reason: "duplicate" });
      continue;
    }
    seen.add(id);
    const command = byId.get(id);
    if (!command) dropped.push({ commandId: id, reason: "unknown-command" });
    else if (!command.executable) dropped.push({ commandId: id, reason: "not-executable" });
    else commands.push(command);
  }
  return Object.freeze({
    format: "toonstudio.command-bundle",
    version: 1,
    bundleId: definition.id,
    nameKo: definition.nameKo,
    nameEn: definition.nameEn,
    commands: Object.freeze(commands),
    dropped: Object.freeze(dropped),
  });
}

/** 내보내기 데이터를 다운로드용 JSON 문자열로 직렬화한다 (왕복 무손실). */
export function serializeHardwareExport(
  value: StudioHardwareProfileExport | StudioCommandBundleExport,
): string {
  return JSON.stringify(value, null, 2);
}
