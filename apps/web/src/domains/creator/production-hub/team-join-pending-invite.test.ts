import { describe, expect, it } from "vitest";
import {
  PENDING_TEAM_INVITE_STORAGE_KEY,
  PENDING_TEAM_INVITE_TTL_MS,
  clearPendingTeamInvite,
  loadPendingTeamInvite,
  savePendingTeamInvite,
  type SessionStorageLike,
} from "./team-join-pending-invite";

const TOKEN = "c".repeat(43);
const NOW = 1_700_000_000_000;

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage: SessionStorageLike = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
  return { storage, map };
}

describe("pending team invite (session-only retention)", () => {
  it("round-trips a code and its entry context within the TTL", () => {
    const { storage } = fakeStorage();
    savePendingTeamInvite(TOKEN, { kind: "project-space", projectId: "work-a" }, storage, NOW);
    expect(loadPendingTeamInvite(storage, NOW + 60_000)).toEqual({
      token: TOKEN,
      context: { kind: "project-space", projectId: "work-a" },
    });
    expect(loadPendingTeamInvite(storage, NOW + PENDING_TEAM_INVITE_TTL_MS)).not.toBeNull();
  });

  it("expires after the TTL and removes the stale record", () => {
    const { storage, map } = fakeStorage();
    savePendingTeamInvite(TOKEN, { kind: "team-lobby" }, storage, NOW);
    expect(loadPendingTeamInvite(storage, NOW + PENDING_TEAM_INVITE_TTL_MS + 1)).toBeNull();
    expect(map.has(PENDING_TEAM_INVITE_STORAGE_KEY)).toBe(false);
  });

  it("never saves an incomplete or malformed code", () => {
    const { storage, map } = fakeStorage();
    savePendingTeamInvite("short", { kind: "team-lobby" }, storage, NOW);
    savePendingTeamInvite("", { kind: "team-lobby" }, storage, NOW);
    expect(map.size).toBe(0);
  });

  it("discards corrupted records instead of trusting them", () => {
    const { storage, map } = fakeStorage({ [PENDING_TEAM_INVITE_STORAGE_KEY]: "{not-json" });
    expect(loadPendingTeamInvite(storage, NOW)).toBeNull();
    expect(map.has(PENDING_TEAM_INVITE_STORAGE_KEY)).toBe(false);
    const wrongShape = fakeStorage({
      [PENDING_TEAM_INVITE_STORAGE_KEY]: JSON.stringify({ v: 1, token: "x".repeat(43), savedAt: "soon" }),
    });
    expect(loadPendingTeamInvite(wrongShape.storage, NOW)).toBeNull();
    expect(wrongShape.map.has(PENDING_TEAM_INVITE_STORAGE_KEY)).toBe(false);
  });

  it("normalizes an unparseable entry context back to the team lobby", () => {
    const { storage } = fakeStorage({
      [PENDING_TEAM_INVITE_STORAGE_KEY]: JSON.stringify({ v: 1, token: TOKEN, context: { kind: "project-space", projectId: "" }, savedAt: NOW }),
    });
    expect(loadPendingTeamInvite(storage, NOW)).toEqual({ token: TOKEN, context: { kind: "team-lobby" } });
  });

  it("clears on demand and tolerates a storage that throws", () => {
    const { storage, map } = fakeStorage();
    savePendingTeamInvite(TOKEN, { kind: "interview-waiting" }, storage, NOW);
    clearPendingTeamInvite(storage);
    expect(map.has(PENDING_TEAM_INVITE_STORAGE_KEY)).toBe(false);
    const throwing: SessionStorageLike = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); },
    };
    expect(() => savePendingTeamInvite(TOKEN, { kind: "team-lobby" }, throwing, NOW)).not.toThrow();
    expect(loadPendingTeamInvite(throwing, NOW)).toBeNull();
    expect(() => clearPendingTeamInvite(throwing)).not.toThrow();
    expect(loadPendingTeamInvite(null, NOW)).toBeNull();
  });
});
