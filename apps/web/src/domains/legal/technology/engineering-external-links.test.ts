import { describe, expect, it } from "vitest";

import {
  ENGINEERING_EXTERNAL_LINKS,
  externalLinkForName,
} from "./engineering-external-links";
import { ENGINEERING_BENCHMARK_GROUPS } from "./engineering-playbook-content";
import { ENGINEERING_REFERENCES } from "./engineering-story-deep-dive-content";

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

  it("참고 자료 카드가 선언한 이름은 전부 공식 링크로 해결된다", () => {
    for (const reference of ENGINEERING_REFERENCES) {
      expect(reference.linkNames?.length, reference.id).toBeGreaterThan(0);
      for (const name of reference.linkNames ?? []) {
        expect(externalLinkForName(name), `${reference.id}: ${name}`).toBeTruthy();
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
    // 2026-10-07에 의존성에서 제거돼 더 이상 쓰지 않는 라이브러리는 링크 행도 두지 않는다.
    expect(externalLinkForName("@helia/verified-fetch")).toBeUndefined();
  });

  it("Hokusai는 자체 제작물이 아니라 외부 crate이므로 업스트림 저장소로 연결한다", () => {
    expect(externalLinkForName("Hokusai")).toBe("https://github.com/reearth/hokusai");
  });
});
