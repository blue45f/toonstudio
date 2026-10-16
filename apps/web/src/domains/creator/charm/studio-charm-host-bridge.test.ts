import { describe, expect, it, vi } from "vitest";

import { resolveStudioVisibleDocumentPlacement } from "../studio-view-controls";
import {
  createStudioCharmContextReader,
  studioCharmLock,
  type StudioCharmClientRect,
  type StudioCharmHostSession,
} from "./studio-charm-host-bridge";

import type { StudioCharmHostCommands } from "./studio-charm-insert";

const COMMANDS: StudioCharmHostCommands = {
  addRenderedImage: vi.fn(() => true),
  addSticker: vi.fn(),
  addBubble: vi.fn(),
  addBuiltinRasterAsset: vi.fn(async () => true as boolean | void),
  addSfxPreset: vi.fn(async () => undefined),
  openStudioObjectInsert: vi.fn(),
};

function rect(left: number, top: number, right: number, bottom: number): StudioCharmClientRect {
  return { left, top, right, bottom };
}

function measurable(value: StudioCharmClientRect) {
  return { current: { getBoundingClientRect: () => value } };
}

function session(overrides: Partial<StudioCharmHostSession> = {}): StudioCharmHostSession {
  return {
    studioToolBeltContentHandlers: COMMANDS,
    selected: null,
    canvasH: 1280,
    canvasFlipH: false,
    canvasRotation: 0,
    snapEnabled: false,
    gridSize: 40,
    effScale: 1,
    ...overrides,
  };
}

describe("참 바 호스트 어댑터: 누르는 순간의 문맥", () => {
  it("문서 크기·선택·스냅 설정을 세션 값 그대로 읽는다", () => {
    const selected = { id: "frame-1", type: "frame", x: 10, y: 20, width: 300, height: 200 };
    const context = createStudioCharmContextReader(720).read(
      session({ selected, snapEnabled: true, gridSize: 24, effScale: 0.5 }),
      1_000,
    );
    expect(context.documentWidth).toBe(720);
    expect(context.documentHeight).toBe(1280);
    expect(context.selection).toBe(selected);
    expect(context.snap).toEqual({ enabled: true, gridSize: 24, viewportScale: 0.5 });
  });

  it("선택이 없으면 null 이고, 보이는 화면을 잴 수 없으면 visible 도 null 이다", () => {
    const context = createStudioCharmContextReader(720).read(session({ selected: undefined }), 0);
    expect(context.selection).toBeNull();
    expect(context.visible).toBeNull();
  });

  it("보이는 화면은 기존 보기 변환(회전·좌우반전 포함)으로 문서 좌표로 바꾼다", () => {
    const host = rect(100, 50, 820, 1330);
    const viewport = rect(0, 0, 900, 700);
    const input = {
      zoomHostRef: measurable(host),
      wrapRef: measurable(viewport),
      canvasFlipH: true,
      canvasRotation: 90 as number,
    };
    const context = createStudioCharmContextReader(720).read(session(input), 0);
    expect(context.visible).toEqual(resolveStudioVisibleDocumentPlacement({
      documentWidth: 720,
      documentHeight: 1280,
      canvasFlipH: true,
      canvasRotation: 90,
      hostRect: host,
      viewportRect: viewport,
    }));
    expect(context.visible?.center).toBeTruthy();
  });

  it("같은 대상에 5초 안에 연달아 읽으면 계단 횟수가 늘고, 읽는 시각은 호출자가 정한다", () => {
    const reader = createStudioCharmContextReader(720);
    const first = reader.read(session(), 10_000);
    expect(first.sequenceFor("viewport:4:8")).toBe(0);
    const second = reader.read(session(), 12_000);
    expect(second.sequenceFor("viewport:4:8")).toBe(1);
    const later = reader.read(session(), 30_000);
    expect(later.sequenceFor("viewport:4:8")).toBe(0);
  });

  it("바 하나가 자기 카운터를 가진다(다른 바와 섞이지 않는다)", () => {
    const left = createStudioCharmContextReader(720);
    const right = createStudioCharmContextReader(720);
    left.read(session(), 0).sequenceFor("k");
    expect(left.read(session(), 1_000).sequenceFor("k")).toBe(1);
    expect(right.read(session(), 1_000).sequenceFor("k")).toBe(0);
  });
});

describe("참 바 호스트 어댑터: 편집 잠금", () => {
  it("잠금이 없으면 null 이다", () => {
    expect(studioCharmLock(session())).toBeNull();
  });

  it("검수 잠금 > 공동 편집 잠금 > 페이지 잠금 순으로 사유를 고른다", () => {
    expect(studioCharmLock(session({
      activeSurfaceReviewLocked: true,
      collaborationDocumentLocked: true,
      pageEditLocked: true,
    }))).toEqual({ kind: "review", message: null });
    expect(studioCharmLock(session({ collaborationDocumentLocked: true, pageEditLocked: true })))
      .toEqual({ kind: "collaboration", message: null });
    expect(studioCharmLock(session({ pageEditLocked: true }))).toEqual({ kind: "page", message: null });
  });

  it("호스트가 이미 가진 공동 편집 잠금 안내 문구는 그대로 전달하고 빈 문구는 버린다", () => {
    expect(studioCharmLock(session({
      collaborationDocumentLocked: true,
      collaborationLockMessage: "다른 작가가 이 회차를 편집 중이에요.",
    }))).toEqual({ kind: "collaboration", message: "다른 작가가 이 회차를 편집 중이에요." });
    expect(studioCharmLock(session({ collaborationDocumentLocked: true, collaborationLockMessage: "" })))
      .toEqual({ kind: "collaboration", message: null });
  });
});
