import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  adminI18nAssetUrl,
  loadAdminI18nLocale,
} from "./admin-i18n-loader";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";
import { resolveI18nValue, useI18n } from "@/shared/lib/i18n";
import { ADMIN_I18N_NAMESPACES } from "@/shared/lib/i18n-asset-manifest";

afterEach(() => {
  vi.restoreAllMocks();
});

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`./${relativePath}`, import.meta.url), "utf-8");
}

function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  const pattern = /registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
      entries[entry[1] ?? ""] = (entry[2] ?? "").replace(/\\"/g, '"');
    }
    blocks[match[1] ?? ""] = entries;
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

const MODULE_FILE = "admin-i18n-loader.ts";
const PREFIXES = ["adminRest.status.", "admin.ciQuality."] as const;
const STATUS_CONSUMERS = [
  "components/AdminIntegrations.tsx",
  "traffic/WebVitalsDashboardPage.tsx",
] as const;
const CONSUMERS = [...STATUS_CONSUMERS, "components/AdminOps.tsx"] as const;
const MIGRATED_FILES = STATUS_CONSUMERS;

const blocks = parseRegisterModule(readSource(MODULE_FILE));
const ALL_KEYS = Object.keys(blocks.ko).sort();

describe("admin lazy i18n loader", () => {
  it("keeps en-US and ko-KR on the embedded base-root dictionaries", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("base admin locale must not fetch"));

    await loadAdminI18nLocale("en-US", "/preview/");
    await loadAdminI18nLocale("ko-KR", "/preview/");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resolveI18nValue("en-US", "admin.title")).toBe("Admin Console");
    expect(resolveI18nValue("ko-KR", "admin.title")).toBe("관리자 콘솔");
  });

  it("normalizes a region locale to its available root asset and publishes it", async () => {
    const beforeRevision = useI18n.getState().translationBundleRevision;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ "admin.title": "Console français" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await loadAdminI18nLocale("fr-CA", "/preview");

    expect(fetchSpy).toHaveBeenCalledTimes(ADMIN_I18N_NAMESPACES.length);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/preview/i18n/admin/dashboard/fr.json",
      {
        cache: "force-cache",
        credentials: "same-origin",
      },
    );
    expect(resolveI18nValue("fr-CA", "admin.title")).toBe("Console français");
    expect(useI18n.getState().translationBundleRevision).toBe(beforeRevision + 1);
  });

  it("deduplicates concurrent requests for the same locale", async () => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(response);

    const first = loadAdminI18nLocale("de-DE", "/preview");
    const second = loadAdminI18nLocale("de-AT", "/preview");

    expect(fetchSpy).toHaveBeenCalledTimes(ADMIN_I18N_NAMESPACES.length);

    resolveResponse(
      new Response(JSON.stringify({ "admin.title": "Admin-Konsole" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await Promise.all([first, second]);

    expect(fetchSpy).toHaveBeenCalledTimes(ADMIN_I18N_NAMESPACES.length);
    expect(resolveI18nValue("de-DE", "admin.title")).toBe("Admin-Konsole");
    expect(resolveI18nValue("de-AT", "admin.title")).toBe("Admin-Konsole");
  });

  it("starts a fresh request after a transient fetch rejection", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("temporary network failure"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ "admin.title": "Consola de administración" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(
      loadAdminI18nLocale("es-MX", "/preview"),
    ).resolves.toBeUndefined();
    await expect(
      loadAdminI18nLocale("es-MX", "/preview"),
    ).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledTimes(ADMIN_I18N_NAMESPACES.length);
    expect(resolveI18nValue("es-MX", "admin.title")).toBe(
      "Consola de administración",
    );
  });

  it("권한 없음 게이트 문구에 내부 구성 힌트를 노출하지 않는다", () => {
    const body = resolveI18nValue("ko-KR", "admin.gate.forbiddenBody");
    expect(body).toBe(
      "이 계정에는 관리자 권한이 없습니다. 권한이 필요하면 운영자에게 문의하세요.",
    );
    expect(body).not.toMatch(/ADMIN_EMAILS|users\.role/);
  });

  it("constructs an asset URL without duplicating separators", () => {
    expect(adminI18nAssetUrl("zh-hant", "/preview")).toBe(
      "/preview/i18n/admin/dashboard/zh-hant.json",
    );
  });
});

describe("admin rest status i18n r3c14", () => {
  it("등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    expect(Object.keys(blocks.en).sort()).toEqual(ALL_KEYS);
    for (const key of ALL_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });

  it("플레이스홀더가 ko/en에서 정확히 일치한다", () => {
    for (const key of ALL_KEYS) {
      const koPh = [...(blocks.ko[key] ?? "").matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
      const enPh = [...(blocks.en[key] ?? "").matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
      expect(enPh, `placeholder mismatch: ${key}`).toEqual(koPh);
    }
  });

  it("전 키가 소비 파일에서 참조되고 미등록 참조가 없다", () => {
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of ALL_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const prefixes = PREFIXES.map((prefix) => prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const referenced = new Set(
      [...consumerSource.matchAll(new RegExp(`"((?:${prefixes})[A-Za-z0-9.]+)"`, "g"))].map((m) => m[1] ?? ""),
    );
    for (const key of referenced) {
      expect(ALL_KEYS.includes(key), `dangling key reference: ${key}`).toBe(true);
    }
  });

  it("이관 파일에 탐지기 위반이 없다", () => {
    for (const file of MIGRATED_FILES) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations, `${file}: ${JSON.stringify(violations)}`).toEqual([]);
    }
  });
});
