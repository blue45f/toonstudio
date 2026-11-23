// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  DICT,
  getI18nRuntimeTranslationSources,
  useI18n,
} from "@/shared/lib/i18n-core";
import * as runtimeTranslations from "@/shared/lib/i18n-runtime-translation";

import { productionHubI18nBuiltins } from "./production-hub-i18n-builtins";

const initialState = useI18n.getState();
const namespaceKeys = (dictionary: Readonly<Record<string, string>>) =>
  Object.keys(dictionary).filter((key) => key.startsWith("productionHub.")).sort();

afterEach(() => {
  cleanup();
  useI18n.setState(initialState);
  vi.restoreAllMocks();
});

it("첫 렌더 전에 ko/en 전체 값과 영어 원문을 등록하고 재진입에도 유지한다", async () => {
  const keys = Object.keys(productionHubI18nBuiltins.en).sort();
  expect(keys).toHaveLength(238);
  expect(namespaceKeys(DICT.ko)).toEqual([]);
  expect(namespaceKeys(DICT.en)).toEqual([]);
  expect(
    getI18nRuntimeTranslationSources().filter(({ key }) => key.startsWith("productionHub.")),
  ).toEqual([]);

  // 비동기 번역 자산이 도착하지 않아도 소비 모듈의 첫 렌더는 완전한 사전을 사용해야 한다.
  const load = vi.spyOn(runtimeTranslations, "loadRuntimeTranslationBundle")
    .mockResolvedValue(undefined);
  const { CollabNotificationInbox } = await import("./CollabNotificationInbox");

  for (const locale of ["ko", "en"] as const) {
    expect(namespaceKeys(DICT[locale])).toEqual(keys);
    for (const [key, value] of Object.entries(productionHubI18nBuiltins[locale])) {
      expect(DICT[locale][key], `${locale}:${key}`).toBe(value);
    }
  }
  const expectedSources = keys.map((key) => ({ key, locale: "en" }));
  const productionSources = () => getI18nRuntimeTranslationSources()
    .filter(({ key }) => key.startsWith("productionHub."))
    .sort((left, right) => left.key.localeCompare(right.key, "en"));
  expect(productionSources()).toEqual(
    [...expectedSources].sort((left, right) => left.key.localeCompare(right.key, "en")),
  );
  expect(load).not.toHaveBeenCalled();

  useI18n.setState({ lang: "ko" });
  const firstVisit = render(<CollabNotificationInbox items={[]} />);
  const emptyKey = "productionHub.status.inboxEmptyAll";
  expect(screen.getByText(productionHubI18nBuiltins.ko[emptyKey])).toBeTruthy();
  firstVisit.unmount();

  useI18n.setState({ lang: "en" });
  const revisited = await import("./CollabNotificationInbox");
  render(<revisited.CollabNotificationInbox items={[]} />);
  expect(screen.getByText(productionHubI18nBuiltins.en[emptyKey])).toBeTruthy();
  expect(screen.queryByText(productionHubI18nBuiltins.ko[emptyKey])).toBeNull();
  expect(productionSources()).toHaveLength(keys.length);
  for (const locale of ["ko", "en"] as const) {
    for (const [key, value] of Object.entries(productionHubI18nBuiltins[locale])) {
      expect(DICT[locale][key], `${locale}:${key}`).toBe(value);
    }
  }
});
