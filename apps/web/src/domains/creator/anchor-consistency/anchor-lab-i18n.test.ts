import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { APP_I18N_NAMESPACES } from "@/shared/lib/i18n-asset-manifest";

import type { AnchorDifference } from "./anchor-consistency-differences";
import { ANCHOR_ANGLE_IDS } from "./anchor-capture-spec";
import {
  ANGLE_NAME_KEYS,
  BAND_KEYS,
  COMPARISON_LIMIT_KEYS,
  DIFFERENCE_SEVERITY_KEYS,
  FEATURE_KEYS,
  SLOT_STATUS_KEYS,
  SORT_MODES,
  SORT_MODE_KEYS,
  captureErrorCopy,
  completenessIssueCopy,
  differenceCopy,
  formatFileSize,
  formatMegabytes,
  isAnchorSortMode,
  packWarningCopy,
  resolveCopy,
  skipReasonCopy,
} from "./anchor-lab-copy";
import { anchorLabI18nBuiltins } from "./anchor-lab-i18n-builtins";

const here = path.dirname(fileURLToPath(import.meta.url));
const namespaceDir = path.resolve(here, "../../../../public/i18n/app/anchorLab");

function readDictionary(locale: string): Record<string, string> {
  return JSON.parse(readFileSync(path.join(namespaceDir, `${locale}.json`), "utf8")) as Record<string, string>;
}

const KO = readDictionary("ko");
const EN = readDictionary("en");

function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/gu)].map((match) => match[1] ?? "").sort();
}

/** 이 화면을 이루는 소스(시험 제외)와, 같은 키를 쓰는 라우트 권위 파일. */
function sourceFiles(): string[] {
  const own = [here, path.join(here, "ui")].flatMap((directory) =>
    readdirSync(directory)
      .filter((name) => /\.(ts|tsx)$/u.test(name) && !/\.test\.|test-kit|synthetic|i18n-builtins/u.test(name))
      .map((name) => path.join(directory, name)),
  );
  return [...own, path.resolve(here, "../../../shared/lib/site-route-authority.ts")];
}

function usedKeys(): Set<string> {
  const used = new Set<string>();
  for (const file of sourceFiles()) {
    for (const match of readFileSync(file, "utf8").matchAll(/["'`](anchorLab\.[A-Za-z0-9.]+)["'`]/gu)) {
      if (match[1]) used.add(match[1]);
    }
  }
  return used;
}

describe("anchorLab 사전", () => {
  it("네임스페이스가 매니페스트에 등록되어 있다", () => {
    expect(APP_I18N_NAMESPACES).toContain("anchorLab");
  });

  it("ko 와 en 의 키 집합이 같고 모든 키가 anchorLab. 으로 시작한다", () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(KO).sort());
    expect(Object.keys(KO).every((key) => key.startsWith("anchorLab."))).toBe(true);
  });

  it("값이 비어 있지 않고 ko 와 en 의 자리표시가 같다", () => {
    for (const [key, ko] of Object.entries(KO)) {
      const en = EN[key] ?? "";
      expect(ko.trim(), key).not.toBe("");
      expect(en.trim(), key).not.toBe("");
      expect(placeholdersOf(en), key).toEqual(placeholdersOf(ko));
    }
  });

  it("셸에 넣지 않는 지연 묶음의 생성물이 정본과 같다", () => {
    expect(anchorLabI18nBuiltins.ko).toEqual(KO);
    expect(anchorLabI18nBuiltins.en).toEqual(EN);
  });

  it("코드가 쓰는 키는 모두 사전에 있고, 쓰이지 않는 키는 사전에 없다", () => {
    const used = usedKeys();
    const defined = new Set(Object.keys(KO));
    expect([...used].filter((key) => !defined.has(key)).sort()).toEqual([]);
    expect([...defined].filter((key) => !used.has(key)).sort()).toEqual([]);
  });

  it("한국어 문구는 해요체로 쓰고 한계 안내가 보장·판정을 말하지 않는다", () => {
    for (const [key, value] of Object.entries(KO)) {
      expect(value, key).not.toMatch(/(합니다|입니다|습니다)[.!]?$/u);
    }
    expect(KO["anchorLab.limits.score"]).toContain("판정하지 않아요");
    expect(KO["anchorLab.limits.noGuarantee"]).toContain("보장은 없어요");
    expect(KO["anchorLab.score.disclaimer"]).toContain("판정하지 않고");
    for (const value of Object.values(KO)) expect(value).not.toMatch(/동일인|같은 캐릭터임을 보장/u);
  });
});

describe("문구 도우미", () => {
  const t = (key: string, values?: Readonly<Record<string, string | number>>): string => {
    const template = KO[key];
    if (template === undefined) throw new Error(`없는 키 ${key}`);
    return template.replace(/\{(\w+)\}/gu, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  };

  it("각도·상태·정렬·구간·특징·한계·심각도 키가 모두 사전에 있다", () => {
    const keys = [
      ...Object.values(ANGLE_NAME_KEYS),
      ...Object.values(SLOT_STATUS_KEYS),
      ...Object.values(SORT_MODE_KEYS),
      ...Object.values(BAND_KEYS),
      ...Object.values(FEATURE_KEYS),
      ...Object.values(COMPARISON_LIMIT_KEYS),
      ...Object.values(DIFFERENCE_SEVERITY_KEYS),
    ];
    for (const key of keys) expect(KO[key], key).toBeDefined();
    expect(Object.keys(ANGLE_NAME_KEYS).sort()).toEqual([...ANCHOR_ANGLE_IDS].sort());
  });

  it("정렬 모드 판별이 목록과 같다", () => {
    for (const mode of SORT_MODES) expect(isAnchorSortMode(mode)).toBe(true);
    expect(isAnchorSortMode("rating")).toBe(false);
  });

  it("차이 항목의 모든 id·갈래가 서로 다른 문구 키로 풀린다", () => {
    const combos: readonly (readonly [AnchorDifference["id"], string | undefined])[] = [
      ["lightness", "brighter"], ["lightness", "darker"], ["chroma", "more"], ["chroma", "less"], ["hue", undefined],
      ["palette-missing", undefined], ["palette-extra", undefined], ["subject-scale", "larger"], ["subject-scale", "smaller"],
      ["proportion", "wider"], ["proportion", "narrower"], ["position", undefined], ["silhouette", undefined],
      ["structure", undefined], ["near-duplicate", undefined], ["subject-not-separated", "both"],
      ["subject-not-separated", "anchor"], ["subject-not-separated", "candidate"],
    ];
    const keys = combos.map(([id, variant]) =>
      differenceCopy({ id, severity: "info", magnitude: 0, params: {}, ...(variant ? { variant } : {}) }).key,
    );
    expect(new Set(keys).size).toBe(combos.length);
    for (const key of keys) {
      expect(KO[key], key).toBeDefined();
      expect(key).not.toBe("anchorLab.diff.none");
    }
  });

  it("차이 항목 문구에 값이 채워진다", () => {
    const text = resolveCopy(t, differenceCopy({
      id: "palette-missing", severity: "major", magnitude: 40, params: { hex: "#c82832", nearestHex: "#bfbfbf", percent: 12, deltaE: 38 },
    }));
    expect(text).toContain("#c82832");
    expect(text).toContain("12%");
    expect(text).toContain("ΔE 38");
    expect(text).not.toMatch(/\{\w+\}/u);
  });

  it("읽기 오류 코드마다 문구가 있고 한도 수치를 MB 로 채운다", () => {
    expect(resolveCopy(t, captureErrorCopy("file-too-large", { bytes: 9 * 1024 * 1024, max: 8 * 1024 * 1024 }))).toBe("파일이 9MB로, 한 장 한도 8MB를 넘어요. 더 작은 파일을 골라 주세요.");
    expect(resolveCopy(t, captureErrorCopy("image-too-small", { width: 100, height: 120, min: 256 }))).toContain("100×120px");
    expect(resolveCopy(t, captureErrorCopy("raster-too-small"))).toContain("16px");
    expect(captureErrorCopy("worker-failed").key).toBe(captureErrorCopy("worker-protocol").key);
    for (const code of ["cancelled", "timeout", "file-empty", "unsupported-format", "invalid-dimensions", "decode-failed", "source-unavailable", "source-failed", "invalid-raster", "empty-image", "raster-too-large", "worker-unavailable"] as const) {
      expect(resolveCopy(t, captureErrorCopy(code)), code).not.toMatch(/\{\w+\}/u);
    }
  });

  it("세트 점검·참조 팩 문구는 각도 이름을 번역해 끼운다", () => {
    const issue = completenessIssueCopy({ code: "missing-mirror-pair", severity: "warning", angleId: "left", relatedAngleId: "right" }, t);
    expect(resolveCopy(t, issue)).toBe("좌측은 있지만 짝인 우측가 없어요. 한쪽 모습만 참조돼요.");
    expect(resolveCopy(t, skipReasonCopy("role-limit", 6, 16))).toContain("6장");
    expect(resolveCopy(t, skipReasonCopy("provider-limit", 6, 16))).toContain("16장");
    expect(packWarningCopy({ code: "existing-bytes-unknown" }, t)).toBeNull();
    const warning = packWarningCopy({ code: "missing-mirror-pair", angleId: "left-34", relatedAngleId: "right-34" }, t);
    expect(warning && resolveCopy(t, warning)).toContain("우 3/4");
  });

  it("파일 크기 표기", () => {
    expect(formatMegabytes(8 * 1024 * 1024)).toBe("8");
    expect(formatMegabytes(1.5 * 1024 * 1024)).toBe("1.5");
    expect(formatFileSize(300)).toBe("1KB");
    expect(formatFileSize(512 * 1024)).toBe("512KB");
    expect(formatFileSize(3.2 * 1024 * 1024)).toBe("3.2MB");
  });
});
