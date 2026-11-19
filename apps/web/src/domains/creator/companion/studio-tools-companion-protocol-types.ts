/**
 * Studio multi-display companion protocol types, constants, and scope/session helpers.
 * Extracted into a leaf module so `studio-tools-companion-primary.ts` and
 * `studio-tools-companion.ts` share the protocol without circular imports.
 */

import type {
  StudioCompanionReferenceControl,
  StudioCompanionReferenceProjection,
} from "../studio-companion-reference-projection";
import type {
  StudioCompanionReviewControl,
  StudioCompanionReviewProjection,
} from "../studio-companion-review-projection";
import { isValidStudioWorkspaceWorkId } from "../studio-workspace-route";

export const STUDIO_TOOLS_COMPANION_CHANNEL = "toonstudio.studio.tools-companion.v1";
export const STUDIO_TOOLS_COMPANION_WINDOW_NAME = "toonstudio-studio-tools";
export const STUDIO_TOOLS_COMPANION_WINDOW_FEATURES =
  "popup=yes,width=520,height=820,menubar=no,toolbar=no,location=no,status=no";

export const STUDIO_COMPANION_SURFACES = ["workspace", "navigator", "review", "reference"] as const;
export type StudioCompanionSurface = (typeof STUDIO_COMPANION_SURFACES)[number];
/** @deprecated Use StudioCompanionSurface. */
export type StudioCompanionView = StudioCompanionSurface;

export const STUDIO_COMPANION_WINDOW_FEATURES_BY_SURFACE: Readonly<Record<StudioCompanionSurface, string>> = {
  workspace: STUDIO_TOOLS_COMPANION_WINDOW_FEATURES,
  navigator: "popup=yes,width=390,height=860,menubar=no,toolbar=no,location=no,status=no",
  review: "popup=yes,width=420,height=860,menubar=no,toolbar=no,location=no,status=no",
  reference: "popup=yes,width=420,height=860,menubar=no,toolbar=no,location=no,status=no",
};

export const STUDIO_COMPANION_SESSION_QUERY = "session";
export const STUDIO_COMPANION_VIEW_QUERY = "view";
const STUDIO_COMPANION_SESSION_PATTERN = /^[A-Za-z0-9_-]{12,96}$/u;
const STUDIO_COMPANION_SCOPE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

export type StudioCompanionI18n = (key: string, fallback?: string) => string;

export type StudioCompanionRole = "primary" | "companion";

export type StudioCompanionToolId =
  | "select"
  | "pen"
  | "eraser"
  | "template"
  | "bubble"
  | "text"
  | "layers"
  | "ai"
  | "3d-character"
  | "3d-bg";

export type StudioCompanionDensity = "simple" | "full" | "focus";
export type StudioCompanionCommandName =
  | StudioCompanionToolId
  | "focus-primary"
  | "toggle-canvas-only"
  | "enter-canvas-only"
  | "exit-canvas-only";

export type StudioCompanionControl =
  | StudioCompanionReviewControl
  | StudioCompanionReferenceControl;

export type StudioCompanionReferenceColorResult = {
  generation: number;
  revision: number;
  referenceRevision: number;
  sequence: number;
  color: string;
};

export type StudioCompanionPresentationSafeState = Readonly<{
  enabled: boolean;
  clock: number;
  writerInstanceId: string;
  mutationId: string;
}>;

export type StudioCompanionMessage =
  | {
      v: 1;
      type: "hello";
      role: "primary";
      primaryInstanceId: string;
      targetCompanionInstanceId: string | null;
      at: number;
    }
  | {
      v: 1;
      type: "hello";
      role: "companion";
      companionInstanceId: string;
      targetPrimaryInstanceId: string | null;
      /** Missing on legacy workspace companions. */
      view?: StudioCompanionSurface;
      at: number;
    }
  | {
      v: 1;
      type: "primary-state";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      tool: StudioCompanionToolId;
      density: StudioCompanionDensity;
      canvasOnly: boolean;
      title: string;
      at: number;
    }
  | {
      v: 1;
      type: "companion-command";
      command: StudioCompanionCommandName;
      companionInstanceId: string;
      targetPrimaryInstanceId: string;
      commandId: string;
      sequence: number;
      at: number;
    }
  | {
      v: 1;
      type: "primary-review-state";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      generation: number;
      projection: StudioCompanionReviewProjection;
      at: number;
    }
  | {
      v: 1;
      type: "navigator-frame";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      generation: number;
      revision: number;
      sequence: number;
      width: number;
      height: number;
      blob: Blob;
      at: number;
    }
  | {
      v: 1;
      type: "primary-reference-state";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      generation: number;
      projection: StudioCompanionReferenceProjection;
      at: number;
    }
  | {
      v: 1;
      type: "reference-preview-frame";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      generation: number;
      revision: number;
      referenceRevision: number;
      sequence: number;
      width: number;
      height: number;
      blob: Blob;
      at: number;
    }
  | {
      v: 1;
      type: "reference-color-result";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      generation: number;
      revision: number;
      referenceRevision: number;
      sequence: number;
      color: string;
      at: number;
    }
  | {
      v: 1;
      type: "companion-presentation-safe";
      /** The companion forwarding this state; never a primary routing target. */
      companionInstanceId: string;
      /** Null broadcasts a mutation, while a peer hello replay is precisely targeted. */
      targetCompanionInstanceId: string | null;
      state: StudioCompanionPresentationSafeState;
      at: number;
    }
  | {
      v: 1;
      type: "companion-control";
      control: StudioCompanionControl;
      generation: number;
      companionInstanceId: string;
      targetPrimaryInstanceId: string;
      commandId: string;
      sequence: number;
      at: number;
    }
  | {
      v: 1;
      type: "ping";
      companionInstanceId: string;
      targetPrimaryInstanceId: string;
      nonce: string;
      at: number;
    }
  | {
      v: 1;
      type: "pong";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      nonce: string;
      at: number;
    }
  | {
      v: 1;
      type: "companion-goodbye";
      companionInstanceId: string;
      targetPrimaryInstanceId: string;
      surface: StudioCompanionSurface;
      at: number;
    }
  | {
      v: 1;
      type: "primary-goodbye";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      surface: StudioCompanionSurface;
      at: number;
    };

export type StudioCompanionCommandMessage = Extract<
  StudioCompanionMessage,
  { type: "companion-command" }
>;

export type StudioCompanionControlMessage = Extract<
  StudioCompanionMessage,
  { type: "companion-control" }
>;

export type StudioCompanionReferenceStateMessage = Extract<
  StudioCompanionMessage,
  { type: "primary-reference-state" }
>;

export type StudioCompanionReferencePreviewFrameMessage = Extract<
  StudioCompanionMessage,
  { type: "reference-preview-frame" }
>;

export type StudioCompanionReferenceColorResultMessage = Extract<
  StudioCompanionMessage,
  { type: "reference-color-result" }
>;

export type StudioCompanionPresentationSafeMessage = Extract<
  StudioCompanionMessage,
  { type: "companion-presentation-safe" }
>;

export type StudioCompanionGoodbyeMessage = Extract<
  StudioCompanionMessage,
  { type: "companion-goodbye" }
>;

export type StudioCompanionSequencedMessage =
  | StudioCompanionCommandMessage
  | StudioCompanionControlMessage;

export type StudioCompanionHelloInput =
  | {
      role: "primary";
      primaryInstanceId: string;
      targetCompanionInstanceId: string | null;
    }
  | {
      role: "companion";
      companionInstanceId: string;
      targetPrimaryInstanceId: string | null;
      surface?: StudioCompanionSurface;
    };

export const STUDIO_COMPANION_TOOL_LABELS: Record<StudioCompanionToolId, string> = {
  select: "선택",
  pen: "펜",
  eraser: "지우개",
  template: "템플릿·에셋",
  bubble: "말풍선",
  text: "텍스트",
  layers: "레이어",
  ai: "AI 어시스트",
  "3d-character": "3D 캐릭터",
  "3d-bg": "3D 배경",
};

export const STUDIO_COMPANION_TOOL_LABEL_KEYS: Record<StudioCompanionToolId, string> = {
  select: "studio.toolsCompanion.tool.select",
  pen: "studio.toolsCompanion.tool.pen",
  eraser: "studio.toolsCompanion.tool.eraser",
  template: "studio.toolsCompanion.tool.template",
  bubble: "studio.toolsCompanion.tool.bubble",
  text: "studio.toolsCompanion.tool.text",
  layers: "studio.toolsCompanion.tool.layers",
  ai: "studio.toolsCompanion.tool.ai",
  "3d-character": "studio.toolsCompanion.tool.threeDCharacter",
  "3d-bg": "studio.toolsCompanion.tool.threeDBackground",
};

export const STUDIO_COMPANION_TOOL_ORDER: readonly StudioCompanionToolId[] = [
  "select",
  "pen",
  "eraser",
  "template",
  "bubble",
  "text",
  "layers",
  "ai",
  "3d-character",
  "3d-bg",
] as const;

export const STUDIO_COMPANION_TOOL_IDS = new Set<string>(STUDIO_COMPANION_TOOL_ORDER);
export const STUDIO_COMPANION_DENSITIES = new Set<string>(["simple", "full", "focus"]);
export const STUDIO_COMPANION_SURFACE_IDS = new Set<string>(STUDIO_COMPANION_SURFACES);
export const STUDIO_COMPANION_COMMANDS = new Set<string>([
  ...STUDIO_COMPANION_TOOL_ORDER,
  "focus-primary",
  "toggle-canvas-only",
  "enter-canvas-only",
  "exit-canvas-only",
]);
export const STUDIO_COMPANION_MAX_MESSAGE_AGE_MS = 30_000;
export const STUDIO_COMPANION_MAX_FUTURE_SKEW_MS = 5_000;
export const STUDIO_COMPANION_RECENT_COMMAND_LIMIT = 256;
export const STUDIO_COMPANION_PRIMARY_BINDING_LEASE_MS = 12_000;

export function isStudioCompanionSessionId(value: unknown): value is string {
  return typeof value === "string" && STUDIO_COMPANION_SESSION_PATTERN.test(value);
}

export function createStudioCompanionSessionId(): string {
  try {
    const cryptoApi = globalThis.crypto;
    const uuid = cryptoApi?.randomUUID?.();
    if (isStudioCompanionSessionId(uuid)) return uuid;
    if (cryptoApi?.getRandomValues) {
      const random = new Uint32Array(4);
      cryptoApi.getRandomValues(random);
      const encoded = Array.from(random, (value) => value.toString(16).padStart(8, "0")).join("");
      const id = `studio-${encoded}`;
      if (isStudioCompanionSessionId(id)) return id;
    }
  } catch {
    // Fail closed below; this id gates isolation but is never an authentication credential.
  }
  return "";
}
export const createStudioCompanionCommandId = createStudioCompanionSessionId;

/**
 * Parses the optional detached-window view. A missing value preserves the original
 * all-in-one workspace companion; duplicate or unknown values fail closed.
 */
export function parseStudioCompanionSurface(search: string): StudioCompanionSurface | null {
  try {
    const values = new URLSearchParams(search).getAll(STUDIO_COMPANION_VIEW_QUERY);
    if (values.length === 0) return "workspace";
    if (values.length !== 1) return null;
    const surface = values[0];
    return typeof surface === "string" && STUDIO_COMPANION_SURFACE_IDS.has(surface)
      ? surface as StudioCompanionSurface
      : null;
  } catch {
    return null;
  }
}

/** @deprecated Use parseStudioCompanionSurface. */
export const parseStudioCompanionView = parseStudioCompanionSurface;

export function requireStudioCompanionSessionId(sessionId: string): string {
  if (!isStudioCompanionSessionId(sessionId)) {
    throw new TypeError("Invalid Studio tools companion session id");
  }
  return sessionId;
}

type StudioCompanionPrimaryScope = { id?: string; remix?: string };

export interface StudioCompanionDocumentScope {
  readonly workId: string | null;
  readonly remixId: string | null;
}

export function studioCompanionPrimaryScope(
  search: string,
  routeWorkId?: string | null,
): StudioCompanionPrimaryScope | null {
  try {
    const params = new URLSearchParams(search);
    const ids = params.getAll("id");
    const remixes = params.getAll("remix");

    if (ids.length > 1 || remixes.length > 1) return null;
    const queryWorkId = ids[0];
    const remixId = remixes[0];
    if (queryWorkId !== undefined && !isValidStudioWorkspaceWorkId(queryWorkId)) return null;
    if (remixId !== undefined && !STUDIO_COMPANION_SCOPE_PATTERN.test(remixId)) return null;

    if (routeWorkId !== undefined) {
      if (routeWorkId !== null && !isValidStudioWorkspaceWorkId(routeWorkId)) return null;
      if (queryWorkId !== undefined && queryWorkId !== routeWorkId) return null;
      if (routeWorkId !== null) return { id: routeWorkId };
      if (queryWorkId !== undefined) return null;
    }

    if (queryWorkId !== undefined) return { id: queryWorkId };
    return remixId === undefined ? {} : { remix: remixId };
  } catch {
    return null;
  }
}

export function parseStudioCompanionDocumentScope(
  search: string,
): StudioCompanionDocumentScope | null {
  const scope = studioCompanionPrimaryScope(search);
  if (!scope) return null;
  return Object.freeze({
    workId: scope.id ?? null,
    remixId: scope.remix ?? null,
  });
}
