import { Color, Euler, Scene, Texture } from "three";

export type StudioBg3dEnvironmentSlot = "environment" | "background";
export interface StudioBg3dEnvironmentSlotValue {
  readonly value: Texture | null;
  readonly intensity: number;
  readonly rotation: Euler;
}
export interface StudioBg3dBackgroundSlotValue {
  readonly value: Color | Texture | null;
  readonly intensity: number;
  readonly rotation: Euler;
}
export interface StudioBg3dEnvironmentSlotInstallation {
  readonly environment?: StudioBg3dEnvironmentSlotValue;
  readonly background?: StudioBg3dBackgroundSlotValue;
}
export interface StudioBg3dEnvironmentSlotUpdate {
  readonly intensity?: number;
  readonly rotation?: Euler;
}
export interface StudioBg3dEnvironmentSlotDisposeOptions {
  /** caller가 곧 해제할 자기 Texture다. 이 owner가 실제 설치한 값만 복원 후보에서 제외한다. */
  readonly retireValues?: readonly Texture[];
}
export interface StudioBg3dEnvironmentSlotOwner {
  /** 요청한 모든 슬롯의 최신 lease와 관측한 실제 상태가 일치하는지 확인한다. */
  isCurrent(): boolean;
  /** claim한 모든 슬롯을 함께 전달한다. 일부 슬롯만 전달하거나 claim하지 않은 슬롯은 거부한다. */
  install(values: StudioBg3dEnvironmentSlotInstallation): boolean;
  /** 다른 슬롯에 새 owner가 있어도 이 슬롯이 current이고 설치됐다면 갱신할 수 있다. */
  update(slot: StudioBg3dEnvironmentSlot, values: StudioBg3dEnvironmentSlotUpdate): boolean;
  /** 자원은 해제하지 않는다. 외부 표시값을 유지하면서 폐기 예정인 자기 Texture도 분리한다. */
  dispose(options?: StudioBg3dEnvironmentSlotDisposeOptions): void;
}

interface SlotState {
  readonly slot: StudioBg3dEnvironmentSlot;
  readonly value: Color | Texture | null;
  readonly intensity: number;
  readonly rotation: Euler;
  readonly color: { readonly r: number; readonly g: number; readonly b: number } | null;
}
interface SlotTrack {
  readonly baseline: SlotState;
  claims: Claim[];
  expected: SlotState;
  visible: Claim | null;
}
interface Claim {
  readonly slot: StudioBg3dEnvironmentSlot;
  readonly track: SlotTrack;
  readonly token: object;
  alive: boolean;
  installed: SlotState | null;
}
const owners = new WeakMap<Scene, Map<StudioBg3dEnvironmentSlot, SlotTrack>>();
const observedTextures = new WeakSet<Texture>();
const disposedTextures = new WeakSet<Texture>();
const retiredTextures = new WeakSet<Texture>();
const installedTexturesByScene = new WeakMap<Scene, WeakSet<Texture>>();
const SLOTS: readonly StudioBg3dEnvironmentSlot[] = ["environment", "background"];
const ORDERS = new Set(["XYZ", "YXZ", "ZXY", "ZYX", "YZX", "XZY"]);

function watch(value: Color | Texture | null): void {
  if (!(value instanceof Texture) || observedTextures.has(value)) return;
  observedTextures.add(value);
  // Texture를 소유·해제하지 않는다. 이 자기 참조 listener와 WeakSet은 Texture 수명을 늘리지 않는다.
  value.addEventListener("dispose", () => { disposedTextures.add(value); });
}
function rotationValid(value: Euler): boolean {
  return value instanceof Euler && [value.x, value.y, value.z].every(Number.isFinite) && ORDERS.has(value.order);
}
function copyRotation(value: Euler): Euler {
  return new Euler(value.x, value.y, value.z, value.order);
}
function state(slot: StudioBg3dEnvironmentSlot, input: StudioBg3dBackgroundSlotValue): SlotState | null {
  const value = input.value;
  if ((value !== null && !(value instanceof Texture) && !(value instanceof Color))
    || (slot === "environment" && value instanceof Color)
    || !Number.isFinite(input.intensity) || !rotationValid(input.rotation)
    || (value instanceof Color && ![value.r, value.g, value.b].every(Number.isFinite))) return null;
  return { slot, value, intensity: input.intensity, rotation: copyRotation(input.rotation),
    color: value instanceof Color ? { r: value.r, g: value.g, b: value.b } : null };
}
function read(scene: Scene, slot: StudioBg3dEnvironmentSlot): SlotState | null {
  return slot === "environment"
    ? state(slot, { value: scene.environment, intensity: scene.environmentIntensity, rotation: scene.environmentRotation })
    : state(slot, { value: scene.background, intensity: scene.backgroundIntensity, rotation: scene.backgroundRotation });
}
function same(left: SlotState | null, right: SlotState): boolean {
  return left !== null && left.slot === right.slot && left.value === right.value
    && Object.is(left.intensity, right.intensity)
    && Object.is(left.rotation.x, right.rotation.x) && Object.is(left.rotation.y, right.rotation.y)
    && Object.is(left.rotation.z, right.rotation.z) && left.rotation.order === right.rotation.order
    && (left.color === null ? right.color === null : right.color !== null
      && Object.is(left.color.r, right.color.r) && Object.is(left.color.g, right.color.g) && Object.is(left.color.b, right.color.b));
}
function live(value: SlotState): boolean {
  if (value.value instanceof Texture) return !disposedTextures.has(value.value) && !retiredTextures.has(value.value);
  if (value.value instanceof Color) return value.color !== null && Object.is(value.value.r, value.color.r)
    && Object.is(value.value.g, value.color.g) && Object.is(value.value.b, value.color.b);
  return true;
}
function writable(scene: Scene, slot: StudioBg3dEnvironmentSlot): boolean {
  // 표준 Scene의 own data 속성만 쓴다. accessor/동결 속성의 예외·동기 재진입으로 부분 설치하지 않는다.
  return [slot, `${slot}Intensity`, `${slot}Rotation`].every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(scene, key);
    return descriptor !== undefined && "value" in descriptor && descriptor.writable === true;
  });
}
function write(scene: Scene, value: SlotState, rotation: Euler): void {
  // 기존 Euler의 onChange callback을 실행하지 않고 개인 사본을 설치한다.
  if (value.slot === "environment") {
    if (value.value instanceof Color) throw new TypeError("환경광 슬롯에 Color를 설치할 수 없습니다.");
    scene.environment = value.value;
    scene.environmentIntensity = value.intensity;
    scene.environmentRotation = rotation;
  } else {
    scene.background = value.value;
    scene.backgroundIntensity = value.intensity;
    scene.backgroundRotation = rotation;
  }
}
function top(track: SlotTrack): Claim | undefined { return track.claims.at(-1); }
function current(scene: Scene, tracks: Map<StudioBg3dEnvironmentSlot, SlotTrack>, claim: Claim): boolean {
  return claim.alive && tracks.get(claim.slot) === claim.track && top(claim.track)?.token === claim.token
    && same(read(scene, claim.slot), claim.track.expected);
}
function emptyBaseline(baseline: SlotState): SlotState {
  return { ...baseline, value: null, color: null, rotation: copyRotation(baseline.rotation) };
}
function unmanagedBaseline(scene: Scene, baseline: SlotState): Color | Texture | null {
  // 외부 변경 뒤에는 이전 owner의 미래 해제에 의존하는 Texture를 다시 연결하지 않는다.
  return live(baseline) && !(baseline.value instanceof Texture && installedTexturesByScene.get(scene)?.has(baseline.value))
    ? baseline.value : null;
}
function writePointer(scene: Scene, slot: StudioBg3dEnvironmentSlot, value: Color | Texture | null): void {
  const descriptor = Object.getOwnPropertyDescriptor(scene, slot);
  if (!descriptor || !("value" in descriptor) || descriptor.writable !== true) return;
  if (slot === "background") scene.background = value;
  else if (!(value instanceof Color)) scene.environment = value;
}

/**
 * HDRI와 panorama가 함께 사용하는 Scene 슬롯 소유권이다. claim은 현재 화면을 지우지 않는다.
 * 외부 writer의 실제 pointer/색/intensity/Euler 변경은 차단하지만, 검사 사이에 완전히 같은 값으로
 * 되돌린 외부 ABA는 Scene의 공개 속성만으로 관측할 수 없다. Texture dispose도 관찰 시작 이후만 안다.
 * GPU pin·capture readiness·자원 해제는 이 모듈의 책임이 아니다.
 */
export function claimStudioBg3dEnvironmentSlots(
  scene: Scene,
  requested: { readonly environment: boolean; readonly background: boolean },
): StudioBg3dEnvironmentSlotOwner {
  let disposed = false;
  const slots = SLOTS.filter((slot) => requested[slot] === true);
  const tracks = owners.get(scene) ?? new Map<StudioBg3dEnvironmentSlot, SlotTrack>();
  const claims: Claim[] = [];
  const installedValues = new WeakSet<Texture>();
  const observed = slots.map((slot) => ({ slot, value: read(scene, slot) }));
  if (observed.length > 0 && observed.every(({ slot, value }) => value !== null && writable(scene, slot))) {
    owners.set(scene, tracks);
    for (const { slot, value } of observed) {
      if (!value) continue;
      let track = tracks.get(slot);
      // 외부가 바꾼 슬롯의 이전 lease는 되살리지 않는다. 새 claim의 명시적 baseline만 채택한다.
      if (!track || !same(value, track.expected)) {
        track = { baseline: value, expected: value, claims: [], visible: null };
        tracks.set(slot, track);
      }
      watch(value.value);
      const claim: Claim = { slot, track, token: {}, alive: true, installed: null };
      track.claims.push(claim); claims.push(claim);
    }
  }
  const isCurrent = () => !disposed && claims.length > 0 && claims.length === slots.length
    && claims.every((claim) => current(scene, tracks, claim));
  const commit = (values: readonly { readonly claim: Claim; readonly value: SlotState }[]): boolean => {
    if (disposed || values.length === 0 || !values.every(({ claim, value }) => current(scene, tracks, claim)
      && writable(scene, claim.slot) && live(value))) return false;
    // 모든 검사와 Euler 할당을 먼저 마치고 Scene의 data 속성을 동기적으로 함께 갱신한다.
    const prepared = values.map((entry) => ({ ...entry, rotation: copyRotation(entry.value.rotation) }));
    for (const { value } of prepared) watch(value.value);
    for (const { value, rotation } of prepared) write(scene, value, rotation);
    for (const { claim, value } of prepared) {
      claim.installed = value; claim.track.expected = value; claim.track.visible = claim;
      if (value.value instanceof Texture) {
        installedValues.add(value.value);
        const sceneValues = installedTexturesByScene.get(scene) ?? new WeakSet<Texture>();
        sceneValues.add(value.value); installedTexturesByScene.set(scene, sceneValues);
      }
    }
    return true;
  };
  return {
    isCurrent,
    install(values) {
      if (!isCurrent() || !values || Object.keys(values).some((key) =>
        (key !== "environment" && key !== "background") || !slots.some((slot) => slot === key))) return false;
      const ready: { claim: Claim; value: SlotState }[] = [];
      for (const claim of claims) {
        const input = claim.slot === "environment" ? values.environment : values.background;
        if (!input) return false;
        const value = state(claim.slot, input); if (!value) return false;
        ready.push({ claim, value });
      }
      return commit(ready);
    },
    update(slot, values) {
      const claim = claims.find((entry) => entry.slot === slot);
      if (disposed || !claim || !claim.installed || claim.track.visible !== claim
        || !current(scene, tracks, claim) || !live(claim.installed)
        || (values.intensity === undefined && values.rotation === undefined)) return false;
      const value = state(slot, { value: claim.installed.value, intensity: values.intensity ?? claim.installed.intensity,
        rotation: values.rotation ?? claim.installed.rotation });
      return value !== null && commit([{ claim, value }]);
    },
    dispose(options) {
      if (disposed) return;
      disposed = true;
      const retiringValues = new Set((options?.retireValues ?? []).filter((value) => installedValues.has(value)));
      for (const value of retiringValues) retiredTextures.add(value);
      for (const claim of claims) claim.alive = false;
      for (const claim of claims) {
        const activeTracks = owners.get(scene), activeTrack = activeTracks?.get(claim.slot);
        const actual = read(scene, claim.slot);
        const pointer = claim.slot === "environment" ? scene.environment : scene.background;
        if (pointer instanceof Texture && retiringValues.has(pointer)
          && (activeTrack !== claim.track || !same(actual, claim.track.expected))) {
          // Texture의 수명만 끝낸다. 외부 intensity/rotation과 Euler identity는 그대로 보존한다.
          writePointer(scene, claim.slot, unmanagedBaseline(scene, activeTrack?.baseline ?? claim.track.baseline));
          activeTracks?.delete(claim.slot);
          if (activeTracks?.size === 0 && owners.get(scene) === activeTracks) owners.delete(scene);
          continue;
        }
        const track = claim.track;
        if (tracks.get(claim.slot) !== track) continue;
        track.claims = track.claims.filter((entry) => entry.alive);
        if (!same(read(scene, claim.slot), track.expected)) { tracks.delete(claim.slot); continue; }
        if (!track.visible?.alive || !track.visible.installed || !live(track.visible.installed)) {
          const previous = [...track.claims].reverse().find((entry) => entry.installed !== null && live(entry.installed));
          const fallback = previous?.installed ?? (live(track.baseline) ? track.baseline : emptyBaseline(track.baseline));
          if (!writable(scene, claim.slot)) { tracks.delete(claim.slot); continue; }
          write(scene, fallback, copyRotation(fallback.rotation));
          track.expected = fallback; track.visible = previous ?? null;
        }
        if (track.claims.length === 0) tracks.delete(claim.slot);
      }
      if (tracks.size === 0 && owners.get(scene) === tracks) owners.delete(scene);
    },
  };
}
