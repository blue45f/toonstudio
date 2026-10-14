import { describe, expect, it, vi } from "vitest";

import {
  buildHardwareBridgeManifest,
  connectStudioHardwareBridge,
  handleHardwareBridgeRequest,
  isHardwareBridgeExecutable,
  STUDIO_HARDWARE_BRIDGE_PROTOCOL,
  STUDIO_HARDWARE_BRIDGE_VERSION,
} from "./studio-hardware-bridge";

import type { StudioCommandCatalogEntry } from "./studio-command-catalog";
import type { StudioHardwareBridgeSocket } from "./studio-hardware-bridge";

const TOKEN = "pairing-token-for-tests";

function entry(
  partial: Partial<StudioCommandCatalogEntry> & Pick<StudioCommandCatalogEntry, "id">,
): StudioCommandCatalogEntry {
  return {
    category: partial.id.split(".")[0] ?? "",
    labels: [{ locale: "ko", label: `라벨 ${partial.id}` }],
    aliases: [],
    helpNodeId: `help/${partial.id.replace(/\./gu, "/")}`,
    origins: [{ source: "menu", nativeId: `menu/${partial.id}` }],
    ...partial,
  };
}

const CATALOG: readonly StudioCommandCatalogEntry[] = [
  entry({
    id: "file.save",
    labels: [
      { locale: "ko", label: "저장" },
      { locale: "en", label: "Save" },
    ],
    shortcut: "⌘S",
    origins: [{ source: "menu", nativeId: "file/save", status: "wired" }],
  }),
  entry({
    id: "edit.undo",
    // No explicit status — the catalog only marks deviations, so this is wired.
    origins: [{ source: "keymap", nativeId: "undo" }],
  }),
  entry({
    id: "filter.legacy",
    origins: [{ source: "menu", nativeId: "filter/legacy", status: "dead" }],
  }),
  entry({
    id: "help.gesture-guide",
    origins: [{ source: "help", nativeId: "gesture-guide", status: "documented-only" }],
  }),
  entry({
    id: "view.mixed",
    origins: [
      { source: "help", nativeId: "mixed", status: "documented-only" },
      { source: "menu", nativeId: "view/mixed", status: "wired" },
    ],
  }),
];

describe("hardware bridge — executability from catalog provenance", () => {
  it("treats wired and unmarked origins as executable, dead/documented-only as not", () => {
    expect(isHardwareBridgeExecutable(CATALOG[0]!)).toBe(true);
    expect(isHardwareBridgeExecutable(CATALOG[1]!)).toBe(true);
    expect(isHardwareBridgeExecutable(CATALOG[2]!)).toBe(false);
    expect(isHardwareBridgeExecutable(CATALOG[3]!)).toBe(false);
    // One wired origin is enough — the entry is reachable somewhere.
    expect(isHardwareBridgeExecutable(CATALOG[4]!)).toBe(true);
  });
});

describe("hardware bridge — manifest", () => {
  it("serializes the catalog into a JSON-safe manifest controllers can consume", () => {
    const manifest = buildHardwareBridgeManifest(CATALOG);
    expect(manifest.protocol).toBe(STUDIO_HARDWARE_BRIDGE_PROTOCOL);
    expect(manifest.version).toBe(STUDIO_HARDWARE_BRIDGE_VERSION);
    expect(manifest.commands).toHaveLength(CATALOG.length);
    const save = manifest.commands.find((command) => command.id === "file.save")!;
    expect(save.label).toBe("저장");
    expect(save.labelEn).toBe("Save");
    expect(save.shortcut).toBe("⌘S");
    expect(save.executable).toBe(true);
    expect(manifest.commands.find((command) => command.id === "filter.legacy")!.executable).toBe(
      false,
    );
    // JSON round-trip loses nothing — the manifest is wire data, not live objects.
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });
});

describe("hardware bridge — request handling", () => {
  type ExecuteFn = (
    commandId: StudioCommandCatalogEntry["id"],
  ) => Promise<{ status: string; message?: string }>;
  const deps = (execute: ExecuteFn = async () => ({ status: "ok" })) => ({
    catalog: CATALOG,
    token: TOKEN,
    execute: vi.fn(execute),
  });

  it("serves the manifest for an authenticated list-commands request", async () => {
    const response = await handleHardwareBridgeRequest(
      { type: "list-commands", requestId: "r1", token: TOKEN },
      deps(),
    );
    expect(response.type).toBe("manifest");
    expect(response.ok).toBe(true);
    if (response.type === "manifest") {
      expect(response.requestId).toBe("r1");
      expect(response.manifest.commands).toHaveLength(CATALOG.length);
    }
  });

  it("rejects a wrong token and never calls the executor", async () => {
    const execute = vi.fn(async () => ({ status: "ok" }));
    const response = await handleHardwareBridgeRequest(
      { type: "execute-command", requestId: "r2", token: "wrong", commandId: "file.save" },
      deps(execute),
    );
    expect(response).toEqual({
      type: "error",
      requestId: "r2",
      ok: false,
      error: { code: "unauthorized", message: "pairing token missing or incorrect" },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails closed when no token is configured at all", async () => {
    const response = await handleHardwareBridgeRequest(
      { type: "list-commands", requestId: "r3", token: "" },
      { catalog: CATALOG, token: "", execute: async () => ({ status: "ok" }) },
    );
    expect(response.ok).toBe(false);
    if (response.type === "error") expect(response.error.code).toBe("unauthorized");
  });

  it("executes an executable command by id and passes the result through", async () => {
    const execute = vi.fn(async () => ({ status: "ok", message: "saved" }));
    const response = await handleHardwareBridgeRequest(
      { type: "execute-command", requestId: "r4", token: TOKEN, commandId: "edit.undo" },
      deps(execute),
    );
    expect(execute).toHaveBeenCalledWith("edit.undo");
    expect(response).toEqual({
      type: "executed",
      requestId: "r4",
      ok: true,
      commandId: "edit.undo",
      status: "ok",
      message: "saved",
    });
  });

  it("maps unknown ids and non-executable commands to stable error codes", async () => {
    const unknown = await handleHardwareBridgeRequest(
      { type: "execute-command", requestId: "r5", token: TOKEN, commandId: "nope.nope" },
      deps(),
    );
    if (unknown.type === "error") expect(unknown.error.code).toBe("unknown-command");
    else throw new Error("expected error response");

    const dead = await handleHardwareBridgeRequest(
      { type: "execute-command", requestId: "r6", token: TOKEN, commandId: "filter.legacy" },
      deps(),
    );
    if (dead.type === "error") expect(dead.error.code).toBe("command-unavailable");
    else throw new Error("expected error response");
  });

  it("turns executor failures into execution-failed without leaking the error", async () => {
    const response = await handleHardwareBridgeRequest(
      { type: "execute-command", requestId: "r7", token: TOKEN, commandId: "file.save" },
      deps(async () => {
        throw new Error("host internal detail");
      }),
    );
    expect(response.ok).toBe(false);
    if (response.type === "error") {
      expect(response.error.code).toBe("execution-failed");
      expect(response.error.message).not.toContain("host internal detail");
    }
  });

  it("never throws on malformed frames", async () => {
    for (const raw of [null, "text", 42, [], {}, { type: "execute-command" }, { requestId: "x" }]) {
      const response = await handleHardwareBridgeRequest(raw, deps());
      expect(response.ok).toBe(false);
      if (response.type === "error") expect(response.error.code).toBe("invalid-request");
    }
  });
});

describe("hardware bridge — WebSocket adapter", () => {
  class FakeSocket implements StudioHardwareBridgeSocket {
    sent: string[] = [];
    closed = false;
    onopen: StudioHardwareBridgeSocket["onopen"] = null;
    onmessage: StudioHardwareBridgeSocket["onmessage"] = null;
    onclose: StudioHardwareBridgeSocket["onclose"] = null;
    onerror: StudioHardwareBridgeSocket["onerror"] = null;
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.closed = true;
    }
  }

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("announces hello on open, serves a token-checked execute frame, closes cleanly", async () => {
    const socket = new FakeSocket();
    const execute = vi.fn(async () => ({ status: "ok" }));
    const connection = connectStudioHardwareBridge({
      catalog: CATALOG,
      token: TOKEN,
      execute,
      createSocket: () => socket,
    });

    socket.onopen?.(null);
    const hello = JSON.parse(socket.sent[0]!) as { type: string; executableCommands: number };
    expect(hello.type).toBe("hello");
    expect(hello.executableCommands).toBe(3);

    socket.onmessage?.({
      data: JSON.stringify({
        type: "execute-command",
        requestId: "ws-1",
        token: TOKEN,
        commandId: "file.save",
      }),
    });
    await tick();
    const response = JSON.parse(socket.sent[1]!) as { type: string; requestId: string; ok: boolean };
    expect(response).toMatchObject({ type: "executed", requestId: "ws-1", ok: true });
    expect(execute).toHaveBeenCalledWith("file.save");

    socket.onmessage?.({ data: "{not json" });
    await tick();
    const invalid = JSON.parse(socket.sent[2]!) as { type: string; ok: boolean };
    expect(invalid).toMatchObject({ type: "error", ok: false });

    connection.close();
    expect(socket.closed).toBe(true);
  });
});
