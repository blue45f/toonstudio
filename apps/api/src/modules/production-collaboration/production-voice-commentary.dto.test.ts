import { describe, expect, it } from "vitest";

import { PRODUCTION_VOICE_COMMENTARY_METADATA_MAX_CHARS, productionVoiceCommentaryTrackMetaSchema } from "./production-voice-commentary.dto";

const pane = { kind: "revision" as const, processId: "line-1", revisionId: "revision-2" };
const viewport = { scale: 8, tx: -0.75, ty: 1 };
const compare = { version: 1 as const, panes: [pane, { kind: "external" as const, assetId: "draft-1" }],
  mode: "overlay" as const, syncView: false, offsets: [{ source: pane, dx: -0.25, dy: 0.25 }],
  flipBoth: true, flipVertical: true, diffOn: true, overlayOpacity: 0.2,
  shared: viewport, locals: [viewport, { scale: 0.25, tx: -1, ty: 1 }], sliderPosition: 75,
  blink: { enabled: false, intervalMs: 1250, phase: true }, focusedPane: 1 };
const view = { surface: "compare" as const, poolItemId: "revision:line-1:revision-2", pageId: null,
  mode: "overlay", scale: 8, tx: -0.75, ty: 1 };
const track = { version: 1, id: "voice-1", episodeId: "episode-1", authorId: "assignment-1", authorName: "검수자",
  createdAt: "2026-10-30T00:00:00.000Z", durationMs: 1000,
  keyframes: [{ atMs: 0, view, pinThreadIds: [] }], pinThreadIds: [] };
function withCompare(value: unknown = compare, surface = "compare") {
  return { ...track, keyframes: [{ ...track.keyframes[0], view: { ...view, surface, compare: value } }] };
}

describe("회차 음성 해설의 비교 화면 확장 DTO", () => {
  it("이전 v1 메타와 전체 비교 표시 상태 확장을 모두 받아들인다", () => {
    expect(productionVoiceCommentaryTrackMetaSchema.safeParse(track).success).toBe(true);
    const parsed = productionVoiceCommentaryTrackMetaSchema.parse(withCompare());
    expect(parsed.keyframes[0].view.compare).toEqual(compare);
    expect(PRODUCTION_VOICE_COMMENTARY_METADATA_MAX_CHARS).toBe(1_048_576);
  });
  it.each([
    { ...compare, panes: [...compare.panes, ...compare.panes, pane] },
    { ...compare, shared: { ...viewport, scale: 9 } },
    { ...compare, shared: { ...viewport, scale: 0.24 } },
    { ...compare, shared: { ...viewport, ty: 1.01 } },
    { ...compare, locals: [{ ...viewport, tx: -2 }] },
    { ...compare, locals: [viewport] },
    { ...compare, focusedPane: 3 },
    { ...compare, focusedPane: 1.5 },
    { ...compare, focusedPane: -1 },
    { ...compare, offsets: [{ source: pane, dx: -0.26, dy: 0 }] },
    { ...compare, blink: { enabled: true, intervalMs: 100, phase: false } },
    { ...compare, blink: { enabled: true, intervalMs: 2001, phase: false } },
    { ...compare, overlayOpacity: 1.01 },
    { ...compare, sliderPosition: -0.01 },
    { ...compare, panes: [{ ...pane, imageUrl: "https://private.invalid/image" }] },
    { ...compare, token: "not-a-real-token" },
    { ...compare, shared: { ...viewport, imageUrl: "https://private.invalid/image" } },
    { ...compare, locals: [viewport, { ...viewport, imageUrl: "https://private.invalid/image" }] },
    { ...compare, offsets: [{ source: pane, dx: 0, dy: 0, imageUrl: "https://private.invalid/image" }] },
    { ...compare, blink: { ...compare.blink, imageUrl: "https://private.invalid/image" } },
  ])("과다·범위 밖 값·계약 외 이미지 주소와 필드는 거절한다", (value) => {
    expect(productionVoiceCommentaryTrackMetaSchema.safeParse(withCompare(value)).success).toBe(false);
  });
  it("비교 확장을 원고 표면에 붙여 의미를 혼동하지 못하게 한다", () => {
    expect(productionVoiceCommentaryTrackMetaSchema.safeParse(withCompare(compare, "manuscript")).success).toBe(false);
  });
});
