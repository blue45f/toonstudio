import { describe, expect, it } from "vitest";

import { ThorvgAssetRejectedError, auditThorvgSvg } from "./audit";

/**
 * ThorVG SVG 사전 감사의 최악 입력 시간 회귀 테스트(CodeQL js/polynomial-redos).
 *
 * 감사는 렌더러를 켜기 전에 SVG(원문 예산 2 MiB)를 정규식으로 훑는다. 정규식이 입력 길이의 제곱 시간이면
 * 수십~수백 KB 한 장으로 탭이 수 초에서 수십 분까지 멈춘다. 아래 입력은 수정 전 구현에서 각각 4~5초가
 * 걸렸고, 선형 시간이면 수십 ms 안에 끝난다. 상한은 느린 CI 에서도 흔들리지 않게 1초로 넉넉히 둔다.
 */
const LINEAR_TIME_BUDGET_MS = 1_000;

function auditWithTiming(source: string) {
  const startedAt = performance.now();
  let error: unknown = null;
  try {
    auditThorvgSvg(source, 32, 32);
  } catch (caught) {
    error = caught;
  }
  return { error, elapsedMs: performance.now() - startedAt };
}

describe("ThorVG SVG 감사의 선형 시간", () => {
  it("하이픈으로 이어진 on- 토큰이 길어도 이벤트 속성 검사가 제곱 시간이 되지 않는다", () => {
    const source = `<svg><desc>${"on-".repeat(33_000)}</desc><rect onclick="x"/></svg>`;
    const { error, elapsedMs } = auditWithTiming(source);
    expect(error).toBeInstanceOf(ThorvgAssetRejectedError);
    expect(error).toMatchObject({ code: "active-content" });
    expect(elapsedMs, "이벤트 속성 검사 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("닫히지 않은 url( 이 길게 반복돼도 CSS URL 검사가 제곱 시간이 되지 않는다", () => {
    const source = `<svg><desc>${"url(".repeat(50_000)}</desc></svg>`;
    const { error, elapsedMs } = auditWithTiming(source);
    expect(error).toBeNull();
    expect(elapsedMs, "CSS URL 검사 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });
});

describe("ThorVG SVG 감사의 판정 보존", () => {
  it.each([
    ["이벤트 속성", '<svg><rect ONCLICK = "x"/></svg>', "active-content"],
    ["하이픈 뒤 이벤트 속성", '<svg><g data-onclick="x"/></svg>', "active-content"],
    ["외부 CSS URL", '<svg><rect fill="url(https://example.test/a.svg)"/></svg>', "external-resource"],
    ["공백으로 시작하는 CSS URL", '<svg><rect fill="url( #a)"/></svg>', "external-resource"],
    ["따옴표로 감싼 CSS URL", '<svg><rect fill="url(\'#a\')"/></svg>', "external-resource"],
  ])("%s 는 계속 거부한다", (_label, source, code) => {
    const { error } = auditWithTiming(source);
    expect(error).toBeInstanceOf(ThorvgAssetRejectedError);
    expect(error).toMatchObject({ code });
  });

  it.each([
    ["문서 안 참조 url(#id)", '<svg><rect fill="url(#a)"/></svg>'],
    ["빈 url()", '<svg><rect fill="url()"/></svg>'],
    ["이벤트가 아닌 on 글자 속성", '<svg><text font-size="2" data-icon="on"/></svg>'],
    ["닫는 괄호가 없는 url(", '<svg><desc>url(https://example.test/a.svg</desc></svg>'],
  ])("%s 는 계속 통과한다", (_label, source) => {
    expect(auditWithTiming(source).error).toBeNull();
  });
});
