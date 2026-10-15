import { describe, expect, it } from "vitest";

import {
  parseStudioAssetDragPayload,
  serializeStudioLocalAssetDragPayload,
} from "../studio-shared-asset-drag";

/**
 * 드래그 payload SVG 검증기의 최악 입력 시간 회귀 테스트(CodeQL js/polynomial-redos).
 *
 * 드롭된 payload 는 다른 창·페이지가 만든 값이라 신뢰할 수 없다. 검증 정규식이 입력 길이의 제곱 시간이면
 * 수백 KB 한 장으로 탭이 수 초에서 수십 분까지 멈춘다(SVG 해독 예산은 2 MiB). 각 입력은 수정 전 구현에서
 * 3초 안팎이 걸렸고 선형 시간이면 수십 ms 안에 끝난다. 상한은 느린 CI 에서도 흔들리지 않게 1초로 둔다.
 */
const LINEAR_TIME_BUDGET_MS = 1_000;
const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg">';

function parseSvgDrag(svg: string) {
  const payload = serializeStudioLocalAssetDragPayload({
    src: `data:image/svg+xml;base64,${btoa(svg)}`,
    width: 360,
    height: 240,
  });
  const startedAt = performance.now();
  const parsed = parseStudioAssetDragPayload(payload);
  return { parsed, elapsedMs: performance.now() - startedAt };
}

describe("드래그 payload SVG 검증기의 선형 시간", () => {
  it("공백만 든 긴 태그가 있어도 요소 이름 추출이 제곱 시간이 되지 않는다", () => {
    const svg = `${SVG_OPEN}<${" ".repeat(120_000)}><script>alert(1)</script></svg>`;
    const { parsed, elapsedMs } = parseSvgDrag(svg);
    expect(parsed).toBeNull();
    expect(elapsedMs, "요소 이름 추출 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it("닫히지 않은 url( 이 길게 반복돼도 url() 호출 검사가 제곱 시간이 되지 않는다", () => {
    const svg = `${SVG_OPEN}<desc>${"url(".repeat(50_000)}</desc></svg>`;
    const { parsed, elapsedMs } = parseSvgDrag(svg);
    expect(parsed).toBeNull();
    expect(elapsedMs, "url() 호출 검사 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });
});

describe("드래그 payload SVG 검증기의 판정 보존", () => {
  it.each([
    ["문서 안 참조 url(#id)", `${SVG_OPEN}<rect fill="url(#paint)"/></svg>`],
    ["따옴표·공백이 낀 문서 안 참조", `${SVG_OPEN}<rect fill="URL ( '#paint' )" stroke='url( "#paint" )'/></svg>`],
    ["공백이 낀 닫는 태그", `${SVG_OPEN}<g>< /g ></svg>`],
  ])("%s 는 계속 통과한다", (_label, svg) => {
    expect(parseSvgDrag(svg).parsed).not.toBeNull();
  });

  it.each([
    ["외부 주소 url()", `${SVG_OPEN}<rect fill="url(https://example.com/p.svg#x)"/></svg>`],
    ["닫히지 않은 url(", `${SVG_OPEN}<rect fill="url(#paint"/></svg>`],
    ["뒤에 닫히지 않은 호출이 남은 url()", `${SVG_OPEN}<rect fill="url(#paint)"/><desc>url(</desc></svg>`],
    ["안쪽에 또 다른 url( 이 든 호출", `${SVG_OPEN}<rect fill="url(url(#paint))"/></svg>`],
    ["빈 url()", `${SVG_OPEN}<rect fill="url()"/></svg>`],
    ["공백이 낀 금지 요소 닫는 태그", `${SVG_OPEN}</ script ></svg>`],
  ])("%s 는 계속 거부한다", (_label, svg) => {
    expect(parseSvgDrag(svg).parsed).toBeNull();
  });
});
