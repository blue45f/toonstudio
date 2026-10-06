import { describe, expect, it } from "vitest";

import {
  ENGINEERING_EXTERNAL_LINKS,
  externalLinkForName,
} from "./engineering-external-links";
import { ENGINEERING_BENCHMARK_GROUPS } from "./engineering-playbook-content";

describe("기술 자료 외부 링크 레지스트리", () => {
  it("이름이 유일하고 모든 URL이 https 공식 주소 형식이다", () => {
    const names = ENGINEERING_EXTERNAL_LINKS.map((link) => link.name);
    expect(new Set(names).size).toBe(names.length);
    for (const link of ENGINEERING_EXTERNAL_LINKS) {
      expect(link.url.startsWith("https://"), link.name).toBe(true);
      expect(() => new URL(link.url), link.name).not.toThrow();
    }
  });

  it("플레이북 벤치마크 제품은 전부 공식 링크로 해결된다", () => {
    for (const group of ENGINEERING_BENCHMARK_GROUPS) {
      for (const product of group.products) {
        expect(externalLinkForName(product), `${group.id}: ${product}`).toBeTruthy();
      }
    }
  });

  it("버전 표기가 붙은 칩과 대소문자 차이도 같은 항목으로 해결한다", () => {
    expect(externalLinkForName("openskp 1.3.0")).toBe("https://openskp.com/");
    expect(externalLinkForName("multiformats 14.0.5")).toBe("https://github.com/multiformats/js-multiformats");
    expect(externalLinkForName("three.js")).toBe("https://threejs.org/");
    expect(externalLinkForName("Three.js")).toBe("https://threejs.org/");
  });

  it("내부 개념과 확정하지 못한 항목은 링크 없이 남는다", () => {
    expect(externalLinkForName("Document authority")).toBeUndefined();
    expect(externalLinkForName("KMAS")).toBeUndefined();
    expect(externalLinkForName("Hokusai")).toBeUndefined();
  });
});
