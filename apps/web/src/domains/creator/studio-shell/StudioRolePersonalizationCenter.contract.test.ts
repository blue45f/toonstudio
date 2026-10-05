import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioRolePersonalizationCenter.tsx", import.meta.url),
  "utf8",
);
const projectHome = readFileSync(
  new URL("./StudioProjectLibraryManagementPage.tsx", import.meta.url),
  "utf8",
);
const personalizePanels = readFileSync(
  new URL("./StudioLibraryPersonalizePanels.tsx", import.meta.url),
  "utf8",
);

describe("role personalization center contract", () => {
  it("is reachable from the active Studio project home", () => {
    // R-3: 개인화 센터는 설정의 "내 직군 · 작업환경"으로 이관됐다. 라이브러리 딥링크는
    // 요약+이동 링크로 남고, 패널 조합 자체는 설정 진입점이 공개 배럴로 가져온다.
    expect(projectHome).toContain('id="role-personalization"');
    expect(projectHome).toContain("<StudioLibraryPersonalizeDetails />");
    expect(projectHome).toContain('href="/settings/role?tab=workspace"');
    expect(projectHome).not.toContain('import("./StudioLibraryPersonalizePanels")');
    expect(personalizePanels).toContain(
      'import { StudioRolePersonalizationCenter } from "./StudioRolePersonalizationCenter"',
    );
    expect(personalizePanels).toContain("<StudioRolePersonalizationCenter locale={locale} />");
  });

  it("connects onboarding, project mode, real work, privacy and AI", () => {
    expect(source).toContain("completeOnboarding");
    expect(source).toContain("프로젝트별 직무 모드");
    expect(source).toContain("rankCreatorRoleWork");
    expect(source).toContain("creatorRoleChecklist");
    expect(source).toContain("creatorRoleNotificationSettings");
    expect(source).toContain("creatorRoleAiTools");
    expect(source).toContain("saveVisibility");
    expect(source).toContain("roleWorkspace");
  });

  it("does not start protected role-workspace sync for signed-out Studio visitors", () => {
    expect(source).toContain('const workspaceSyncEnabled = status === "authenticated";');
    expect(source.match(/workspaceSyncEnabled,/gu)).toHaveLength(2);
  });

  it("keeps recommendations advisory and permissions separate", () => {
    expect(source).toContain("recommendCreatorTeamRoles");
    expect(source).toContain("자동 배정하거나 접근 권한을 바꾸지 않습니다");
    expect(source).toContain("팀 접근 권한과 승인 권한은 변경하지 않습니다");
  });
});
