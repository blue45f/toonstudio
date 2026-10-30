import { describe, expect, it } from "vitest";

import { createOffice2dActor } from "./office2d-actors";
import { office2dExpressionSheetIsValid, readOffice2dExpressionSheets, type Office2dExpressionSheet } from "./office2d-expression-catalog";
import { office2dExpressionFrame } from "./office2d-expression-layer";
import { office2dPoseFrame, type Office2dSheetFrame } from "./office2d-poses";

function actor() {
  return createOffice2dActor({ id: "face-actor", kind: "peer", character: "artist", accent: "#fff", name: "작가", x: 100, y: 200, now: 0 });
}

const idle: Office2dSheetFrame = { sheet: "walk", row: 0, col: 0 };
const fixtureSheet: Office2dExpressionSheet = {
  role: "artist", url: "/assets/virtual-studio/office-standing-expressions-v1/artist-standing.png",
  width: 1536, height: 1024, columns: 4, rows: 2,
  frames: Array.from({ length: 8 }, (_, index) => ({
    source: { x: (index % 4) * 384 + 92, y: Math.floor(index / 4) * 512 + 20, width: 200, height: 460 },
    target: { x: 24, y: 8, width: 80, height: 180 }, accessoryOffset: { x: index - 3, y: 2 - index },
    eyewearOffset: { x: index - 2.25, y: 10 - index },
  })),
};

describe("정면 정지 배우의 전신 표정 선택", () => {
  it("서서 대화·입력 중일 때 몸체 정지 자세를 유지하며 말하기 네 프레임을 순환한다", () => {
    const talker = actor();
    talker.bubble = "같이 작업해요";
    const frames = new Set(Array.from({ length: 100 }, (_, index) => office2dExpressionFrame(talker, idle, index * 0.07, 1000, false)));
    expect(frames).toEqual(new Set([0, 1, 2, 3]));
    expect(office2dPoseFrame(talker, 1, 1000, false)).toEqual(idle);
    talker.bubble = null;
    talker.typing = true;
    expect(office2dExpressionFrame(talker, idle, 1, 1000, false)).not.toBeNull();
    talker.typing = false;
    expect(office2dExpressionFrame(talker, idle, 1, 1000, false)).toBeNull();
  });

  it("활성 웃음은 대화보다 우선하고 만료되면 현재 대화 또는 중립 몸체로 돌아간다", () => {
    const laugher = actor();
    laugher.bubble = "안녕하세요";
    laugher.emote = { kind: "laugh", glyph: "😂", until: 1500 };
    const frames = new Set(Array.from({ length: 100 }, (_, index) => office2dExpressionFrame(laugher, idle, index * 0.08, 1000, false)));
    expect(frames).toEqual(new Set([4, 5, 6, 7]));
    expect(office2dExpressionFrame(laugher, idle, 1, 1500, true)).toBe(1);
    laugher.bubble = null;
    expect(office2dExpressionFrame(laugher, idle, 1, 1500, false)).toBeNull();
  });

  it.each(["up", "left", "right"] as const)("%s 방향은 기존 몸체를 보존한다", (facing) => {
    const target = actor();
    target.typing = true;
    target.facing = facing;
    expect(office2dExpressionFrame(target, idle, 1, 1000, false)).toBeNull();
  });

  it("걷기·보행 잔여 관성·착석·제스처 중에는 전신 표정으로 교체하지 않는다", () => {
    const target = actor();
    target.typing = true;
    target.moving = true;
    expect(office2dExpressionFrame(target, idle, 1, 1000, false)).toBeNull();
    target.moving = false;
    target.gaitBlend = 0.01;
    expect(office2dExpressionFrame(target, idle, 1, 1000, false)).toBeNull();
    target.gaitBlend = 0;
    target.seat = { id: "seat", anchor: { x: 100, y: 200 }, attach: { x: 100, y: 190 }, facing: "down", chair: "chair-front" };
    expect(office2dExpressionFrame(target, idle, 1, 1000, false)).toBeNull();
    target.seat = null;
    target.gesture = { kind: "wave", until: 1500 };
    expect(office2dExpressionFrame(target, idle, 1, 1000, false)).toBeNull();
    expect(office2dExpressionFrame(target, idle, 1, 1500, false)).not.toBeNull();
  });

  it.each([
    { sheet: "work", row: 2, col: 0 },
    { sheet: "walk", row: 0, col: 1 },
    { sheet: "walk", row: 1, col: 0 },
  ] satisfies readonly Office2dSheetFrame[])("선택 몸체 $sheet/$row/$col이 중립 정면이 아니면 보존한다", (pose) => {
    const target = actor();
    target.typing = true;
    expect(office2dExpressionFrame(target, pose, 1, 1000, false)).toBeNull();
  });

  it("동작 줄이기는 시간에 무관한 표정을 쓰며 잘못된 시각에도 유효 프레임만 고른다", () => {
    const target = actor();
    target.typing = true;
    for (const time of [0, 1, 500, -1, Number.NaN]) expect(office2dExpressionFrame(target, idle, time, 1000, true)).toBe(1);
    expect(office2dExpressionFrame(target, idle, Number.NaN, 1000, false)).toBe(office2dExpressionFrame(target, idle, 0, 1000, false));
    target.emote = { kind: "laugh", glyph: "😂", until: 2000 };
    for (const time of [0, 1, 500]) expect(office2dExpressionFrame(target, idle, time, 1000, true)).toBe(5);
  });
});

describe("표정 atlas의 안전한 좌표 계약", () => {
  it("전신 여덟 프레임의 실제 픽셀 범위와 논리셀·머리 오프셋을 확인한다", () => {
    expect(office2dExpressionSheetIsValid(fixtureSheet)).toBe(true);
  });

  it("시트 밖 crop·잘못된 크기·셀 밖 부착점·잘못된 머리 좌표는 기존 몸체로 폴백한다", () => {
    for (const invalid of [
      { ...fixtureSheet, width: 0 },
      { ...fixtureSheet, height: Number.NaN },
      { ...fixtureSheet, rows: 3 },
      { ...fixtureSheet, frames: fixtureSheet.frames.slice(0, 7) },
      { ...fixtureSheet, url: "https://example.invalid/face.png" },
      { ...fixtureSheet, url: "/assets/virtual-studio/office-expressions-v1/artist-faces-runtime-v1.png" },
      { ...fixtureSheet, frames: fixtureSheet.frames.map((frame) => ({ ...frame, source: { ...frame.source, x: 1536 } })) },
      { ...fixtureSheet, frames: fixtureSheet.frames.map((frame) => ({ ...frame, source: { ...frame.source, y: -1 } })) },
      { ...fixtureSheet, frames: fixtureSheet.frames.map((frame) => ({ ...frame, target: { ...frame.target, y: -8.001 } })) },
      { ...fixtureSheet, frames: fixtureSheet.frames.map((frame) => ({ ...frame, accessoryOffset: undefined })) },
      { ...fixtureSheet, frames: fixtureSheet.frames.map((frame) => ({ ...frame, accessoryOffset: { x: Number.NaN, y: 0 } })) },
      { ...fixtureSheet, frames: fixtureSheet.frames.map((frame) => ({ ...frame, accessoryOffset: { x: 0, y: 193 } })) },
      { ...fixtureSheet, frames: fixtureSheet.frames.map((frame) => ({ ...frame, eyewearOffset: undefined })) },
      { ...fixtureSheet, frames: fixtureSheet.frames.map((frame) => ({ ...frame, eyewearOffset: { x: Number.POSITIVE_INFINITY, y: 0 } })) },
      { ...fixtureSheet, frames: fixtureSheet.frames.map((frame) => ({ ...frame, eyewearOffset: { x: 129, y: 0 } })) },
      { ...fixtureSheet, frames: fixtureSheet.frames.map((frame) => ({ ...frame, eyewearOffset: { x: 0, y: -193 } })) },
    ]) expect(office2dExpressionSheetIsValid(invalid)).toBe(false);
  });

  it("기존 몸키와 발 188을 유지하는 상단 overscan은 -8까지 허용하고 그 밖은 거절한다", () => {
    const withTarget = (y: number, height: number) => ({ ...fixtureSheet,
      frames: fixtureSheet.frames.map((frame) => ({ ...frame, target: { ...frame.target, y, height } })),
    });
    expect(office2dExpressionSheetIsValid(withTarget(-3, 191))).toBe(true);
    expect(office2dExpressionSheetIsValid(withTarget(-8, 196))).toBe(true);
    expect(office2dExpressionSheetIsValid(withTarget(-8.001, 196.001))).toBe(false);
    expect(office2dExpressionSheetIsValid(withTarget(-3, 196))).toBe(false);
  });

  it("v2 전신 metadata만 읽고 이전 얼굴 패치나 미완성 입력은 선택하지 않는다", () => {
    expect(readOffice2dExpressionSheets({ version: 2, sheets: [fixtureSheet] })).toEqual([fixtureSheet]);
    expect(readOffice2dExpressionSheets({ version: 1, sheets: [fixtureSheet] })).toEqual([]);
    expect(readOffice2dExpressionSheets({ version: 2, sheets: [null, { role: "artist" }, fixtureSheet] })).toEqual([fixtureSheet]);
    expect(readOffice2dExpressionSheets(null)).toEqual([]);
    expect(readOffice2dExpressionSheets({ version: 2, sheets: null })).toEqual([]);
  });
});
