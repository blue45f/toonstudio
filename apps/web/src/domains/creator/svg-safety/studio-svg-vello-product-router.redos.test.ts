import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_SVG_PRODUCT_SELECTED_PROVIDER_ID,
  StudioSvgProductTournament,
} from "../studio-svg-vello-product-router";

/**
 * Vello 제품 라우터의 활성 콘텐츠 검사 최악 입력 시간 회귀 테스트(CodeQL js/polynomial-redos).
 *
 * 사용자가 가져온 SVG(원문 예산 2 MiB)를 가장 먼저 훑는 검사다. 이벤트 속성 정규식이 입력 길이의 제곱 시간이면
 * 수십 KB 한 장으로 탭이 수 초에서 수십 분까지 멈춘다. 아래 입력은 수정 전 구현에서 5초가량 걸렸고,
 * 선형 시간이면 수십 ms 안에 끝난다. 상한은 느린 CI 에서도 흔들리지 않게 1초로 넉넉히 둔다.
 */
const LINEAR_TIME_BUDGET_MS = 1_000;
const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2">';

function request(svg: string) {
  return {
    assetId: "imported-svg",
    svg,
    width: 2,
    height: 2,
    trust: "user-import" as const,
    selectedProviderId: STUDIO_SVG_PRODUCT_SELECTED_PROVIDER_ID,
  };
}

async function resolveWithTiming(svg: string) {
  const ports = {
    auditVello: vi.fn(async () => ({ elementCount: 2, maxDepth: 2, localReferenceCount: 0 })),
    renderVelloCpu: vi.fn(async () => new Uint8Array(2 * 2 * 4)),
  };
  const startedAt = performance.now();
  const decision = await new StudioSvgProductTournament(ports).resolve(request(svg));
  return { decision, ports, elapsedMs: performance.now() - startedAt };
}

describe("Vello 제품 라우터 활성 콘텐츠 검사의 선형 시간", () => {
  it("하이픈으로 이어진 on- 토큰이 길어도 이벤트 속성 검사가 제곱 시간이 되지 않는다", async () => {
    const svg = `${SVG_OPEN}<desc>${"on-".repeat(33_000)}</desc><rect onclick="x"/></svg>`;
    const { decision, ports, elapsedMs } = await resolveWithTiming(svg);
    expect(decision).toMatchObject({ providerId: "rejected", route: "fail-closed" });
    expect(decision.unsupported).toContain("security:active-or-external-content");
    expect(ports.auditVello).not.toHaveBeenCalled();
    expect(elapsedMs, "이벤트 속성 검사 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("이벤트 속성이 없는 일반 SVG 는 계속 통과해 선택된 공급자까지 간다", async () => {
    const svg = `${SVG_OPEN}<text font-size="2" data-icon="on"/><rect fill="url(#paint)"/></svg>`;
    const { decision, ports } = await resolveWithTiming(svg);
    expect(decision).toMatchObject({ providerId: "vello-svg-native", route: "selected-vello-native" });
    expect(ports.auditVello).toHaveBeenCalledOnce();
  });
});
