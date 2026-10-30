import { describe, expect, it } from "vitest";

import { compareSourceKey, createEmptyCompareSession, poolItemFromExternal, type CompareSession } from "./compare-review-model";
import { createVoiceCommentaryTrack, parseVoiceCommentaryTrack, recordVoiceKeyframe, serializeVoiceCommentaryTrack,
  startVoiceRecording, voicePlaybackCueAt } from "./review-voice-commentary-model";
import { captureVoiceCompareView, parseVoiceCompareView, voiceCompareSessionForReplay, type VoiceCompareView } from "./voice-compare-view";

const items = ["a", "b", "c", "d"].map((assetId) => poolItemFromExternal({ assetId, label: assetId,
  imageUrl: `https://images.invalid/${assetId}?private-signed-value`, addedBy: "reviewer", addedAt: "2026-10-30T00:00:00Z" }));
function fixture(): CompareSession {
  return { ...createEmptyCompareSession("ep-1"), pool: items,
    panes: [items[2].source, items[0].source, items[3].source, items[1].source], mode: "overlay", syncView: false,
    offsets: { [compareSourceKey(items[2].source)]: { dx: -0.2, dy: 0.25 } },
    flipBoth: true, flipVertical: true, diffOn: true, overlayOpacity: 0.3 };
}
function capture(session = fixture()) {
  const view = captureVoiceCompareView(session, { shared: { scale: 8, tx: -0.75, ty: 1 },
    locals: session.panes.map((_, index) => ({ scale: index + 1, tx: -index / 4, ty: index / 4 })),
    sliderPosition: 27, blink: { enabled: false, intervalMs: 1250, phase: true }, focusedPane: 3 });
  if (!view) throw new Error("비교 캡처가 없습니다.");
  return view;
}

describe("음성 비교 화면의 실제 상태 계약", () => {
  it("풀의 첫 항목 대신 앞 페인의 소스를 기록하고 네 페인의 표시 상태를 URL 없이 보존한다", () => {
    const session = fixture(), view = capture(session);
    expect(view.poolItemId).toBe(items[2].id);
    expect(view.compare).toMatchObject({ panes: session.panes, mode: "overlay", syncView: false,
      shared: { scale: 8, tx: -0.75, ty: 1 }, locals: [{ scale: 1 }, { scale: 2 }, { scale: 3 }, { scale: 4 }],
      flipBoth: true, flipVertical: true, diffOn: true, overlayOpacity: 0.3, sliderPosition: 27,
      blink: { enabled: false, intervalMs: 1250, phase: true }, focusedPane: 3 });
    expect(JSON.stringify(view)).not.toMatch(/images\.invalid|private-signed-value|imageUrl/u);
    expect(voiceCompareSessionForReplay({ ...session, mode: "panes", panes: [items[0].source, items[1].source] }, view))
      .toMatchObject({ panes: session.panes, mode: session.mode, syncView: false, offsets: session.offsets,
        flipBoth: true, flipVertical: true, diffOn: true, overlayOpacity: 0.3 });
  });

  it.each([2, 3, 4])("%i 페인 구성을 녹음 직렬화·서버 응답 파서 왕복 뒤에도 보존한다", (count) => {
    const view = capture({ ...fixture(), panes: fixture().panes.slice(0, count) });
    const track = createVoiceCommentaryTrack({ id: "voice-1", episodeId: "ep-1", authorName: "검수자",
      createdAt: "2026-10-30T00:00:00Z", durationMs: 1000, keyframes: [{ atMs: 0, view, pinThreadIds: ["pin-1"] }] });
    const restored = parseVoiceCommentaryTrack(serializeVoiceCommentaryTrack(track));
    expect(restored?.keyframes[0].view.compare).toEqual(view.compare);
    expect(restored?.keyframes[0].pinThreadIds).toEqual(["pin-1"]);
  });

  it("비교 확장이 없는 이전 트랙은 선택 소스와 기존 모드·뷰포트로 계속 복원한다", () => {
    const { compare: _compare, ...view } = capture();
    const session = fixture();
    expect(voiceCompareSessionForReplay(session, view)).toMatchObject({
      panes: session.panes, mode: view.mode, syncView: true, offsets: {},
    });
  });

  it("녹음이 참조하는 소스가 없으면 다른 버전으로 대체하거나 부분 적용하지 않는다", () => {
    const view = capture();
    const current = { ...fixture(), pool: items.slice(0, 2) };
    const before = JSON.stringify(current);
    expect(voiceCompareSessionForReplay(current, view)).toBeNull();
    expect(JSON.stringify(current)).toBe(before);
    expect(captureVoiceCompareView({ ...current, panes: [items[2].source] }, {
      shared: { scale: 1, tx: 0, ty: 0 }, locals: [], sliderPosition: 50,
      blink: { enabled: true, intervalMs: 800, phase: false }, focusedPane: 0 })).toBeNull();
  });

  it("앞 페인 뷰포트가 같아도 다른 페인·슬라이더·반전 변경을 키프레임으로 기록한다", () => {
    const first = capture(), compare = first.compare;
    if (!compare) throw new Error("비교 확장이 없습니다.");
    let recording = startVoiceRecording({ episodeId: "ep-1", startedAt: "2026-10-30T00:00:00Z", initialView: first });
    expect(recordVoiceKeyframe(recording, 500, first)).toBe(recording);
    recording = recordVoiceKeyframe(recording, 1000, { ...first, compare: { ...compare, sliderPosition: 74 } });
    recording = recordVoiceKeyframe(recording, 1500, { ...first, compare: { ...compare, flipBoth: false } });
    expect(recording.keyframes).toHaveLength(3);
  });

  it("고정 구성이 같은 구간에서는 공유·개별 뷰포트와 슬라이더를 함께 보간한다", () => {
    const first = capture(), compare = first.compare;
    if (!compare) throw new Error("비교 확장이 없습니다.");
    const later = { ...first, compare: { ...compare, shared: { scale: 4, tx: -0.25, ty: 0 },
      locals: compare.locals.map((entry) => ({ ...entry, scale: entry.scale + 2 })), sliderPosition: 77 } };
    const track = createVoiceCommentaryTrack({ id: "voice-1", episodeId: "ep-1", authorName: "검수자",
      createdAt: "2026-10-30T00:00:00Z", durationMs: 1000,
      keyframes: [{ atMs: 0, view: first, pinThreadIds: [] }, { atMs: 1000, view: later, pinThreadIds: [] }] });
    const view = voicePlaybackCueAt(track, 500).view;
    expect(view?.compare?.shared).toEqual({ scale: 6, tx: -0.5, ty: 0.5 });
    expect(view?.compare?.locals[1].scale).toBe(3);
    expect(view?.compare?.sliderPosition).toBe(52);
  });

  it("비유한 값·과다 페인·식별자 없는 소스는 잘못된 확장으로 거절한다", () => {
    const compare = capture().compare;
    expect(parseVoiceCompareView({ ...compare, panes: [...fixture().panes, items[0].source] })).toBeNull();
    expect(parseVoiceCompareView({ ...compare, shared: { scale: NaN, tx: 0, ty: 0 } })).toBeNull();
    expect(parseVoiceCompareView({ ...compare, locals: [] })).toBeNull();
    expect(parseVoiceCompareView({ ...compare, panes: [{ kind: "external", assetId: "" }] })).toBeNull();
    expect(parseVoiceCompareView({ ...compare, blink: { enabled: true, intervalMs: Infinity, phase: false } })).toBeNull();
  });

  it.each<[string, (view: VoiceCompareView) => unknown]>([
    ["집중 페인 비정수", (value) => ({ ...value, focusedPane: 1.5 })],
    ["집중 페인 음수", (value) => ({ ...value, focusedPane: -1 })],
    ["집중 페인 범위 초과", (value) => ({ ...value, focusedPane: 4 })],
    ["공유 배율 초과", (value) => ({ ...value, shared: { ...value.shared, scale: 8.01 } })],
    ["공유 배율 미달", (value) => ({ ...value, shared: { ...value.shared, scale: 0.24 } })],
    ["공유 이동 범위 초과", (value) => ({ ...value, shared: { ...value.shared, tx: -1.01 } })],
    ["개별 이동 범위 초과", (value) => ({ ...value, locals: value.locals.map((local) => ({ ...local, ty: 1.01 })) })],
    ["정렬 범위 초과", (value) => ({ ...value, offsets: [{ source: items[0].source, dx: 0.251, dy: 0 }] })],
    ["불투명도 범위 초과", (value) => ({ ...value, overlayOpacity: 1.01 })],
    ["슬라이더 범위 초과", (value) => ({ ...value, sliderPosition: -0.01 })],
    ["깜빡 주기 미달", (value) => ({ ...value, blink: { ...value.blink, intervalMs: 249 } })],
    ["깜빡 주기 초과", (value) => ({ ...value, blink: { ...value.blink, intervalMs: 2001 } })],
    ["최상위 계약 외 주소", (value) => ({ ...value, imageUrl: "https://private.invalid/image" })],
    ["소스의 계약 외 주소", (value) => ({ ...value, panes: value.panes.map((pane) => ({ ...pane, imageUrl: "https://private.invalid/image" })) })],
    ["공유 뷰포트의 계약 외 주소", (value) => ({ ...value, shared: { ...value.shared, imageUrl: "https://private.invalid/image" } })],
    ["개별 뷰포트의 계약 외 주소", (value) => ({ ...value, locals: value.locals.map((local) => ({ ...local, imageUrl: "https://private.invalid/image" })) })],
    ["정렬의 계약 외 주소", (value) => ({ ...value, offsets: value.offsets.map((offset) => ({ ...offset, imageUrl: "https://private.invalid/image" })) })],
    ["깜빡 상태의 계약 외 주소", (value) => ({ ...value, blink: { ...value.blink, imageUrl: "https://private.invalid/image" } })],
  ])("%s는 저장 확장을 보정하거나 필드를 버리지 않고 거절한다", (_label, invalid) => {
    const view = capture(), compare = view.compare;
    if (!compare) throw new Error("비교 확장이 없습니다.");
    const value = invalid(compare);
    expect(parseVoiceCompareView(value)).toBeNull();
    const raw = JSON.stringify({ version: 1, id: "voice-1", episodeId: "ep-1", authorName: "검수자",
      createdAt: "2026-10-30T00:00:00Z", durationMs: 1000, audio: null,
      keyframes: [{ atMs: 0, view: { ...view, compare: value }, pinThreadIds: [] }], pinThreadIds: [] });
    expect(parseVoiceCommentaryTrack(raw)).toBeNull();
  });

  it("뷰포트 수에 맞지 않는 집중 페인은 거절하고 실제 페인 축소 캡처는 표시 중인 페인을 기록한다", () => {
    const session = { ...fixture(), panes: fixture().panes.slice(0, 2) };
    const view = capture(session), compare = view.compare;
    expect(compare?.focusedPane).toBe(1);
    expect(parseVoiceCompareView({ ...compare, focusedPane: 2 })).toBeNull();
  });

  it("저장 확장의 모든 영 표현은 입력을 변조하지 않고 +0으로 고정해 엄격한 JSON 왕복을 보존한다", () => {
    const compare = capture().compare;
    if (!compare) throw new Error("비교 확장이 없습니다.");
    const input: VoiceCompareView = { ...compare, shared: { scale: 8, tx: -0, ty: -0 },
      locals: compare.locals.map((local) => ({ ...local, tx: -0, ty: -0 })),
      offsets: compare.panes.map((pane) => ({ source: pane, dx: -0, dy: -0 })),
      overlayOpacity: -0, sliderPosition: -0, focusedPane: -0 };
    const zeroFields = (value: VoiceCompareView) => [value.shared.tx, value.shared.ty,
      ...value.locals.flatMap((local) => [local.tx, local.ty]), ...value.offsets.flatMap((offset) => [offset.dx, offset.dy]),
      value.overlayOpacity, value.sliderPosition, value.focusedPane];
    expect(zeroFields(input).every((value) => Object.is(value, -0))).toBe(true);
    const parsed = parseVoiceCompareView(input);
    if (!parsed) throw new Error("유효한 영 좌표가 거절됐습니다.");
    for (const value of zeroFields(parsed)) {
      expect(Object.is(value, -0)).toBe(false);
      expect(value).toBe(0);
    }
    expect(parseVoiceCompareView(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(zeroFields(input).every((value) => Object.is(value, -0))).toBe(true);
  });

  it("영 표현 정규화는 비영 음수와 허용 경계를 반올림하거나 이동하지 않는다", () => {
    const compare = capture().compare;
    if (!compare) throw new Error("비교 확장이 없습니다.");
    const input: VoiceCompareView = { ...compare, shared: { scale: 8, tx: -0.75, ty: 1 },
      locals: [{ scale: 0.25, tx: -1, ty: 1 }, { scale: 8, tx: 1, ty: -1 },
        { scale: 1, tx: -0.75, ty: 0.75 }, { scale: 4, tx: -0.25, ty: 0.25 }],
      offsets: [{ source: compare.panes[0], dx: -0.25, dy: 0.25 }], overlayOpacity: 1, sliderPosition: 100,
      focusedPane: 3, blink: { enabled: false, intervalMs: 250, phase: true } };
    expect(parseVoiceCompareView(input)).toEqual(input);
    expect(parseVoiceCompareView(JSON.parse(JSON.stringify(input)))).toEqual(input);
    const slowBlink = { ...input, blink: { ...input.blink, intervalMs: 2000 } };
    expect(parseVoiceCompareView(slowBlink)).toEqual(slowBlink);
  });
});
