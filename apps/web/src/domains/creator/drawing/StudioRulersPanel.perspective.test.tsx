// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n-core";

import {
  StudioRulersPanel,
  type StudioPerspectiveGuideState,
  type StudioRulersPanelProps,
} from "./StudioRulersPanel";

afterEach(cleanup);

function fixLocale(lang: string): string {
  const prev = useI18n.getState().lang;
  useI18n.setState({ lang });
  return prev;
}

function props(
  overrides: Partial<StudioRulersPanelProps> = {},
): StudioRulersPanelProps {
  return {
    onRulersChange: vi.fn(),
    onSymmetryChange: vi.fn(),
    onPerspectiveGuideChange: vi.fn(),
    ...overrides,
  };
}

function lastGuideState(
  onPerspectiveGuideChange: ReturnType<typeof vi.fn>,
): StudioPerspectiveGuideState {
  return onPerspectiveGuideChange.mock.calls.at(-1)![0];
}

describe("StudioRulersPanel 원근 가이드 본 배선", () => {
  it("기본(꺼짐)에서는 격자 미리보기가 없고 콜백도 나가지 않는다", () => {
    const prev = fixLocale("ko");
    try {
      const onPerspectiveGuideChange = vi.fn();
      const { container } = render(
        <StudioRulersPanel {...props({ onPerspectiveGuideChange })} />,
      );
      // 기존 자 종류 프리뷰 4개만 존재 — 기존 테스트의 개수 단언과 정합
      expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(4);
      expect(screen.queryByText("1점 투시")).toBeNull();
      expect(onPerspectiveGuideChange).not.toHaveBeenCalled();
      const toggle = screen.getByLabelText("원근 가이드 켜기");
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
    } finally {
      fixLocale(prev);
    }
  });

  it("켜면 2점 투시 격자 세그먼트가 콜백으로 나가고 미리보기가 보인다", () => {
    const prev = fixLocale("ko");
    try {
      const onPerspectiveGuideChange = vi.fn();
      render(<StudioRulersPanel {...props({ onPerspectiveGuideChange })} />);
      fireEvent.click(screen.getByLabelText("원근 가이드 켜기"));

      expect(onPerspectiveGuideChange).toHaveBeenCalledTimes(1);
      const state = lastGuideState(onPerspectiveGuideChange);
      expect(state.enabled).toBe(true);
      expect(state.snapEnabled).toBe(true);
      expect(state.guide.kind).toBe("two-point");
      expect(state.segments.length).toBeGreaterThan(0);
      for (const segment of state.segments) {
        for (const point of [segment.from, segment.to]) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(320);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(240);
        }
      }
      expect(
        screen.getByLabelText("원근 가이드 격자 미리보기"),
      ).toBeTruthy();
    } finally {
      fixLocale(prev);
    }
  });

  it("1점 투시로 바꾸면 소실점 하나짜리 가이드가 나간다", () => {
    const prev = fixLocale("ko");
    try {
      const onPerspectiveGuideChange = vi.fn();
      render(<StudioRulersPanel {...props({ onPerspectiveGuideChange })} />);
      fireEvent.click(screen.getByLabelText("원근 가이드 켜기"));
      fireEvent.click(screen.getByText("1점 투시"));

      const state = lastGuideState(onPerspectiveGuideChange);
      expect(state.guide.kind).toBe("one-point");
      expect(state.guide.left).toEqual({ x: 160, y: 120 });
      expect(state.guide.right).toBeUndefined();
      expect(state.segments.length).toBeGreaterThan(0);
    } finally {
      fixLocale(prev);
    }
  });

  it("3점 투시는 수직 소실점을 포함하고, 스냅 토글이 snapEnabled를 뒤집는다", () => {
    const prev = fixLocale("ko");
    try {
      const onPerspectiveGuideChange = vi.fn();
      render(<StudioRulersPanel {...props({ onPerspectiveGuideChange })} />);
      fireEvent.click(screen.getByLabelText("원근 가이드 켜기"));
      fireEvent.click(screen.getByText("3점 투시"));
      expect(lastGuideState(onPerspectiveGuideChange).guide.vertical).toEqual(
        { x: 160, y: -288 },
      );

      fireEvent.click(screen.getByLabelText("원근 스냅 끄기"));
      const state = lastGuideState(onPerspectiveGuideChange);
      expect(state.enabled).toBe(true);
      expect(state.snapEnabled).toBe(false);
      // 스냅만 꺼도 격자(segments)는 그대로 표시된다
      expect(state.segments.length).toBeGreaterThan(0);
    } finally {
      fixLocale(prev);
    }
  });

  it("끄면 segments가 비어 호스트가 기존 동작으로 돌아간다", () => {
    const prev = fixLocale("ko");
    try {
      const onPerspectiveGuideChange = vi.fn();
      render(<StudioRulersPanel {...props({ onPerspectiveGuideChange })} />);
      fireEvent.click(screen.getByLabelText("원근 가이드 켜기"));
      fireEvent.click(screen.getByLabelText("원근 가이드 끄기"));

      const state = lastGuideState(onPerspectiveGuideChange);
      expect(state.enabled).toBe(false);
      expect(state.segments).toEqual([]);
      expect(screen.queryByText("1점 투시")).toBeNull();
    } finally {
      fixLocale(prev);
    }
  });

  it("초기 켜짐 prop을 주면 처음부터 격자가 보인다", () => {
    const prev = fixLocale("ko");
    try {
      render(
        <StudioRulersPanel
          {...props({
            initialPerspectiveGuideEnabled: true,
            initialPerspectiveKind: "one-point",
          })}
        />,
      );
      expect(screen.getByLabelText("원근 가이드 격자 미리보기")).toBeTruthy();
      const onePoint = screen.getByText("1점 투시").closest("button")!;
      expect(onePoint.getAttribute("aria-pressed")).toBe("true");
    } finally {
      fixLocale(prev);
    }
  });
});
