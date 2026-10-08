import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SHOWCASE_SOURCE =
  "apps/web/src/domains/legal/technology/TechnologyStackShowcase.tsx";
const PAGE_SOURCE = "apps/web/src/domains/legal/TechnologyPage.tsx";
const ROLE_LEDGER_SOURCE = "packages/studio-engine-registry/src/renderer-roles.ts";
const SKIA_DESCRIPTOR_SOURCE = "packages/studio-engine-skia/src/descriptor.ts";
const VELLO_DESCRIPTOR_SOURCE = "packages/studio-engine-vello/src/descriptor.ts";

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("technology stack showcase", () => {
  it("is embedded in the technology page", () => {
    const pageSource = readSource(PAGE_SOURCE);
    expect(pageSource).toContain("TechnologyStackShowcase");
  });

  it("offers four accessible tabs for renderer, 3D, VRM and AI", () => {
    const source = readSource(SHOWCASE_SOURCE);
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("ArrowLeft");
    expect(source).toContain("ArrowRight");
    for (const label of ["렌더러", "캐릭터(VRM)", "AI"]) {
      expect(source).toContain(label);
    }
  });

  it("explains the renderer registry with a pipeline diagram and comparison table", () => {
    const source = readSource(SHOWCASE_SOURCE);
    for (const name of ["CanvasKit (Skia)", "Vello", "ThorVG", "Canvas2D"]) {
      expect(source).toContain(name);
    }
    expect(source).toContain("렌더러 비교표");
    expect(source).toContain("빠른 미리보기");
    // 획은 래스터가 아니라 점·필압·붓 정보로 기록돼 렌더마다 다시 계산된다(studio-element-model.ts paperModel 주석).
    expect(source).toContain("획 확정 기록");
    expect(source).not.toContain("타일 커밋");
  });

  it("names every named element of the pipeline diagram with a role instead of a bare aria-label", () => {
    const source = readSource(SHOWCASE_SOURCE);
    expect(source).toMatch(/role="group"[^>]*aria-label=\{bi\("렌더링 파이프라인"/u);
    // aria-label 은 role 이 있는 요소에만 둔다: 이름만 붙은 div 를 만들지 않는다.
    expect(source).not.toMatch(/<div(?![^>]*\brole=)[^>]*\baria-label=/u);
  });

  it("states maturity and product scope for each renderer instead of listing them as equals", () => {
    const source = readSource(SHOWCASE_SOURCE);
    expect(source).toContain("성숙도·적용 범위");
    for (const registryMaturity of ["production-baseline", "experimental · conditional"]) {
      expect(source).toContain(registryMaturity);
    }
    // ThorVG 는 레지스트리 성숙도 선언이 없는 SVG 에셋 미리보기 전문 경로이며 저사양 대체 렌더러가 아니다.
    expect(source).toContain("SVG 에셋 미리보기");
    expect(source).not.toContain("저사양 기기·임베디드 환경");
    // 붓 표현의 정밀함을 CanvasKit 의 역할로 귀속하지 않는다.
    expect(source).not.toContain("정밀한 붓 표현");
  });

  it("keeps the declared maturity in line with the engine descriptors and the role ledger", () => {
    const skia = readSource(SKIA_DESCRIPTOR_SOURCE);
    const vello = readSource(VELLO_DESCRIPTOR_SOURCE);
    const ledger = readSource(ROLE_LEDGER_SOURCE);
    // Skia CPU 기준 레인 = production-baseline, Vello GPU = experimental, 나머지 Vello 레인 = conditional.
    expect(skia).toMatch(/id: "skia-canvaskit",[\s\S]*?maturity: "production-baseline"/u);
    expect(vello).toMatch(/id: "vello-gpu-browser",[\s\S]*?maturity: "experimental"/u);
    expect(vello).toContain('maturity: "conditional"');
    // 제품 역할: ThorVG 는 명시 선택 provider, Vello 는 권위 없는 provider/reference, Canvas2D 는 래스터 획 커밋의 primary.
    expect(ledger).toMatch(/id: "thorvg-webcanvas"[\s\S]*?role: "provider"/u);
    expect(ledger).toMatch(/id: "vello-classic-gpu"[\s\S]*?role: "provider"/u);
    expect(ledger).toMatch(/id: "canvas2d-draw-node"[\s\S]*?role: "primary"/u);
  });

  it("covers 3D, VRM and AI with non-expert explanations", () => {
    const source = readSource(SHOWCASE_SOURCE);
    expect(source).toContain("Three.js");
    expect(source).toContain("React Three Fiber");
    expect(source).toContain("신체 설계도");
    expect(source).toContain("Studio Credit");
    expect(source).toContain("BYOK");
  });

  it("respects reduced motion and links to the evidence-heavy story", () => {
    const source = readSource(SHOWCASE_SOURCE);
    expect(source).toContain("motion-reduce");
    expect(source).toContain('href="/about/technology/story"');
  });

  it("sends incident records to the field notes instead of the references page", () => {
    const source = readSource(SHOWCASE_SOURCE);
    expect(source).toContain('href="/about/technology/field-notes#incidents"');
    expect(source).toContain('href="/about/technology/references"');
    // 참고 자료 링크의 라벨이 장애 기록까지 약속하지 않는다.
    expect(source).not.toContain("참고 자료와 장애 기록");
  });
});
