// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseStudioLessonMission } from "../studio-lesson-mission";
import { StudioLessonMissionBarSlot } from "./StudioLessonMissionBarSlot";
import { hasStudioLessonMissionLinkShape } from "./studio-lesson-mission-link-shape";

/** 지연 로딩 청크 변환이 병렬 테스트 부하에서 느려질 수 있어 기본 1초보다 넉넉히 기다린다. */
const LAZY_LOAD_TIMEOUT_MS = 15_000;

const fixtures = vi.hoisted(() => ({
  /** 미션 바 본체 모듈 평가 횟수 — 딥링크가 없을 때 본체가 로드되지 않았다는 증거다. */
  bodyEvaluations: 0,
}));

vi.mock("../StudioLessonMissionBar", () => {
  fixtures.bodyEvaluations += 1;
  return {
    StudioLessonMissionBar: () => <section aria-label="학습 실습 미션">미션 바 본체</section>,
  };
});

function renderSlot(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/studio/canvas${search}`]}>
      <StudioLessonMissionBarSlot />
    </MemoryRouter>,
  );
}

describe("hasStudioLessonMissionLinkShape", () => {
  it("practice=lesson 과 lesson·mission 이 모두 있을 때만 딥링크 모양으로 본다", () => {
    expect(hasStudioLessonMissionLinkShape(new URLSearchParams("practice=lesson&lesson=a&mission=b"))).toBe(true);
    expect(hasStudioLessonMissionLinkShape(new URLSearchParams("lesson=a&mission=b"))).toBe(false);
    expect(hasStudioLessonMissionLinkShape(new URLSearchParams("practice=other&lesson=a&mission=b"))).toBe(false);
    expect(hasStudioLessonMissionLinkShape(new URLSearchParams("practice=lesson&lesson=a"))).toBe(false);
    expect(hasStudioLessonMissionLinkShape(new URLSearchParams("practice=lesson&mission=b"))).toBe(false);
  });

  it("공백뿐인 값은 없는 값으로 본다", () => {
    expect(hasStudioLessonMissionLinkShape(new URLSearchParams("practice=lesson&lesson=%20&mission=b"))).toBe(false);
    expect(hasStudioLessonMissionLinkShape(new URLSearchParams("practice=lesson&lesson=a&mission=%20%20"))).toBe(false);
  });

  // 슬롯의 값싼 판정은 바 본체의 최종 판정(parseStudioLessonMission)보다 좁으면 안 된다 —
  // 유효한 딥링크를 슬롯이 가리면 미션 바가 조용히 사라진다.
  it.each([
    "practice=lesson&lesson=story-board&mission=mission-story-board",
    "practice=lesson&lesson=%20story-board%20&mission=%20mission-story-board%20",
    "mission=mission-story-board&lesson=story-board&practice=lesson",
  ])("바 본체가 미션을 찾는 주소는 슬롯도 통과시킨다: %s", (query) => {
    const params = new URLSearchParams(query);
    expect(parseStudioLessonMission(params)).not.toBeNull();
    expect(hasStudioLessonMissionLinkShape(params)).toBe(true);
  });
});

describe("StudioLessonMissionBarSlot 지연 로딩 경계", () => {
  afterEach(() => {
    cleanup();
  });

  // 첫 두 테스트는 본체가 한 번도 로드되기 전에 실행돼야 한다
  // (모듈 레지스트리는 파일 안에서 유지되므로 순서를 바꾸면 증거가 사라진다).
  it("딥링크가 없으면 아무것도 그리지 않고 미션 바 본체를 로드하지 않는다", () => {
    const { container } = renderSlot("");
    expect(container.childElementCount).toBe(0);
    expect(fixtures.bodyEvaluations).toBe(0);
  });

  it("딥링크 파라미터가 하나라도 빠지면 본체를 로드하지 않는다", () => {
    const { container } = renderSlot("?practice=lesson&lesson=story-board");
    expect(container.childElementCount).toBe(0);
    expect(fixtures.bodyEvaluations).toBe(0);
  });

  it("딥링크가 있으면 본체를 지연 로딩해 그대로 렌더한다", async () => {
    renderSlot("?practice=lesson&lesson=story-board&mission=mission-story-board");
    expect(
      await screen.findByRole("region", { name: "학습 실습 미션" }, { timeout: LAZY_LOAD_TIMEOUT_MS }),
    ).toBeTruthy();
    expect(fixtures.bodyEvaluations).toBe(1);
  });
});
