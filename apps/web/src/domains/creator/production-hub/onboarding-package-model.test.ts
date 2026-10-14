import { describe, expect, it } from "vitest";

import { productionRolePreset } from "./production-manuscript-competitive-model";
import { buildOnboardingPackage, buildOnboardingPackageText } from "./onboarding-package-model";

describe("onboarding package (T-3)", () => {
  it("assembles role rules from the preset contract without inventing permissions", () => {
    const preset = productionRolePreset("invite-line-art");
    const pkg = buildOnboardingPackage({ preset });
    expect(pkg.allowedActions).toEqual(preset.allowedActions);
    expect(pkg.blockedActions).toEqual(preset.blockedActions);
    expect(pkg.processScope.ko).toBe("선화 공정");
    expect(pkg.workingRules.length).toBeGreaterThan(0);
    expect(pkg.scheduleRules.length).toBeGreaterThan(0);
    expect(pkg.referenceGuide.length).toBeGreaterThan(0);
  });

  it("never fabricates reference cuts: empty supply stays missing", () => {
    const pkg = buildOnboardingPackage({ preset: productionRolePreset("invite-color") });
    expect(pkg.suppliedCuts).toEqual([]);
    expect(pkg.referenceCutsMissing).toBe(true);
    const withCuts = buildOnboardingPackage({
      preset: productionRolePreset("invite-color"),
      referenceCuts: [{ id: "cut-1", title: "1화 대표 채색 컷" }],
    });
    expect(withCuts.referenceCutsMissing).toBe(false);
    expect(withCuts.suppliedCuts[0]?.title).toBe("1화 대표 채색 컷");
  });

  it("links the brief only when a project detail id is known", () => {
    const noProject = buildOnboardingPackage({ preset: productionRolePreset("invite-lettering") });
    expect(noProject.briefHref).toBeNull();
    expect(noProject.firstSteps[0]?.ko).toContain("읽습니다");
    const withProject = buildOnboardingPackage({
      preset: productionRolePreset("invite-lettering"),
      projectTitle: "검수 원고",
      briefProjectId: "project-a",
    });
    expect(withProject.briefHref).toBe("/production/projects/project-a/production");
    expect(withProject.projectTitle).toBe("검수 원고");
    expect(withProject.briefFields.find((field) => field.label.ko === "작품")?.value).toBe("검수 원고");
    // 모르는 칸(첫 작업·마감)은 지어내지 않고 빈 값으로 남긴다.
    expect(withProject.briefFields.find((field) => field.label.ko === "마감")?.value).toBe("");
  });

  it("covers every invite preset with package content", () => {
    const ids = [
      "invite-producer",
      "invite-story-writer",
      "invite-storyboard",
      "invite-line-art",
      "invite-color",
      "invite-lettering",
      "invite-external-reviewer",
    ] as const;
    for (const id of ids) {
      const pkg = buildOnboardingPackage({ preset: productionRolePreset(id) });
      expect(pkg.workingRules.length, id).toBeGreaterThan(0);
      expect(pkg.referenceGuide.length, id).toBeGreaterThan(0);
      expect(pkg.scheduleRules.length, id).toBeGreaterThan(0);
      expect(pkg.firstSteps.length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it("builds copyable text that carries the invite link, rules, and brief", () => {
    const pkg = buildOnboardingPackage({
      preset: productionRolePreset("invite-external-reviewer"),
      briefProjectId: "project-a",
    });
    const text = buildOnboardingPackageText(pkg, "ko", "https://example.test/team/people/join#invite=x");
    expect(text).toContain("https://example.test/team/people/join#invite=x");
    expect(text).toContain("외부 검토자");
    expect(text).toContain("원본 다운로드");
    expect(text).toContain("일정 규칙");
    expect(text).toContain("/production/projects/project-a/production");
    expect(text).toContain("연결된 참조 컷이 아직 없습니다");
  });
});
