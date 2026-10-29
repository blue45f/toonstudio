import { Color, Euler, Scene, Texture } from "three";
import { describe, expect, it, vi } from "vitest";

import { claimStudioBg3dEnvironmentSlots } from "./studio-bg3d-environment-slot-owner";

function value(texture: Texture | Color | null, intensity = 1, rotation = new Euler()) {
  return { value: texture, intensity, rotation };
}
function environment(texture: Texture | null, intensity = 1, rotation = new Euler()) {
  return { value: texture, intensity, rotation };
}
function snapshot(scene: Scene) {
  return { environment: scene.environment, background: scene.background,
    environmentIntensity: scene.environmentIntensity, backgroundIntensity: scene.backgroundIntensity,
    environmentRotation: scene.environmentRotation.toArray(), backgroundRotation: scene.backgroundRotation.toArray() };
}
function fixture() {
  const scene = new Scene(), original = new Texture(), background = new Color("#304050");
  scene.environment = original; scene.background = background;
  scene.environmentIntensity = 0.7; scene.backgroundIntensity = 0.4;
  scene.environmentRotation.set(0.1, 0.2, 0.3, "YXZ");
  scene.backgroundRotation.set(0.4, 0.5, 0.6, "ZXY");
  return { scene, original, background, before: snapshot(scene) };
}

describe("Scene 환경광·배경 슬롯의 정확한 owner", () => {
  it("pending claim은 last-good 화면을 그대로 두고 설치는 두 슬롯·설정을 함께 바꾼다", () => {
    const f = fixture(), texture = new Texture();
    const owner = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: true });
    expect(owner.isCurrent()).toBe(true); expect(snapshot(f.scene)).toEqual(f.before);
    const rotation = new Euler(1, 2, 3, "ZYX");
    expect(owner.install({ environment: environment(texture, 2, rotation), background: value(texture, 3, rotation) })).toBe(true);
    expect(f.scene.environment).toBe(texture); expect(f.scene.background).toBe(texture);
    expect(f.scene.environmentIntensity).toBe(2); expect(f.scene.backgroundIntensity).toBe(3);
    expect(f.scene.environmentRotation.toArray()).toEqual([1, 2, 3, "ZYX"]);
    rotation.set(7, 8, 9);
    expect(f.scene.environmentRotation.toArray()).toEqual([1, 2, 3, "ZYX"]);
    expect(owner.isCurrent()).toBe(true);
    owner.dispose(); owner.dispose(); expect(snapshot(f.scene)).toEqual(f.before);
  });

  it("한 슬롯의 외부 변경이 있으면 두 슬롯 install 모두 쓰지 않는다", () => {
    const f = fixture(), own = new Texture(), next = new Texture(), external = new Color("#ab2030");
    const owner = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: true });
    expect(owner.install({ environment: environment(own), background: value(own) })).toBe(true);
    f.scene.background = external;
    const before = snapshot(f.scene);
    expect(owner.isCurrent()).toBe(false);
    expect(owner.install({ environment: environment(next, 4), background: value(next, 5) })).toBe(false);
    expect(snapshot(f.scene)).toEqual(before);
    owner.dispose();
    expect(f.scene.environment).toBe(f.original); expect(f.scene.background).toBe(external);
  });

  it("A 설치→B pending→A 해제→B 설치·해제에서 죽은 A를 복원하지 않는다", () => {
    const f = fixture(), a = new Texture(), b = new Texture();
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.install({ environment: environment(a, 2) })).toBe(true);
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(f.scene.environment).toBe(a); expect(first.isCurrent()).toBe(false); expect(second.isCurrent()).toBe(true);
    first.dispose(); a.dispose();
    expect(f.scene.environment).toBe(f.original); expect(second.isCurrent()).toBe(true);
    expect(second.install({ environment: environment(b, 3) })).toBe(true);
    second.dispose(); expect(snapshot(f.scene)).toEqual(f.before);
    expect(first.install({ environment: environment(a) })).toBe(false);
  });

  it("뒤의 pending만 취소하면 살아 있는 이전 owner가 다시 갱신할 수 있다", () => {
    const f = fixture(), a = new Texture();
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.install({ environment: environment(a) })).toBe(true);
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.update("environment", { intensity: 5 })).toBe(false);
    second.dispose();
    expect(first.isCurrent()).toBe(true); expect(first.update("environment", { intensity: 5 })).toBe(true);
    expect(f.scene.environment).toBe(a); expect(f.scene.environmentIntensity).toBe(5);
    first.dispose(); expect(snapshot(f.scene)).toEqual(f.before);
  });

  it.each(["first", "second"])("설치된 A/B에서 %s 먼저 해제해도 살아 있는 owner/baseline만 복원한다", (order) => {
    const f = fixture(), a = new Texture(), b = new Texture();
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: true });
    expect(first.install({ environment: environment(a, 2), background: value(a, 3) })).toBe(true);
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: true });
    expect(second.install({ environment: environment(b, 4), background: value(b, 5) })).toBe(true);
    if (order === "first") {
      first.dispose(); a.dispose(); expect(f.scene.environment).toBe(b); expect(f.scene.background).toBe(b);
      second.dispose();
    } else {
      second.dispose(); expect(f.scene.environment).toBe(a); expect(f.scene.environmentIntensity).toBe(2);
      expect(f.scene.background).toBe(a); expect(f.scene.backgroundIntensity).toBe(3);
      expect(first.isCurrent()).toBe(true); first.dispose();
    }
    expect(snapshot(f.scene)).toEqual(f.before);
  });

  it("같은 Texture로 A→B→C가 바뀌어도 옛 lease의 update·dispose가 C를 덮지 않는다", () => {
    const f = fixture(), shared = new Texture();
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.install({ environment: environment(shared, 2) })).toBe(true);
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(second.install({ environment: environment(shared, 2) })).toBe(true);
    const third = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(third.install({ environment: environment(shared, 2) })).toBe(true);
    first.dispose(); second.dispose();
    expect(first.update("environment", { intensity: 9 })).toBe(false);
    expect(second.install({ environment: environment(shared, 9) })).toBe(false);
    expect(third.isCurrent()).toBe(true); expect(f.scene.environmentIntensity).toBe(2);
    third.dispose(); expect(snapshot(f.scene)).toEqual(f.before);
  });

  it("부분 supersede는 원자 install을 막지만 아직 자기 것인 슬롯 update는 허용한다", () => {
    const f = fixture(), a = new Texture(), b = new Texture(), rotation = new Euler(2, 3, 4, "XZY");
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: true });
    expect(first.install({ environment: environment(a), background: value(a) })).toBe(true);
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.isCurrent()).toBe(false);
    expect(first.install({ environment: environment(a, 8), background: value(a, 8) })).toBe(false);
    expect(first.update("environment", { rotation })).toBe(false);
    expect(first.update("background", { intensity: 0.25, rotation })).toBe(true);
    expect(f.scene.backgroundRotation.toArray()).toEqual([2, 3, 4, "XZY"]);
    expect(second.install({ environment: environment(b) })).toBe(true);
    first.dispose(); expect(f.scene.background).toBe(f.background); expect(f.scene.environment).toBe(b);
    second.dispose(); expect(snapshot(f.scene)).toEqual(f.before);
  });

  it.each(["intensity", "rotation", "color"])("외부 %s 변경을 update·dispose로 되돌리지 않는다", (kind) => {
    const f = fixture(), color = new Color("#334455");
    const owner = claimStudioBg3dEnvironmentSlots(f.scene, { environment: false, background: true });
    expect(owner.install({ background: value(color, 2) })).toBe(true);
    if (kind === "intensity") f.scene.backgroundIntensity = 7;
    if (kind === "rotation") f.scene.backgroundRotation.set(3, 2, 1, "YXZ");
    if (kind === "color") color.set("#ffcc00");
    const before = snapshot(f.scene), rgb = color.toArray();
    expect(owner.isCurrent()).toBe(false); expect(owner.update("background", { intensity: 4 })).toBe(false);
    owner.dispose(); expect(snapshot(f.scene)).toEqual(before); expect(color.toArray()).toEqual(rgb);
  });

  it("외부 pointer를 새 claim의 baseline으로 채택한 뒤 옛 owner가 다시 나타나지 않는다", () => {
    const f = fixture(), a = new Texture(), external = new Texture(), b = new Texture();
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.install({ environment: environment(a) })).toBe(true);
    f.scene.environment = external; f.scene.environmentIntensity = 6;
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.isCurrent()).toBe(false); expect(second.isCurrent()).toBe(true);
    expect(second.install({ environment: environment(b) })).toBe(true);
    first.dispose(); expect(f.scene.environment).toBe(b);
    second.dispose(); expect(f.scene.environment).toBe(external); expect(f.scene.environmentIntensity).toBe(6);
    expect(first.install({ environment: environment(a) })).toBe(false);
  });

  it("관측한 외부 변경 뒤 새 owner가 같은 예전 pointer를 설치해도 이전 lease는 무효다", () => {
    const f = fixture(), shared = new Texture(), external = new Texture();
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.install({ environment: environment(shared, 2) })).toBe(true);
    f.scene.environment = external;
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(second.install({ environment: environment(shared, 2) })).toBe(true);
    expect(first.isCurrent()).toBe(false); expect(first.update("environment", { intensity: 9 })).toBe(false);
    first.dispose(); expect(second.isCurrent()).toBe(true); expect(f.scene.environment).toBe(shared);
    second.dispose(); expect(f.scene.environment).toBe(external); expect(f.scene.environmentIntensity).toBe(2);
  });

  it("null baseline과 서로 다른 Scene은 독립이며 자원을 helper가 dispose하지 않는다", () => {
    const scene = new Scene(), other = new Scene(), a = new Texture(), b = new Texture();
    const aDispose = vi.spyOn(a, "dispose"), bDispose = vi.spyOn(b, "dispose");
    const first = claimStudioBg3dEnvironmentSlots(scene, { environment: true, background: true });
    const second = claimStudioBg3dEnvironmentSlots(other, { environment: true, background: false });
    expect(first.install({ environment: environment(a), background: value(a) })).toBe(true);
    expect(second.install({ environment: environment(b) })).toBe(true);
    first.dispose(); expect(scene.environment).toBeNull(); expect(scene.background).toBeNull();
    expect(second.isCurrent()).toBe(true); expect(other.environment).toBe(b);
    second.dispose(); expect(other.environment).toBeNull();
    expect(aDispose).not.toHaveBeenCalled(); expect(bDispose).not.toHaveBeenCalled();
  });

  it("관찰한 baseline·이전 owner Texture가 폐기되면 복원 후보에서 건너뛴다", () => {
    const f = fixture(), a = new Texture(), b = new Texture();
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.install({ environment: environment(a) })).toBe(true);
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(second.install({ environment: environment(b) })).toBe(true);
    a.dispose(); f.original.dispose(); second.dispose();
    expect(f.scene.environment).toBeNull(); expect(first.update("environment", { intensity: 3 })).toBe(false);
    first.dispose(); expect(f.scene.environment).toBeNull(); expect(f.scene.background).toBe(f.background);
  });

  it("숨겨진 baseline Color가 외부에서 바뀌었으면 과거 색 snapshot으로 복원하지 않는다", () => {
    const f = fixture(), own = new Texture();
    const owner = claimStudioBg3dEnvironmentSlots(f.scene, { environment: false, background: true });
    expect(owner.install({ background: value(own) })).toBe(true);
    f.background.set("#abcdef"); owner.dispose();
    expect(f.scene.background).toBeNull(); expect(f.background.getHexString()).toBe("abcdef");
  });

  it("미설치 update·빈 claim·누락/미claim slot·유효하지 않은 값은 부분 쓰기 없이 거부한다", () => {
    const f = fixture(), texture = new Texture();
    const empty = claimStudioBg3dEnvironmentSlots(f.scene, { environment: false, background: false });
    expect(empty.isCurrent()).toBe(false); expect(empty.install({})).toBe(false); empty.dispose();
    const owner = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: true });
    expect(owner.update("environment", { intensity: 2 })).toBe(false);
    expect(owner.install({ environment: environment(texture) })).toBe(false);
    expect(owner.install({ environment: environment(texture), background: value(texture, NaN) })).toBe(false);
    expect(owner.install({ environment: environment(texture), background: value(texture, 1, new Euler(Infinity, 0, 0)) })).toBe(false);
    const invalidOrder = new Euler(); Object.defineProperty(invalidOrder, "order", { value: "BAD" });
    expect(owner.install({ environment: environment(texture), background: value(texture, 1, invalidOrder) })).toBe(false);
    expect(snapshot(f.scene)).toEqual(f.before); owner.dispose();
    const single = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(single.install({ environment: environment(texture), background: value(texture) })).toBe(false);
    expect(single.install({ environment: environment(texture) })).toBe(true);
    expect(single.update("environment", {})).toBe(false); expect(single.update("environment", { intensity: NaN })).toBe(false);
    texture.dispose(); expect(single.install({ environment: environment(texture) })).toBe(false);
    single.dispose(); expect(snapshot(f.scene)).toEqual(f.before);
  });

  it("한 Scene 속성이 동결돼 있으면 두 슬롯을 claim·설치하지 않는다", () => {
    const f = fixture(), texture = new Texture();
    Object.defineProperty(f.scene, "backgroundIntensity", { value: 0.4, writable: false, configurable: true });
    const owner = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: true });
    expect(owner.isCurrent()).toBe(false);
    expect(owner.install({ environment: environment(texture), background: value(texture) })).toBe(false);
    owner.dispose(); expect(snapshot(f.scene)).toEqual(f.before);
  });

  it("자기 Texture를 retire할 때 외부 밝기·회전은 유지하고 두 슬롯 pointer만 분리한다", () => {
    const f = fixture(), own = new Texture(), dispose = vi.spyOn(own, "dispose");
    const owner = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: true });
    expect(owner.install({ environment: environment(own, 2), background: value(own, 3) })).toBe(true);
    f.scene.environmentIntensity = 9; f.scene.backgroundIntensity = 8;
    f.scene.environmentRotation.set(1, 2, 3, "ZYX"); f.scene.backgroundRotation.set(4, 5, 6, "YXZ");
    const envRotation = f.scene.environmentRotation, bgRotation = f.scene.backgroundRotation;
    owner.dispose({ retireValues: [own] }); owner.dispose({ retireValues: [own] });
    expect(f.scene.environment).toBe(f.original); expect(f.scene.background).toBe(f.background);
    expect(f.scene.environmentIntensity).toBe(9); expect(f.scene.backgroundIntensity).toBe(8);
    expect(f.scene.environmentRotation).toBe(envRotation); expect(f.scene.backgroundRotation).toBe(bgRotation);
    expect(envRotation.toArray()).toEqual([1, 2, 3, "ZYX"]); expect(bgRotation.toArray()).toEqual([4, 5, 6, "YXZ"]);
    expect(owner.isCurrent()).toBe(false); expect(dispose).not.toHaveBeenCalled();
    own.dispose(); expect(dispose).toHaveBeenCalledOnce();
    expect(f.scene.environment).toBe(f.original); expect(f.scene.background).toBe(f.background);
  });

  it("자기 Texture retire는 외부가 설치한 다른 pointer와 표시값을 건드리지 않는다", () => {
    const f = fixture(), own = new Texture(), external = new Texture();
    const owner = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(owner.install({ environment: environment(own) })).toBe(true);
    f.scene.environment = external; f.scene.environmentIntensity = 7; f.scene.environmentRotation.set(4, 3, 2);
    const before = snapshot(f.scene), rotation = f.scene.environmentRotation;
    owner.dispose({ retireValues: [own] });
    expect(snapshot(f.scene)).toEqual(before); expect(f.scene.environmentRotation).toBe(rotation);
  });

  it("정상 same 상태의 retire는 살아 있는 이전 owner 체인을 그대로 복원한다", () => {
    const f = fixture(), a = new Texture(), b = new Texture();
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.install({ environment: environment(a, 2) })).toBe(true);
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(second.install({ environment: environment(b, 3) })).toBe(true);
    second.dispose({ retireValues: [b] });
    expect(f.scene.environment).toBe(a); expect(f.scene.environmentIntensity).toBe(2); expect(first.isCurrent()).toBe(true);
    first.dispose({ retireValues: [a] }); expect(snapshot(f.scene)).toEqual(f.before);
    const next = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(next.install({ environment: environment(b) })).toBe(false); next.dispose();
  });

  it("외부 표시값 변경 뒤 retire는 이전 owner Texture 대신 unmanaged baseline만 사용한다", () => {
    const f = fixture(), a = new Texture(), b = new Texture();
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.install({ environment: environment(a, 2) })).toBe(true);
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(second.install({ environment: environment(b, 3) })).toBe(true);
    f.scene.environmentIntensity = 7; f.scene.environmentRotation.set(3, 2, 1);
    second.dispose({ retireValues: [b] });
    expect(f.scene.environment).toBe(f.original); expect(f.scene.environmentIntensity).toBe(7);
    expect(f.scene.environmentRotation.toArray()).toEqual([3, 2, 1, "XYZ"]);
    expect(first.isCurrent()).toBe(false); expect(first.update("environment", { intensity: 4 })).toBe(false);
    expect(first.install({ environment: environment(a) })).toBe(false);
    first.dispose({ retireValues: [a] }); expect(f.scene.environment).toBe(f.original); expect(f.scene.environmentIntensity).toBe(7);
  });

  it("외부 변경 뒤 새 claim이 폐기될 A를 baseline으로 채택해도 A pointer를 남기지 않는다", () => {
    const f = fixture(), a = new Texture(), b = new Texture();
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.install({ environment: environment(a, 2) })).toBe(true);
    f.scene.environmentIntensity = 6;
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(second.isCurrent()).toBe(true);
    first.dispose({ retireValues: [a] });
    expect(f.scene.environment).toBeNull(); expect(f.scene.environmentIntensity).toBe(6);
    expect(second.isCurrent()).toBe(false); expect(second.install({ environment: environment(b) })).toBe(false);
    second.dispose(); expect(f.scene.environment).toBeNull();
  });

  it("불일치한 새 track의 baseline이 아직 살아 있는 이전 owner Texture여도 다시 연결하지 않는다", () => {
    const f = fixture(), a = new Texture(), b = new Texture();
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(first.install({ environment: environment(a, 2) })).toBe(true);
    f.scene.environmentIntensity = 6;
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(second.install({ environment: environment(b, 3) })).toBe(true);
    f.scene.environmentIntensity = 7;
    second.dispose({ retireValues: [b] });
    expect(f.scene.environment).toBeNull(); expect(f.scene.environmentIntensity).toBe(7);
    first.dispose({ retireValues: [a] }); a.dispose(); b.dispose();
    expect(f.scene.environment).toBeNull(); expect(f.scene.environmentIntensity).toBe(7);
  });

  it("기준 Texture가 다른 실제 owner에 의해 retire됐으면 null로 분리하고 외부 표시값을 보존한다", () => {
    const scene = new Scene(), baseline = new Texture(), own = new Texture();
    const baselineOwner = claimStudioBg3dEnvironmentSlots(new Scene(), { environment: true, background: false });
    expect(baselineOwner.install({ environment: environment(baseline) })).toBe(true);
    scene.environment = baseline;
    const owner = claimStudioBg3dEnvironmentSlots(scene, { environment: true, background: false });
    expect(owner.install({ environment: environment(own) })).toBe(true);
    baselineOwner.dispose({ retireValues: [baseline] });
    scene.environmentIntensity = 4;
    owner.dispose({ retireValues: [own] });
    expect(scene.environment).toBeNull(); expect(scene.environmentIntensity).toBe(4);
  });

  it("자기가 설치하지 않은 baseline·외부 Texture의 임의 retire 요청은 수명 권한을 얻지 못한다", () => {
    const f = fixture(), own = new Texture(), external = new Texture();
    const owner = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(owner.install({ environment: environment(own) })).toBe(true);
    owner.dispose({ retireValues: [f.original, external] }); expect(snapshot(f.scene)).toEqual(f.before);
    const next = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(next.install({ environment: environment(f.original) })).toBe(true);
    expect(next.install({ environment: environment(external) })).toBe(true); next.dispose();
    expect(snapshot(f.scene)).toEqual(f.before);
  });

  it("부분 supersede에서 자기 background retire는 현재 다른 environment owner를 보존한다", () => {
    const f = fixture(), a = new Texture(), b = new Texture();
    const first = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: true });
    expect(first.install({ environment: environment(a), background: value(a) })).toBe(true);
    const second = claimStudioBg3dEnvironmentSlots(f.scene, { environment: true, background: false });
    expect(second.install({ environment: environment(b) })).toBe(true);
    f.scene.backgroundIntensity = 6;
    first.dispose({ retireValues: [a] });
    expect(f.scene.environment).toBe(b); expect(second.isCurrent()).toBe(true);
    expect(f.scene.background).toBe(f.background); expect(f.scene.backgroundIntensity).toBe(6);
    second.dispose({ retireValues: [b] }); expect(f.scene.environment).toBe(f.original);
    expect(f.scene.backgroundIntensity).toBe(6);
  });
});
