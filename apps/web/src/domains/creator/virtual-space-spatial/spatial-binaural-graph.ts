/**
 * WebAudio `PannerNode`(`panningModel: "HRTF"`) 그래프 빌더 및 SSR/Headless 안전 폴백.
 *
 * - 각 동료 채널마다 `inputGain -> lowpassFilter(벽체 차음·공기 흡음) -> HRTF Panner -> master / reverbBus`
 *   노드 체인을 구성한다.
 * - 브라우저 AudioContext가 없거나 자동재생 제약/SSR/테스트 환경에서는 예외 없이
 *   `headless-fallback` 모드로 결정론적 채널 스냅샷을 유지한다.
 */

import {
  ACOUSTIC_ZONE_PROFILES,
  computeListenerBasis,
  createDefaultListenerState,
  type AcousticStageMixReport,
  type AcousticZoneId,
  type HrtfSpatialEvaluation,
  type SpatialListenerState,
  type SpatialPeerAudioSource,
  type SpatialVec3,
} from "./spatial-binaural-stage";

export interface SpatialAudioParamLike {
  value: number;
  setTargetAtTime?: (target: number, startTime: number, timeConstant: number) => unknown;
}

export interface SpatialAudioNodeLike {
  connect: (destination: SpatialAudioNodeLike) => unknown;
  disconnect?: () => void;
}

export interface SpatialGainNodeLike extends SpatialAudioNodeLike {
  readonly gain: SpatialAudioParamLike;
}

export interface SpatialBiquadFilterNodeLike extends SpatialAudioNodeLike {
  type: BiquadFilterType;
  readonly frequency: SpatialAudioParamLike;
  readonly Q: SpatialAudioParamLike;
}

export interface SpatialPannerNodeLike extends SpatialAudioNodeLike {
  panningModel: PanningModelType;
  distanceModel: DistanceModelType;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
  readonly positionX?: SpatialAudioParamLike;
  readonly positionY?: SpatialAudioParamLike;
  readonly positionZ?: SpatialAudioParamLike;
  setPosition?: (x: number, y: number, z: number) => void;
}

export interface SpatialAudioListenerLike {
  readonly positionX?: SpatialAudioParamLike;
  readonly positionY?: SpatialAudioParamLike;
  readonly positionZ?: SpatialAudioParamLike;
  readonly forwardX?: SpatialAudioParamLike;
  readonly forwardY?: SpatialAudioParamLike;
  readonly forwardZ?: SpatialAudioParamLike;
  readonly upX?: SpatialAudioParamLike;
  readonly upY?: SpatialAudioParamLike;
  readonly upZ?: SpatialAudioParamLike;
  setPosition?: (x: number, y: number, z: number) => void;
  setOrientation?: (
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number,
  ) => void;
}

export interface SpatialAudioContextLike {
  readonly currentTime: number;
  readonly destination: SpatialAudioNodeLike;
  readonly listener?: SpatialAudioListenerLike;
  createGain: () => SpatialGainNodeLike;
  createBiquadFilter: () => SpatialBiquadFilterNodeLike;
  createPanner: () => SpatialPannerNodeLike;
}

export interface PeerAudioChannelSnapshot {
  readonly peerId: string;
  readonly panningModel: PanningModelType;
  readonly distanceModel: DistanceModelType;
  readonly position: SpatialVec3;
  readonly lowpassHz: number;
  readonly dryGain: number;
  readonly reverbSendGain: number;
}

export interface SpatialAudioGraphSnapshot {
  readonly backend: "webaudio" | "headless-fallback";
  readonly zoneId: AcousticZoneId;
  readonly rt60Sec: number;
  readonly listener: SpatialListenerState;
  readonly channelCount: number;
  readonly channels: readonly PeerAudioChannelSnapshot[];
  readonly disposed: boolean;
}

interface PeerWebAudioNodes {
  readonly inputGain: SpatialGainNodeLike;
  readonly lowpassFilter: SpatialBiquadFilterNodeLike;
  readonly panner: SpatialPannerNodeLike;
  readonly reverbSend: SpatialGainNodeLike;
}

function roundGain(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function setAudioParamSmooth(
  param: SpatialAudioParamLike | undefined,
  value: number,
  currentTime: number,
): void {
  if (!param) return;
  if (typeof param.setTargetAtTime === "function") {
    param.setTargetAtTime(value, currentTime, 0.025);
  } else {
    param.value = value;
  }
}

export class SpatialBinauralAudioGraph {
  private readonly audioCtx: SpatialAudioContextLike | null;
  private readonly masterGain: SpatialGainNodeLike | null;
  private readonly reverbBusGain: SpatialGainNodeLike | null;
  private readonly peerNodes = new Map<string, PeerWebAudioNodes>();
  private readonly peerSnapshots = new Map<string, PeerAudioChannelSnapshot>();
  private activeZoneId: AcousticZoneId;
  private currentListener: SpatialListenerState;
  private isDisposed = false;

  constructor(
    options: {
      readonly audioContext?: SpatialAudioContextLike | null;
      readonly zoneId?: AcousticZoneId;
      readonly listener?: SpatialListenerState;
    } = {},
  ) {
    this.activeZoneId = options.zoneId ?? "wood-atelier";
    this.currentListener = options.listener ?? createDefaultListenerState();
    this.audioCtx = options.audioContext ?? null;

    if (this.audioCtx) {
      this.masterGain = this.audioCtx.createGain();
      this.reverbBusGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 0.9;
      this.reverbBusGain.gain.value = ACOUSTIC_ZONE_PROFILES[this.activeZoneId].reverbWetMix;
      this.reverbBusGain.connect(this.masterGain);
      this.masterGain.connect(this.audioCtx.destination);
      this.syncListener(this.currentListener);
    } else {
      this.masterGain = null;
      this.reverbBusGain = null;
    }
  }

  public setZone(zoneId: AcousticZoneId): void {
    if (this.isDisposed) return;
    this.activeZoneId = zoneId;
    if (this.audioCtx && this.reverbBusGain) {
      const wetMix = ACOUSTIC_ZONE_PROFILES[zoneId].reverbWetMix;
      setAudioParamSmooth(this.reverbBusGain.gain, wetMix, this.audioCtx.currentTime);
    }
  }

  public syncListener(listener: SpatialListenerState): void {
    if (this.isDisposed) return;
    this.currentListener = listener;

    const audioListener = this.audioCtx?.listener;
    if (!this.audioCtx || !audioListener) return;

    const now = this.audioCtx.currentTime;
    const { forward, up } = computeListenerBasis(listener.yawDeg);

    if (audioListener.positionX && audioListener.positionY && audioListener.positionZ) {
      setAudioParamSmooth(audioListener.positionX, listener.position.x, now);
      setAudioParamSmooth(audioListener.positionY, listener.position.y, now);
      setAudioParamSmooth(audioListener.positionZ, listener.position.z, now);
    } else if (typeof audioListener.setPosition === "function") {
      audioListener.setPosition(listener.position.x, listener.position.y, listener.position.z);
    }

    if (
      audioListener.forwardX &&
      audioListener.forwardY &&
      audioListener.forwardZ &&
      audioListener.upX &&
      audioListener.upY &&
      audioListener.upZ
    ) {
      setAudioParamSmooth(audioListener.forwardX, forward.x, now);
      setAudioParamSmooth(audioListener.forwardY, forward.y, now);
      setAudioParamSmooth(audioListener.forwardZ, forward.z, now);
      setAudioParamSmooth(audioListener.upX, up.x, now);
      setAudioParamSmooth(audioListener.upY, up.y, now);
      setAudioParamSmooth(audioListener.upZ, up.z, now);
    } else if (typeof audioListener.setOrientation === "function") {
      audioListener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  public syncStageMix(
    report: AcousticStageMixReport,
    sources: readonly SpatialPeerAudioSource[],
  ): SpatialAudioGraphSnapshot {
    if (this.isDisposed) return this.getSnapshot();
    this.setZone(report.zone.id);
    this.syncListener(report.listener);

    const sourceById = new Map<string, SpatialPeerAudioSource>();
    for (const source of sources) {
      sourceById.set(source.peerId, source);
    }

    for (const mix of report.peerMixes) {
      const source = sourceById.get(mix.peerId);
      if (!source) continue;
      this.upsertPeerChannel(source, mix);
    }

    return this.getSnapshot();
  }

  public upsertPeerChannel(
    source: SpatialPeerAudioSource,
    mix: HrtfSpatialEvaluation,
  ): PeerAudioChannelSnapshot {
    const channelGain = Math.max(mix.pencilPenAsmrGain, mix.footstepGain, mix.voiceGain);
    const snapshot: PeerAudioChannelSnapshot = {
      peerId: source.peerId,
      panningModel: "HRTF",
      distanceModel: "inverse",
      position: source.position,
      lowpassHz: mix.effectiveLowpassHz,
      dryGain: roundGain(channelGain),
      reverbSendGain: mix.reverbSendGain,
    };
    this.peerSnapshots.set(source.peerId, snapshot);

    if (!this.audioCtx || !this.masterGain || !this.reverbBusGain || this.isDisposed) {
      return snapshot;
    }

    let nodes = this.peerNodes.get(source.peerId);
    if (!nodes) {
      const inputGain = this.audioCtx.createGain();
      const lowpassFilter = this.audioCtx.createBiquadFilter();
      lowpassFilter.type = "lowpass";
      lowpassFilter.Q.value = 0.707;

      const panner = this.audioCtx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.maxDistance = 18;
      panner.rolloffFactor = 1;

      const reverbSend = this.audioCtx.createGain();
      inputGain.connect(lowpassFilter);
      lowpassFilter.connect(panner);
      panner.connect(this.masterGain);
      lowpassFilter.connect(reverbSend);
      reverbSend.connect(this.reverbBusGain);

      nodes = { inputGain, lowpassFilter, panner, reverbSend };
      this.peerNodes.set(source.peerId, nodes);
    }

    const now = this.audioCtx.currentTime;
    setAudioParamSmooth(nodes.inputGain.gain, channelGain, now);
    setAudioParamSmooth(nodes.lowpassFilter.frequency, mix.effectiveLowpassHz, now);
    setAudioParamSmooth(nodes.reverbSend.gain, mix.reverbSendGain, now);

    if (nodes.panner.positionX && nodes.panner.positionY && nodes.panner.positionZ) {
      setAudioParamSmooth(nodes.panner.positionX, source.position.x, now);
      setAudioParamSmooth(nodes.panner.positionY, source.position.y, now);
      setAudioParamSmooth(nodes.panner.positionZ, source.position.z, now);
    } else if (typeof nodes.panner.setPosition === "function") {
      nodes.panner.setPosition(source.position.x, source.position.y, source.position.z);
    }

    return snapshot;
  }

  public getSnapshot(): SpatialAudioGraphSnapshot {
    const zone = ACOUSTIC_ZONE_PROFILES[this.activeZoneId];
    return {
      backend: this.audioCtx ? "webaudio" : "headless-fallback",
      zoneId: zone.id,
      rt60Sec: zone.rt60Sec,
      listener: this.currentListener,
      channelCount: this.peerSnapshots.size,
      channels: Array.from(this.peerSnapshots.values()),
      disposed: this.isDisposed,
    };
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    for (const nodes of this.peerNodes.values()) {
      nodes.inputGain.disconnect?.();
      nodes.lowpassFilter.disconnect?.();
      nodes.panner.disconnect?.();
      nodes.reverbSend.disconnect?.();
    }
    this.peerNodes.clear();
    this.reverbBusGain?.disconnect?.();
    this.masterGain?.disconnect?.();
  }
}

/**
 * 브라우저 환경에서 안전하게 WebAudio 컨텍스트를 탐지해 HRTF 그래프를 생성한다.
 * SSR·JSDOM·자동재생 제한 환경에서는 예외 없이 headless 폴백 그래프를 반환한다.
 */
export function createSafeSpatialAudioGraph(
  zoneId: AcousticZoneId = "wood-atelier",
  listener: SpatialListenerState = createDefaultListenerState(),
): SpatialBinauralAudioGraph {
  if (typeof globalThis === "undefined") {
    return new SpatialBinauralAudioGraph({ audioContext: null, zoneId, listener });
  }

  const candidate = globalThis as {
    AudioContext?: new () => SpatialAudioContextLike;
    webkitAudioContext?: new () => SpatialAudioContextLike;
  };
  const AudioCtor = candidate.AudioContext ?? candidate.webkitAudioContext;

  if (typeof AudioCtor !== "function") {
    return new SpatialBinauralAudioGraph({ audioContext: null, zoneId, listener });
  }

  try {
    const ctx = new AudioCtor();
    return new SpatialBinauralAudioGraph({ audioContext: ctx, zoneId, listener });
  } catch {
    return new SpatialBinauralAudioGraph({ audioContext: null, zoneId, listener });
  }
}
