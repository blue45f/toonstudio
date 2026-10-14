/**
 * Hardware controller command bridge — exposes the studio command catalog to
 * external hardware controllers (TourBox, Stream Deck, …) through a local
 * bridge, so a physical dial/button can run the exact same command a menu,
 * shortcut or the ⌘K palette runs.
 *
 * Why this shape (product 발견 7):
 * - The catalog (`studio-command-catalog.ts`) is declaration-only data and the
 *   `CommandRegistry` already executes by id. The missing piece was never the
 *   commands — it was a wire format + a guarded execution door. This module is
 *   that thin layer: manifest serialization, request validation, and a
 *   WebSocket adapter. It holds no React, no store and no registry instance;
 *   the host injects `execute`, wired to its live `CommandRegistry` +
 *   `CommandContext`, so availability/permission checks stay the registry's.
 *
 * Security posture — a local bridge is a command-execution surface, so:
 * - Loopback only by default (`ws://127.0.0.1:47615`). The page connects out
 *   to a bridge the user runs on their own machine (Stream Deck plugin /
 *   companion process); nothing here opens a listening socket or leaves the
 *   machine.
 * - Every request must carry the pairing token the user copied from studio
 *   settings into their controller profile. An empty configured token fails
 *   closed: every request is `unauthorized`, nothing executes.
 * - Only catalog commands with a reachable execution path are executable
 *   (see `isHardwareBridgeExecutable`). Dead / advertised-only /
 *   documented-only entries are listed with `executable: false` so controller
 *   software can grey them out instead of failing at press time.
 * - The handler never throws and never leaks internals: malformed frames,
 *   unknown ids and executor failures map to stable error codes, and error
 *   messages never include the token or a stack.
 */

import type { StudioCommandCatalogEntry } from "./studio-command-catalog";
import type { CommandId } from "@toonstudio/studio-command-registry";

/* ------------------------------------------------------------------ constants */

export const STUDIO_HARDWARE_BRIDGE_PROTOCOL = "toonstudio.hardware-command-bridge";
export const STUDIO_HARDWARE_BRIDGE_VERSION = 1;

/** Default loopback endpoint of the user-run local bridge process. */
export const STUDIO_HARDWARE_BRIDGE_DEFAULT_URL = "ws://127.0.0.1:47615";

/* ------------------------------------------------------------------ manifest */

/** One command as controller software (Stream Deck plugin, TourBox mapper) consumes it. JSON-safe. */
export interface StudioHardwareBridgeCommand {
  id: CommandId;
  category: string;
  /** Primary Korean label — the label the studio UI itself shows. */
  label: string;
  /** English label when the catalog carries one. */
  labelEn?: string;
  /** Display chord from the catalog, when the command owns one. */
  shortcut?: string;
  helpNodeId: string;
  /**
   * True when at least one origin has a reachable execution path. False for
   * entries whose every origin is dead / advertised-only / documented-only —
   * listed (so profiles can be built ahead) but rejected at execute time.
   */
  executable: boolean;
}

export interface StudioHardwareBridgeManifest {
  protocol: string;
  version: number;
  source: "studio-command-catalog";
  commands: readonly StudioHardwareBridgeCommand[];
}

/**
 * Executability follows the catalog's own provenance: an origin's `status` is
 * only set when it deviates, and the deviations are exactly the non-runnable
 * states. So a command is executable unless *every* origin is explicitly
 * dead / advertised-only / documented-only. An entry with no origins at all
 * (the catalog tests forbid this, but data from elsewhere might) is not
 * executable — no provenance, no execution path.
 */
export function isHardwareBridgeExecutable(entry: StudioCommandCatalogEntry): boolean {
  return entry.origins.some(
    (origin) => origin.status === undefined || origin.status === "wired",
  );
}

function toBridgeCommand(entry: StudioCommandCatalogEntry): StudioHardwareBridgeCommand {
  const ko = entry.labels.find((label) => label.locale === "ko");
  const en = entry.labels.find((label) => label.locale === "en");
  const primary = ko ?? entry.labels[0];
  return {
    id: entry.id,
    category: entry.category,
    label: primary?.label ?? entry.id,
    ...(en && en !== primary ? { labelEn: en.label } : {}),
    ...(entry.shortcut === undefined ? {} : { shortcut: entry.shortcut }),
    helpNodeId: entry.helpNodeId,
    executable: isHardwareBridgeExecutable(entry),
  };
}

/** Serialize the live catalog into the JSON manifest controllers consume. */
export function buildHardwareBridgeManifest(
  catalog: readonly StudioCommandCatalogEntry[],
): StudioHardwareBridgeManifest {
  return {
    protocol: STUDIO_HARDWARE_BRIDGE_PROTOCOL,
    version: STUDIO_HARDWARE_BRIDGE_VERSION,
    source: "studio-command-catalog",
    commands: catalog.map(toBridgeCommand),
  };
}

/* ------------------------------------------------------------------ wire protocol */

export type StudioHardwareBridgeErrorCode =
  | "invalid-request"
  | "unauthorized"
  | "unknown-command"
  | "command-unavailable"
  | "execution-failed";

/** Inbound frame. `token` is the pairing token from studio settings. */
export type StudioHardwareBridgeRequest =
  | { type: "list-commands"; requestId: string; token: string }
  | { type: "execute-command"; requestId: string; token: string; commandId: string };

export type StudioHardwareBridgeResponse =
  | {
      type: "manifest";
      requestId: string;
      ok: true;
      manifest: StudioHardwareBridgeManifest;
    }
  | {
      type: "executed";
      requestId: string;
      ok: true;
      commandId: CommandId;
      /** Mirrors `CommandResult.status` from the registry. */
      status: string;
      message?: string;
    }
  | {
      type: "error";
      /** Echoed when the inbound frame carried a usable one, else null. */
      requestId: string | null;
      ok: false;
      error: { code: StudioHardwareBridgeErrorCode; message: string };
    };

/** What the host's executor returns — structurally the registry's `CommandResult`. */
export interface StudioHardwareBridgeExecuteResult {
  status: string;
  message?: string;
}

export interface StudioHardwareBridgeDeps {
  catalog: readonly StudioCommandCatalogEntry[];
  /** Pairing token configured in studio settings. Empty fails closed. */
  token: string;
  /**
   * Host execution door — expected to call `CommandRegistry.execute(id, ctx)`
   * with the host's live context, so availability and permissions are judged
   * by the registry, not re-implemented here.
   */
  execute: (commandId: CommandId) => Promise<StudioHardwareBridgeExecuteResult>;
}

function errorResponse(
  requestId: string | null,
  code: StudioHardwareBridgeErrorCode,
  message: string,
): StudioHardwareBridgeResponse {
  return { type: "error", requestId, ok: false, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate and serve one inbound frame. Never throws: any malformed input,
 * auth failure, unknown id or executor failure becomes an `error` response
 * with a stable code, so a misbehaving controller can never wedge the studio.
 */
export async function handleHardwareBridgeRequest(
  raw: unknown,
  deps: StudioHardwareBridgeDeps,
): Promise<StudioHardwareBridgeResponse> {
  if (!isRecord(raw)) {
    return errorResponse(null, "invalid-request", "frame must be a JSON object");
  }
  const requestId = typeof raw.requestId === "string" && raw.requestId !== "" ? raw.requestId : null;
  if (requestId === null) {
    return errorResponse(null, "invalid-request", "requestId must be a non-empty string");
  }
  if (raw.type !== "list-commands" && raw.type !== "execute-command") {
    return errorResponse(requestId, "invalid-request", `unknown request type: ${String(raw.type)}`);
  }
  // Fail closed: no configured token (or a mismatched one) means no service.
  if (deps.token === "" || raw.token !== deps.token) {
    return errorResponse(requestId, "unauthorized", "pairing token missing or incorrect");
  }

  if (raw.type === "list-commands") {
    return {
      type: "manifest",
      requestId,
      ok: true,
      manifest: buildHardwareBridgeManifest(deps.catalog),
    };
  }

  if (typeof raw.commandId !== "string" || raw.commandId === "") {
    return errorResponse(requestId, "invalid-request", "commandId must be a non-empty string");
  }
  const entry = deps.catalog.find((candidate) => candidate.id === raw.commandId);
  if (!entry) {
    return errorResponse(requestId, "unknown-command", `no such command: ${raw.commandId}`);
  }
  if (!isHardwareBridgeExecutable(entry)) {
    return errorResponse(
      requestId,
      "command-unavailable",
      `command has no reachable execution path: ${entry.id}`,
    );
  }
  try {
    const result = await deps.execute(entry.id);
    return {
      type: "executed",
      requestId,
      ok: true,
      commandId: entry.id,
      status: result.status,
      ...(result.message === undefined ? {} : { message: result.message }),
    };
  } catch {
    // Deliberately message-free: executor errors can carry host internals.
    return errorResponse(requestId, "execution-failed", `command failed: ${entry.id}`);
  }
}

/* ------------------------------------------------------------------ WebSocket adapter */

/** The slice of the WebSocket API the adapter uses — injectable for tests. */
export interface StudioHardwareBridgeSocket {
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface StudioHardwareBridgeConnection {
  close(): void;
}

export interface ConnectStudioHardwareBridgeOptions extends StudioHardwareBridgeDeps {
  /** Bridge endpoint. Defaults to the loopback `STUDIO_HARDWARE_BRIDGE_DEFAULT_URL`. */
  url?: string;
  /** Socket factory — defaults to the global `WebSocket`. Injected in tests. */
  createSocket?: (url: string) => StudioHardwareBridgeSocket;
  /** Lifecycle notices for the settings UI (connected / closed / error). */
  onStatus?: (status: "open" | "closed" | "error") => void;
}

/**
 * Connect to the user-run local bridge and serve requests until `close()`.
 * On open, announces the protocol and the executable-command count (never the
 * token and never the full catalog — the bridge must ask with its token).
 */
export function connectStudioHardwareBridge(
  options: ConnectStudioHardwareBridgeOptions,
): StudioHardwareBridgeConnection {
  const url = options.url ?? STUDIO_HARDWARE_BRIDGE_DEFAULT_URL;
  const createSocket =
    options.createSocket ??
    ((target: string) => new WebSocket(target) as unknown as StudioHardwareBridgeSocket);
  const socket = createSocket(url);
  let closed = false;

  socket.onopen = () => {
    options.onStatus?.("open");
    const executableCount = options.catalog.filter(isHardwareBridgeExecutable).length;
    socket.send(
      JSON.stringify({
        type: "hello",
        protocol: STUDIO_HARDWARE_BRIDGE_PROTOCOL,
        version: STUDIO_HARDWARE_BRIDGE_VERSION,
        executableCommands: executableCount,
      }),
    );
  };
  socket.onmessage = (event) => {
    void (async () => {
      let raw: unknown;
      try {
        raw = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        if (!closed) {
          socket.send(
            JSON.stringify(errorResponse(null, "invalid-request", "frame is not valid JSON")),
          );
        }
        return;
      }
      const response = await handleHardwareBridgeRequest(raw, options);
      if (!closed) socket.send(JSON.stringify(response));
    })();
  };
  socket.onclose = () => options.onStatus?.("closed");
  socket.onerror = () => options.onStatus?.("error");

  return {
    close() {
      closed = true;
      socket.close();
    },
  };
}
