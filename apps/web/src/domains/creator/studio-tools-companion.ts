/**
 * Studio multi-display companion protocol — pure helpers + BroadcastChannel contract.
 *
 * Primary editor owns document/undo. Companion is a tools-only window (palette + density
 * + open menus) that mirrors ephemeral UI intent over same-origin BroadcastChannel.
 * Not a CRDT — no document merge.
 */

import {
  STUDIO_COMPANION_DENSITIES,
  STUDIO_COMPANION_MAX_FUTURE_SKEW_MS,
  STUDIO_COMPANION_MAX_MESSAGE_AGE_MS,
  STUDIO_COMPANION_PRIMARY_BINDING_LEASE_MS,
  STUDIO_COMPANION_RECENT_COMMAND_LIMIT,
  STUDIO_COMPANION_SESSION_QUERY,
  STUDIO_COMPANION_SURFACES,
  STUDIO_COMPANION_SURFACE_IDS,
  STUDIO_COMPANION_TOOL_IDS,
  STUDIO_COMPANION_TOOL_LABELS,
  STUDIO_COMPANION_TOOL_LABEL_KEYS,
  STUDIO_COMPANION_TOOL_ORDER,
  STUDIO_COMPANION_VIEW_QUERY,
  STUDIO_COMPANION_WINDOW_FEATURES_BY_SURFACE,
  STUDIO_TOOLS_COMPANION_CHANNEL,
  STUDIO_TOOLS_COMPANION_WINDOW_FEATURES,
  STUDIO_TOOLS_COMPANION_WINDOW_NAME,
  createStudioCompanionCommandId,
  createStudioCompanionSessionId,
  isStudioCompanionSessionId,
  parseStudioCompanionDocumentScope,
  parseStudioCompanionSurface,
  parseStudioCompanionView,
  requireStudioCompanionSessionId,
  studioCompanionPrimaryScope,
  type StudioCompanionCommandMessage,
  type StudioCompanionCommandName,
  type StudioCompanionControl,
  type StudioCompanionControlMessage,
  type StudioCompanionDensity,
  type StudioCompanionDocumentScope,
  type StudioCompanionGoodbyeMessage,
  type StudioCompanionHelloInput,
  type StudioCompanionI18n,
  type StudioCompanionMessage,
  type StudioCompanionPresentationSafeMessage,
  type StudioCompanionPresentationSafeState,
  type StudioCompanionReferenceColorResult,
  type StudioCompanionReferenceColorResultMessage,
  type StudioCompanionReferencePreviewFrameMessage,
  type StudioCompanionReferenceStateMessage,
  type StudioCompanionRole,
  type StudioCompanionSequencedMessage,
  type StudioCompanionSurface,
  type StudioCompanionToolId,
  type StudioCompanionView,
} from "./companion/studio-tools-companion-protocol-types";
import {
  StudioCompanionCommandGuard,
  canAcceptStudioCompanionReferencePick,
  commitStudioCompanionReferencePick,
  isStudioCompanionCommandAllowed,
  isStudioCompanionControl,
  isStudioCompanionControlAllowed,
  isStudioCompanionMessage,
  isStudioCompanionMessageFresh,
  isStudioCompanionPresentationSafeState,
  isStudioCompanionReferenceColorResult,
  studioCompanionSurfaceForHello,
  type StudioCompanionBindingSlot,
  type StudioCompanionBindingSnapshot,
} from "./companion/studio-tools-companion-protocol-guards";

export {
  captureStudioCompanionNavigatorFrame,
  createStudioCompanionReviewProjection,
  createStudioCompanionReviewProjectionFromSource,
  encodeStudioCompanionNavigatorWebp,
  planStudioCompanionExternalScreenPlacement,
} from "./studio-companion-review-projection";
export {
  isStudioCompanionReferenceControl,
  isStudioCompanionReferencePreviewFrame,
  isStudioCompanionReferenceProjection,
} from "./studio-companion-reference-projection";
export type {
  StudioCompanionReferenceControl,
  StudioCompanionReferencePreviewFrame,
  StudioCompanionReferenceProjection,
} from "./studio-companion-reference-projection";

export {
  STUDIO_COMPANION_DENSITIES,
  STUDIO_COMPANION_MAX_FUTURE_SKEW_MS,
  STUDIO_COMPANION_MAX_MESSAGE_AGE_MS,
  STUDIO_COMPANION_PRIMARY_BINDING_LEASE_MS,
  STUDIO_COMPANION_RECENT_COMMAND_LIMIT,
  STUDIO_COMPANION_SESSION_QUERY,
  STUDIO_COMPANION_SURFACES,
  STUDIO_COMPANION_SURFACE_IDS,
  STUDIO_COMPANION_TOOL_IDS,
  STUDIO_COMPANION_TOOL_LABELS,
  STUDIO_COMPANION_TOOL_LABEL_KEYS,
  STUDIO_COMPANION_TOOL_ORDER,
  STUDIO_COMPANION_VIEW_QUERY,
  STUDIO_COMPANION_WINDOW_FEATURES_BY_SURFACE,
  STUDIO_TOOLS_COMPANION_CHANNEL,
  STUDIO_TOOLS_COMPANION_WINDOW_FEATURES,
  STUDIO_TOOLS_COMPANION_WINDOW_NAME,
  StudioCompanionCommandGuard,
  canAcceptStudioCompanionReferencePick,
  commitStudioCompanionReferencePick,
  createStudioCompanionCommandId,
  createStudioCompanionSessionId,
  isStudioCompanionCommandAllowed,
  isStudioCompanionControl,
  isStudioCompanionControlAllowed,
  isStudioCompanionMessage,
  isStudioCompanionMessageFresh,
  isStudioCompanionPresentationSafeState,
  isStudioCompanionReferenceColorResult,
  isStudioCompanionSessionId,
  parseStudioCompanionDocumentScope,
  parseStudioCompanionSurface,
  parseStudioCompanionView,
  requireStudioCompanionSessionId,
  studioCompanionPrimaryScope,
  studioCompanionSurfaceForHello,
  type StudioCompanionBindingSlot,
  type StudioCompanionBindingSnapshot,
  type StudioCompanionCommandMessage,
  type StudioCompanionCommandName,
  type StudioCompanionControl,
  type StudioCompanionControlMessage,
  type StudioCompanionDensity,
  type StudioCompanionDocumentScope,
  type StudioCompanionGoodbyeMessage,
  type StudioCompanionHelloInput,
  type StudioCompanionI18n,
  type StudioCompanionMessage,
  type StudioCompanionPresentationSafeMessage,
  type StudioCompanionPresentationSafeState,
  type StudioCompanionReferenceColorResult,
  type StudioCompanionReferenceColorResultMessage,
  type StudioCompanionReferencePreviewFrameMessage,
  type StudioCompanionReferenceStateMessage,
  type StudioCompanionRole,
  type StudioCompanionSequencedMessage,
  type StudioCompanionSurface,
  type StudioCompanionToolId,
  type StudioCompanionView,
};

export function buildStudioCompanionCommand(
  input: {
    command: StudioCompanionCommandName;
    companionInstanceId: string;
    targetPrimaryInstanceId: string;
    commandId: string;
    sequence: number;
  },
  now = Date.now()
): StudioCompanionCommandMessage {
  return {
    v: 1,
    type: "companion-command",
    command: input.command,
    companionInstanceId: input.companionInstanceId,
    targetPrimaryInstanceId: input.targetPrimaryInstanceId,
    commandId: input.commandId,
    sequence: input.sequence,
    at: now,
  };
}

export function buildStudioCompanionControl(
  input: {
    control: StudioCompanionControl;
    generation: number;
    companionInstanceId: string;
    targetPrimaryInstanceId: string;
    commandId: string;
    sequence: number;
  },
  now = Date.now()
): StudioCompanionControlMessage {
  return {
    v: 1,
    type: "companion-control",
    control: input.control,
    generation: input.generation,
    companionInstanceId: input.companionInstanceId,
    targetPrimaryInstanceId: input.targetPrimaryInstanceId,
    commandId: input.commandId,
    sequence: input.sequence,
    at: now,
  };
}

export function buildStudioCompanionPresentationSafe(input: {
  companionInstanceId: string;
  targetCompanionInstanceId: string | null;
  state: StudioCompanionPresentationSafeState;
  now?: number;
}): StudioCompanionPresentationSafeMessage {
  return {
    v: 1,
    type: "companion-presentation-safe",
    companionInstanceId: input.companionInstanceId,
    targetCompanionInstanceId: input.targetCompanionInstanceId,
    state: Object.freeze({ ...input.state }),
    at: input.now ?? Date.now(),
  };
}

export function buildStudioCompanionPing(input: {
  companionInstanceId: string;
  targetPrimaryInstanceId: string;
  nonce: string;
}, now = Date.now()): Extract<StudioCompanionMessage, { type: "ping" }> {
  return { v: 1, type: "ping", ...input, at: now };
}

export function buildStudioCompanionGoodbye(input: {
  companionInstanceId: string;
  targetPrimaryInstanceId: string;
  surface: StudioCompanionSurface;
}, now = Date.now()): StudioCompanionGoodbyeMessage {
  return { v: 1, type: "companion-goodbye", ...input, at: now };
}

function compareStudioCompanionPresentationSafeState(
  left: StudioCompanionPresentationSafeState,
  right: StudioCompanionPresentationSafeState
): number {
  if (left.clock !== right.clock) return left.clock < right.clock ? -1 : 1;
  if (left.writerInstanceId !== right.writerInstanceId) {
    return left.writerInstanceId < right.writerInstanceId ? -1 : 1;
  }
  if (left.mutationId === right.mutationId) return 0;
  return left.mutationId < right.mutationId ? -1 : 1;
}

/**
 * Companion-only LWW register for presentation-safe state. Primary windows deliberately do not
 * participate. Lamport clock + writer/mutation ids form a deterministic total order, so peer
 * hello snapshots and concurrent updates converge without replaying an already-applied state.
 */
export class StudioCompanionPresentationSafeGuard {
  private companionInstanceId: string | null = null;
  private logicalClock = 0;
  private value: StudioCompanionPresentationSafeState | null = null;

  bind(companionInstanceId: string): boolean {
    if (!isStudioCompanionSessionId(companionInstanceId)) return false;
    if (this.companionInstanceId === companionInstanceId) return true;
    this.companionInstanceId = companionInstanceId;
    this.logicalClock = 0;
    this.value = null;
    return true;
  }

  reset(): void {
    this.companionInstanceId = null;
    this.logicalClock = 0;
    this.value = null;
  }

  write(enabled: boolean, mutationId: string): StudioCompanionPresentationSafeState | null {
    const writerInstanceId = this.companionInstanceId;
    if (
      !writerInstanceId
      || typeof enabled !== "boolean"
      || !isStudioCompanionSessionId(mutationId)
    ) return null;
    this.logicalClock = Math.max(this.logicalClock, this.value?.clock ?? 0) + 1;
    this.value = Object.freeze({
      enabled,
      clock: this.logicalClock,
      writerInstanceId,
      mutationId,
    });
    return this.value;
  }

  /**
   * Restores or merges an exact durable register value without pretending that the local
   * companion authored it. This is also used by the storage event bridge. Keeping the original
   * writer and mutation ids preserves the same total order across window reloads.
   */
  merge(state: unknown): boolean {
    if (!this.companionInstanceId || !isStudioCompanionPresentationSafeState(state)) return false;
    const candidate = Object.freeze({ ...state });
    this.logicalClock = Math.max(this.logicalClock, candidate.clock);
    if (this.value && compareStudioCompanionPresentationSafeState(candidate, this.value) <= 0) {
      return false;
    }
    this.value = candidate;
    return true;
  }

  accept(
    message: StudioCompanionMessage,
    expected: { companionInstanceId: string; now?: number }
  ): boolean {
    if (
      message.type !== "companion-presentation-safe"
      || !isStudioCompanionMessage(message)
      || this.companionInstanceId !== expected.companionInstanceId
      || message.companionInstanceId === expected.companionInstanceId
      || (
        message.targetCompanionInstanceId !== null
        && message.targetCompanionInstanceId !== expected.companionInstanceId
      )
      || !isStudioCompanionMessageFresh(message, expected.now ?? Date.now())
    ) return false;

    return this.merge(message.state);
  }

  current(): StudioCompanionPresentationSafeState | null {
    return this.value;
  }

  snapshot(): Readonly<{
    companionInstanceId: string | null;
    logicalClock: number;
    state: StudioCompanionPresentationSafeState | null;
  }> {
    return Object.freeze({
      companionInstanceId: this.companionInstanceId,
      logicalClock: this.logicalClock,
      state: this.value,
    });
  }
}

/**
 * Companion-side fence for the view-only Reference stream. The projection is the revision
 * authority; preview and color messages are accepted only for that exact cursor and once per
 * monotonically increasing sequence. A new binding generation resets both sequence fences.
 */
export class StudioCompanionReferenceMessageGuard {
  private primaryInstanceId: string | null = null;
  private companionInstanceId: string | null = null;
  private generation = 0;
  private revision = 0;
  private referenceRevision = 0;
  private frameSequence = 0;
  private colorSequence = 0;

  bind(primaryInstanceId: string, companionInstanceId: string): boolean {
    if (
      !isStudioCompanionSessionId(primaryInstanceId)
      || !isStudioCompanionSessionId(companionInstanceId)
    ) return false;
    if (
      this.primaryInstanceId === primaryInstanceId
      && this.companionInstanceId === companionInstanceId
    ) return true;
    this.primaryInstanceId = primaryInstanceId;
    this.companionInstanceId = companionInstanceId;
    this.resetCursor();
    return true;
  }

  reset(): void {
    this.primaryInstanceId = null;
    this.companionInstanceId = null;
    this.resetCursor();
  }

  acceptState(
    message: StudioCompanionMessage,
    now = Date.now()
  ): message is StudioCompanionReferenceStateMessage {
    if (
      message.type !== "primary-reference-state"
      || !this.matchesRoute(message)
      || !isStudioCompanionMessageFresh(message, now)
    ) return false;

    const { generation, revision, referenceRevision } = message.projection;
    if (generation < this.generation) return false;
    if (generation === this.generation) {
      if (revision < this.revision || referenceRevision < this.referenceRevision) return false;
      if (revision === this.revision && referenceRevision === this.referenceRevision) return false;
    }

    if (generation > this.generation) {
      this.frameSequence = 0;
      this.colorSequence = 0;
    } else if (revision > this.revision || referenceRevision > this.referenceRevision) {
      this.frameSequence = 0;
      this.colorSequence = 0;
    }
    this.generation = generation;
    this.revision = revision;
    this.referenceRevision = referenceRevision;
    return true;
  }

  acceptPreviewFrame(
    message: StudioCompanionMessage,
    now = Date.now()
  ): message is StudioCompanionReferencePreviewFrameMessage {
    if (
      message.type !== "reference-preview-frame"
      || !this.matchesRoute(message)
      || !isStudioCompanionMessageFresh(message, now)
      || !this.matchesCurrentCursor(message)
      || message.sequence <= this.frameSequence
    ) return false;
    this.frameSequence = message.sequence;
    return true;
  }

  acceptColorResult(
    message: StudioCompanionMessage,
    now = Date.now()
  ): message is StudioCompanionReferenceColorResultMessage {
    if (
      message.type !== "reference-color-result"
      || !this.matchesRoute(message)
      || !isStudioCompanionMessageFresh(message, now)
      || !this.matchesCurrentCursor(message)
      || message.sequence <= this.colorSequence
    ) return false;
    this.colorSequence = message.sequence;
    return true;
  }

  snapshot(): Readonly<{
    generation: number;
    revision: number;
    referenceRevision: number;
    frameSequence: number;
    colorSequence: number;
  }> {
    return {
      generation: this.generation,
      revision: this.revision,
      referenceRevision: this.referenceRevision,
      frameSequence: this.frameSequence,
      colorSequence: this.colorSequence,
    };
  }

  private matchesRoute(message: StudioCompanionMessage): boolean {
    if (
      message.type !== "primary-reference-state"
      && message.type !== "reference-preview-frame"
      && message.type !== "reference-color-result"
    ) return false;
    return message.primaryInstanceId === this.primaryInstanceId
      && message.targetCompanionInstanceId === this.companionInstanceId;
  }

  private matchesCurrentCursor(message: StudioCompanionReferencePreviewFrameMessage | StudioCompanionReferenceColorResultMessage): boolean {
    return this.generation > 0
      && message.generation === this.generation
      && message.revision === this.revision
      && message.referenceRevision === this.referenceRevision;
  }

  private resetCursor(): void {
    this.generation = 0;
    this.revision = 0;
    this.referenceRevision = 0;
    this.frameSequence = 0;
    this.colorSequence = 0;
  }
}

export {
  STUDIO_TOOLS_COMPANION_PATH,
  StudioCompanionPrimaryBinding,
  buildStudioCompanionHello,
  buildStudioCompanionNavigatorFrame,
  buildStudioCompanionPong,
  buildStudioCompanionPrimaryGoodbye,
  buildStudioCompanionPrimaryState,
  buildStudioCompanionReferenceColorResult,
  buildStudioCompanionReferencePreviewFrame,
  buildStudioCompanionReferenceState,
  buildStudioCompanionReviewState,
  completeReservedStudioToolsCompanionWindow,
  createStudioCompanionChannel,
  createStudioCompanionInstanceId,
  isStudioToolsCompanionWindowReusable,
  openReadyStudioToolsCompanionForMenu,
  openStudioCompanionSurfaceWindow,
  openStudioToolsCompanionWindow,
  parseStudioCompanionMessage,
  parseStudioCompanionSessionId,
  startStudioCompanionPrimaryRuntime,
  startStudioCompanionPrimaryRuntimeFromSources,
  studioCompanionChannelName,
  studioCompanionDefaultWindowFeatures,
  studioCompanionPrimaryUrl,
  studioCompanionUrl,
  studioCompanionWindowName,
} from "./studio-tools-companion-primary";
export type {
  StudioCompanionChannel,
  StudioCompanionChannelFactory,
  StudioCompanionNavigatorCaptureRequest,
  StudioCompanionPrimaryRuntime,
  StudioCompanionPrimarySnapshot,
  StudioCompanionPrimarySourceRuntimeInput,
  StudioCompanionReferenceCaptureRequest,
  StudioCompanionReferenceColorSampleRequest,
  StudioCompanionReferenceRequester,
} from "./studio-tools-companion-primary";
