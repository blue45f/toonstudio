import { describe, expect, it } from "vitest";

import {
  hasStudioStartIntent,
  resolveStudioStartHref,
  STUDIO_START_FORM_BACK_HREF,
  STUDIO_START_GATEWAY_HREF,
} from "./studio-start-entry";

describe("studio-start-entry (A5 시작 입구 정본)", () => {
  it("맥락 없는 bare 양식 링크는 정문(/create)으로 정규화한다", () => {
    expect(resolveStudioStartHref("/studio/new")).toBe("/create");
    expect(STUDIO_START_GATEWAY_HREF).toBe("/create");
    expect(STUDIO_START_FORM_BACK_HREF).toBe("/create");
  });

  it("시작 의도를 단 딥링크는 양식 직행을 유지한다", () => {
    for (const href of [
      "/studio/new?kind=webtoon&template=webtoon-vertical",
      "/studio/new?lane=blank",
      "/studio/new?lane=idea&start=idea",
      "/studio/new?start=storyboard&episode=ep-1",
      "/studio/new?onboarding=production&start=script",
      "/studio/new?title=비 오는 날의 첫사랑&start=idea",
    ]) {
      expect(hasStudioStartIntent(href)).toBe(true);
      expect(resolveStudioStartHref(href)).toBe(href);
    }
  });

  it("의도 없는 쿼리와 다른 경로는 딥링크로 보지 않는다", () => {
    expect(hasStudioStartIntent("/studio/new")).toBe(false);
    expect(hasStudioStartIntent("/studio/new?from=home")).toBe(false);
    expect(hasStudioStartIntent("/create?intent=my-story")).toBe(false);
    expect(resolveStudioStartHref("/studio/import")).toBe("/studio/import");
    expect(resolveStudioStartHref("/create")).toBe("/create");
  });
});
