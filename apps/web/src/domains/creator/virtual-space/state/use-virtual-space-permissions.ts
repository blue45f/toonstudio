import { useCallback, useEffect, useMemo, useState } from "react";

import type { StudioTeamRole } from "../../studio-team-client";
import type { StudioLiveDirectPort } from "../../live/studio-live-direct-port";

export const VIRTUAL_SPACE_ROLES = [
  "owner",
  "admin",
  "editor",
  "guest-voice",
  "viewer",
] as const;

export type VirtualSpaceRole = (typeof VIRTUAL_SPACE_ROLES)[number];

export interface VirtualSpaceRoomControlState {
  readonly roomLocked: boolean;
  readonly editLocked: boolean;
  readonly presenterSessionId: string | null;
  readonly mutedPeerIds: readonly string[];
  readonly kickedPeerIds: readonly string[];
}

export interface VirtualSpacePermissions {
  readonly role: VirtualSpaceRole;
  readonly canMove: boolean;
  readonly canVoice: boolean;
  readonly canChat: boolean;
  readonly canSit: boolean;
  readonly canReact: boolean;
  readonly canUseBoard: boolean;
  readonly canEditSpace: boolean;
  readonly canManageRoom: boolean;
  readonly canKick: boolean;
  readonly canSetPresenter: boolean;
  readonly mutedByHost: boolean;
}

export type VirtualSpaceHostAction =
  | { readonly action: "lock-room"; readonly locked: boolean }
  | { readonly action: "toggle-edit-lock"; readonly locked: boolean }
  | { readonly action: "set-presenter"; readonly targetSessionId: string | null }
  | { readonly action: "mute-peer"; readonly targetSessionId: string; readonly muted: boolean }
  | { readonly action: "kick-peer"; readonly targetSessionId: string };

const HOST_CONTROL_WIRE = "toonstudio-space-host-v1";

export const INITIAL_ROOM_CONTROL_STATE: VirtualSpaceRoomControlState = Object.freeze({
  roomLocked: false,
  editLocked: false,
  presenterSessionId: null,
  mutedPeerIds: Object.freeze([]),
  kickedPeerIds: Object.freeze([]),
});

export function resolveVirtualSpaceRole(input: {
  readonly personal: boolean;
  readonly signedIn: boolean;
  readonly isGuest: boolean;
  readonly teamRole?: StudioTeamRole | null;
}): VirtualSpaceRole {
  if (input.personal) return "owner";
  if (input.isGuest && !input.signedIn) return "guest-voice";
  if (!input.signedIn) return "viewer";
  if (input.teamRole === "owner") return "owner";
  if (input.teamRole === "admin") return "admin";
  if (input.teamRole === "viewer") return "viewer";
  return "editor";
}

export function resolveVirtualSpacePermissions(
  role: VirtualSpaceRole,
  control: VirtualSpaceRoomControlState,
  selfSessionId: string,
): VirtualSpacePermissions {
  const isHost = role === "owner" || role === "admin";
  const isMember = isHost || role === "editor";
  const isGuestVoice = role === "guest-voice";
  const mutedByHost = control.mutedPeerIds.includes(selfSessionId);

  return Object.freeze({
    role,
    canMove: true,
    canVoice: (isMember || isGuestVoice) && !mutedByHost,
    canChat: isMember || isGuestVoice,
    canSit: isMember || isGuestVoice,
    canReact: isMember || isGuestVoice,
    canUseBoard: (isMember || isGuestVoice) && (!control.editLocked || isHost),
    canEditSpace: isHost || (role === "editor" && !control.editLocked),
    canManageRoom: isHost,
    canKick: isHost,
    canSetPresenter: isHost,
    mutedByHost,
  });
}

export function applyVirtualSpaceHostAction(
  state: VirtualSpaceRoomControlState,
  cmd: VirtualSpaceHostAction,
): VirtualSpaceRoomControlState {
  switch (cmd.action) {
    case "lock-room":
      return Object.freeze({ ...state, roomLocked: cmd.locked });
    case "toggle-edit-lock":
      return Object.freeze({ ...state, editLocked: cmd.locked });
    case "set-presenter":
      return Object.freeze({ ...state, presenterSessionId: cmd.targetSessionId });
    case "mute-peer": {
      const next = new Set(state.mutedPeerIds);
      if (cmd.muted) next.add(cmd.targetSessionId);
      else next.delete(cmd.targetSessionId);
      return Object.freeze({ ...state, mutedPeerIds: Object.freeze([...next]) });
    }
    case "kick-peer": {
      const next = new Set(state.kickedPeerIds);
      next.add(cmd.targetSessionId);
      return Object.freeze({ ...state, kickedPeerIds: Object.freeze([...next]) });
    }
  }
}

export function useVirtualSpacePermissions(input: {
  readonly personal: boolean;
  readonly signedIn: boolean;
  readonly isGuest: boolean;
  readonly teamRole?: StudioTeamRole | null;
  readonly selfSessionId: string;
  readonly directPort?: StudioLiveDirectPort | null;
  readonly onHostForcedMute?: () => void;
  readonly onKicked?: () => void;
}) {
  const { personal, signedIn, isGuest, teamRole, selfSessionId, directPort, onHostForcedMute, onKicked } = input;
  const role = useMemo(
    () => resolveVirtualSpaceRole({
      personal,
      signedIn,
      isGuest,
      teamRole,
    }),
    [isGuest, personal, signedIn, teamRole],
  );
  const [control, setControl] = useState<VirtualSpaceRoomControlState>(INITIAL_ROOM_CONTROL_STATE);
  const permissions = useMemo(
    () => resolveVirtualSpacePermissions(role, control, selfSessionId),
    [control, role, selfSessionId],
  );

  useEffect(() => {
    const port = directPort;
    if (!port) return undefined;
    return port.subscribe((sender, raw) => {
      if (sender.role !== "owner" && sender.role !== "admin") return;
      try {
        const parsed = JSON.parse(raw) as { readonly wire?: unknown; readonly cmd?: VirtualSpaceHostAction };
        if (parsed.wire !== HOST_CONTROL_WIRE || !parsed.cmd) return;
        const cmd = parsed.cmd;
        setControl((current) => applyVirtualSpaceHostAction(current, cmd));
        if (cmd.action === "mute-peer" && cmd.targetSessionId === selfSessionId && cmd.muted) {
          onHostForcedMute?.();
        }
        if (cmd.action === "kick-peer" && cmd.targetSessionId === selfSessionId) {
          onKicked?.();
        }
      } catch {
        // Ignore unrelated direct packets.
      }
    });
  }, [directPort, onHostForcedMute, onKicked, selfSessionId]);

  const dispatchHostAction = useCallback((cmd: VirtualSpaceHostAction): boolean => {
    if (!permissions.canManageRoom) return false;
    setControl((current) => applyVirtualSpaceHostAction(current, cmd));
    const port = directPort;
    if (port) {
      const payload = JSON.stringify({ wire: HOST_CONTROL_WIRE, cmd });
      for (const peer of port.getPeers()) {
        if (peer.sessionId !== selfSessionId) {
          port.send(peer.sessionId, payload);
        }
      }
    }
    return true;
  }, [directPort, permissions.canManageRoom, selfSessionId]);

  return { role, control, permissions, dispatchHostAction };
}
