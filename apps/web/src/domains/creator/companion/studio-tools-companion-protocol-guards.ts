/**
 * Studio multi-display companion message validators, command guard, and surface policy helpers.
 */

import {
  isStudioCompanionReferenceControl,
  isStudioCompanionReferencePreviewFrame,
  isStudioCompanionReferenceProjection,
} from "../studio-companion-reference-projection";
import {
  isStudioCompanionNavigatorFrame,
  isStudioCompanionReviewControl,
  isStudioCompanionReviewProjection,
} from "../studio-companion-review-projection";
import {
  STUDIO_COMPANION_COMMANDS,
  STUDIO_COMPANION_DENSITIES,
  STUDIO_COMPANION_MAX_FUTURE_SKEW_MS,
  STUDIO_COMPANION_MAX_MESSAGE_AGE_MS,
  STUDIO_COMPANION_RECENT_COMMAND_LIMIT,
  STUDIO_COMPANION_SURFACE_IDS,
  STUDIO_COMPANION_TOOL_IDS,
  isStudioCompanionSessionId,
  type StudioCompanionCommandName,
  type StudioCompanionControl,
  type StudioCompanionMessage,
  type StudioCompanionPresentationSafeState,
  type StudioCompanionReferenceColorResult,
  type StudioCompanionSequencedMessage,
  type StudioCompanionSurface,
} from "./studio-tools-companion-protocol-types";

function isPlainStudioCompanionRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasExactStudioCompanionKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  try {
    const ownKeys = Reflect.ownKeys(value);
    return ownKeys.length === expected.length
      && ownKeys.every((key) => typeof key === "string" && expected.includes(key));
  } catch {
    return false;
  }
}

function studioCompanionExactOwnData(
  value: unknown,
  expected: readonly string[]
): Readonly<Record<string, unknown>> | null {
  if (!isPlainStudioCompanionRecord(value) || !hasExactStudioCompanionKeys(value, expected)) {
    return null;
  }
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of expected) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function isStudioCompanionReferenceColorResult(
  value: unknown
): value is StudioCompanionReferenceColorResult {
  const result = studioCompanionExactOwnData(value, [
    "generation",
    "revision",
    "referenceRevision",
    "sequence",
    "color",
  ]);
  return result !== null
    && typeof result.generation === "number"
    && Number.isSafeInteger(result.generation)
    && result.generation > 0
    && typeof result.revision === "number"
    && Number.isSafeInteger(result.revision)
    && result.revision > 0
    && typeof result.referenceRevision === "number"
    && Number.isSafeInteger(result.referenceRevision)
    && result.referenceRevision > 0
    && typeof result.sequence === "number"
    && Number.isSafeInteger(result.sequence)
    && result.sequence > 0
    && typeof result.color === "string"
    && /^#[\da-f]{6}(?:[\da-f]{2})?$/iu.test(result.color);
}

export function isStudioCompanionPresentationSafeState(
  value: unknown
): value is StudioCompanionPresentationSafeState {
  const state = studioCompanionExactOwnData(value, [
    "enabled",
    "clock",
    "writerInstanceId",
    "mutationId",
  ]);
  return state !== null
    && typeof state.enabled === "boolean"
    && typeof state.clock === "number"
    && Number.isSafeInteger(state.clock)
    && state.clock > 0
    && isStudioCompanionSessionId(state.writerInstanceId)
    && isStudioCompanionSessionId(state.mutationId);
}

export function isStudioCompanionControl(value: unknown): value is StudioCompanionControl {
  return isStudioCompanionReviewControl(value) || isStudioCompanionReferenceControl(value);
}

export function isStudioCompanionMessage(value: unknown): value is StudioCompanionMessage {
  if (!isPlainStudioCompanionRecord(value)) return false;
  const msg = value;
  if (
    msg.v !== 1
    || typeof msg.type !== "string"
    || typeof msg.at !== "number"
    || !Number.isSafeInteger(msg.at)
    || msg.at < 0
  ) return false;
  switch (msg.type) {
    case "hello":
      if (msg.role === "primary") {
        return hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "role",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "at",
        ])
          && isStudioCompanionSessionId(msg.primaryInstanceId)
          && (
            msg.targetCompanionInstanceId === null
            || isStudioCompanionSessionId(msg.targetCompanionInstanceId)
          );
      }
      if (msg.role === "companion") {
        const legacyKeys = [
          "v",
          "type",
          "role",
          "companionInstanceId",
          "targetPrimaryInstanceId",
          "at",
        ] as const;
        const surfaceKeys = [...legacyKeys.slice(0, -1), "view", "at"] as const;
        return (
          hasExactStudioCompanionKeys(msg, legacyKeys)
          || (
            hasExactStudioCompanionKeys(msg, surfaceKeys)
            && typeof msg.view === "string"
            && STUDIO_COMPANION_SURFACE_IDS.has(msg.view)
          )
        )
          && isStudioCompanionSessionId(msg.companionInstanceId)
          && (
            msg.targetPrimaryInstanceId === null
            || isStudioCompanionSessionId(msg.targetPrimaryInstanceId)
          );
      }
      return false;
    case "primary-state":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "tool",
          "density",
          "canvasOnly",
          "title",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && typeof msg.tool === "string"
        && STUDIO_COMPANION_TOOL_IDS.has(msg.tool)
        && typeof msg.density === "string"
        && STUDIO_COMPANION_DENSITIES.has(msg.density)
        && typeof msg.canvasOnly === "boolean"
        && typeof msg.title === "string"
        && msg.title.length <= 120
        && !/[\0\r\n]/u.test(msg.title)
      );
    case "companion-command":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "command",
          "companionInstanceId",
          "targetPrimaryInstanceId",
          "commandId",
          "sequence",
          "at",
        ])
        && typeof msg.command === "string"
        && STUDIO_COMPANION_COMMANDS.has(msg.command)
        && isStudioCompanionSessionId(msg.companionInstanceId)
        && isStudioCompanionSessionId(msg.targetPrimaryInstanceId)
        && isStudioCompanionSessionId(msg.commandId)
        && typeof msg.sequence === "number"
        && Number.isSafeInteger(msg.sequence)
        && msg.sequence > 0
      );
    case "primary-review-state":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "generation",
          "projection",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && typeof msg.generation === "number"
        && Number.isSafeInteger(msg.generation)
        && msg.generation > 0
        && isStudioCompanionReviewProjection(msg.projection)
      );
    case "navigator-frame":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "generation",
          "revision",
          "sequence",
          "width",
          "height",
          "blob",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && isStudioCompanionNavigatorFrame({
          generation: msg.generation,
          revision: msg.revision,
          sequence: msg.sequence,
          width: msg.width,
          height: msg.height,
          blob: msg.blob,
        })
      );
    case "primary-reference-state":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "generation",
          "projection",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && typeof msg.generation === "number"
        && Number.isSafeInteger(msg.generation)
        && msg.generation > 0
        && isStudioCompanionReferenceProjection(msg.projection)
        && msg.projection.generation === msg.generation
      );
    case "reference-preview-frame":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "generation",
          "revision",
          "referenceRevision",
          "sequence",
          "width",
          "height",
          "blob",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && isStudioCompanionReferencePreviewFrame({
          generation: msg.generation,
          revision: msg.revision,
          referenceRevision: msg.referenceRevision,
          sequence: msg.sequence,
          width: msg.width,
          height: msg.height,
          blob: msg.blob,
        })
      );
    case "reference-color-result":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "generation",
          "revision",
          "referenceRevision",
          "sequence",
          "color",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && isStudioCompanionReferenceColorResult({
          generation: msg.generation,
          revision: msg.revision,
          referenceRevision: msg.referenceRevision,
          sequence: msg.sequence,
          color: msg.color,
        })
      );
    case "companion-presentation-safe":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "companionInstanceId",
          "targetCompanionInstanceId",
          "state",
          "at",
        ])
        && isStudioCompanionSessionId(msg.companionInstanceId)
        && (
          msg.targetCompanionInstanceId === null
          || isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        )
        && isStudioCompanionPresentationSafeState(msg.state)
      );
    case "companion-control":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "control",
          "generation",
          "companionInstanceId",
          "targetPrimaryInstanceId",
          "commandId",
          "sequence",
          "at",
        ])
        && isStudioCompanionControl(msg.control)
        && typeof msg.generation === "number"
        && Number.isSafeInteger(msg.generation)
        && msg.generation > 0
        && isStudioCompanionSessionId(msg.companionInstanceId)
        && isStudioCompanionSessionId(msg.targetPrimaryInstanceId)
        && isStudioCompanionSessionId(msg.commandId)
        && typeof msg.sequence === "number"
        && Number.isSafeInteger(msg.sequence)
        && msg.sequence > 0
      );
    case "ping":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "companionInstanceId",
          "targetPrimaryInstanceId",
          "nonce",
          "at",
        ])
        && isStudioCompanionSessionId(msg.companionInstanceId)
        && isStudioCompanionSessionId(msg.targetPrimaryInstanceId)
        && isStudioCompanionSessionId(msg.nonce)
      );
    case "pong":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "nonce",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && isStudioCompanionSessionId(msg.nonce)
      );
    case "companion-goodbye":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "companionInstanceId",
          "targetPrimaryInstanceId",
          "surface",
          "at",
        ])
        && isStudioCompanionSessionId(msg.companionInstanceId)
        && isStudioCompanionSessionId(msg.targetPrimaryInstanceId)
        && typeof msg.surface === "string"
        && STUDIO_COMPANION_SURFACE_IDS.has(msg.surface)
      );
    case "primary-goodbye":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "surface",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && typeof msg.surface === "string"
        && STUDIO_COMPANION_SURFACE_IDS.has(msg.surface)
      );
    default:
      return false;
  }
}

export function isStudioCompanionMessageFresh(
  message: Pick<StudioCompanionMessage, "at">,
  now = Date.now()
): boolean {
  if (!Number.isFinite(now)) return false;
  return (
    now - message.at <= STUDIO_COMPANION_MAX_MESSAGE_AGE_MS
    && message.at - now <= STUDIO_COMPANION_MAX_FUTURE_SKEW_MS
  );
}

export class StudioCompanionCommandGuard {
  private companionInstanceId: string | null = null;
  private lastSequence = 0;
  private readonly recentCommandIds = new Set<string>();
  private readonly recentCommandOrder: string[] = [];

  bindCompanion(companionInstanceId: string): void {
    if (this.companionInstanceId === companionInstanceId) return;
    this.companionInstanceId = companionInstanceId;
    this.lastSequence = 0;
    this.recentCommandIds.clear();
    this.recentCommandOrder.length = 0;
  }

  reset(): void {
    this.companionInstanceId = null;
    this.lastSequence = 0;
    this.recentCommandIds.clear();
    this.recentCommandOrder.length = 0;
  }

  accept(message: StudioCompanionSequencedMessage, expected: {
    primaryInstanceId: string;
    companionInstanceId: string;
    now?: number;
  }): boolean {
    if (this.companionInstanceId !== expected.companionInstanceId) return false;
    if (message.targetPrimaryInstanceId !== expected.primaryInstanceId) return false;
    if (message.companionInstanceId !== expected.companionInstanceId) return false;
    if (!isStudioCompanionMessageFresh(message, expected.now ?? Date.now())) return false;
    if (message.sequence <= this.lastSequence) return false;
    if (this.recentCommandIds.has(message.commandId)) return false;

    this.lastSequence = message.sequence;
    this.recentCommandIds.add(message.commandId);
    this.recentCommandOrder.push(message.commandId);
    while (this.recentCommandOrder.length > STUDIO_COMPANION_RECENT_COMMAND_LIMIT) {
      const expired = this.recentCommandOrder.shift();
      if (expired) this.recentCommandIds.delete(expired);
    }
    return true;
  }

  snapshot(): {
    companionInstanceId: string | null;
    lastSequence: number;
    recentCommandCount: number;
  } {
    return {
      companionInstanceId: this.companionInstanceId,
      lastSequence: this.lastSequence,
      recentCommandCount: this.recentCommandIds.size,
    };
  }
}

export type StudioCompanionBindingSnapshot = {
  surface: StudioCompanionSurface;
  companionInstanceId: string;
  generation: number;
  lastActivityAt: number;
};

export type StudioCompanionBindingSlot = StudioCompanionBindingSnapshot & {
  commandGuard: StudioCompanionCommandGuard;
  referencePickRevision: number;
  referencePickSequence: number;
};

export function studioCompanionSurfaceForHello(
  message: Extract<StudioCompanionMessage, { type: "hello"; role: "companion" }>
): StudioCompanionSurface {
  return message.view ?? "workspace";
}

export function isStudioCompanionCommandAllowed(
  surface: StudioCompanionSurface,
  command: StudioCompanionCommandName
): boolean {
  return surface === "workspace" || command === "focus-primary";
}

export function isStudioCompanionControlAllowed(
  surface: StudioCompanionSurface,
  control: StudioCompanionControl
): boolean {
  if (surface === "workspace") return true;
  if (surface === "navigator") {
    return control.kind === "navigator-demand" || control.kind === "navigate";
  }
  if (surface === "reference") return isStudioCompanionReferenceControl(control);
  return control.kind === "select-layer"
    || control.kind === "history"
    || control.kind === "comment-focus"
    || control.kind === "brush";
}

export function canAcceptStudioCompanionReferencePick(
  slot: StudioCompanionBindingSlot,
  control: StudioCompanionControl
): boolean {
  if (control.kind !== "reference-pick-color") return true;
  return control.referenceRevision > slot.referencePickRevision
    || (
      control.referenceRevision === slot.referencePickRevision
      && control.sequence > slot.referencePickSequence
    );
}

export function commitStudioCompanionReferencePick(
  slot: StudioCompanionBindingSlot,
  control: StudioCompanionControl
): void {
  if (control.kind !== "reference-pick-color") return;
  slot.referencePickRevision = control.referenceRevision;
  slot.referencePickSequence = control.sequence;
}
