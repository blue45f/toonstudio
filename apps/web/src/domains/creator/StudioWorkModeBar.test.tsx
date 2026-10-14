import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioWorkModeBar } from "./StudioWorkModeBar";

describe("StudioWorkModeBar", () => {
  it("모드 6종 버튼과 현재 모드 설명을 렌더한다", () => {
    const html = renderToStaticMarkup(
      <StudioWorkModeBar mode="draw" onModeChange={() => undefined} />,
    );
    for (const label of ["전체", "콘티", "스케치·선화", "채색", "식자", "효과·마감"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("그리는 단계예요");
  });

  it("다음 단계 버튼은 파이프라인 다음 모드를 가리킨다", () => {
    const html = renderToStaticMarkup(
      <StudioWorkModeBar mode="color" onModeChange={() => undefined} />,
    );
    expect(html).toContain("다음 단계: 식자");
  });

  it("마감 모드에서는 다음 단계 버튼이 없다", () => {
    const html = renderToStaticMarkup(
      <StudioWorkModeBar mode="finish" onModeChange={() => undefined} />,
    );
    expect(html).not.toContain("다음 단계:");
  });

  it("단계 제안이 현재 모드와 다르면 제안 배너가 뜬다", () => {
    const html = renderToStaticMarkup(
      <StudioWorkModeBar
        mode="all"
        suggestedMode="color"
        onModeChange={() => undefined}
        onDismissSuggestion={() => undefined}
      />,
    );
    expect(html).toContain("채색 모드로 바꿀까요?");
    expect(html).toContain("그대로 두기");
  });

  it("제안이 현재 모드와 같으면 배너가 뜨지 않는다", () => {
    const html = renderToStaticMarkup(
      <StudioWorkModeBar
        mode="color"
        suggestedMode="color"
        onModeChange={() => undefined}
      />,
    );
    expect(html).not.toContain("바꿀까요?");
  });
});
