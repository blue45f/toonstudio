// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useTensionMapDraft } from "./use-tension-map-draft";

afterEach(() => {
  cleanup();
});

describe("useTensionMapDraft", () => {
  it("starts with no chosen source and an empty script, so the tab can pick the source from the manuscript", () => {
    const { result } = renderHook(() => useTensionMapDraft());
    expect(result.current.kind).toBeNull();
    expect(result.current.script).toBe("");
  });

  it("keeps what the artist chose and typed, and exposes it through the change callbacks", () => {
    const { result } = renderHook(() => useTensionMapDraft());
    act(() => {
      result.current.onKindChange("script");
      result.current.onScriptChange("한 줄이 한 컷");
    });
    expect(result.current.kind).toBe("script");
    expect(result.current.script).toBe("한 줄이 한 컷");
    act(() => {
      result.current.onKindChange("document");
    });
    expect(result.current.kind).toBe("document");
    expect(result.current.script).toBe("한 줄이 한 컷");
  });

  it("keeps the callbacks and the whole draft stable between renders that change nothing", () => {
    const { result, rerender } = renderHook(() => useTensionMapDraft());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(result.current.onScriptChange).toBe(first.onScriptChange);
    expect(result.current.onKindChange).toBe(first.onKindChange);
  });
});
