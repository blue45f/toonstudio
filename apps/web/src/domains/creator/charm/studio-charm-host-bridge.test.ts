import { describe, expect, it, vi } from "vitest";

import { resolveStudioVisibleDocumentPlacement } from "../studio-view-controls";
import {
  createStudioCharmContextReader,
  studioCharmLock,
  type StudioCharmClientRect,
  type StudioCharmHostSession,
} from "./studio-charm-host-bridge";

import { deriveHostLockFields, type HostLockInputs } from "./studio-charm-fake-host.test-fixture";

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

  it("연달아 붙일 때 호스트가 자동으로 고른 새 요소 대신 직전 붙이기의 컷을 이어 받아 같은 대상 키로 센다", () => {
    const reader = createStudioCharmContextReader(720);
    const frame = { id: "frame-1", type: "frame", x: 100, y: 200, width: 400, height: 300 };
    const stamped = { id: "new-1", type: "image", x: 162, y: 212, width: 276, height: 276 };
    const first = reader.read(session({ selected: frame, elements: [{ id: "frame-1" }] }), 1_000);
    expect(first.selection).toBe(frame);
    expect(first.sequenceFor("selected-frame:frame-1")).toBe(0);
    // 호스트가 방금 붙인 요소를 선택했다: 세션의 선택은 새 요소지만 컷을 이어 받는다.
    const second = reader.read(session({ selected: stamped, elements: [{ id: "frame-1" }, { id: "new-1" }] }), 2_000);
    expect(second.selection).toBe(frame);
    expect(second.sequenceFor("selected-frame:frame-1")).toBe(1);
  });

  it("사용자가 문서에 원래 있던 요소를 직접 고르면 이어 받지 않는다", () => {
    const reader = createStudioCharmContextReader(720);
    const frame = { id: "frame-1", type: "frame", x: 100, y: 200, width: 400, height: 300 };
    const photo = { id: "img-1", type: "image", x: 50, y: 60, width: 200, height: 100 };
    const elements = [{ id: "frame-1" }, { id: "img-1" }];
    reader.read(session({ selected: frame, elements }), 1_000);
    expect(reader.read(session({ selected: photo, elements }), 2_000).selection).toBe(photo);
  });

  it("바 하나가 자기 카운터를 가진다(다른 바와 섞이지 않는다)", () => {
    const left = createStudioCharmContextReader(720);
    const right = createStudioCharmContextReader(720);
    left.read(session(), 0).sequenceFor("k");
    expect(left.read(session(), 1_000).sequenceFor("k")).toBe(1);
    expect(right.read(session(), 1_000).sequenceFor("k")).toBe(0);
  });
});

describe("참 바 호스트 어댑터: 편집 잠금(호스트가 파생한 값으로)", () => {
  const locked = (input: HostLockInputs) => studioCharmLock(session(deriveHostLockFields(input)));

  it("잠금이 없으면 null 이다", () => {
    expect(studioCharmLock(session())).toBeNull();
    expect(locked({})).toBeNull();
  });

  it("공동 편집 잠금은 검수 잠금이 아니라 공동 편집 잠금으로 안내하고 호스트가 만든 문장을 그대로 쓴다", () => {
    // 호스트는 공동 편집 잠금일 때 activeSurfaceReviewLocked 도 함께 켠다. 그래서 검수 쪽을 먼저 보면 사유가 뒤바뀐다.
    const result = locked({ collaborationDocumentLocked: true, collaborationMessage: "다른 작가가 이 회차를 편집 중이에요." });
    expect(result).toEqual({ kind: "collaboration", message: "다른 작가가 이 회차를 편집 중이에요." });
    expect(locked({ collaborationDocumentLocked: true, pageEditLocked: true })?.kind).toBe("collaboration");
  });

  it("공동 편집 안내 문장은 함수를 부른 결과이고, 빈 문장이면 화면의 기본 문구를 쓰게 비워 둔다", () => {
    const result = locked({ collaborationDocumentLocked: true, collaborationMessage: "잠시 후 다시 시도해 주세요." });
    expect(typeof result?.message).toBe("string");
    expect(result?.message).not.toContain("=>");
    expect(locked({ collaborationDocumentLocked: true, collaborationMessage: "  " })).toEqual({ kind: "collaboration", message: null });
    // 함수가 아닌 값이 들어와도(타입 밖) 함수 원문이나 객체를 사용자에게 보이지 않는다.
    const odd = studioCharmLock(session({
      collaborationDocumentLocked: true,
      activeSurfaceReviewLocked: true,
      collaborationLockMessage: undefined,
    }));
    expect(odd).toEqual({ kind: "collaboration", message: null });
  });

  it("페이지 검토 잠금은 막지만, 문서 마스터를 편집하는 동안에는 호스트가 허용하므로 막지 않는다", () => {
    expect(locked({ pageEditLocked: true })).toEqual({ kind: "page", message: null });
    expect(locked({ pageEditLocked: true, masterEditMode: true })).toBeNull();
    // 마스터 편집 중에도 공동 편집 잠금은 그대로 막는다.
    expect(locked({ pageEditLocked: true, masterEditMode: true, collaborationDocumentLocked: true })?.kind).toBe("collaboration");
  });

  it("검수 잠금만 켜진 세션은 검수 잠금으로 안내한다", () => {
    expect(studioCharmLock(session({ activeSurfaceReviewLocked: true }))).toEqual({ kind: "review", message: null });
  });

  it("호스트가 만들 수 있는 모든 잠금 조합이 호스트의 편집 가능 여부와 같다", () => {
    for (const collaborationDocumentLocked of [false, true]) {
      for (const pageEditLocked of [false, true]) {
        for (const masterEditMode of [false, true]) {
          const hostBlocks = collaborationDocumentLocked || (pageEditLocked && !masterEditMode);
          const result = locked({ collaborationDocumentLocked, pageEditLocked, masterEditMode });
          expect(result !== null, `collab=${collaborationDocumentLocked} page=${pageEditLocked} master=${masterEditMode}`).toBe(hostBlocks);
        }
      }
    }
  });
});
