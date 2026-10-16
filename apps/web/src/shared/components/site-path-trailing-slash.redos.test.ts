import { describe, expect, it } from "vitest";

import { canonicalSitePath } from "../lib/site-route-authority";
import { isCreatorOnboardingEntry } from "../lib/creator-adaptive-onboarding-policy";
import { atelierChapterForPath } from "./site-experience/site-atelier-content";
import { siteArtDirection } from "./site-experience/site-art-direction";
import { nextExperienceDestinations } from "./site-experience/site-experience-model";
import {
  isDiscoverPurposeRoute,
  isPublicCreativeRoute,
  supportsPublicSiteOnwardJourney,
} from "./site-public-routes";
import { workspaceTaskRoute } from "./workspace/workspace-task-route";

/**
 * 주소 경로 끝의 슬래시를 떼는 `pathname.replace(/\/+$/u, "")` 의 최악 입력 시간 회귀 테스트(CodeQL js/polynomial-redos).
 *
 * 주소창의 경로는 누구나 만들어 보낼 수 있다. 슬래시가 길게 이어지고 그 뒤에 다른 글자가 오면 시작점마다 슬래시 열을
 * 끝까지 다시 읽어 입력 길이의 제곱 시간이 든다(6만 칸이면 호출마다 1초 안팎, 호출이 모든 화면 전환마다 여러 번 겹친다).
 * 아래 입력은 수정 전 구현에서 호출마다 1초 안팎이 걸렸고, 선형 시간이면 수 ms 안에 끝난다.
 * 상한은 느린 CI 에서도 흔들리지 않게 300ms 로 넉넉히 둔다.
 */
const SLASH_RUN = "/".repeat(60_000);
const BUDGET_MS = 300;

function elapsedMs(run: () => unknown): number {
  const startedAt = performance.now();
  run();
  return performance.now() - startedAt;
}

describe("경로 끝 슬래시 정리의 선형 시간(공유 화면 모델)", () => {
  it.each([
    ["atelierChapterForPath", () => atelierChapterForPath(`/about${SLASH_RUN}x`)],
    ["nextExperienceDestinations", () => nextExperienceDestinations(`/about${SLASH_RUN}x`)],
    ["siteArtDirection", () => siteArtDirection(`/about${SLASH_RUN}x`)],
    ["isPublicCreativeRoute", () => isPublicCreativeRoute(`/create${SLASH_RUN}x`)],
    ["supportsPublicSiteOnwardJourney", () => supportsPublicSiteOnwardJourney(`/create${SLASH_RUN}x`)],
    ["isDiscoverPurposeRoute", () => isDiscoverPurposeRoute(`/search${SLASH_RUN}x`)],
    ["workspaceTaskRoute", () => workspaceTaskRoute(`/studio${SLASH_RUN}x`, "")],
    ["isCreatorOnboardingEntry", () => isCreatorOnboardingEntry(`/studio${SLASH_RUN}x`, "")],
    ["canonicalSitePath", () => canonicalSitePath(`/about${SLASH_RUN}x`)],
  ])("%s 는 슬래시가 길게 이어진 경로에서도 제곱 시간이 되지 않는다", (_name, run) => {
    expect(elapsedMs(run), "소요(ms)").toBeLessThan(BUDGET_MS);
  });
});

describe("경로 끝 슬래시 정리의 판정 보존", () => {
  it("끝 슬래시를 모두 떼고 같은 경로로 본다", () => {
    expect(canonicalSitePath("/about")).toBe(canonicalSitePath("/about/"));
    expect(canonicalSitePath("/about")).toBe(canonicalSitePath("/about////"));
    expect(isPublicCreativeRoute("/create/")).toBe(isPublicCreativeRoute("/create"));
    expect(isDiscoverPurposeRoute("/search//")).toBe(isDiscoverPurposeRoute("/search"));
  });

  it("경로 가운데의 슬래시는 건드리지 않는다", () => {
    expect(canonicalSitePath("/about//x/")).toBe(canonicalSitePath("/about//x"));
  });

  it("슬래시뿐인 경로는 루트로 본다", () => {
    expect(canonicalSitePath("///")).toBe(canonicalSitePath("/"));
  });
});
