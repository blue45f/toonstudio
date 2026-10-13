import {
  GODOT_EMOTE_GLYPHS,
  GODOT_INTERACT_LABELS,
  parseHostPayload,
  saveGodotLastPosition,
  type GodotZoneInfo,
  type TsvsHostBridge,
} from "./studio-godot-space-embed-support";
import { restoreGodotBackgroundReference, type GodotSpaceDefinition } from "./studio-godot-space";

import type {
  GodotLayoutLoadState,
  GodotLayoutSaveState,
  GodotLayoutSelection,
} from "./StudioGodotLayoutPanel";
import type { StudioGodotMeetingSession } from "./studio-godot-meeting-session";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

type Setter<T> = Dispatch<SetStateAction<T>>;

/** 셸 임베드가 브리지 핸들러에 빌려주는 상태 접근자(셸 본체의 상태·ref를 그대로 넘긴다). */
export interface GodotHostBridgeDeps {
  readonly workId: string;
  readonly displayName: string;
  readonly bt: (ko: string, en: string) => string;
  readonly issueAndInject: () => Promise<void>;
  readonly appendChat: (fromSelf: boolean, name: string, text: string) => void;
  readonly setPhase: (phase: "connected" | "disconnected") => void;
  readonly setZoneInfo: Setter<GodotZoneInfo | null>;
  readonly setProximitySize: Setter<number>;
  readonly setInteractNotice: Setter<string | null>;
  readonly setSpaceDef: Setter<GodotSpaceDefinition | null>;
  readonly setLayoutDirty: Setter<boolean>;
  readonly setLayoutSelection: Setter<GodotLayoutSelection | null>;
  readonly setLayoutSaveState: Setter<GodotLayoutSaveState>;
  readonly setLayoutFetchNonce: Setter<number>;
  readonly meetingSessionRef: MutableRefObject<StudioGodotMeetingSession | null>;
  readonly zoneInfoRef: MutableRefObject<GodotZoneInfo | null>;
  readonly spaceIdRef: MutableRefObject<string>;
  readonly spaceDefRef: MutableRefObject<GodotSpaceDefinition | null>;
  readonly layoutDirtyRef: MutableRefObject<boolean>;
}

export type { GodotLayoutLoadState };

/**
 * Godot 무대 → 셸 통지 핸들러 묶음(`window.__tsvsHost`). 셸 본체(`StudioGodotSpaceEmbed.tsx`)에서 분리했다.
 * 페이로드 파싱과 상태 반영만 하며 소켓·타이머는 다루지 않는다.
 */
export function createGodotHostBridge(deps: GodotHostBridgeDeps): TsvsHostBridge {
  const {
    workId,
    displayName,
    bt,
    issueAndInject,
    appendChat,
    setPhase,
    setZoneInfo,
    setProximitySize,
    setInteractNotice,
    setSpaceDef,
    setLayoutDirty,
    setLayoutSelection,
    setLayoutSaveState,
    setLayoutFetchNonce,
    meetingSessionRef,
    zoneInfoRef,
    spaceIdRef,
    spaceDefRef,
    layoutDirtyRef,
  } = deps;
  return {
    onGodotReady: () => {
      void issueAndInject();
    },
    onConnectionState: (json) => {
      const payload = parseHostPayload(json);
      if (payload?.state === "connected") setPhase("connected");
      else if (payload?.state === "disconnected") setPhase("disconnected");
    },
    onTicketNeeded: () => {
      void issueAndInject();
    },
    onZoneChanged: (json) => {
      const payload = parseHostPayload(json);
      if (!payload) return;
      const zones = Array.isArray(payload.zones)
        ? payload.zones.flatMap((zone) => {
            if (typeof zone !== "object" || zone === null) return [];
            const record = zone as Record<string, unknown>;
            return [
              {
                zoneId: String(record.zoneId ?? ""),
                kind: String(record.kind ?? ""),
                name: String(record.name ?? ""),
                occupants: Array.isArray(record.occupants)
                  ? record.occupants.map((value) => String(value))
                  : [],
              },
            ];
          })
        : [];
      setZoneInfo({
        selfZoneId: String(payload.selfZoneId ?? ""),
        selfActorId: String(payload.selfActorId ?? ""),
        selfClientId: String(payload.selfClientId ?? ""),
        presenterActorId: String(payload.presenterActorId ?? ""),
        peerClientIds: (payload.peerClientIds ?? {}) as Record<
          string,
          string
        >,
        names: (payload.names ?? {}) as Record<string, string>,
        zones,
      });
    },
    onProximityChanged: (json) => {
      const payload = parseHostPayload(json);
      if (payload && typeof payload.size === "number") {
        setProximitySize(payload.size);
      }
    },
    onSignal: (json) => {
      const payload = parseHostPayload(json);
      const signal = payload?.payload;
      if (
        payload &&
        typeof signal === "object" &&
        signal !== null &&
        !Array.isArray(signal)
      ) {
        void meetingSessionRef.current?.handleSignal(
          String(payload.fromClientId ?? ""),
          signal as Record<string, unknown>,
        );
      }
    },
    onBubble: (json) => {
      const payload = parseHostPayload(json);
      if (!payload || typeof payload.text !== "string") return;
      const fromActorId = String(payload.fromActorId ?? "");
      const name =
        zoneInfoRef.current?.names[fromActorId] ??
        bt("상대", "Partner");
      appendChat(false, name, payload.text);
    },
    onEmote: (json) => {
      const payload = parseHostPayload(json);
      if (!payload || typeof payload.emote !== "string") return;
      const glyph = GODOT_EMOTE_GLYPHS[payload.emote];
      if (!glyph) return;
      const fromActorId = String(payload.fromActorId ?? "");
      const fromSelf =
        fromActorId !== "" &&
        fromActorId === zoneInfoRef.current?.selfActorId;
      const name =
        zoneInfoRef.current?.names[fromActorId] ??
        (fromSelf ? displayName : bt("상대", "Partner"));
      appendChat(fromSelf, name, glyph);
    },
    onInteract: (json) => {
      const payload = parseHostPayload(json);
      if (!payload || typeof payload.kind !== "string") return;
      const label = GODOT_INTERACT_LABELS[payload.kind];
      if (!label) return;
      setInteractNotice(label);
    },
    onPosition: (json) => {
      const payload = parseHostPayload(json);
      if (
        !payload ||
        typeof payload.spaceId !== "string" ||
        typeof payload.x !== "number" ||
        typeof payload.y !== "number"
      ) {
        return;
      }
      saveGodotLastPosition(workId, {
        spaceId: payload.spaceId,
        x: payload.x,
        y: payload.y,
        at: Date.now(),
      });
    },
    onLayoutChanged: (json) => {
      const payload = parseHostPayload(json);
      const spec = payload?.spec;
      if (
        typeof spec !== "object" ||
        spec === null ||
        Array.isArray(spec)
      ) {
        return;
      }
      // 무대 정규화를 통과한 정의를 셸 초안으로 삼는다 (저장은 별도 동선).
      // 무대는 업로드 배경을 절대 URL로 알고 있으므로, 저장 정본인
      // uploads/ 참조로 되돌려서 초안에 싣는다 (§14 역변환).
      const definition = restoreGodotBackgroundReference(
        spec as GodotSpaceDefinition,
        workId,
      );
      if (definition.id !== spaceIdRef.current) return;
      spaceDefRef.current = definition;
      setSpaceDef(definition);
      setLayoutDirty(true);
    },
    onLayoutSelection: (json) => {
      const payload = parseHostPayload(json);
      const raw = payload?.selection;
      if (
        typeof raw !== "object" ||
        raw === null ||
        Array.isArray(raw) ||
        Object.keys(raw).length === 0
      ) {
        setLayoutSelection(null);
        return;
      }
      const record = raw as Record<string, unknown>;
      const rect = Array.isArray(record.rect) ? record.rect : [];
      const rectTuple: [number, number, number, number] = [
        Number(rect[0] ?? 0),
        Number(rect[1] ?? 0),
        Number(rect[2] ?? 0),
        Number(rect[3] ?? 0),
      ];
      setLayoutSelection({
        // 무대 편집기는 구분을 "type" 키로 보낸다 (category는 예비 키).
        category:
          (record.category ?? record.type) === "zone" ? "zone" : "prop",
        index: Number(record.index ?? 0),
        kind: String(record.kind ?? ""),
        name: String(record.name ?? ""),
        rect: rectTuple,
      });
    },
    onLayoutRemote: (json) => {
      const payload = parseHostPayload(json);
      if (!payload || payload.spaceId !== spaceIdRef.current) return;
      if (layoutDirtyRef.current) {
        // 내 미저장 변경과 부딪히면 자동 적용하지 않고 충돌 동선을 띄운다.
        setLayoutSaveState("conflict");
        return;
      }
      setLayoutFetchNonce((nonce) => nonce + 1);
    },
  };
}
