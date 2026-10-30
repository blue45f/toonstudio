// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearStudioVirtualAvatarProfile, writeStudioVirtualAvatarProfile } from "../studio-virtual-space-avatar-store";
import { STUDIO_AVATAR_ACCESSORY_OPTIONS } from "../studio-virtual-space-avatar-options";
import { studioVirtualAvatarProfile, type StudioVirtualAvatarProfile } from "../studio-virtual-space-model";
import { advanceOffice2dActor, createOffice2dActor, office2dActorBob, type Office2dActor } from "./office2d-actors";
import { createOffice2dAvatarProfileSource, paintOffice2dAvatarAccessory, type Office2dAccessoryPlacement } from "./office2d-avatar-appearance";
import * as avatarAppearance from "./office2d-avatar-appearance";
import { office2dAtlasDrawFrame } from "./office2d-atlas-frames";
import { Office2dCamera } from "./office2d-camera";
import * as expressionCatalog from "./office2d-expression-catalog";
import { office2dExpressionFrame } from "./office2d-expression-layer";
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

describe("기본 렌더러의 전신 standing 표정 선택", () => {
  const scene: Office2dScene = { kind: "generic", width: 512, height: 512, backgroundUrl: null,
    floors: [], walls: [], objects: [], seats: [], lights: [], rooms: [], physicsProps: [], staticColliders: [], portals: [] };
  const sheet: expressionCatalog.Office2dExpressionSheet = {
    role: "artist", url: "/assets/virtual-studio/office-standing-expressions-v1/artist-standing.png",
    width: 1536, height: 1024, columns: 4, rows: 2,
    frames: Array.from({ length: 8 }, (_, index) => ({
      source: { x: index % 4 * 384 + 92, y: Math.floor(index / 4) * 512 + 20, width: 200, height: 460 },
      target: { x: 24, y: 8, width: 80, height: 180 }, accessoryOffset: { x: index - 3, y: 2 - index },
      eyewearOffset: { x: index - 2.25, y: 10 - index },
    })),
  };

  function renderExpression(options: {
    readonly asset?: "missing" | "wrong-size";
    readonly baseBody?: "generated" | "legacy" | "missing";
    readonly workBody?: boolean;
    readonly signal?: "laugh" | "talk" | "none";
    readonly reducedMotion?: boolean;
    readonly alpha?: number;
    readonly ghost?: boolean;
    readonly accessory?: StudioVirtualAvatarProfile["accessory"];
    readonly mutate?: (actor: Office2dActor) => void;
    readonly beforeRender?: (record: ReturnType<typeof recordingContext>, standing: HTMLCanvasElement) => void;
  } = {}) {
    vi.spyOn(expressionCatalog, "office2dExpressionSheet").mockReturnValue(sheet);
    const body = document.createElement("canvas"), standing = document.createElement("canvas"), work = document.createElement("canvas");
    body.width = options.baseBody === "legacy" ? 1152 : 1536; body.height = options.baseBody === "legacy" ? 768 : 1024;
    standing.width = options.asset === "wrong-size" ? 128 : 1536; standing.height = 1024;
    work.width = 1182; work.height = 1330;
    const record = recordingContext();
    const order: string[] = [];
    let clipped = false;
    const clipStack: boolean[] = [], standingClipStates: boolean[] = [], accessoryClipStates: boolean[] = [], standingAlphas: number[] = [];
    record.save.mockImplementation(() => { clipStack.push(clipped); });
    record.restore.mockImplementation(() => { clipped = clipStack.pop() ?? false; });
    vi.mocked(record.ctx.clip).mockImplementation(() => { clipped = true; });
    vi.mocked(record.ctx.drawImage).mockImplementation((image) => {
      order.push(image === standing ? "standing" : image === body ? "body" : image === work ? "work" : "other");
      if (image === standing) { standingClipStates.push(clipped); standingAlphas.push(record.ctx.globalAlpha); }
    });
    const accessory = vi.spyOn(avatarAppearance, "paintOffice2dAvatarAccessory").mockImplementation(() => {
      order.push("accessory"); accessoryClipStates.push(clipped);
    });
    const self = createOffice2dActor({ id: "self", kind: "self", character: "artist", accent: "#ab8dce", name: "작가", x: 120, y: 200, now: 0 });
    if ((options.signal ?? "laugh") === "laugh") self.emote = { kind: "laugh", glyph: "😂", until: 2000 };
    if (options.signal === "talk") self.bubble = "같이 작업해요";
    self.alpha = options.alpha ?? 1; options.mutate?.(self);
    const selectedProfile = { ...profile, accessory: options.accessory ?? profile.accessory };
    const renderer = new Office2dRenderer(scene, { createSurface: () => null, selfAvatarProfile: () => selectedProfile,
      image: (url) => url === sheet.url ? options.asset === "missing" ? null : standing
        : options.workBody && url === "/assets/virtual-studio/office-cast-v2/artist-work.webp" ? work
          : options.baseBody !== "missing" && url === (options.baseBody === "legacy" ? "/assets/virtual-studio/toon-office-v1/characters/artist.webp" : "/assets/virtual-studio/office-cast-v2/artist-walk.webp") ? body : null });
    const camera = new Office2dCamera(512, 512, self);
    camera.setViewport({ width: 800, height: 600 });
    options.beforeRender?.(record, standing);
    renderer.render(record.ctx, { camera, pixelRatio: 1, time: 1, now: 1000, actors: [self], selfId: self.id,
      props: [], nearbyInteractionId: null, destination: null, locateTarget: null, daylight: 1,
      reducedMotion: options.reducedMotion ?? true, language: "ko", particles: new Office2dParticles(), ghost: options.ghost ?? false });
    return { record, order, accessory, body, standing, work, self, standingClipStates, accessoryClipStates, clipStack, standingAlphas };
  }

  it("웃는 전신을 한 번만 그리고 발 188·새 머리 기준으로 액세서리를 배치한다", () => {
    const { record, order, accessory, standing, standingClipStates, accessoryClipStates, clipStack } = renderExpression();
    expect(order).toEqual(["standing", "accessory"]);
    expect(standingClipStates).toEqual([false]);
    expect(accessoryClipStates).toEqual([false]);
    expect(clipStack).toEqual([]);
    const call = vi.mocked(record.ctx.drawImage).mock.calls.find(([image]) => image === standing);
    const width = 76 * 128 / 192;
    expect(call?.slice(1, 5)).toEqual([476, 532, 200, 460]);
    expect(call?.[5]).toBeCloseTo(-width / 2 + 24 / 128 * width);
    expect(call?.[6]).toBeCloseTo(-76 * 188 / 192 + 8 / 192 * 76);
    expect(Number(call?.[6]) + Number(call?.[8])).toBeCloseTo(0);
    expect(record.translate.mock.calls.filter(([x, y]) => x === 120 && y === 203)).toHaveLength(1);
    expect(accessory).toHaveBeenCalledWith(record.ctx, profile, expect.objectContaining({ footX: 120, footY: 203,
      width, height: 76, tiltRad: 0, offset: { x: 2, y: -3 } }));
  });

  it.each(["legacy", "missing"] as const)("기존 몸체가 %s여도 유효한 전신 표정은 독립적으로 그린다", (baseBody) => {
    expect(renderExpression({ baseBody }).order).toEqual(["standing", "accessory"]);
  });

  it("대화와 웃음의 머리 위치를 각 프레임에서 읽고 이전 body offset을 누적하지 않는다", () => {
    const talking = renderExpression({ signal: "talk" });
    expect(talking.accessory.mock.calls.at(-1)?.[2].offset).toEqual({ x: -2, y: 1 });
    expect(talking.order).toEqual(["standing", "accessory"]);
  });

  it.each(["glasses", "sunglasses"] as const)("standing의 %s만 눈 전용 offset을 사용하고 몸체·발은 바꾸지 않는다", (accessory) => {
    const result = renderExpression({ accessory });
    expect(result.order).toEqual(["standing", "accessory"]);
    expect(result.accessory.mock.calls.at(-1)?.[2].offset).toEqual({ x: 2.75, y: 5 });
    const call = vi.mocked(result.record.ctx.drawImage).mock.calls[0];
    expect(call?.slice(1, 5)).toEqual([476, 532, 200, 460]);
    expect(Number(call?.[6]) + Number(call?.[8])).toBeCloseTo(0);
  });

  it.each(["beret", "cap", "headphones"] as const)("standing의 %s는 기존 머리 offset을 유지한다", (accessory) => {
    expect(renderExpression({ accessory }).accessory.mock.calls.at(-1)?.[2].offset).toEqual({ x: 2, y: -3 });
  });

  it("standing 폴백 때 안경도 기존 body의 원래 offset을 유지한다", () => {
    const result = renderExpression({ accessory: "glasses", asset: "missing" });
    expect(result.order).toEqual(["body", "accessory"]);
    expect(result.accessory.mock.calls.at(-1)?.[2].offset).toEqual(office2dAtlasDrawFrame("artist", "walk", 0, 0, result.body).accessoryOffset);
  });

  it("호흡·기울기·불투명도·ghost를 기존 body와 같은 경로에 적용한다", () => {
    const result = renderExpression({ reducedMotion: false, alpha: 0.4, ghost: true,
      mutate: (actor) => { actor.leanAngle = 0.04; actor.squash = 0.02; } });
    const bob = office2dActorBob(result.self, 1, false);
    const index = office2dExpressionFrame(result.self, { sheet: "walk", row: 0, col: 0 }, 1, 1000, false);
    expect(index).not.toBeNull();
    expect(result.record.rotate).toHaveBeenCalledWith(bob.tiltRad);
    expect(result.standingAlphas[0]).toBeCloseTo(0.2);
    expect(result.accessory.mock.calls.at(-1)?.[2]).toMatchObject({ height: 76 * bob.scaleY,
      width: 76 * 128 / 192 * bob.scaleX, tiltRad: bob.tiltRad, offset: index === null ? null : sheet.frames[index]?.accessoryOffset });
  });

  it("전신 draw 실패도 기존 예외를 전파하면서 save/restore 균형을 복구한다", () => {
    const captured: { record?: ReturnType<typeof recordingContext> } = {};
    expect(() => renderExpression({ beforeRender: (record, standing) => {
      captured.record = record;
      vi.mocked(record.ctx.drawImage).mockImplementation((image) => { if (image === standing) throw new Error("standing-draw-failed"); });
    } })).toThrow("standing-draw-failed");
    expect(captured.record).toBeDefined();
    expect(captured.record?.save.mock.calls.length).toBe(captured.record?.restore.mock.calls.length);
  });

  it.each([
    { asset: "missing" }, { asset: "wrong-size" }, { asset: "missing", baseBody: "legacy" },
  ] as const)("표정이 미수신·잘못된 크기이면 기존 전체 body와 머리 기준으로 돌아간다: %j", (options) => {
    const result = renderExpression(options);
    expect(result.order).toEqual(["body", "accessory"]);
    const legacy = "baseBody" in options && options.baseBody === "legacy";
    const original = office2dAtlasDrawFrame("artist", "walk", 0, 0, result.body, 1, !legacy);
    expect(result.accessory.mock.calls.at(-1)?.[2].offset).toEqual(original.accessoryOffset);
  });

  it.each([
    (actor: Office2dActor) => { actor.moving = true; actor.stride = 12; },
    (actor: Office2dActor) => { actor.gaitBlend = 0.05; },
    (actor: Office2dActor) => { actor.facing = "left"; },
    (actor: Office2dActor) => { actor.facing = "up"; },
    (actor: Office2dActor) => { actor.gesture = { kind: "wave", until: 2000 }; },
    (actor: Office2dActor) => { actor.emote = null; },
  ])("걷기·잔여 gait·다른 방향·제스처·신호 만료는 중립 몸체를 유지한다", (mutate) => {
    expect(renderExpression({ mutate }).order).toEqual(["body", "accessory"]);
  });

  it("앞 착석 웃음은 기존 work 전신을 유지한다", () => {
    const result = renderExpression({ workBody: true, mutate: (actor) => {
      actor.seat = { id: "seat", anchor: { x: 120, y: 200 }, attach: { x: 120, y: 190 }, facing: "down", chair: "chair-front" };
    } });
    expect(result.order).toEqual(["work", "accessory"]);
    expect(result.record.ctx.drawImage).toHaveBeenCalledOnce();
  });

  it("만료 후에도 말풍선이 있으면 대화 전신으로 이어간다", () => {
    const result = renderExpression({ mutate: (actor) => { actor.emote = { kind: "laugh", glyph: "😂", until: 1000 }; actor.bubble = "대화를 계속해요"; } });
    expect(result.order).toEqual(["standing", "accessory"]);
    expect(result.accessory.mock.calls.at(-1)?.[2].offset).toEqual({ x: -2, y: 1 });
  });
});
