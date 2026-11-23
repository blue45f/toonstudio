/**
 * 가상 스튜디오 6종 상호작용 스테이션 상태 머신 및 4종 바닥 재질 Web Audio 절차적 음향 합성기.
 * - 브라우저 저장소 접근 0건, 원시 색상 코드 0건(시맨틱 톤 키만 노출).
 * - 모든 Web Audio 노드는 onended에서 .disconnect(), dispose() 시 활성 노드 해제 및 AudioContext.close().
 */

export type AtelierSemanticTone = "accent" | "cool" | "good" | "warn";
export type AtelierStationId = "easel" | "turntable" | "mannequin" | "sticky-board" | "coffee-bar" | "lighting-dimmer";
export type EaselPigmentId = "persimmon" | "cobalt" | "emerald" | "ochre";
export type TurntableTrackId = "lofi-ink" | "rain-jazz" | "midnight-vinyl";
export type MannequinPoseId = "hero-stance" | "action-leap" | "seated-sketch" | "dialogue-turn";
export type AtelierBrewId = "hand-drip" | "espresso" | "matcha-latte";
export type PomodoroPhaseId = "focus-25" | "break-5" | "deep-50";
export type LightingPresetId = "morning-sun" | "golden-hour" | "blue-dusk" | "midnight-desk";
export type AtelierFootstepSurface = "hardwood" | "tatami" | "rainy-rooftop" | "stone-courtyard";
export type AtelierFootstepFoot = "left" | "right";
export type AtelierParticleKind =
  | "stroke-spark" | "vinyl-note" | "pedestal-arc" | "note-pop" | "coffee-steam" | "light-ray"
  | "wood-chip" | "tatami-fiber" | "rain-ripple" | "stone-dust";

export interface AtelierParticleItem {
  readonly id: string; readonly kind: AtelierParticleKind; readonly tone: AtelierSemanticTone;
  readonly txPx: number; readonly tyPx: number; readonly scale: number; readonly rotateDeg: number; readonly opacity: number;
}
export interface AtelierStickyNote {
  readonly id: string; readonly textKo: string; readonly textEn: string;
  readonly tone: AtelierSemanticTone; readonly resolved: boolean;
}
export interface AtelierFootstepAcousticSpec {
  readonly surface: AtelierFootstepSurface; readonly labelKo: string; readonly labelEn: string;
  readonly vibeKo: string; readonly vibeEn: string; readonly tone: AtelierSemanticTone;
  readonly particleKind: AtelierParticleKind; readonly filterType: BiquadFilterType;
  readonly filterStartHz: number; readonly filterEndHz: number; readonly filterQ: number;
  readonly noisePeak: number; readonly durationMs: number; readonly oscWave: OscillatorType;
  readonly oscStartHz: number; readonly oscEndHz: number; readonly oscPeak: number; readonly oscDurationMs: number;
  readonly echo: { readonly delayMs: number; readonly gainScale: number; readonly pitchScale: number } | null;
}
export interface AtelierStationsState {
  readonly activeStation: AtelierStationId; readonly soundEnabled: boolean; readonly eventSeq: number;
  readonly particles: readonly AtelierParticleItem[]; readonly lastFeedbackKo: string; readonly lastFeedbackEn: string;
  readonly easel: { readonly strokeCount: number; readonly pigment: EaselPigmentId };
  readonly turntable: { readonly playing: boolean; readonly track: TurntableTrackId; readonly rpm: 33 | 45; readonly volume: number };
  readonly mannequin: { readonly angleDeg: number; readonly pose: MannequinPoseId; readonly spins: number };
  readonly stickyBoard: { readonly notes: readonly AtelierStickyNote[]; readonly nextId: number };
  readonly coffeeBar: { readonly brew: AtelierBrewId; readonly cupsBrewed: number; readonly phase: PomodoroPhaseId; readonly running: boolean; readonly remainingMinutes: number };
  readonly lighting: { readonly preset: LightingPresetId; readonly brightness: number };
  readonly footstep: { readonly surface: AtelierFootstepSurface; readonly nextFoot: AtelierFootstepFoot; readonly stepCount: number };
}
export type AtelierStationsAction =
  | { readonly type: "easel-stroke"; readonly pigment?: EaselPigmentId; readonly reducedMotion?: boolean }
  | { readonly type: "easel-pigment"; readonly pigment: EaselPigmentId }
  | { readonly type: "turntable-toggle"; readonly reducedMotion?: boolean }
  | { readonly type: "turntable-track"; readonly track: TurntableTrackId }
  | { readonly type: "turntable-rpm" }
  | { readonly type: "turntable-volume"; readonly volume: number }
  | { readonly type: "mannequin-rotate"; readonly deltaDeg: number; readonly reducedMotion?: boolean }
  | { readonly type: "mannequin-pose"; readonly pose: MannequinPoseId; readonly reducedMotion?: boolean }
  | { readonly type: "sticky-add"; readonly text?: string; readonly reducedMotion?: boolean }
  | { readonly type: "sticky-toggle"; readonly id: string }
  | { readonly type: "sticky-clear-resolved" }
  | { readonly type: "coffee-brew"; readonly brew?: AtelierBrewId; readonly reducedMotion?: boolean }
  | { readonly type: "coffee-phase"; readonly phase: PomodoroPhaseId }
  | { readonly type: "coffee-toggle-timer" }
  | { readonly type: "lighting-preset"; readonly preset: LightingPresetId; readonly reducedMotion?: boolean }
  | { readonly type: "lighting-brightness"; readonly brightness: number }
  | { readonly type: "footstep-step"; readonly surface?: AtelierFootstepSurface; readonly reducedMotion?: boolean }
  | { readonly type: "sound-toggle" };

export const EASEL_PIGMENT_TONES: Readonly<Record<EaselPigmentId, AtelierSemanticTone>> = Object.freeze({
  persimmon: "accent", cobalt: "cool", emerald: "good", ochre: "warn",
});
export const POMODORO_MINUTES: Readonly<Record<PomodoroPhaseId, number>> = Object.freeze({ "focus-25": 25, "break-5": 5, "deep-50": 50 });
export const LIGHTING_DEFAULT_BRIGHTNESS: Readonly<Record<LightingPresetId, number>> = Object.freeze({
  "morning-sun": 92, "golden-hour": 74, "blue-dusk": 56, "midnight-desk": 36,
});
export const ATELIER_FOOTSTEP_ORDER: readonly AtelierFootstepSurface[] = Object.freeze([
  "hardwood", "tatami", "rainy-rooftop", "stone-courtyard",
]);
export const ATELIER_FOOTSTEP_SPECS: Readonly<Record<AtelierFootstepSurface, AtelierFootstepAcousticSpec>> = Object.freeze({
  hardwood: { surface: "hardwood", labelKo: "원목 마루", labelEn: "Hardwood", vibeKo: "따뜻한 마루 울림 · 나무결 조각", vibeEn: "Warm plank resonance · wood chips", tone: "warn", particleKind: "wood-chip", filterType: "bandpass", filterStartHz: 840, filterEndHz: 460, filterQ: 1.2, noisePeak: 0.62, durationMs: 76, oscWave: "triangle", oscStartHz: 162, oscEndHz: 96, oscPeak: 0.34, oscDurationMs: 56, echo: null },
  tatami: { surface: "tatami", labelKo: "다다미", labelEn: "Tatami Mat", vibeKo: "부드러운 왕골 스침 · 섬유 보풀", vibeEn: "Soft woven reed brush · lint wisps", tone: "good", particleKind: "tatami-fiber", filterType: "lowpass", filterStartHz: 540, filterEndHz: 290, filterQ: 0.75, noisePeak: 0.46, durationMs: 68, oscWave: "sine", oscStartHz: 118, oscEndHz: 78, oscPeak: 0.18, oscDurationMs: 44, echo: null },
  "rainy-rooftop": { surface: "rainy-rooftop", labelKo: "비 오는 옥상", labelEn: "Rainy Rooftop", vibeKo: "물웅덩이 철벅임 · 빗방울 파문", vibeEn: "Crisp puddle splash · rain ripples", tone: "cool", particleKind: "rain-ripple", filterType: "bandpass", filterStartHz: 2350, filterEndHz: 980, filterQ: 1.5, noisePeak: 0.72, durationMs: 92, oscWave: "sine", oscStartHz: 1460, oscEndHz: 980, oscPeak: 0.2, oscDurationMs: 38, echo: { delayMs: 36, gainScale: 0.45, pitchScale: 1.24 } },
  "stone-courtyard": { surface: "stone-courtyard", labelKo: "돌 안뜰", labelEn: "Stone Courtyard", vibeKo: "또렷한 석재 탭 · 안뜰 잔향", vibeEn: "Crisp mineral tap · courtyard echo", tone: "accent", particleKind: "stone-dust", filterType: "bandpass", filterStartHz: 1860, filterEndHz: 1120, filterQ: 1.75, noisePeak: 0.68, durationMs: 54, oscWave: "sine", oscStartHz: 910, oscEndHz: 540, oscPeak: 0.24, oscDurationMs: 34, echo: { delayMs: 62, gainScale: 0.34, pitchScale: 0.91 } },
});

const INITIAL_STICKY_NOTES: readonly AtelierStickyNote[] = Object.freeze([
  { id: "note-1", textKo: "3컷 역광 하이라이트 보강", textEn: "Boost backlight rim on panel 3", tone: "warn", resolved: false },
  { id: "note-2", textKo: "말풍선 꼬리 우측 정렬", textEn: "Align speech tail to right", tone: "accent", resolved: false },
  { id: "note-3", textKo: "계단 투시선 최종 확인", textEn: "Final check on stair perspective", tone: "cool", resolved: true },
]);
const QUICK_STAMPS = [
  { ko: "표정 눈썹 각도 미세 조정", en: "Refine eyebrow expression angle", tone: "accent" as AtelierSemanticTone },
  { ko: "톤 경계 그라데이션 정리", en: "Smooth screentone gradient edge", tone: "cool" as AtelierSemanticTone },
  { ko: "효과음 외곽선 대비 상향", en: "Raise SFX outline contrast", tone: "warn" as AtelierSemanticTone },
  { ko: "최종 출고 해상도 확인 완료", en: "Verify export resolution spec", tone: "good" as AtelierSemanticTone },
] as const;
const STATION_CUES: Readonly<Record<AtelierStationId, readonly [OscillatorType, number, number, number]>> = Object.freeze({
  easel: ["triangle", 640, 1020, 0.075], turntable: ["sine", 392, 587, 0.11], mannequin: ["triangle", 320, 210, 0.06],
  "sticky-board": ["sine", 860, 1140, 0.055], "coffee-bar": ["sine", 523, 659, 0.1], "lighting-dimmer": ["sine", 440, 520, 0.065],
});
const MAX_STICKY_NOTES = 8;
const clamp = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : min);

export function resolveDefaultFootstepSurface(zoneId?: string | null, weather?: string | null): AtelierFootstepSurface {
  if (weather === "rain" || weather === "thunderstorm") return "rainy-rooftop";
  if (zoneId === "lounge" || zoneId === "teams") return "tatami";
  if (zoneId === "release" || zoneId === "live") return "rainy-rooftop";
  if (zoneId === "lobby" || zoneId === "assets" || zoneId === "review" || zoneId === "quality") return "stone-courtyard";
  return "hardwood";
}

export function spawnAtelierParticles(kind: AtelierParticleKind, tone: AtelierSemanticTone, seq: number, reducedMotion = false): readonly AtelierParticleItem[] {
  if (reducedMotion) return [];
  return Object.freeze(Array.from({ length: 5 }, (_, i) => Object.freeze({
    id: `${kind}-${seq}-${i}`, kind, tone,
    txPx: (i - 2) * 19 + ((seq * 7) % 9) - 4, tyPx: -14 - ((i + seq) % 3) * 9,
    scale: Number((0.8 + ((i + seq) % 3) * 0.22).toFixed(2)),
    rotateDeg: (i - 2) * 24 + ((seq * 13) % 18), opacity: Number((0.72 + (i % 2) * 0.2).toFixed(2)),
  })));
}

export function createInitialAtelierStationsState(options: { readonly zoneId?: string | null; readonly weather?: string | null } = {}): AtelierStationsState {
  return Object.freeze<AtelierStationsState>({
    activeStation: "easel", soundEnabled: true, eventSeq: 0, particles: [],
    lastFeedbackKo: "스테이션이나 바닥 재질을 눌러 바로 반응과 소리를 체험해요.",
    lastFeedbackEn: "Tap any station or floor surface for instant feedback and audio.",
    easel: { strokeCount: 0, pigment: "persimmon" },
    turntable: { playing: false, track: "lofi-ink", rpm: 33, volume: 68 },
    mannequin: { angleDeg: 0, pose: "hero-stance", spins: 0 },
    stickyBoard: { notes: INITIAL_STICKY_NOTES, nextId: 4 },
    coffeeBar: { brew: "hand-drip", cupsBrewed: 1, phase: "focus-25", running: false, remainingMinutes: 25 },
    lighting: { preset: "golden-hour", brightness: 74 },
    footstep: { surface: resolveDefaultFootstepSurface(options.zoneId, options.weather), nextFoot: "left", stepCount: 0 },
  });
}

function withBurst(
  state: AtelierStationsState, patch: Partial<AtelierStationsState>, kind: AtelierParticleKind | null,
  tone: AtelierSemanticTone, ko: string, en: string, rm: boolean,
): AtelierStationsState {
  const eventSeq = state.eventSeq + 1;
  return { ...state, ...patch, eventSeq, particles: kind ? spawnAtelierParticles(kind, tone, eventSeq, rm) : [], lastFeedbackKo: ko, lastFeedbackEn: en };
}

export function reduceAtelierStationsState(state: AtelierStationsState, action: AtelierStationsAction): AtelierStationsState {
  const rm = "reducedMotion" in action ? Boolean(action.reducedMotion) : false;
  switch (action.type) {
    case "easel-pigment": return { ...state, activeStation: "easel", easel: { ...state.easel, pigment: action.pigment } };
    case "easel-stroke": {
      const pigment = action.pigment ?? state.easel.pigment;
      const strokeCount = state.easel.strokeCount + 1;
      return withBurst(state, { activeStation: "easel", easel: { strokeCount, pigment } }, "stroke-spark", EASEL_PIGMENT_TONES[pigment], `원목 이젤 실시간 획 #${strokeCount} · 스파크 반응`, `Wood easel live stroke #${strokeCount} · spark burst`, rm);
    }
    case "turntable-toggle": {
      const playing = !state.turntable.playing;
      return withBurst(state, { activeStation: "turntable", turntable: { ...state.turntable, playing } }, playing ? "vinyl-note" : null, "cool", playing ? `턴테이블 재생 시작 (${state.turntable.rpm} RPM)` : "턴테이블 일시 정지", playing ? `Turntable spinning (${state.turntable.rpm} RPM)` : "Turntable paused", rm);
    }
    case "turntable-track": return { ...state, activeStation: "turntable", turntable: { ...state.turntable, track: action.track } };
    case "turntable-rpm": return { ...state, activeStation: "turntable", turntable: { ...state.turntable, rpm: state.turntable.rpm === 33 ? 45 : 33 } };
    case "turntable-volume": return { ...state, activeStation: "turntable", turntable: { ...state.turntable, volume: clamp(action.volume, 0, 100) } };
    case "mannequin-rotate": {
      const angleDeg = (((state.mannequin.angleDeg + action.deltaDeg) % 360) + 360) % 360;
      return withBurst(state, { activeStation: "mannequin", mannequin: { ...state.mannequin, angleDeg, spins: state.mannequin.spins + 1 } }, "pedestal-arc", "accent", `3D 포즈 마네킹 받침대 ${angleDeg}° 회전`, `3D pose mannequin pedestal rotated to ${angleDeg}°`, rm);
    }
    case "mannequin-pose": return withBurst(state, { activeStation: "mannequin", mannequin: { ...state.mannequin, pose: action.pose } }, "pedestal-arc", "cool", "3D 포즈 마네킹 프리셋 전환", "Switched 3D mannequin pose preset", rm);
    case "sticky-add": {
      const trimmed = action.text?.trim() ?? "";
      const stamp = QUICK_STAMPS[(state.stickyBoard.nextId - 1) % QUICK_STAMPS.length] ?? QUICK_STAMPS[0];
      const note: AtelierStickyNote = { id: `note-${state.stickyBoard.nextId}`, textKo: trimmed || stamp.ko, textEn: trimmed || stamp.en, tone: stamp.tone, resolved: false };
      const notes = [note, ...state.stickyBoard.notes].slice(0, MAX_STICKY_NOTES);
      return withBurst(state, { activeStation: "sticky-board", stickyBoard: { notes, nextId: state.stickyBoard.nextId + 1 } }, "note-pop", note.tone, `수정 포스트잇 추가 (총 ${notes.length}장)`, `Added revision sticky note (${notes.length} total)`, rm);
    }
    case "sticky-toggle": return { ...state, activeStation: "sticky-board", stickyBoard: { ...state.stickyBoard, notes: state.stickyBoard.notes.map((n) => (n.id === action.id ? { ...n, resolved: !n.resolved } : n)) } };
    case "sticky-clear-resolved": return { ...state, activeStation: "sticky-board", stickyBoard: { ...state.stickyBoard, notes: state.stickyBoard.notes.filter((n) => !n.resolved) } };
    case "coffee-brew": {
      const brew = action.brew ?? state.coffeeBar.brew;
      const cupsBrewed = state.coffeeBar.cupsBrewed + 1;
      return withBurst(state, { activeStation: "coffee-bar", coffeeBar: { ...state.coffeeBar, brew, cupsBrewed } }, "coffee-steam", "warn", `아틀리에 커피 바 추출 완료 (#${cupsBrewed}잔)`, `Brewed fresh atelier cup (#${cupsBrewed})`, rm);
    }
    case "coffee-phase": return { ...state, activeStation: "coffee-bar", coffeeBar: { ...state.coffeeBar, phase: action.phase, remainingMinutes: POMODORO_MINUTES[action.phase], running: false } };
    case "coffee-toggle-timer": return { ...state, activeStation: "coffee-bar", coffeeBar: { ...state.coffeeBar, running: !state.coffeeBar.running } };
    case "lighting-preset": {
      const brightness = LIGHTING_DEFAULT_BRIGHTNESS[action.preset];
      return withBurst(state, { activeStation: "lighting-dimmer", lighting: { preset: action.preset, brightness } }, "light-ray", "warn", `채광·시간대 디머 전환 (${brightness}%)`, `Lighting dimmer switched (${brightness}%)`, rm);
    }
    case "lighting-brightness": return { ...state, activeStation: "lighting-dimmer", lighting: { ...state.lighting, brightness: clamp(action.brightness, 20, 100) } };
    case "footstep-step": {
      const surface = action.surface ?? state.footstep.surface;
      const foot = state.footstep.nextFoot;
      const spec = ATELIER_FOOTSTEP_SPECS[surface];
      const stepCount = state.footstep.stepCount + 1;
      return withBurst(state, { footstep: { surface, nextFoot: foot === "left" ? "right" : "left", stepCount } }, spec.particleKind, spec.tone, `${spec.labelKo} · ${foot === "left" ? "왼발" : "오른발"} 발걸음 #${stepCount}`, `${spec.labelEn} · ${foot} footstep #${stepCount}`, rm);
    }
    case "sound-toggle": return { ...state, soundEnabled: !state.soundEnabled };
  }
}

export type AtelierAudioContextFactory = () => AudioContext | null;
function defaultAudioContextFactory(): AudioContext | null {
  const Ctor = (globalThis as { readonly AudioContext?: typeof AudioContext }).AudioContext;
  if (typeof Ctor !== "function") return null;
  try { return new Ctor(); } catch { return null; }
}
const safeDisconnect = (node: AudioNode): void => { try { node.disconnect(); } catch { /* noop */ } };

/** 4종 바닥 재질 발걸음 + 6종 스테이션 촉각 효과음 Web Audio 절차적 합성기. */
export class AtelierProceduralAudioSynth {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly activeNodes = new Set<AudioNode>();
  private disposed = false;

  constructor(private readonly createContext: AtelierAudioContextFactory = defaultAudioContextFactory) {}

  playFootstep(surface: AtelierFootstepSurface, foot: AtelierFootstepFoot, volume = 0.72): boolean {
    const ready = this.ensureReady();
    if (!ready) return false;
    const { context, master } = ready;
    const spec = ATELIER_FOOTSTEP_SPECS[surface];
    const footScale = foot === "left" ? 0.94 : 1.06;
    const gainScale = Math.max(0.05, Math.min(1, volume)) * 0.55;
    const now = context.currentTime;
    this.scheduleNoiseVoice(context, master, now, spec, footScale, gainScale);
    this.scheduleToneVoice(context, master, now, spec.oscWave, spec.oscStartHz * footScale, spec.oscEndHz * footScale, spec.oscDurationMs / 1000, spec.oscPeak * gainScale);
    if (spec.echo) {
      this.scheduleToneVoice(context, master, now + spec.echo.delayMs / 1000, spec.oscWave, spec.oscStartHz * footScale * spec.echo.pitchScale, spec.oscEndHz * footScale * spec.echo.pitchScale, (spec.oscDurationMs * 0.8) / 1000, spec.oscPeak * gainScale * spec.echo.gainScale);
    }
    return true;
  }

  playStationCue(station: AtelierStationId, volume = 0.45): boolean {
    const ready = this.ensureReady();
    if (!ready) return false;
    const [wave, fromHz, toHz, dur] = STATION_CUES[station];
    this.scheduleToneVoice(ready.context, ready.master, ready.context.currentTime, wave, fromHz, toHz, dur, Math.max(0.05, Math.min(1, volume)) * 0.35);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const node of this.activeNodes) safeDisconnect(node);
    this.activeNodes.clear();
    if (this.masterGain) safeDisconnect(this.masterGain);
    this.masterGain = null;
    this.noiseBuffer = null;
    const ctx = this.context;
    this.context = null;
    if (ctx && typeof ctx.close === "function") void ctx.close().catch(() => undefined);
  }

  private ensureReady(): { readonly context: AudioContext; readonly master: GainNode } | null {
    if (this.disposed) return null;
    if (!this.context) {
      const created = this.createContext();
      if (!created) return null;
      this.context = created;
      this.masterGain = created.createGain();
      this.masterGain.gain.value = 0.85;
      this.masterGain.connect(created.destination);
    }
    if (!this.masterGain) return null;
    if (this.context.state === "suspended" && typeof this.context.resume === "function") void this.context.resume().catch(() => undefined);
    return { context: this.context, master: this.masterGain };
  }

  private createEnvelope(context: AudioContext, start: number, dur: number, peak: number, attack: number): GainNode {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    return gain;
  }

  private bindCleanup(source: AudioScheduledSourceNode, chain: readonly AudioNode[]): void {
    for (const node of chain) this.activeNodes.add(node);
    source.onended = () => { for (const node of chain) { safeDisconnect(node); this.activeNodes.delete(node); } };
  }

  private getNoiseBuffer(context: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === context.sampleRate) return this.noiseBuffer;
    const buffer = context.createBuffer(1, Math.max(1024, Math.floor(context.sampleRate * 0.4)), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = ((i * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  private scheduleNoiseVoice(context: AudioContext, master: GainNode, start: number, spec: AtelierFootstepAcousticSpec, footScale: number, gainScale: number): void {
    const source = context.createBufferSource();
    source.buffer = this.getNoiseBuffer(context);
    const filter = context.createBiquadFilter();
    filter.type = spec.filterType;
    filter.Q.value = spec.filterQ;
    const dur = spec.durationMs / 1000;
    filter.frequency.setValueAtTime(spec.filterStartHz * footScale, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, spec.filterEndHz * footScale), start + dur);
    const gain = this.createEnvelope(context, start, dur, spec.noisePeak * gainScale, 0.005);
    source.connect(filter); filter.connect(gain); gain.connect(master);
    this.bindCleanup(source, [source, filter, gain]);
    source.start(start); source.stop(start + dur + 0.015);
  }

  private scheduleToneVoice(context: AudioContext, master: GainNode, start: number, wave: OscillatorType, fromHz: number, toHz: number, dur: number, peak: number): void {
    const osc = context.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(Math.max(40, fromHz), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), start + dur);
    const gain = this.createEnvelope(context, start, dur, peak, 0.004);
    osc.connect(gain); gain.connect(master);
    this.bindCleanup(osc, [osc, gain]);
    osc.start(start); osc.stop(start + dur + 0.015);
  }
}
