import { describe, expect, it } from "vitest";

import { classifyRouteDomain } from "./route-domain-classifier";
import { classifyRouteDomain as publicClassifier } from "./route-inventory-audit";

describe("접근성 감사 라우트 도메인 분류", () => {
  it("기존 인벤토리 모듈의 공개 함수는 분리한 정본과 동일하다", () => {
    expect(publicClassifier).toBe(classifyRouteDomain);
  });

  it.each([
    ["/", "home"],
    ["/discover/works", "discover"],
    ["/title/visual-audit", "catalog-work"],
    ["/read/spatial", "reader-viewer"],
    ["/community/cafes", "community"],
    ["/market/checkout/visual-audit", "market"],
    ["/learn/accessibility", "learn"],
    ["/accessibility", "legal"],
    ["/settings", "account"],
    ["/fortune/saju", "experience"],
    ["/events/beta-open", "events-promo"],
    ["/offline", "status-ops"],
    ["/admin/overview", "admin"],
    ["/production/projects", "production"],
    ["/studio", "studio-hub"],
    ["/studio/ai-lab", "studio-hub"],
    ["/studio/canvas", "studio-editor"],
    ["/studio/animation", "studio-editor"],
    ["/studio/brush-lab", "studio-3d-brush-character"],
    ["/brush-lab", "studio-3d-brush-character"],
    ["/shaper", "studio-3d-brush-character"],
    ["/creator/revenue", "creator"],
    ["/not-a-declared-route", "redirect-legacy"],
  ] as const)("%s는 %s 분류와 특수 경로 우선순위를 유지한다", (route, category) => {
    expect(classifyRouteDomain(route)).toBe(category);
  });
});
