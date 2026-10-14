import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioAnimTimelinePanel } from "./StudioAnimTimelinePanel";
import source from "./StudioAnimTimelinePanel.tsx?raw";

import type { StudioAnimKeyframe } from "./studio-anim-tracks";

const onionSkin = {
  enabled: true,
  prevCount: 1,
  nextCount: 1,
  opacity: 0.35,
  tint: true,
} as const;

function renderTimeline(
  frameCount: number,
  options: { locked?: boolean; playhead?: number; playing?: boolean; track?: StudioAnimKeyframe[] } = {}
): string {
  const track = options.track ?? [];
  return renderToStaticMarkup(
    <StudioAnimTimelinePanel
      doc={{ fps: 12, frameCount, tracks: track.length > 0 ? { "locked-image": track } : {} }}
      rows={[{
        id: "locked-image",
        label: options.locked === false ? "이미지" : "잠긴 이미지",
        eligible: true,
        hidden: false,
        locked: options.locked ?? true,
      }]}
      playhead={options.playhead ?? 0}
      playing={options.playing ?? false}
      focusedTrackId="locked-image"
      onionSkin={onionSkin}
      onClose={vi.fn()}
      onDocChange={vi.fn()}
      onScrub={vi.fn()}
      onTogglePlay={vi.fn()}
      onFocusTrack={vi.fn()}
      onAddKeyframe={vi.fn()}
      onRemoveKeyframe={vi.fn()}
      onMoveKeyframe={vi.fn()}
      onRemoveTrack={vi.fn()}
      onOnionSkinChange={vi.fn()}
    />
  );
}

describe("StudioAnimTimelinePanel motion coach", () => {
  it("coaches playback, keyframe capture, and the complete onion-skin control group", () => {
    const html = renderTimeline(1);

    expect(html.match(/data-studio-tool-hint-target="true"/g)?.length ?? 0).toBe(7);
    expect(html).toContain('aria-label="타임라인 재생"');
    expect(html).toContain('aria-label="현재 위치에 키프레임 추가"');
    expect(html).toContain('aria-disabled="true"');
    expect(source).toContain('id: "timeline-playback"');
    expect(source).toContain('id: "timeline-keyframe-add"');
    expect(source).toContain('id: "timeline-onion-skin"');
    expect(source).toContain('preview: "timeline"');
    expect(source).toContain('previewVariant: "play"');
    expect(source).toContain('previewVariant: "pause"');
    expect(source).toContain('preview: "keyframe"');
    expect(source).toContain('preview: "onion-skin"');
    expect(source).not.toContain('title="현재 재생헤드 위치에 이 레이어의 키프레임을 캡처합니다."');
  });

  it("describes the next playback action when the timeline is already running", () => {
    const html = renderTimeline(2, { playing: true });

    expect(html).toContain("lucide-pause");
    expect(html).toContain(">정지</button>");
    expect(source).toContain('title: "타임라인 정지"');
    expect(source).toContain("공유 재생헤드를 현재 프레임에 멈춰");
  });

  it("keeps rich coach targets constant instead of wrapping every generated grid cell", () => {
    const oneFrame = renderTimeline(1);
    const fourFrames = renderTimeline(4);
    const countTargets = (html: string) => html.match(/data-studio-tool-hint-target="true"/g)?.length ?? 0;

    expect(countTargets(oneFrame)).toBe(7);
    expect(countTargets(fourFrames)).toBe(7);
  });

  it("keeps exact disabled reasons next to their stable action identities", () => {
    expect(source).toContain("재생하려면 타임라인이 2프레임 이상이어야 해요.");
    expect(source).toContain("레이어 잠금을 풀면 키프레임을 추가할 수 있어요.");
    expect(source).toContain("이미지 레이어이면서 단일 셀 프레임 애니메이션을 사용하지 않는 레이어에서만 키프레임을 만들 수 있어요.");
    expect(source).toContain("unavailableReason={addKeyframeDisabledReason}");
  });

  it("allows replacing the current keyframe when the track is already at capacity", () => {
    const fullTrack: StudioAnimKeyframe[] = Array.from({ length: 60 }, (_, frameIndex) => ({
      frameIndex,
      frame: { id: `frame-${frameIndex}`, src: "data:image/png;base64,AA==" },
    }));
    const html = renderTimeline(60, { locked: false, playhead: 0, track: fullTrack });

    expect(html).toContain("현재 프레임(1) 키프레임 갱신");
    expect(html).not.toContain('data-studio-tool-hint-unavailable="true"');
    expect(source).toContain("!replacingKeyframe && !canAddKeyframe(doc, focusedRow.id)");
  });

  it("keeps wrapped onion-skin rows stretched to the inspector width", () => {
    expect(source.match(/className="w-full \[&>\*\]:w-full"/g)?.length ?? 0).toBe(4);
  });

  it("wires extended ease options and clip rename without StudioPage glue", () => {
    expect(source).toContain("setKeyframeEase");
    expect(source).toContain("renameTimelineClip");
    expect(source).toContain('data-testid="timeline-keyframe-ease"');
    expect(source).toContain('data-testid="timeline-clip-add"');
    expect(source).toContain('value: "ease-in"');
    expect(source).toContain('value: "ease-out"');

    const html = renderTimeline(4, {
      locked: false,
      playhead: 0,
      track: [{ frameIndex: 0, frame: { id: "f0", src: "data:x" }, ease: "ease-out" }],
    });
    expect(html).toContain('data-testid="timeline-keyframe-ease"');
    expect(html).toContain("가속 (ease-in)");
    expect(html).toContain("클립 추가");
  });

  it("derives a timesheet (노출표) surface with print/SVG/text export wiring", () => {
    expect(source).toContain("deriveStudioAnimTimesheet");
    expect(source).toContain('data-testid="timeline-timesheet"');
    expect(source).toContain('data-testid="timeline-timesheet-print"');
    expect(source).toContain('data-testid="timeline-timesheet-svg"');
    expect(source).toContain('data-testid="timeline-timesheet-text"');
    expect(source).toContain("renderStudioAnimTimesheetSvg");
    expect(source).toContain("renderStudioAnimTimesheetText");
    expect(source).toContain("renderStudioAnimTimesheetPrintHtml");

    // 키프레임 1장(프레임 1)이 6프레임 전체에 노출 → 시트에 "셀 1 · 1–6f · 6프레임" 행이 도출된다.
    const html = renderTimeline(6, {
      locked: false,
      track: [{ frameIndex: 0, frame: { id: "f0", src: "data:x" } }],
    });
    expect(html).toContain('data-testid="timeline-timesheet"');
    expect(html).toContain("타임시트(노출표)");
    expect(html).toContain("셀 1");
    expect(html).toContain("1–6f");
    expect(html).toContain("6프레임");
    expect(html).toContain("인쇄·PDF");
    expect(html).toContain("이미지(SVG) 저장");
  });

  it("pins the mobile timeline to the viewport while preserving desktop canvas placement", () => {
    expect(source).toContain('className="fixed inset-x-2 top-16 z-40');
    expect(source).toContain("max-h-[calc(100svh-5rem)]");
    expect(source).toContain("sm:absolute sm:inset-x-auto sm:right-3 sm:top-3");
    expect(source).toContain("sm:w-[min(46rem,calc(100%-1.5rem))]");
    expect(source).not.toContain('className="absolute right-3 top-3 z-40');
  });
});

describe("StudioAnimTimelinePanel clip exposure editing", () => {
  it("wires clip start/duration editing to the pure model ops (drag bar + numeric inputs)", () => {
    expect(source).toContain("moveTimelineClip");
    expect(source).toContain("setTimelineClipDuration");
    expect(source).toContain("setTimelineClipStart");
    expect(source).toContain("activeClipExposureFrameIndices");
    expect(source).toContain('data-testid={`timeline-clip-start-${clip.id}`}');
    expect(source).toContain('data-testid={`timeline-clip-duration-${clip.id}`}');
    expect(source).toContain('data-testid={`timeline-clip-bar-${clip.id}`}');
    expect(source).toContain('data-clip-bar-track="true"');
  });

  it("renders start/duration inputs and the exposure bar for an existing clip", () => {
    const html = renderToStaticMarkup(
      <StudioAnimTimelinePanel
        doc={{
          fps: 12,
          frameCount: 24,
          tracks: {},
          clips: [{ id: "clip-a", name: "도입", startFrame: 2, endFrame: 7 }],
          activeClipId: "clip-a",
        }}
        rows={[]}
        playhead={0}
        playing={false}
        focusedTrackId={null}
        onionSkin={onionSkin}
        onClose={vi.fn()}
        onDocChange={vi.fn()}
        onScrub={vi.fn()}
        onTogglePlay={vi.fn()}
        onFocusTrack={vi.fn()}
        onAddKeyframe={vi.fn()}
        onRemoveKeyframe={vi.fn()}
        onMoveKeyframe={vi.fn()}
        onRemoveTrack={vi.fn()}
        onOnionSkinChange={vi.fn()}
      />
    );
    expect(html).toContain('data-testid="timeline-clip-start-clip-a"');
    expect(html).toContain('data-testid="timeline-clip-duration-clip-a"');
    expect(html).toContain('data-testid="timeline-clip-bar-clip-a"');
    // 시작 3(1-based)·길이 6 — 활성 노출 안내도 6프레임으로 일치한다.
    expect(html).toContain("활성 노출 6프레임");
  });
});
