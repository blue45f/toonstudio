// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_SPACE_EMOTES,
  studioSpaceEmoteDurationMs,
} from "../studio-virtual-space-emote-catalog";
import { createOffice2dActor, office2dEmoteGlyph } from "./office2d-actors";
import { Office2dCamera } from "./office2d-camera";
import {
  applyOffice2dActorEmote,
  office2dEmoteBurstLabel,
  resolveOffice2dEmoteTransform,
} from "./office2d-emote-motion";
import {
  drawOffice2dOverlay,
  office2dStatusDotColor,
  planOffice2dOverlay,
} from "./office2d-overlay";
import type { Office2dCanvas2D } from "./office2d-procedural-art";
import { office2dGestureForEmote } from "./office2d-sprite-catalog";

function fakeOverlayContext(): {
  readonly ctx: Office2dCanvas2D;
  readonly fillStyles: string[];
} {
  const fillStyles: string[] = [];
  let currentFill = "#000";
  const ctx: Office2dCanvas2D = {
    get fillStyle() {
      return currentFill;
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      currentFill = String(value);
      fillStyles.push(currentFill);
    },
    strokeStyle: "#000",
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    font: "12px sans-serif",
    textAlign: "left",
    textBaseline: "top",
    imageSmoothingEnabled: true,
    lineJoin: "miter",
    lineCap: "butt",
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: (text: string) =>
      ({
        width: text.length * 7,
      }) as TextMetrics,
    createLinearGradient: () => ({ addColorStop: vi.fn() }) as unknown as CanvasGradient,
    createRadialGradient: () => ({ addColorStop: vi.fn() }) as unknown as CanvasGradient,
    clip: vi.fn(),
    setLineDash: vi.fn(),
  };
  return { ctx, fillStyles };
}

describe("office2d-actors & office2d-emote-motion", () => {
  it("25종 카탈로그 이모트 모두 고유 글리프를 반환하고 누락된 이모트(fireworks, yoga 등)가 ✨로 폴백되지 않는다", () => {
    expect(STUDIO_SPACE_EMOTES).toHaveLength(25);
    for (const def of STUDIO_SPACE_EMOTES) {
      expect(office2dEmoteGlyph(def.id)).toBe(def.glyph);
    }
    expect(office2dEmoteGlyph("fireworks")).toBe("🎆");
    expect(office2dEmoteGlyph("calisthenics")).toBe("🤸");
    expect(office2dEmoteGlyph("yoga")).toBe("🧘");
    expect(office2dEmoteGlyph("kpop-dance")).toBe("🕺");
    expect(office2dEmoteGlyph("shuffle")).toBe("🪩");
    expect(office2dEmoteGlyph("neck-stretch")).toBe("💆");
    expect(office2dEmoteGlyph("tai-chi")).toBe("☯️");
    expect(office2dEmoteGlyph("cheers")).toBe("🥂");
    expect(office2dEmoteGlyph("moonwalk")).toBe("🕴️");
  });

  it("카탈로그 이모트별 제스처와 지속시간, startedAt, 바디 모션 변위를 연결한다", () => {
    expect(office2dGestureForEmote("fireworks")).toBe("cheer");
    expect(office2dGestureForEmote("kpop-dance")).toBe("cheer");
    expect(office2dGestureForEmote("coffee")).toBe("thumbs");
    expect(office2dGestureForEmote("yoga")).toBe("think");
    expect(office2dGestureForEmote("moonwalk")).toBe("wave");

    const actor = createOffice2dActor({
      id: "self",
      kind: "self",
      character: "artist",
      accent: "#ab8dce",
      name: "작가",
      x: 200,
      y: 300,
      now: 1000,
    });
    const applied = applyOffice2dActorEmote(actor, "kpop-dance", 1000);
    expect(applied).toEqual({
      glyph: "🕺",
      durationMs: studioSpaceEmoteDurationMs("kpop-dance"),
    });
    expect(actor.emote).toEqual({
      glyph: "🕺",
      kind: "kpop-dance",
      startedAt: 1000,
      until: 1000 + studioSpaceEmoteDurationMs("kpop-dance"),
    });
    expect(actor.gesture).toEqual({
      kind: "cheer",
      until: 1000 + studioSpaceEmoteDurationMs("kpop-dance"),
    });
    expect(office2dEmoteBurstLabel("fireworks", "ko")).toBe("🎆 폭죽");
    expect(office2dEmoteBurstLabel("fireworks", "en")).toBe("🎆 Fireworks");

    const standingTransform = resolveOffice2dEmoteTransform(actor, 1250, false);
    expect(
      Math.abs(standingTransform.offsetX) +
        Math.abs(standingTransform.offsetY) +
        Math.abs(standingTransform.tiltRad),
    ).toBeGreaterThan(0);

    // 이동 중에는 facingOverride를 적용하지 않고 축소된 바운스만 반환한다.
    actor.moving = true;
    const movingTransform = resolveOffice2dEmoteTransform(actor, 1250, false);
    expect(movingTransform.facingOverride).toBeNull();
    expect(Math.abs(movingTransform.offsetX)).toBeLessThan(
      Math.abs(standingTransform.offsetX) + 0.001,
    );
  });

  it("네임플레이트 상태 텍스트를 24자까지 유지하고 상태 아이콘별 왼쪽 점 색상을 반영한다", () => {
    expect(office2dStatusDotColor("🟢 대화 가능")).toBe("#22c55e");
    expect(office2dStatusDotColor("🔴 방해 금지 · 마감 중")).toBe("#ef4444");
    expect(office2dStatusDotColor("🎤 회의 중")).toBe("#a855f7");
    expect(office2dStatusDotColor("🎯 집중 작업 중")).toBe("#3b82f6");
    expect(office2dStatusDotColor("🟡 자리 비움")).toBe("#eab308");
    expect(office2dStatusDotColor("☕ 휴식 중")).toBe("#f97316");

    const actor = createOffice2dActor({
      id: "self",
      kind: "self",
      character: "artist",
      accent: "#ab8dce",
      name: "작가",
      x: 200,
      y: 200,
      now: 0,
    });
    actor.status = "🔴 방해 금지 · 마감 원고 집중 작업 중입니다";
    const camera = new Office2dCamera(800, 600, { x: 200, y: 200 });
    camera.setViewport({ width: 800, height: 600 });
    const { ctx, fillStyles } = fakeOverlayContext();
    const frame = {
      camera,
      actors: [actor],
      selfId: actor.id,
      now: 100,
      time: 0.1,
      reducedMotion: true,
    };
    const plan = planOffice2dOverlay(ctx, frame);
    expect(plan.actors).toHaveLength(1);
    expect([...(plan.actors[0]?.status ?? "")].length).toBeLessThanOrEqual(24);
    expect([...(plan.actors[0]?.status ?? "")].length).toBeGreaterThan(16);
    drawOffice2dOverlay(ctx, plan, frame);
    expect(fillStyles).toContain("#ef4444");
  });
});
