import { describe, expect, it } from "vitest";

import {
  ENGINEERING_LIBRARY_LICENSES,
  ENGINEERING_MODEL_ASSET_LICENSES,
} from "./engineering-license-inventory";

describe("라이브러리 라이선스 현황 데이터", () => {
  it("직접 의존성 116개를 표면별로 빠짐없이 담는다", () => {
    expect(ENGINEERING_LIBRARY_LICENSES).toHaveLength(116);
    const bySurface = new Map<string, number>();
    for (const library of ENGINEERING_LIBRARY_LICENSES) {
      bySurface.set(library.surface, (bySurface.get(library.surface) ?? 0) + 1);
    }
    expect(bySurface.get("web")).toBe(83);
    expect(bySurface.get("api")).toBe(23);
    expect(bySurface.get("mobile")).toBe(8);
    expect(bySurface.get("labs")).toBe(2);
  });

  it("이름은 유일하고 버전·라이선스·역할이 비어 있지 않다", () => {
    const names = ENGINEERING_LIBRARY_LICENSES.map((library) => library.name);
    expect(new Set(names).size).toBe(names.length);
    for (const library of ENGINEERING_LIBRARY_LICENSES) {
      expect(library.version.length, library.name).toBeGreaterThan(0);
      expect(library.license.length, library.name).toBeGreaterThan(0);
      expect(library.role.ko.length, library.name).toBeGreaterThan(0);
      expect(library.role.en.length, library.name).toBeGreaterThan(0);
    }
  });

  it("강한 카피레프트(GPL·AGPL) 직접 의존성은 없다", () => {
    for (const library of ENGINEERING_LIBRARY_LICENSES) {
      expect(library.license, library.name).not.toMatch(/^(A?GPL|AGPL)/u);
      expect(library.license, library.name).not.toContain("AGPL");
    }
  });

  it("별도 확인이 필요한 항목은 플래그와 함께 정확히 일곱 개다", () => {
    const flagged = ENGINEERING_LIBRARY_LICENSES.filter((library) => library.flag);
    expect(flagged.map((library) => [library.name, library.license, library.flag])).toEqual(
      expect.arrayContaining([
        ["opencascade.js", "LGPL-2.1-only", "weak-copyleft"],
        ["@resvg/resvg-wasm", "MPL-2.0", "weak-copyleft"],
        ["web-ifc", "MPL-2.0", "weak-copyleft"],
        ["web-push", "MPL-2.0", "weak-copyleft"],
        ["mixbox", "CC-BY-NC-4.0", "noncommercial"],
        ["remotion", "Remotion License", "custom-license"],
        ["@remotion/player", "Remotion License", "custom-license"],
      ]),
    );
    expect(flagged).toHaveLength(7);
  });
});

describe("AI 모델 자산 라이선스 데이터", () => {
  it("고지가 있는 모델 여섯 개만 싣고 라이선스는 허용 목록 안에 있다", () => {
    expect(ENGINEERING_MODEL_ASSET_LICENSES).toHaveLength(6);
    for (const model of ENGINEERING_MODEL_ASSET_LICENSES) {
      expect(["MIT", "Apache-2.0", "BSD-3-Clause"], model.file).toContain(model.license);
      expect(model.bytes, model.file).toBeGreaterThan(0);
      expect(model.role.ko.length, model.file).toBeGreaterThan(0);
    }
  });

  it("AnimeGANv2 두 모델은 배포본 경유 경계를 고지로 남긴다", () => {
    const animegan = ENGINEERING_MODEL_ASSET_LICENSES.filter((model) => model.file.startsWith("animegan2-"));
    expect(animegan).toHaveLength(2);
    for (const model of animegan) {
      expect(model.note?.ko).toContain("MIT 라이선스 배포본");
    }
  });
});
