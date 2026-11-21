import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";

export interface SpatialAudioListenerPose {
  readonly point: StudioVirtualSpacePoint;
  readonly cameraYawRadians: number;
}

export interface SpatialAudioPeerCoordinates {
  /** Listener-relative X in meters (-left, +right) */
  readonly x: number;
  /** Listener-relative Z in meters (-forward, +behind) */
  readonly z: number;
  /** Stereo pan fallback (-1..+1) */
  readonly pan: number;
  /** World distance in meters */
  readonly distanceMeters: number;
}

const PIXELS_TO_METERS = 1 / 32;

/**
 * Pure, deterministic listener-relative 3D audio coordinate projection.
 * Rotates world offset into the listener's camera frame so left/right panning
 * matches what the user sees on screen in both 2D and 3D camera yaw orientations.
 */
export function computeSpatialAudioCoordinates(
  listener: SpatialAudioListenerPose,
  peerPoint: StudioVirtualSpacePoint,
  scale = PIXELS_TO_METERS,
): SpatialAudioPeerCoordinates {
  const dx = (peerPoint.x - listener.point.x) * scale;
  const dz = (peerPoint.y - listener.point.y) * scale;
  const cos = Math.cos(listener.cameraYawRadians);
  const sin = Math.sin(listener.cameraYawRadians);
  const relX = dx * cos + dz * sin;
  const relZ = -dx * sin + dz * cos;
  const distanceMeters = Math.hypot(relX, relZ);
  const pan = distanceMeters > 0.05
    ? Math.max(-1, Math.min(1, relX / Math.max(1.5, distanceMeters)))
    : 0;
  return Object.freeze({ x: relX, z: relZ, pan, distanceMeters });
}

interface PeerAudioPipeline {
  readonly source: MediaStreamAudioSourceNode;
  readonly panner: PannerNode | StereoPannerNode | null;
  readonly gain: GainNode;
  stream: MediaStream;
}

/**
 * WebAudio HRTF PannerNode spatial audio engine with StereoPannerNode fallback.
 * Gracefully degrades to no-op in environments without AudioContext (e.g. jsdom).
 */
export class StudioVirtualSpaceSpatialAudioEngine {
  private context: AudioContext | null = null;
  private readonly peers = new Map<string, PeerAudioPipeline>();
  private listenerPose: SpatialAudioListenerPose = { point: { x: 0, y: 0 }, cameraYawRadians: 0 };
  private disposed = false;

  private ensureContext(): AudioContext | null {
    if (this.disposed || typeof window === "undefined") return null;
    if (this.context) return this.context;
    const AudioCtx = window.AudioContext
      ?? (window as unknown as { readonly webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      this.context = new AudioCtx();
      return this.context;
    } catch {
      return null;
    }
  }

  get active(): boolean {
    return this.context !== null && this.context.state === "running";
  }

  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }
  }

  updateListener(pose: SpatialAudioListenerPose): void {
    this.listenerPose = pose;
    const ctx = this.context;
    if (!ctx) return;
    const listener = ctx.listener;
    if (listener.positionX && listener.positionZ) {
      listener.positionX.setTargetAtTime(0, ctx.currentTime, 0.04);
      listener.positionZ.setTargetAtTime(0, ctx.currentTime, 0.04);
    }
    if (listener.forwardX && listener.forwardZ) {
      listener.forwardX.setTargetAtTime(0, ctx.currentTime, 0.04);
      listener.forwardZ.setTargetAtTime(-1, ctx.currentTime, 0.04);
    }
  }

  attachPeerStream(peerId: string, stream: MediaStream | null): boolean {
    if (this.disposed) return false;
    const existing = this.peers.get(peerId);
    if (!stream || stream.getAudioTracks().length === 0) {
      this.detachPeer(peerId);
      return false;
    }
    if (existing && existing.stream === stream) return true;
    this.detachPeer(peerId);

    const ctx = this.ensureContext();
    if (!ctx) return false;
    try {
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = 1;
      let panner: PannerNode | StereoPannerNode | null = null;
      if (typeof ctx.createPanner === "function") {
        const hrtf = ctx.createPanner();
        hrtf.panningModel = "HRTF";
        hrtf.distanceModel = "inverse";
        hrtf.refDistance = 1.5;
        hrtf.maxDistance = 18;
        hrtf.rolloffFactor = 1.2;
        panner = hrtf;
      } else if (typeof ctx.createStereoPanner === "function") {
        panner = ctx.createStereoPanner();
      }
      if (panner) {
        source.connect(panner);
        panner.connect(gain);
      } else {
        source.connect(gain);
      }
      gain.connect(ctx.destination);
      this.peers.set(peerId, { source, panner, gain, stream });
      return true;
    } catch {
      return false;
    }
  }

  updatePeerPosition(
    peerId: string,
    peerPoint: StudioVirtualSpacePoint,
    distanceGain: number,
    muted = false,
  ): SpatialAudioPeerCoordinates | null {
    const coords = computeSpatialAudioCoordinates(this.listenerPose, peerPoint);
    const pipeline = this.peers.get(peerId);
    const ctx = this.context;
    if (!pipeline || !ctx) return coords;

    const targetGain = muted ? 0 : Math.max(0, Math.min(1, distanceGain));
    pipeline.gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);
    const panner = pipeline.panner;
    if (panner && "positionX" in panner) {
      panner.positionX.setTargetAtTime(coords.x, ctx.currentTime, 0.05);
      panner.positionY.setTargetAtTime(0, ctx.currentTime, 0.05);
      panner.positionZ.setTargetAtTime(coords.z, ctx.currentTime, 0.05);
    } else if (panner && "pan" in panner) {
      panner.pan.setTargetAtTime(coords.pan, ctx.currentTime, 0.05);
    }
    return coords;
  }

  detachPeer(peerId: string): void {
    const pipeline = this.peers.get(peerId);
    if (!pipeline) return;
    this.peers.delete(peerId);
    try {
      pipeline.source.disconnect();
      pipeline.panner?.disconnect();
      pipeline.gain.disconnect();
    } catch {
      // Disconnection cleanup is idempotent.
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of [...this.peers.keys()]) this.detachPeer(id);
    const ctx = this.context;
    this.context = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }
}
