import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NEXTGEN_CAPABILITY_IDS,
  detectNextgenCapabilities,
  isNextgenCapabilitySupported,
  type NextgenCapabilityId,
} from "./nextgen-web-capabilities";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectNextgenCapabilities", () => {
  it("등록된 후보를 전부 포함하고, jsdom 기본 환경에서는 실험 API들을 미지원으로 판정한다", () => {
    const map = detectNextgenCapabilities();
    expect(Object.keys(map).sort()).toEqual([...NEXTGEN_CAPABILITY_IDS].sort());
    // jsdom이 자체 구현할 수 있는 popover·moveBefore는 제외하고, 나머지는 전부 미지원이어야 한다.
    const expectedUnsupported: readonly NextgenCapabilityId[] = [
      "compute-pressure",
      "idle-detection",
      "screen-wake-lock",
      "eye-dropper",
      "view-transitions",
      "speculation-rules",
      "scroll-driven-animations",
      "webnn",
      "webxr",
      "temporal",
      "window-management",
      "web-midi",
      "built-in-ai",
      "navigation-api",
      "long-animation-frames",
      "file-system-observer",
      "webmcp",
      "document-pip",
      "storage-buckets",
      "digital-credentials",
      "anchor-positioning",
      "field-sizing",
      "scroll-state-queries",
      "handwriting-recognition",
      "virtual-keyboard",
    ];
    for (const id of expectedUnsupported) {
      expect(map[id]).toBe(false);
    }
    expect(typeof map["popover-api"]).toBe("boolean");
    expect(typeof map["move-before"]).toBe("boolean");
  });

  it("내장 AI·Navigation API 전역이 나타나면 지원으로 뒤집힌다", () => {
    vi.stubGlobal("LanguageModel", { availability: async () => "available" });
    vi.stubGlobal("navigation", { addEventListener: () => undefined });
    const map = detectNextgenCapabilities();
    expect(map["built-in-ai"]).toBe(true);
    expect(map["navigation-api"]).toBe(true);
  });

  it("구형 window.ai 이름공간도 내장 AI로 감지한다", () => {
    vi.stubGlobal("ai", { languageModel: {} });
    expect(isNextgenCapabilitySupported("built-in-ai")).toBe(true);
  });

  it("전역 생성자가 나타나면 해당 능력만 지원으로 뒤집힌다", () => {
    vi.stubGlobal("PressureObserver", class FakePressureObserver {});
    vi.stubGlobal("IdleDetector", class FakeIdleDetector {});
    vi.stubGlobal("Temporal", { Now: {} });
    const map = detectNextgenCapabilities();
    expect(map["compute-pressure"]).toBe(true);
    expect(map["idle-detection"]).toBe(true);
    expect(map["temporal"]).toBe(true);
    expect(map["webnn"]).toBe(false);
  });

  it("navigator 기반 API를 감지한다", () => {
    vi.stubGlobal("navigator", {
      wakeLock: { request: async () => ({ released: false, release: async () => undefined }) },
      ml: {},
      xr: {},
      requestMIDIAccess: async () => ({}),
      virtualKeyboard: { overlaysContent: false },
      createHandwritingRecognizer: async () => ({}),
    });
    const map = detectNextgenCapabilities();
    expect(map["screen-wake-lock"]).toBe(true);
    expect(map["webnn"]).toBe(true);
    expect(map["webxr"]).toBe(true);
    expect(map["web-midi"]).toBe(true);
    expect(map["virtual-keyboard"]).toBe(true);
    expect(map["handwriting-recognition"]).toBe(true);
  });

  it("wakeLock이 있어도 request가 없으면 미지원이다", () => {
    vi.stubGlobal("navigator", { wakeLock: {} });
    expect(isNextgenCapabilitySupported("screen-wake-lock")).toBe(false);
  });

  it("감지는 어떤 환경에서도 던지지 않는다", () => {
    vi.stubGlobal("navigator", undefined);
    expect(() => detectNextgenCapabilities()).not.toThrow();
  });
});
