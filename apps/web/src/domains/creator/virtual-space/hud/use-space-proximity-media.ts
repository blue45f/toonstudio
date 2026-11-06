import { useCallback, useEffect, useRef, useState } from "react";

import type { StudioLiveParticipant } from "../../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../../live/studio-live-direct-port";
import { StudioP2pHuddleController, type HuddleSnapshot } from "../../live/huddle/studio-p2p-huddle-controller";
import type { StudioVirtualSpaceActivity, StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import type { StudioUserStatus } from "../studio-virtual-space-user-status";
import type { StudioWorldRect } from "../studio-virtual-space-world-manifest";
import { spaceStatusOption, spaceStatusOptionById, type SpaceStatusExpiryMinutes, type SpaceStatusOption } from "./space-dock-model";
import {
  createSpaceChannelPort,
  nextSpaceProximityRangeMode,
  sameSpaceProximityScope,
  spacePrivateZoneAt,
  spaceProximityMediaScopePeers,
  type SpaceProximityRangeMode,
} from "./space-proximity-media";

export type SpaceProximityMediaPhase =
  /** 사용자가 아직 켜지 않음(동의 전). */
  | "off"
  /** 켰지만 지금은 연결할 수 없음(연결 확인 중·게스트·개인 공간 등). */
  | "waiting"
  /** 근처 팀원을 자동으로 연결하는 중. */
  | "live";

export interface SpaceProximityMediaInput {
  readonly participant: StudioLiveParticipant | null | undefined;
  readonly port: StudioLiveDirectPort | null | undefined;
  /** 팀 공간·서버 연결·월드 준비 등 기능을 쓸 수 있는 조건. */
  readonly available: boolean;
  /** 지금 연결할 팀원(가까운 순). spaceProximityMediaScope 결과. */
  readonly scopeIds: readonly string[];
}

/**
 * 가까이 가면 영상: 사용자가 한 번 켜면(카메라·마이크 권한은 버튼을 누를 때만 요청)
 * 근처 팀원과 자동으로 연결하고 멀어지면 자동으로 끊는다.
 * Huddle 컨트롤러(무료 STUN·P2P)를 전용 채널로 감싸 대화방과 신호가 섞이지 않게 한다.
 */
export function useSpaceProximityMedia({ participant, port, available, scopeIds }: SpaceProximityMediaInput) {
  const [enabled, setEnabled] = useState(false);
  const [snapshot, setSnapshot] = useState<HuddleSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef<StudioP2pHuddleController | null>(null);
  const scopeRef = useRef<ReadonlySet<string>>(new Set(scopeIds));
  const appliedScope = useRef<readonly string[]>([]);
  /** 사용자가 켜 둔 장치. 장소를 옮겨 연결을 다시 만들 때 같은 장치를 다시 켠다(권한은 이미 허락한 상태). */
  const wanted = useRef<{ camera: boolean; mic: boolean }>({ camera: false, mic: false });
  const viewer = participant?.role === "viewer";
  const ready = enabled && available && Boolean(participant && port) && !viewer;

  useEffect(() => {
    if (!ready || !participant || !port) return undefined;
    const controller = new StudioP2pHuddleController(participant, createSpaceChannelPort(port), {
      // 근접 범위 밖 팀원은 상태 신호조차 주고받지 않는다.
      peerFilter: (peer) => scopeRef.current.has(peer.sessionId),
    });
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(() => setSnapshot(controller.snapshot()));
    controller.start();
    controller.setMediaPeerScope([...scopeRef.current]);
    appliedScope.current = [...scopeRef.current];
    setSnapshot(controller.snapshot());
    const capture = wanted.current;
    if (capture.camera || capture.mic) {
      setBusy(true);
      void Promise.all([
        capture.camera ? controller.setVideo("camera") : Promise.resolve(),
        capture.mic ? controller.setMicrophone(true) : Promise.resolve(),
      ]).finally(() => { if (controllerRef.current === controller) setBusy(false); });
    }
    return () => {
      unsubscribe();
      controller.close();
      if (controllerRef.current === controller) controllerRef.current = null;
      setSnapshot(null);
    };
  }, [participant, port, ready]);

  useEffect(() => {
    scopeRef.current = new Set(scopeIds);
    const controller = controllerRef.current;
    if (!controller || sameSpaceProximityScope(appliedScope.current, scopeIds)) return;
    appliedScope.current = [...scopeIds];
    controller.setMediaPeerScope(scopeIds);
    controller.refreshPeers();
  }, [scopeIds]);

  /** 동의 버튼: 근접 영상을 켜고 고른 장치를 그 자리에서 요청한다. */
  const start = useCallback((capture: { readonly camera: boolean; readonly mic: boolean }) => {
    wanted.current = { camera: capture.camera, mic: capture.mic };
    const controller = controllerRef.current;
    if (controller) {
      setBusy(true);
      void Promise.all([
        capture.camera ? controller.setVideo("camera") : Promise.resolve(),
        capture.mic ? controller.setMicrophone(true) : Promise.resolve(),
      ]).finally(() => { if (controllerRef.current === controller) setBusy(false); });
    }
    setEnabled(true);
  }, []);
  const stop = useCallback(() => { wanted.current = { camera: false, mic: false }; setEnabled(false); }, []);
  const run = useCallback((action: (controller: StudioP2pHuddleController) => Promise<void>) => {
    const controller = controllerRef.current;
    if (!controller) return;
    setBusy(true);
    void action(controller).finally(() => { if (controllerRef.current === controller) setBusy(false); });
  }, []);
  const toggleCamera = useCallback(() => run((controller) => {
    const next = !controller.snapshot().camera;
    wanted.current.camera = next;
    return controller.setVideo(next ? "camera" : null);
  }), [run]);
  const toggleMic = useCallback(() => run((controller) => {
    const next = controller.snapshot().muted;
    wanted.current.mic = next;
    return controller.setMicrophone(next);
  }), [run]);
  const toggleScreen = useCallback(() => run((controller) => controller.setVideo(controller.snapshot().sharing ? null : "screen")), [run]);
  const startScreenShare = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller) throw new Error("screen-share-unavailable");
    if (!controller.snapshot().sharing) {
      setBusy(true);
      try {
        const customStart = (controller as unknown as { readonly startScreen?: () => Promise<void> }).startScreen;
        if (typeof customStart === "function") await customStart.call(controller);
        else await controller.setVideo("screen");
      } finally {
        if (controllerRef.current === controller) setBusy(false);
      }
    }
    if (controller.snapshot().sharing !== true) {
      throw new Error("screen-share-unavailable");
    }
  }, []);
  const phase: SpaceProximityMediaPhase = !enabled ? "off" : ready && snapshot ? "live" : "waiting";
  return { phase, enabled, snapshot, busy, viewer, start, stop, toggleCamera, toggleMic, toggleScreen, startScreenShare };
}

export interface SpaceProximityScopePeerSample {
  readonly participant: { readonly sessionId: string; readonly displayName: string };
  readonly state: StudioVirtualSpacePoint & { readonly activity: StudioVirtualSpaceActivity };
}

export interface SpaceProximityScopeHookInput {
  readonly selfPoint: StudioVirtualSpacePoint;
  readonly activity: StudioVirtualSpaceActivity;
  readonly userStatus?: StudioUserStatus | null;
  readonly ghostMode: boolean;
  readonly peers: readonly SpaceProximityScopePeerSample[];
  readonly acousticZones: readonly (StudioWorldRect & { readonly id: string; readonly policy?: string })[] | undefined;
  readonly blockedIds: readonly string[];
  readonly fallbackPeerLabel: string;
  readonly onExpireStatus?: (next: SpaceStatusOption) => void;
  readonly onNotify?: (kind: "quiet-on" | "quiet-off" | "whisper-start" | "whisper-end", peerName?: string) => void;
}

/**
 * 근접 음성 범위(기본/조용히/끄기)·1:1 귓속말(Whisper)·고스트 모드 제외·상태 자동 해제를 합쳐
 * 현재 연결 대상(scopeIds·scopeNames)을 계산하는 상태 훅.
 */
export function useSpaceProximityScope({
  selfPoint, activity, userStatus = null, ghostMode, peers, acousticZones, blockedIds, fallbackPeerLabel, onExpireStatus, onNotify,
}: SpaceProximityScopeHookInput) {
  const [proximityRange, setProximityRange] = useState<SpaceProximityRangeMode>("standard");
  const [whisperPeerId, setWhisperPeerId] = useState<string | null>(null);
  const [statusExpiryMinutes, setStatusExpiryMinutes] = useState<SpaceStatusExpiryMinutes>(null);
  const previousRef = useRef<ReadonlySet<string>>(new Set());
  const currentStatusId = spaceStatusOption(activity, userStatus).id;

  useEffect(() => {
    if (currentStatusId === "available" || statusExpiryMinutes === null || !onExpireStatus) return undefined;
    const timer = globalThis.setTimeout(() => {
      setStatusExpiryMinutes(null);
      onExpireStatus(spaceStatusOptionById("available"));
    }, statusExpiryMinutes * 60_000);
    return () => globalThis.clearTimeout(timer);
  }, [currentStatusId, onExpireStatus, statusExpiryMinutes]);

  const proximityPeers = spaceProximityMediaScopePeers({
    self: { point: selfPoint, activity, privateZoneId: spacePrivateZoneAt(acousticZones, selfPoint), ghost: ghostMode },
    peers: peers.map((peer) => ({
      id: peer.participant.sessionId,
      point: peer.state,
      activity: peer.state.activity,
      privateZoneId: spacePrivateZoneAt(acousticZones, peer.state),
    })),
    previous: previousRef.current,
    blockedIds,
    range: proximityRange,
    whisperPeerId,
  });

  const gainById = new Map(proximityPeers.map((peer) => [peer.id, peer.gain] as const));
  const proximityKey = proximityPeers.map((peer) => peer.id).join("\u0000");
  const scopeIds = proximityKey ? proximityKey.split("\u0000") : [];

  useEffect(() => {
    previousRef.current = new Set(proximityKey ? proximityKey.split("\u0000") : []);
  }, [proximityKey]);

  const whisperPeer = whisperPeerId ? peers.find((peer) => peer.participant.sessionId === whisperPeerId) ?? null : null;
  useEffect(() => {
    if (!whisperPeerId) return;
    if (ghostMode || proximityRange === "off" || !proximityPeers.some((peer) => peer.id === whisperPeerId)) {
      setWhisperPeerId(null);
    }
  }, [ghostMode, proximityPeers, proximityRange, whisperPeerId]);

  const toggleQuietMode = useCallback(() => {
    const next = nextSpaceProximityRangeMode(proximityRange);
    setProximityRange(next);
    onNotify?.(next === "quiet" ? "quiet-on" : "quiet-off");
  }, [onNotify, proximityRange]);

  const toggleWhisper = useCallback((peerId: string) => {
    if (whisperPeerId === peerId) {
      setWhisperPeerId(null);
      onNotify?.("whisper-end");
      return;
    }
    const target = peers.find((item) => item.participant.sessionId === peerId);
    if (!target) return;
    setWhisperPeerId(peerId);
    onNotify?.("whisper-start", target.participant.displayName);
  }, [onNotify, peers, whisperPeerId]);

  const scopeNames = scopeIds.map((id) => ({
    id,
    name: peers.find((peer) => peer.participant.sessionId === id)?.participant.displayName ?? fallbackPeerLabel,
    gain: gainById.get(id),
  }));

  return {
    proximityRange,
    setProximityRange,
    toggleQuietMode,
    whisperPeerId,
    setWhisperPeerId,
    whisperPeerName: whisperPeer?.participant.displayName ?? null,
    toggleWhisper,
    statusExpiryMinutes,
    setStatusExpiryMinutes,
    scopeIds,
    scopeNames,
  };
}
