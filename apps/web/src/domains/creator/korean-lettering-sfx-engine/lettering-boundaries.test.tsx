// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { generateSfxVectorEnvelope, StudioKoreanLetteringSfxPanel, typesetKoreanBalloon, type KoreanBalloonTypesetResult, type SfxVectorEnvelopeResult } from "./index";
import { MAX_DIALOGUE_LENGTH, MAX_DIALOGUE_TOKENS } from "./lettering-input-contract";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("조판 예제 입력·원문·출력 경계", () => {
  it("길이·어절 한도는 DP 배열 생성 전에 차단한다", () => {
    const allocation = vi.spyOn(Array, "from");
    expect(() => typesetKoreanBalloon("가".repeat(MAX_DIALOGUE_LENGTH + 1))).toThrow(/한도/);
    expect(() => typesetKoreanBalloon("가 ".repeat(MAX_DIALOGUE_TOKENS + 1))).toThrow(/한도/);
    expect(allocation).not.toHaveBeenCalled();
  });

  it("한도 초과 대사를 미계산으로 표시하고 입력·탭·복구 경로를 유지한다", () => {
    const onBalloon = vi.fn();
    render(<StudioKoreanLetteringSfxPanel locale="ko" onBalloonTypeset={onBalloon} />);
    const text = "가".repeat(MAX_DIALOGUE_LENGTH + 1);
    fireEvent.change(screen.getByTestId("balloon-dialogue-input"), { target: { value: text } });
    expect(screen.getByTestId("balloon-dialogue-input")).toHaveProperty("value", text);
    expect(screen.getByTestId("balloon-typeset-input-error").textContent).toContain("미계산");
    expect(screen.queryByTestId("balloon-svg-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("writing-mode-vertical-rl"));
    expect(screen.getByTestId("balloon-dialogue-input")).toHaveProperty("value", text);
    expect(onBalloon).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("balloon-dialogue-input"), { target: { value: "원문 유지" } });
    expect(screen.queryByTestId("balloon-typeset-input-error")).toBeNull();
    expect(screen.getByTestId("balloon-svg-preview")).toBeTruthy();
  });

  it("NaN 조판·SFX 옵션을 성공 좌표나 SVG로 반환하지 않는다", () => {
    expect(() => typesetKoreanBalloon("원문", { fontSizePx: NaN })).toThrow(/유한/);
    expect(() => typesetKoreanBalloon("원문", { balloonWidthPx: Infinity })).toThrow(/유한/);
    expect(() => generateSfxVectorEnvelope("쿵", { arcIntensity: NaN })).toThrow(/유한/);
  });

  it("세로 열 넘침은 가로 지표와 분리하고 모든 원문 글자를 남긴다", () => {
    const text = "가".repeat(90);
    const result = typesetKoreanBalloon(text, { writingMode: "vertical-rl", balloonWidthPx: 210, fontSizePx: 24 });
    expect(result.verticalOverflowPx).toBeGreaterThan(0);
    expect(result.hasLayoutOverflow).toBe(true);
    expect(result.verticalColumns.flatMap((column) => column.glyphs.map((glyph) => glyph.sourceChar)).join("")).toBe(text);
    expect(result.text).toBe(text);
    render(<StudioKoreanLetteringSfxPanel locale="ko" initialDialogue={text} initialWritingMode="vertical-rl" />);
    expect(screen.getByTestId("balloon-layout-overflow").textContent).toContain("세로 열");
    expect(screen.getByTestId("btn-apply-balloon-layout")).toHaveProperty("disabled", true);
  });

  it("높이가 맞아도 세로 열의 글자 폭이 겹치면 넘침으로 판정하고 알림을 막는다", () => {
    const text = "가".repeat(25);
    const result = typesetKoreanBalloon(text, { shape: "caption", writingMode: "vertical-rl", balloonWidthPx: 160, fontSizePx: 24 });
    const first = result.verticalColumns[0];
    const second = result.verticalColumns[1];
    expect(first && second && Math.abs(first.xPx - second.xPx)).toBeLessThan(result.fontSizePx);
    expect(result.verticalOverflowPx).toBe(0);
    expect(result.horizontalOverflowPx).toBeGreaterThan(0);
    expect(result.hasLayoutOverflow).toBe(true);
    expect(result.text).toBe(text);
    expect(result.verticalColumns.flatMap((column) => column.glyphs.map((glyph) => glyph.sourceChar)).join("")).toBe(text);
    const onBalloon = vi.fn();
    render(<StudioKoreanLetteringSfxPanel locale="ko" initialDialogue={text} initialBalloonShape="caption" initialWritingMode="vertical-rl" onBalloonTypeset={onBalloon} />);
    fireEvent.change(screen.getByTestId("balloon-width-slider"), { target: { value: "160" } });
    fireEvent.change(screen.getByTestId("balloon-fontsize-slider"), { target: { value: "24" } });
    expect(screen.getByTestId("balloon-dialogue-input")).toHaveProperty("value", text);
    expect(screen.getByTestId("balloon-layout-overflow").textContent).toContain("열 간격");
    expect(screen.getByTestId("btn-apply-balloon-layout")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByTestId("btn-apply-balloon-layout"));
    expect(onBalloon).not.toHaveBeenCalled();
  });

  it("세로쓰기에서도 결합 한글·이모지를 분리하지 않고 원문을 보존한다", () => {
    const text = "한👨‍👩‍👧‍👦";
    const result = typesetKoreanBalloon(text, { writingMode: "vertical-rl" });
    const glyphs = result.verticalColumns.flatMap((column) => column.glyphs);
    expect(glyphs.map((glyph) => glyph.sourceChar)).toEqual(["한", "👨‍👩‍👧‍👦"]);
    expect(glyphs.map((glyph) => glyph.displayChar)).toEqual(["한", "👨‍👩‍👧‍👦"]);
    expect(result.text).toBe(text);
  });

  it("SFX 원문 공백·빈 입력을 보존하고 결합 글자·이모지를 한 표시 단위로 다룬다", () => {
    const text = "  한 👨‍👩‍👧‍👦  ";
    const result = generateSfxVectorEnvelope(text);
    expect(result.text).toBe(text);
    expect(result.glyphs.map((glyph) => glyph.char)).toContain("한");
    expect(result.glyphs.map((glyph) => glyph.char)).toContain("👨‍👩‍👧‍👦");
    expect(result.glyphs.filter((glyph) => /^\s+$/u.test(glyph.char))).toHaveLength(5);
    const empty = generateSfxVectorEnvelope("  ");
    expect(empty.text).toBe("  ");
    expect(empty.glyphs).toHaveLength(0);
    expect(empty.totalVectorPathCount).toBe(0);
    expect(result.renderingKind).toBe("font-dependent-svg-text");
    expect(result.glyphOutlineGenerated).toBe(false);
  });

  it("독립 SVG 문자열에도 내곽선 두께를 기록하며 사각 경계를 글리프 경로로 세지 않는다", () => {
    const thin = generateSfxVectorEnvelope("쿵", { outerStrokeWidthPx: 10, innerStrokeWidthPx: 2 });
    const thick = generateSfxVectorEnvelope("쿵", { outerStrokeWidthPx: 10, innerStrokeWidthPx: 5 });
    expect(thin.standaloneSvgMarkup).not.toBe(thick.standaloneSvgMarkup);
    expect(thick.standaloneSvgMarkup).toContain('stroke-width="5"');
    const svg = new DOMParser().parseFromString(thick.standaloneSvgMarkup, "image/svg+xml");
    expect(svg.querySelector("parsererror")).toBeNull();
    expect(svg.querySelectorAll("text")).toHaveLength(3);
    expect(thick.totalVectorPathCount).toBe(svg.querySelectorAll("path").length);
  });

  it("기본 패널은 컷 적용·벡터 레이어 저장 성공을 주장하지 않는다", () => {
    render(<StudioKoreanLetteringSfxPanel locale="ko" />);
    expect(screen.getByTestId("korean-lettering-sfx-panel").textContent).toContain("현재 원고 적용·저장·내보내기는 연결되지 않았습니다");
    fireEvent.click(screen.getByTestId("btn-apply-balloon-layout"));
    expect(screen.getByTestId("balloon-apply-status").textContent).toContain("현재 원고·저장 상태는 바뀌지 않습니다");
    fireEvent.click(screen.getByTestId("tab-sfx-vector"));
    fireEvent.click(screen.getByTestId("btn-generate-sfx-layer"));
    expect(screen.getByTestId("sfx-commit-status").textContent).toContain("실제 레이어 생성·저장은 연결되지 않았습니다");
    expect(screen.queryByTestId("example-notification-status")).toBeNull();
  });

  it("조판 콜백 대기·거절·재시도는 같은 결과를 알리고 중복을 막는다", async () => {
    let rejectPending: (error: Error) => void = () => { throw new Error("대기 Promise 누락"); };
    const pending = new Promise<void>((_resolve, reject) => { rejectPending = reject; });
    const onBalloon = vi.fn<(result: KoreanBalloonTypesetResult) => void | Promise<void>>().mockImplementationOnce(() => pending).mockResolvedValueOnce(undefined);
    render(<StudioKoreanLetteringSfxPanel locale="ko" initialDialogue="원문" onBalloonTypeset={onBalloon} />);
    fireEvent.click(screen.getByTestId("btn-apply-balloon-layout"));
    fireEvent.click(screen.getByTestId("btn-apply-balloon-layout"));
    expect(onBalloon).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("example-notification-status").textContent).toContain("처리 중");
    await act(async () => { rejectPending(new Error("알림 거부")); });
    expect(screen.getByRole("alert").textContent).toContain("알림 거부");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "결과 알림 다시 시도" })); });
    expect(onBalloon).toHaveBeenCalledTimes(2);
    expect(onBalloon.mock.calls[1]?.[0]).toBe(onBalloon.mock.calls[0]?.[0]);
  });

  it("SFX 콜백의 동기 예외는 결과 알림 오류로 남고 동일 결과로 재시도한다", () => {
    const onSfx = vi.fn<(result: SfxVectorEnvelopeResult) => void | Promise<void>>().mockImplementationOnce(() => { throw new Error("연결 실패"); }).mockImplementationOnce(() => undefined);
    render(<StudioKoreanLetteringSfxPanel locale="ko" initialTab="sfx-vector" onSfxGenerated={onSfx} />);
    fireEvent.click(screen.getByTestId("btn-generate-sfx-layer"));
    expect(screen.getByRole("alert").textContent).toContain("연결 실패");
    fireEvent.click(screen.getByRole("button", { name: "결과 알림 다시 시도" }));
    expect(onSfx.mock.calls[1]?.[0]).toBe(onSfx.mock.calls[0]?.[0]);
  });

  it.each([
    { channel: "balloon", tab: "balloon-typeset", trigger: "btn-apply-balloon-layout" },
    { channel: "sfx", tab: "sfx-vector", trigger: "btn-generate-sfx-layer" },
  ] as const)("$channel 수신자가 바뀌거나 제거되면 재시도도 최신 수신자를 따른다", ({ channel, tab, trigger }) => {
    const original = vi.fn<(result: KoreanBalloonTypesetResult | SfxVectorEnvelopeResult) => void>(() => { throw new Error("첫 수신자 거부"); });
    const replacement = vi.fn<(result: KoreanBalloonTypesetResult | SfxVectorEnvelopeResult) => void>(() => { throw new Error("새 수신자 거부"); });
    const initialProps = channel === "balloon" ? { onBalloonTypeset: original } : { onSfxGenerated: original };
    const latestProps = channel === "balloon" ? { onBalloonTypeset: replacement } : { onSfxGenerated: replacement };
    const view = render(<StudioKoreanLetteringSfxPanel locale="ko" initialTab={tab} initialDialogue="원문" {...initialProps} />);
    fireEvent.click(screen.getByTestId(trigger));
    const payload = original.mock.calls[0]?.[0];
    expect(original).toHaveBeenCalledTimes(1);

    view.rerender(<StudioKoreanLetteringSfxPanel locale="ko" initialTab={tab} initialDialogue="원문" {...latestProps} />);
    fireEvent.click(screen.getByRole("button", { name: "결과 알림 다시 시도" }));
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(replacement.mock.calls[0]?.[0]).toBe(payload);

    view.rerender(<StudioKoreanLetteringSfxPanel locale="ko" initialTab={tab} initialDialogue="원문" />);
    fireEvent.click(screen.getByRole("button", { name: "결과 알림 다시 시도" }));
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("example-notification-status")).toBeNull();
  });
});
