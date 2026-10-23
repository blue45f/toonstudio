import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioWorkModeBar } from "./StudioWorkModeBar";

describe("StudioWorkModeBar", () => {
  it("모드 7종 버튼과 현재 모드 설명을 렌더한다", () => {
    const html = renderToStaticMarkup(
      <StudioWorkModeBar mode="draw" onModeChange={() => undefined} />,
    );
    // 파이프라인은 채색 뒤에 후보정이 끼고 마지막 단계 이름은 "마감"이다(studio-work-mode.ts).
    for (const label of ["전체", "콘티", "스케치·선화", "채색", "후보정", "식자", "마감"]) {
      expect(html).toContain(`>${label}</button>`);
    }
    expect(html.match(/role="tab"/g)?.length ?? 0).toBe(7);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("그리는 단계예요");
  });

  it("다음 단계 버튼은 파이프라인 다음 모드를 가리킨다", () => {
    const next = (mode: "color" | "post" | "lettering") =>
      renderToStaticMarkup(<StudioWorkModeBar mode={mode} onModeChange={() => undefined} />);
    // 채색 다음은 후보정, 후보정 다음이 식자, 식자 다음이 마감이다.
    expect(next("color")).toContain("다음 단계: 후보정");
    expect(next("post")).toContain("다음 단계: 식자");
    expect(next("lettering")).toContain("다음 단계: 마감");
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

  it("단계 번호(①~⑥)와 단계별 핵심 단축키 & 입문자 팁 코칭 스트립을 표시한다", () => {
    const html = renderToStaticMarkup(
      <StudioWorkModeBar mode="storyboard" onModeChange={() => undefined} />,
    );
    for (const badge of ["①", "②", "③", "④", "⑤", "⑥"]) {
      expect(html).toContain(badge);
    }
    expect(html).toContain('data-work-mode="storyboard"');
    expect(html).toContain("단계별 핵심 단축키 &amp; 입문자 팁");
    expect(html).toContain("가이드 숨기기");
    expect(html).toContain("<kbd");
    expect(html).toContain("① 콘티 단계에서는 세부 묘사보다 세로 스크롤 호흡");
  });
});
