// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearStudioVirtualAvatarProfile, writeStudioVirtualAvatarProfile } from "../studio-virtual-space-avatar-store";
import { STUDIO_AVATAR_ACCESSORY_OPTIONS } from "../studio-virtual-space-avatar-options";
import { studioVirtualAvatarProfile, type StudioVirtualAvatarProfile } from "../studio-virtual-space-model";
import { advanceOffice2dActor, createOffice2dActor, office2dActorBob } from "./office2d-actors";
import { createOffice2dAvatarProfileSource, paintOffice2dAvatarAccessory, type Office2dAccessoryPlacement } from "./office2d-avatar-appearance";
import { Office2dCamera } from "./office2d-camera";
import { Office2dParticles } from "./office2d-particles";
import type { Office2dCanvas2D } from "./office2d-procedural-art";
import { Office2dRenderer } from "./office2d-renderer";
import type { Office2dScene } from "./office2d-scene";

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

function recordingContext() {
  const save = vi.fn(), restore = vi.fn(), translate = vi.fn(), scale = vi.fn(), rotate = vi.fn(), fill = vi.fn();
  const ctx: Office2dCanvas2D = {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, globalAlpha: 0.7,
    globalCompositeOperation: "source-over", font: "12px sans-serif", textAlign: "left", textBaseline: "top",
    imageSmoothingEnabled: true, lineJoin: "miter", lineCap: "butt",
    save, restore, translate, scale, rotate, fill, setTransform: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(),
    clearRect: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(),
    ellipse: vi.fn(), quadraticCurveTo: vi.fn(), rect: vi.fn(), stroke: vi.fn(), drawImage: vi.fn(),
    fillText: vi.fn(), measureText: (text) => ({ width: text.length * 7,
      actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0,
      fontBoundingBoxAscent: 9, fontBoundingBoxDescent: 3, emHeightAscent: 9, emHeightDescent: 3,
      hangingBaseline: 8, alphabeticBaseline: 0, ideographicBaseline: -2 }),
    createLinearGradient: () => ({ addColorStop: vi.fn() }), createRadialGradient: () => ({ addColorStop: vi.fn() }),
    clip: vi.fn(), setLineDash: vi.fn(),
  };
  return { ctx, save, restore, translate, scale, rotate, fill };
}

const placement: Office2dAccessoryPlacement = { facing: "down", footX: 420, footY: 510, width: 51, height: 76, tiltRad: 0.04 };
const profile: StudioVirtualAvatarProfile = { ...studioVirtualAvatarProfile("artist"), accessory: "headphones", outfitStyle: "hoodie" };

describe("2D 오피스의 기존 아바타 꾸미기 연결", () => {
  it("저장된 꾸밈이 없으면 기존 직군 외형을 유지하고 반복 조회는 저장소를 읽지 않는다", () => {
    localStorage.clear();
    const source = createOffice2dAvatarProfileSource();
    try {
      const read = vi.spyOn(Storage.prototype, "getItem");
      for (let i = 0; i < 120; i += 1) expect(source.get()).toBeNull();
      expect(read).not.toHaveBeenCalled();
    } finally { source.dispose(); }
  });

  it("기존 커스터마이저의 저장·리셋과 다른 탭의 변경을 반영하고 해제 후 구독을 정리한다", () => {
    localStorage.clear();
    const source = createOffice2dAvatarProfileSource();
    try {
      expect(writeStudioVirtualAvatarProfile(profile)).toBe(true);
      expect(source.get()).toMatchObject({ accessory: "headphones", accent: profile.accent, outfit: profile.outfit });
      clearStudioVirtualAvatarProfile();
      expect(source.get()).toBeNull();
      const other = { ...profile, accessory: "scarf" } satisfies StudioVirtualAvatarProfile;
      localStorage.setItem("toonspectrum:virtual-space-avatar-profile:v1", JSON.stringify(other));
      window.dispatchEvent(new StorageEvent("storage"));
      expect(source.get()).toMatchObject({ accessory: "scarf", accent: other.accent, outfit: other.outfit });
      const cached = source.get();
      source.dispose();
      const read = vi.spyOn(Storage.prototype, "getItem");
      window.dispatchEvent(new StorageEvent("storage"));
      expect(read).not.toHaveBeenCalled();
      clearStudioVirtualAvatarProfile();
      expect(source.get()).toBe(cached);
    } finally { source.dispose(); }
  });

  it("기존 16종 선택을 모두 처리하고 없음은 아무 장식도 그리지 않는다", () => {
    expect(STUDIO_AVATAR_ACCESSORY_OPTIONS).toHaveLength(16);
    for (const option of STUDIO_AVATAR_ACCESSORY_OPTIONS) {
      const record = recordingContext();
      paintOffice2dAvatarAccessory(record.ctx, { ...profile, accessory: option.key }, placement);
      if (option.key === "none") expect(record.save).not.toHaveBeenCalled();
      else {
        expect(record.save).toHaveBeenCalledOnce();
        expect(record.restore).toHaveBeenCalledOnce();
        expect(record.fill.mock.calls.length + vi.mocked(record.ctx.stroke).mock.calls.length).toBeGreaterThan(0);
      }
    }
  });

  it("액세서리는 발끝·보행 기울기와 같은 변환을 따르고 뒤를 보면 안경 앞면을 숨긴다", () => {
    const record = recordingContext();
    paintOffice2dAvatarAccessory(record.ctx, profile, { ...placement, facing: "left" });
    expect(record.translate.mock.calls[0]).toEqual([420, 510]);
    expect(record.rotate).toHaveBeenCalledWith(0.04);
    expect(record.scale.mock.calls[0]).toEqual([51 / 128, 76 / 192]);
    expect(record.translate).toHaveBeenCalledWith(-64, -188);
    expect(record.scale).toHaveBeenCalledWith(-1, 1);
    const back = recordingContext();
    paintOffice2dAvatarAccessory(back.ctx, { ...profile, accessory: "glasses" }, { ...placement, facing: "up" });
    expect(back.save).not.toHaveBeenCalled();
  });

  it("실제 렌더러는 저장 액세서리를 자기 배우에게만 합성하고 원격 동료 외형을 보존한다", () => {
    const scene: Office2dScene = { kind: "generic", width: 512, height: 512, backgroundUrl: null,
      floors: [], walls: [], objects: [], seats: [], lights: [], rooms: [], physicsProps: [], staticColliders: [], portals: [] };
    const selfAvatarProfile = vi.fn(() => profile);
    const renderer = new Office2dRenderer(scene, { createSurface: () => null, image: () => null, selfAvatarProfile });
    const actor = (id: string, kind: "self" | "peer", x: number) => createOffice2dActor({ id, kind,
      character: "artist", accent: "#ab8dce", name: id, x, y: 200, now: 0 });
    const self = actor("self", "self", 120), peer = actor("peer", "peer", 200);
    const camera = new Office2dCamera(512, 512, self);
    camera.setViewport({ width: 800, height: 600 });
    const record = recordingContext();
    renderer.render(record.ctx, { camera, pixelRatio: 1, time: 1, now: 1000, actors: [self, peer], selfId: self.id,
      props: [], nearbyInteractionId: null, destination: null, locateTarget: null, daylight: 1,
      reducedMotion: true, language: "ko", particles: new Office2dParticles(), ghost: false });
    expect(selfAvatarProfile).toHaveBeenCalledOnce();
    expect(record.translate.mock.calls.filter(([x, y]) => x === -64 && y === -188)).toHaveLength(1);
    expect(record.translate).toHaveBeenCalledWith(120, 203);
  });

  it("v2 크기가 metadata와 다르면 큰 이미지를 128셀로 자르지 않고 실제 기존 시트로 돌아간다", () => {
    const scene: Office2dScene = { kind: "generic", width: 512, height: 512, backgroundUrl: null,
      floors: [], walls: [], objects: [], seats: [], lights: [], rooms: [], physicsProps: [], staticColliders: [], portals: [] };
    const invalid = document.createElement("canvas"), legacy = document.createElement("canvas");
    invalid.width = 128; invalid.height = 192;
    legacy.width = 1152; legacy.height = 768;
    const renderer = new Office2dRenderer(scene, { createSurface: () => null,
      image: (url) => url.includes("office-cast-v2/") ? invalid : url.endsWith("/characters/artist.webp") ? legacy : null });
    const self = createOffice2dActor({ id: "self", kind: "self", character: "artist", accent: "#ab8dce", name: "self", x: 120, y: 200, now: 0 });
    const camera = new Office2dCamera(512, 512, self);
    camera.setViewport({ width: 800, height: 600 });
    const record = recordingContext();
    renderer.render(record.ctx, { camera, pixelRatio: 1, time: 1, now: 1000, actors: [self], selfId: self.id,
      props: [], nearbyInteractionId: null, destination: null, locateTarget: null, daylight: 1,
      reducedMotion: true, language: "ko", particles: new Office2dParticles(), ghost: false });
    expect(record.ctx.drawImage).toHaveBeenCalledOnce();
    expect(vi.mocked(record.ctx.drawImage).mock.calls[0]?.[0]).toBe(legacy);
  });
});

describe("배우별 자연스러운 숨쉬기", () => {
  const actor = (id: string) => createOffice2dActor({ id, kind: "ambient", character: "artist", accent: "#ab8dce", name: id, x: 0, y: 0, now: 0 });

  it("동료별 호흡은 결정적이지만 서로 엇갈리며 보행 위상은 이동 거리를 따른다", () => {
    const a = actor("coworker-a"), b = actor("coworker-b");
    expect(office2dActorBob(a, 1, false)).toEqual(office2dActorBob(actor("coworker-a"), 1, false));
    expect(office2dActorBob(a, 1, false).scaleY).not.toBe(office2dActorBob(b, 1, false).scaleY);
    advanceOffice2dActor(a, 3, 0, 1 / 60);
    advanceOffice2dActor(b, 3, 0, 1 / 60);
    expect(office2dActorBob(a, 1, false)).toEqual(office2dActorBob(b, 1, false));
  });

  it("동작 줄이기를 켜면 신원과 시간에 관계없이 정적 자세를 유지한다", () => {
    expect(office2dActorBob(actor("a"), 0, true)).toEqual(office2dActorBob(actor("b"), 9, true));
    expect(office2dActorBob(actor("a"), 0, true)).toEqual({ offsetY: 0, scaleX: 1, scaleY: 1, tiltRad: 0, shadowScale: 1 });
  });
});
