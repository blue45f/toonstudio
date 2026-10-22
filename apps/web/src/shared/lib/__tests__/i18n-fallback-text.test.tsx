// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
  translateNow,
  useI18n,
  useT,
} from "../i18n-core";

const initial = useI18n.getState();
afterEach(() => { cleanup(); useI18n.setState(initial); });

describe("authored i18n fallback compatibility", () => {
  it("uses explicit fallback only for missing keys and never returns a raw identifier", () => {
    expect(resolveTranslationForDisplay("en", "synthetic.missing-label", [], "Open settings")).toBe("Open settings");
    expect(resolveTranslationForDisplay("en", "synthetic.missing-label", [])).toBe("Missing label");
    expect(resolveTranslationForDisplay("en", "synthetic.missing-label", [], "")).toBe("");
    registerI18nLocaleEntries("en", { "synthetic.authored": "Published label" });
    expect(resolveTranslationForDisplay("en", "synthetic.authored", [], "Old label")).toBe("Published label");
  });

  it("retains translator identity while preserving literal user values during interpolation", () => {
    useI18n.setState({ lang: "en" });
    const { result, rerender } = renderHook(() => useT());
    const translate = result.current;
    expect(translate("synthetic.fallback", "Text {value}")).toBe("Text {value}");
    expect(translate("synthetic.fallback", { value: "{other}", other: "not substituted" }, "Text {value} / {unknown}")).toBe("Text {other} / {unknown}");
    rerender();
    expect(result.current).toBe(translate);
    act(() => useI18n.setState({ translationBundleRevision: useI18n.getState().translationBundleRevision + 1 }));
    expect(result.current).toBe(translate);
    registerI18nLocaleEntries("en", { "synthetic.fallback": "Loaded {value}" });
    expect(translate("synthetic.fallback", { value: "copy" }, "Default")).toBe("Loaded copy");
  });
});

// 효과·콜백 안의 실패 안내처럼 훅을 못 쓰는 곳이 쓰는 번역이다. useT 와 같은 해석기를 호출 시점의 언어로 바로 돌린다.
describe("translateNow resolves with the language at call time", () => {
  it("reads the current language dictionary without a hook and follows a language change on the next call", () => {
    registerI18nLocaleEntries("ko", { "synthetic.now.greeting": "{name} 님, 안녕하세요" });
    registerI18nLocaleEntries("en", { "synthetic.now.greeting": "Hello, {name}" });
    useI18n.setState({ lang: "ko" });
    expect(translateNow("synthetic.now.greeting", { name: "하나" })).toBe("하나 님, 안녕하세요");
    useI18n.setState({ lang: "en" });
    expect(translateNow("synthetic.now.greeting", { name: "하나" })).toBe("Hello, 하나");
  });

  it("uses the fallback text for a missing key and substitutes values once", () => {
    useI18n.setState({ lang: "en" });
    expect(translateNow("synthetic.now.missing", "Could not save.")).toBe("Could not save.");
    expect(translateNow("synthetic.now.missing", { count: 3 }, "{count} left")).toBe("3 left");
    // A value that looks like a placeholder is not substituted a second time.
    expect(translateNow("synthetic.now.missing", { name: "{count}", count: 9 }, "Hi {name}")).toBe("Hi {count}");
  });

  it("never returns a raw key, even with no fallback text", () => {
    useI18n.setState({ lang: "en" });
    expect(translateNow("synthetic.now.some-label")).toBe("Some label");
  });

  it("gives the same result as the hook-based translator", () => {
    registerI18nLocaleEntries("en", { "synthetic.now.same": "Same {value}" });
    useI18n.setState({ lang: "en" });
    const { result } = renderHook(() => useT());
    expect(translateNow("synthetic.now.same", { value: "copy" })).toBe(result.current("synthetic.now.same", { value: "copy" }));
    expect(translateNow("synthetic.now.absent", "Fallback")).toBe(result.current("synthetic.now.absent", "Fallback"));
  });
});
