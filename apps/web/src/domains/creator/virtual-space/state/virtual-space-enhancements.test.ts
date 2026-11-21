import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { computeVisemeFromSpectrum, SILENT_VISEME_WEIGHTS } from "../audio/studio-virtual-space-audio-lipsync";
import { computeSpatialAudioCoordinates } from "../audio/studio-virtual-space-spatial-panner";
import {
  createVirtualSpaceYjsDoc,
  decodeYjsUpdateBase64,
  encodeYjsUpdateBase64,
  mergeLocalSpaceDocIntoRemote,
} from "../crdt/studio-virtual-space-yjs-doc";
import { formatDeadlineCountdown } from "../hud/space-deadline-countdown-model";
import { StudioVirtualSpaceAcousticPolicy } from "../studio-virtual-space-acoustics";
import { parseStudioVirtualSpacePacket, runtimePresenceState } from "../studio-virtual-space-presence-protocol";
import {
  applyVirtualSpaceHostAction,
  INITIAL_ROOM_CONTROL_STATE,
  resolveVirtualSpacePermissions,
  resolveVirtualSpaceRole,
} from "./use-virtual-space-permissions";

describe("Virtual Studio Wave V2-W4 core engines", () => {
  it("grants invited guest-voice full movement, voice, chat, seating, and board without host controls", () => {
    const role = resolveVirtualSpaceRole({ personal: false, signedIn: false, isGuest: true, teamRole: "viewer" });
    expect(role).toBe("guest-voice");

    const perms = resolveVirtualSpacePermissions(role, INITIAL_ROOM_CONTROL_STATE, "guest-1");
    expect(perms.canMove).toBe(true);
    expect(perms.canVoice).toBe(true);
    expect(perms.canChat).toBe(true);
    expect(perms.canSit).toBe(true);
    expect(perms.canUseBoard).toBe(true);
    expect(perms.canEditSpace).toBe(false);
    expect(perms.canManageRoom).toBe(false);
    expect(perms.canKick).toBe(false);

    const mutedControl = applyVirtualSpaceHostAction(INITIAL_ROOM_CONTROL_STATE, {
      action: "mute-peer",
      targetSessionId: "guest-1",
      muted: true,
    });
    const mutedPerms = resolveVirtualSpacePermissions(role, mutedControl, "guest-1");
    expect(mutedPerms.canVoice).toBe(false);
    expect(mutedPerms.mutedByHost).toBe(true);

    const lockedControl = applyVirtualSpaceHostAction(INITIAL_ROOM_CONTROL_STATE, {
      action: "toggle-edit-lock",
      locked: true,
    });
    expect(resolveVirtualSpacePermissions("editor", lockedControl, "ed-1").canEditSpace).toBe(false);
    expect(resolveVirtualSpacePermissions("owner", lockedControl, "own-1").canEditSpace).toBe(true);
  });

  it("encodes, decodes, and merges solo Yjs Space CRDT edits into remote cloud doc cleanly", () => {
    const solo = createVirtualSpaceYjsDoc();
    solo.getMap("roomPreset").set("themeId", "hero-bg-kr-atelier-cafe-interior");
    solo.getMap("stickyNotes").set("s1", { id: "s1", text: "12화 수정" });
    const b64 = encodeYjsUpdateBase64(Y.encodeStateAsUpdate(solo));
    const decoded = decodeYjsUpdateBase64(b64);
    expect(decoded).not.toBeNull();

    const remote = createVirtualSpaceYjsDoc();
    remote.getMap("stickyNotes").set("s2", { id: "s2", text: "배경 체크" });
    mergeLocalSpaceDocIntoRemote(solo, remote);

    expect(remote.getMap("roomPreset").get("themeId")).toBe("hero-bg-kr-atelier-cafe-interior");
    expect(remote.getMap("stickyNotes").has("s1")).toBe(true);
    expect(remote.getMap("stickyNotes").has("s2")).toBe(true);
    solo.destroy();
    remote.destroy();
  });

  it("projects directional HRTF spatial audio coordinates in camera-relative frame", () => {
    const rightPeer = computeSpatialAudioCoordinates(
      { point: { x: 100, y: 100 }, cameraYawRadians: 0 },
      { x: 196, y: 100 },
    );
    expect(rightPeer.x).toBeCloseTo(3, 2);
    expect(rightPeer.pan).toBeGreaterThan(0.8);

    const rotated = computeSpatialAudioCoordinates(
      { point: { x: 100, y: 100 }, cameraYawRadians: Math.PI },
      { x: 196, y: 100 },
    );
    expect(rotated.x).toBeCloseTo(-3, 2);
    expect(rotated.pan).toBeLessThan(-0.8);
  });

  it("maps WebAudio spectral energy bands into VRM 1.0 viseme weights", () => {
    expect(computeVisemeFromSpectrum(0.01, 0.5, 0.5, 0.5)).toEqual(SILENT_VISEME_WEIGHTS);
    const vowelA = computeVisemeFromSpectrum(0.8, 0.2, 0.7, 0.1);
    expect(vowelA.aa).toBeGreaterThan(0.5);
    const vowelO = computeVisemeFromSpectrum(0.8, 0.8, 0.1, 0.1);
    expect(vowelO.oh).toBeGreaterThan(vowelO.ih);
    const vowelI = computeVisemeFromSpectrum(0.8, 0.05, 0.15, 0.8);
    expect(vowelI.ih).toBeGreaterThan(vowelI.ou);
  });

  it("round-trips optional vrmModelId, poseGestureId, and visemeLevel on presence wire packets", () => {
    const state = runtimePresenceState(
      { x: 240, y: 300 },
      "down",
      "available",
      false,
      0,
      "lobby",
      undefined,
      { vrmModelId: "hero-v1-romance-female", poseGestureId: "hand-peace", visemeLevel: 0.64 },
    );
    const parsed = parseStudioVirtualSpacePacket(JSON.stringify({
      wire: "toonstudio-space-v1",
      kind: "presence",
      sequence: 1,
      at: 1000,
      state,
    }));
    expect(parsed?.kind).toBe("presence");
    if (parsed?.kind === "presence") {
      expect(parsed.state.vrmModelId).toBe("hero-v1-romance-female");
      expect(parsed.state.poseGestureId).toBe("hand-peace");
      expect(parsed.state.visemeLevel).toBe(0.64);
    }
  });

  it("honors fail-closed private acoustic zone authority adapter when provided", () => {
    const world = {
      worldId: "studio-campus",
      contentRevision: "a".repeat(64),
      width: 1000,
      height: 1000,
      rooms: [{ id: "meeting", x: 0, y: 0, width: 500, height: 500 }],
      acousticZones: [{ id: "booth-1", roomId: "meeting", x: 50, y: 50, width: 200, height: 200, policy: "private" as const, doorId: "door-1" }],
    };
    const snapshot = {
      self: runtimePresenceState({ x: 100, y: 100 }, "down", "available", false, 0, "meeting"),
      peers: [{
        participant: { sessionId: "peer-1", displayName: "Peer", role: "editor" as const },
        state: runtimePresenceState({ x: 120, y: 110 }, "down", "available", false, 0, "meeting"),
        lastSeen: 1000,
        sequence: 1,
      }],
      nearbyPeers: [],
      selfReaction: null,
      peerReactions: [],
      chatMessages: [],
      chatBubbles: [],
      selfChatBubble: null,
      peerTyping: [],
      peerImpacts: [],
      objectStates: [],
      peerFixtures: [],
      direct: true,
    };

    const denied = new StudioVirtualSpaceAcousticPolicy(world, "self-1", { now: () => 2000, wallNow: () => 1500 });
    denied.update(snapshot, true);
    expect(denied.check(["self-1", "peer-1"], "enter").reason).toBe("authority-required");

    let clock = 1000;
    const granted = new StudioVirtualSpaceAcousticPolicy(world, "self-1", {
      now: () => clock,
      wallNow: () => 1500,
      privateZoneAuthority: (zoneId, doorId) => zoneId === "booth-1" && doorId === "door-1",
    });
    granted.update(snapshot, true);
    clock = 1500;
    expect(granted.check(["self-1", "peer-1"], "enter").allowed).toBe(true);
  });

  it("formats episode deadline D-Day and HH:MM:SS countdown accurately", () => {
    const now = Date.UTC(2026, 10, 20, 12, 0, 0);
    const future = Date.UTC(2026, 10, 23, 14, 30, 15);
    const summary = formatDeadlineCountdown(new Date(future).toISOString(), now);
    expect(summary.dDayLabel).toBe("D-3");
    expect(summary.clockLabel).toBe("02:30:15");
    expect(summary.overdue).toBe(false);

    const past = Date.UTC(2026, 10, 19, 10, 0, 0);
    const overdue = formatDeadlineCountdown(new Date(past).toISOString(), now);
    expect(overdue.dDayLabel).toBe("D+1");
    expect(overdue.overdue).toBe(true);
  });
});
