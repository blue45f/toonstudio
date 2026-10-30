// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOffice2dActor } from "./office2d-actors";
import * as catalog from "./office2d-expression-catalog";
import { resolveOffice2dStandingExpression } from "./office2d-standing-expression";

afterEach(() => vi.restoreAllMocks());

const sheet: catalog.Office2dExpressionSheet = {
  role: "artist", url: "/assets/virtual-studio/office-standing-expressions-v1/artist-standing.png",
  width: 1536, height: 1024, columns: 4, rows: 2,
  frames: Array.from({ length: 8 }, (_, index) => ({
    source: { x: index % 4 * 384 + 92, y: Math.floor(index / 4) * 512 + 20, width: 200, height: 460 },
    target: { x: 24, y: 8, width: 80, height: 180 }, accessoryOffset: { x: index - 3, y: 2 - index },
    eyewearOffset: { x: index - 2.25, y: 10 - index },
  })),
};

function setup() {
  vi.spyOn(catalog, "office2dExpressionSheet").mockReturnValue(sheet);
  const actor = createOffice2dActor({ id: "self", kind: "self", character: "artist", accent: "#fff", name: "작가", x: 100, y: 200, now: 0 });
  const image = document.createElement("canvas"); image.width = 1536; image.height = 1024;
  return { actor, image, getter: vi.fn(() => image) };
}
const idle = { sheet: "walk", row: 0, col: 0 } as const;
const frame = { time: 1, now: 1000, reducedMotion: true };

describe("정지 전신 표정 bitmap 선택과 발·머리 계약", () => {
  it("대화와 웃음은 선택된 전신 프레임과 독립적인 머리 오프셋을 반환한다", () => {
    const { actor, image, getter } = setup();
    actor.bubble = "같이 작업해요";
    const talking = resolveOffice2dStandingExpression(actor, idle, frame, getter);
    expect(talking).toEqual({ image, frameIndex: 1, eyewearOffset: sheet.frames[1]?.eyewearOffset, drawFrame: { source: sheet.frames[1]?.source,
      destination: sheet.frames[1]?.target, accessoryOffset: sheet.frames[1]?.accessoryOffset } });
    actor.emote = { kind: "laugh", glyph: "😂", until: 2000 };
    const laughing = resolveOffice2dStandingExpression(actor, idle, frame, getter);
    expect(laughing?.frameIndex).toBe(5);
    expect(laughing?.drawFrame.accessoryOffset).toEqual({ x: 2, y: -3 });
    expect(laughing?.eyewearOffset).toEqual({ x: 2.75, y: 5 });
    expect(laughing?.drawFrame.destination).toEqual({ x: 24, y: 8, width: 80, height: 180 });
    expect(getter).toHaveBeenCalledWith(sheet.url);
  });

  it("전신 target은 발 188 기준을 유지하고 머리 오프셋을 몸체에 누적하지 않는다", () => {
    const { actor, getter } = setup(); actor.typing = true;
    const result = resolveOffice2dStandingExpression(actor, idle, frame, getter);
    expect(result).not.toBeNull();
    expect((result?.drawFrame.destination.y ?? 0) + (result?.drawFrame.destination.height ?? 0)).toBe(188);
    expect(result?.drawFrame.destination.x).toBe(24);
    expect(result?.drawFrame.accessoryOffset.x).toBe(-2);
  });

  it("웃음 만료 뒤 현재 대화로 돌아오고 신호가 없으면 원래 몸체를 고른다", () => {
    const { actor, getter } = setup(); actor.emote = { kind: "laugh", glyph: "😂", until: 1000 };
    expect(resolveOffice2dStandingExpression(actor, idle, frame, getter)).toBeNull();
    actor.bubble = "대화를 계속해요";
    expect(resolveOffice2dStandingExpression(actor, idle, frame, getter)?.frameIndex).toBe(1);
  });

  it("등록되지 않거나 미수신인 표정은 중립 몸체 선택을 방해하지 않는다", () => {
    const { actor } = setup(); actor.typing = true;
    expect(resolveOffice2dStandingExpression(actor, idle, frame, () => null)).toBeNull();
    vi.mocked(catalog.office2dExpressionSheet).mockReturnValue(null);
    const lookup = vi.fn();
    expect(resolveOffice2dStandingExpression(actor, idle, frame, lookup)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([[128, 192], [1536, 1023], [1535, 1024]])("실제 bitmap %d×%d가 metadata와 다르면 전체 몸체로 폴백한다", (width, height) => {
    const { actor, image, getter } = setup(); actor.typing = true; image.width = width; image.height = height;
    expect(resolveOffice2dStandingExpression(actor, idle, frame, getter)).toBeNull();
  });

  it("움직임·잔여 gait·옆 방향·착석·제스처는 표정 이미지 조회도 하지 않는다", () => {
    const { actor, getter } = setup(); actor.typing = true;
    actor.moving = true;
    expect(resolveOffice2dStandingExpression(actor, idle, frame, getter)).toBeNull();
    actor.moving = false; actor.gaitBlend = 0.01;
    expect(resolveOffice2dStandingExpression(actor, idle, frame, getter)).toBeNull();
    actor.gaitBlend = 0; actor.facing = "left";
    expect(resolveOffice2dStandingExpression(actor, idle, frame, getter)).toBeNull();
    actor.facing = "down"; actor.seat = { id: "seat", anchor: { x: 0, y: 0 }, attach: { x: 0, y: 0 }, facing: "down", chair: "chair-front" };
    expect(resolveOffice2dStandingExpression(actor, idle, frame, getter)).toBeNull();
    actor.seat = null; actor.gesture = { kind: "wave", until: 2000 };
    expect(resolveOffice2dStandingExpression(actor, idle, frame, getter)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });
});
