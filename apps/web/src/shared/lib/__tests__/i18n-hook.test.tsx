// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  registerAppI18nLocaleDictionary,
  triggerTranslationBundleUpdate,
  useI18n,
  useT,
} from "@/shared/lib/i18n";

const initialI18nState = useI18n.getState();

beforeEach(() => {
  useI18n.setState({ lang: "ko", translationBundleRevision: 0 });
});

afterEach(() => {
  useI18n.setState({
    lang: initialI18nState.lang,
    translationBundleRevision: initialI18nState.translationBundleRevision,
  });
});

describe("useT", () => {
  it("keeps its resolver stable for the same locale while observing bundle revisions", () => {
    const { result, rerender } = renderHook(() => useT());
    const initialResolver = result.current;

    rerender();
    expect(result.current).toBe(initialResolver);

    act(() => {
      useI18n.setState((state) => ({
        translationBundleRevision: state.translationBundleRevision + 1,
      }));
    });

    expect(result.current).toBe(initialResolver);
    expect(result.current("common.close")).toBe("닫기");
  });

  it("switches to a locale-specific stable resolver when the language changes", () => {
    const { result, rerender } = renderHook(() => useT());
    const koreanResolver = result.current;

    act(() => {
      useI18n.setState({ lang: "en" });
    });

    const englishResolver = result.current;
    expect(englishResolver).not.toBe(koreanResolver);
    expect(englishResolver("common.close")).toBe("Close");

    rerender();
    expect(result.current).toBe(englishResolver);
  });

  it("refreshes labels memoized on the translator once the current locale's dictionary arrives after the first render", () => {
    // React Compiler가 하는 것처럼 번역 결과를 번역기 참조에만 묶어 기억하는 컴포넌트.
    act(() => {
      useI18n.setState({ lang: "de" });
    });
    const { result } = renderHook(() => {
      const t = useT();
      const label = useMemo(() => t("test.lateDictionary.signIn"), [t]);
      return { t, label };
    });
    const firstResolver = result.current.t;
    expect(result.current.label).not.toBe("Anmelden");

    // 기계 번역 묶음 같은 일반 갱신은 번역기 참조를 바꾸지 않는다(번역기를 의존성으로 쓰는 effect를 다시 돌리지 않는다).
    act(() => {
      triggerTranslationBundleUpdate();
    });
    expect(result.current.t).toBe(firstResolver);

    // 화면을 그린 뒤 de 사전이 도착하면 번역기 참조가 한 번 바뀌어 기억한 문구를 새 사전으로 다시 계산한다.
    act(() => {
      registerAppI18nLocaleDictionary("de", { "test.lateDictionary.signIn": "Anmelden" });
      triggerTranslationBundleUpdate();
    });
    expect(result.current.t).not.toBe(firstResolver);
    expect(result.current.label).toBe("Anmelden");

    // 같은 사전을 다시 등록하거나 일반 갱신만 있으면 참조는 그대로다.
    const refreshedResolver = result.current.t;
    act(() => {
      registerAppI18nLocaleDictionary("de", { "test.lateDictionary.signIn": "Anmelden" });
      triggerTranslationBundleUpdate();
    });
    expect(result.current.t).toBe(refreshedResolver);
  });

  it("does not change the translator of other locales when a dictionary for one locale arrives", () => {
    const { result } = renderHook(() => useT());
    const koreanResolver = result.current;
    act(() => {
      registerAppI18nLocaleDictionary("fr", { "test.lateDictionary.otherLocale": "Se connecter" });
      triggerTranslationBundleUpdate();
    });
    expect(result.current).toBe(koreanResolver);
  });
});
