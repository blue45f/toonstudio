import { describe, expect, it, vi } from "vitest";

import { createStudioResvgSvgProvider } from "../studio-resvg-svg-provider";

/**
 * SVG 살균 정규식의 최악 입력 시간 회귀 테스트(CodeQL js/polynomial-redos).
 *
 * 살균기는 외부에서 받은 SVG(원문 예산 2 MiB)를 먼저 훑는다. 정규식이 입력 길이의 제곱 시간이면
 * 아래처럼 수십~수백 KB 한 장으로 탭이 수 초에서 수십 분까지 멈춘다. 각 입력은 수정 전 구현에서 3~5초가
 * 걸렸고, 선형 시간이면 수십 ms 안에 끝난다. 상한은 느린 CI 에서도 흔들리지 않게 1초로 넉넉히 둔다.
 */
const LINEAR_TIME_BUDGET_MS = 1_000;
const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2">';

async function sanitizeOutcome(svg: string) {
  // 살균을 통과하면 런타임 로더까지 도달한다. 로더는 즉시 실패시켜 WASM 없이 통과 여부만 확인한다.
  const runtimeLoader = vi.fn((): never => {
    throw new Error("sanitizer accepted the SVG");
  });
  const provider = createStudioResvgSvgProvider({ runtimeLoader });
  const startedAt = performance.now();
  const outcome = await provider
    .render({ svg, fontPolicy: { mode: "none" }, imagePolicy: "deny" })
    .then(
      () => null,
      (error: unknown) => error,
    );
  return {
    outcome,
    elapsedMs: performance.now() - startedAt,
    accepted: runtimeLoader.mock.calls.length > 0,
  };
}

describe("studio resvg SVG 살균기의 선형 시간", () => {
  it("'<' 뒤에 공백만 길게 이어져도 금지 요소 검사가 제곱 시간이 되지 않는다", async () => {
    const svg = `${SVG_OPEN}<${" ".repeat(100_000)}<script>alert(1)</script></svg>`;
    const { outcome, elapsedMs } = await sanitizeOutcome(svg);
    expect(outcome).toMatchObject({ code: "unsafe-svg" });
    expect(elapsedMs, "금지 요소 검사 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("하이픈으로 이어진 on- 토큰이 길어도 이벤트 속성 검사가 제곱 시간이 되지 않는다", async () => {
    const svg = `${SVG_OPEN}<desc>${"on-".repeat(33_000)}</desc><rect onclick="x"/></svg>`;
    const { outcome, elapsedMs } = await sanitizeOutcome(svg);
    expect(outcome).toMatchObject({ code: "unsafe-svg" });
    expect(elapsedMs, "이벤트 속성 검사 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("닫히지 않은 url( 이 길게 반복돼도 CSS URL 검사가 제곱 시간이 되지 않는다", async () => {
    const svg = `${SVG_OPEN}<desc>${"url(".repeat(25_000)}</desc></svg>`;
    const { accepted, elapsedMs } = await sanitizeOutcome(svg);
    expect(accepted).toBe(true);
    expect(elapsedMs, "CSS URL 검사 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("끝나지 않는 <image 가 길게 반복돼도 이미지 요소 검사가 제곱 시간이 되지 않는다", async () => {
    const svg = `${SVG_OPEN}${"<image".repeat(66_000)}`;
    const { accepted, elapsedMs } = await sanitizeOutcome(svg);
    expect(accepted).toBe(true);
    expect(elapsedMs, "이미지 요소 검사 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });
});

describe("studio resvg SVG 살균기의 판정 보존", () => {
  it.each([
    ["공백이 낀 금지 요소", `${SVG_OPEN}<  /  script></svg>`],
    ["대문자 이벤트 속성", `${SVG_OPEN}<rect ONCLICK = "x"/></svg>`],
    ["하이픈 뒤 이벤트 속성", `${SVG_OPEN}<g data-onclick="x"/></svg>`],
    ["외부 CSS URL", `${SVG_OPEN}<rect fill="url(https://example.com/p.svg#x)"/></svg>`],
    ["따옴표로 감싼 외부 CSS URL", `${SVG_OPEN}<rect fill="url( 'https://example.com/p.svg#x' )"/></svg>`],
    ["빈 CSS URL", `${SVG_OPEN}<rect fill="url()"/></svg>`],
    ["짝이 어긋난 따옴표의 CSS URL", `${SVG_OPEN}<rect fill='url("#a"x")'/></svg>`],
    ["image 요소(deny 정책)", `${SVG_OPEN}<image width="1" height="1" href="data:image/png;base64,iVBORw0KGgo="/></svg>`],
  ])("%s 는 계속 거부한다", async (_label, svg) => {
    const { outcome, accepted } = await sanitizeOutcome(svg);
    expect(outcome).toMatchObject({ code: "unsafe-svg" });
    expect(accepted).toBe(false);
  });

  it.each([
    ["문서 안 참조 url(#id)", `${SVG_OPEN}<rect fill="url(#paint)"/></svg>`],
    ["따옴표·공백이 낀 문서 안 참조", `${SVG_OPEN}<rect fill="URL( '#paint' )" stroke='url( "#paint" )'/></svg>`],
    ["글자가 on 으로 시작하지만 이벤트가 아닌 속성", `${SVG_OPEN}<text font-size="2" data-icon="on"/></svg>`],
    ["image 로 시작하는 다른 요소 이름", `${SVG_OPEN}<imagery/></svg>`],
  ])("%s 는 계속 통과한다", async (_label, svg) => {
    const { outcome, accepted } = await sanitizeOutcome(svg);
    expect(accepted).toBe(true);
    expect(outcome).toMatchObject({ code: "runtime-failed" });
  });
});
