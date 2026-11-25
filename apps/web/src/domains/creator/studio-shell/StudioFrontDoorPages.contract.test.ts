import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioFrontDoorPages.tsx", import.meta.url),
  "utf8",
);
const illustratedSurfaceCss = readFileSync(
  new URL("./studio-illustrated-project-surfaces.css", import.meta.url),
  "utf8",
);
const projectHome = readFileSync(
  new URL("./StudioProjectLibraryManagementPage.tsx", import.meta.url),
  "utf8",
);
const projectStartPanel = readFileSync(
  new URL("./StudioProjectStartPanel.tsx", import.meta.url),
  "utf8",
);
const personalizePanels = readFileSync(
  new URL("./StudioLibraryPersonalizePanels.tsx", import.meta.url),
  "utf8",
);

describe("Studio front door UX contract", () => {
  it("keeps the project library home and integrates role and task-first panels", () => {
    // R-3: 개인화 패널은 설정의 "내 직군 · 작업환경" 진입점으로 이관됐고, 라이브러리에는
    // 딥링크를 지키는 요약+이동 링크가 남는다. 패널 조합(역할·시작)은 그대로 유지된다.
    expect(projectHome).toContain('id="role-personalization"');
    // 시작 안내와 개인화는 활성 목록에서만 함께 노출하며, 안내는 기본 접힘을 유지한다.
    expect(projectHome).toMatch(
      /\{controller\.view === "active" \? \([\s\S]*?<details[^>]*>[\s\S]*?<StudioCreatorLobby controller=\{controller\} \/>[\s\S]*?<\/details>[\s\S]*?<StudioLibraryPersonalizeDetails \/>[\s\S]*?\) : null\}/,
    );
    const activeGuideTag = projectHome.match(
      /\{controller\.view === "active" \? \([\s\S]*?(<details[^>]*>)/,
    )?.[1];
    expect(activeGuideTag).toBeDefined();
    expect(activeGuideTag).not.toMatch(/\sopen(?:[\s=>])/);
    expect(projectHome).toContain('href="/settings/role?tab=workspace"');
    expect(personalizePanels).toContain(
      'import { StudioProjectStartPanel } from "./StudioProjectStartPanel"',
    );
    expect(personalizePanels).toContain(
      'import { StudioRoleWorkspacePanel } from "./StudioRoleWorkspacePanel"',
    );

    const rolePanelIndex = personalizePanels.indexOf("<StudioRoleWorkspacePanel");
    const startPanelIndex = personalizePanels.indexOf("<StudioProjectStartPanel", rolePanelIndex);

    expect(rolePanelIndex).toBeGreaterThanOrEqual(0);
    expect(startPanelIndex).toBeGreaterThan(rolePanelIndex);
    expect(projectStartPanel).toContain("기존 프로젝트는 아래에서 바로 이어서 작업할 수 있습니다");
  });

  it("starts from what the user currently has instead of asking for expertise", () => {
    expect(projectStartPanel).toContain("지금 무엇을 가지고 있나요?");
    expect(projectStartPanel).toContain("아이디어만 있어요");
    expect(projectStartPanel).toContain("대본이나 콘티가 있어요");
    expect(projectStartPanel).toContain("그리던 파일이 있어요");
    expect(projectStartPanel).toContain("팀 프로젝트를 시작해요");
    expect(projectStartPanel).toContain("샘플로 먼저 둘러볼게요");
    expect(projectStartPanel).not.toContain("초보 모드");
    expect(projectStartPanel).not.toContain("전문가 모드");
  });

  it("connects every starting intent to a real product destination", () => {
    expect(projectStartPanel).toContain("/studio/new?kind=webtoon&template=webtoon-vertical");
    expect(projectStartPanel).toContain("/story-lab");
    expect(projectStartPanel).toContain("/studio/import");
    expect(projectStartPanel).toContain("/production");
    expect(projectStartPanel).toContain("/production/projects/sample-project/overview");
  });

  it("shows the complete project flow and save-trust language", () => {
    expect(projectStartPanel).toContain("<StudioTaskFlow");
    expect(projectStartPanel).toContain("2D·3D 제작");
    expect(projectStartPanel).toContain("협업");
    expect(projectStartPanel).toContain("검토");
    expect(projectStartPanel).toContain("연재");
    expect(projectStartPanel).toContain("<WorkflowTrustBadge state=\"device-saved\"");
  });

  it("does not silently flatten unsupported imported objects", () => {
    expect(source).toContain("지원하지 않는 객체는 몰래 평탄화하지 않습니다");
    expect(source).toContain("완전 보존, 편집 가능한 변환, 래스터 변환과 제외 항목");
    expect(source).toContain("원본 파일을 별도로 보관합니다");
  });

  it("keeps long labels and calls to action visible on narrow screens", () => {
    expect(source).toContain("min-w-0");
    expect(source).toContain("break-words");
    expect(source).toContain("w-full min-w-0");
    expect(projectStartPanel).toContain("min-w-0");
    expect(projectStartPanel).toContain("break-words");
    expect(source).not.toContain("truncate text-sm");
  });

  it("uses recoverable notices instead of passive explanatory panels", () => {
    expect(source).toContain("<RecoverableActionNotice");
    // 원본 보존 약속은 가져오기 페이지의 복구 가능 안내가 맡는다.
    expect(source).toContain("원본 파일을 별도로 보관합니다");
  });

  it("keeps a single studio home surface instead of a duplicate front-door home", () => {
    // 홈은 프로젝트 라이브러리+로비 하나로 단일화됐다. 이 파일에는 실제 라우트가 쓰는
    // 가져오기·소재 페이지만 남고, 중복 홈·새 작품 표면은 되살아나지 않는다.
    expect(source).not.toContain("export function StudioHomePage");
    expect(source).not.toContain("export function StudioNewPage");
    expect(source).toContain("export function StudioImportPage");
    expect(source).toContain("export function StudioAssetsPage");
    // WCAG 2.5.8 / 터치 타깃: 브레드크럼 링크가 16px로 축소되지 않고 44×44px 히트 영역을 보장한다.
    expect(source).toContain("min-h-11 min-w-11");
  });

  it("polishes /studio/import breadcrumb and 3 import cards without raw colors or transition-all", () => {
    // 원시 색 토큰 및 transition-all 0건
    expect(source).not.toMatch(/\btransition-all\b/u);
    expect(source).not.toMatch(
      /\b(?:bg|text|border|ring|from|to|via|shadow|accent)-(?:white|black|slate|amber|rose|sky|emerald|violet|fuchsia|red|green|blue|yellow|orange|indigo|purple|pink|cyan|teal|zinc|gray|neutral)(?:-[0-9]{2,3})?(?:\/[0-9]+)?|\b(?:bg|text|border)-\[#[0-9a-fA-F]{3,8}\]/u,
    );

    // 브레드크럼 span[aria-current="page"]에 왼쪽 주황 커서처럼 보이는 inset 2px 바가 붙지 않도록 링크/버튼에만 한정한다.
    expect(illustratedSurfaceCss).toContain('a[aria-current="page"], button[aria-current="page"]');
    expect(illustratedSurfaceCss).not.toMatch(/:where\(\[aria-current="page"\]/u);
    expect(source).toContain('data-studio-import-breadcrumb="true"');
    expect(source).toContain("select-none text-fg-3/60");
    expect(source).toContain("focus-visible:outline-accent");

    // 가져오기 카드 3종 촉각 hover/press · 44px 터치 · 한글 어절 줄바꿈
    expect(source).toContain('data-studio-import-card="true"');
    expect(source).toContain("transition-[background-color,border-color,color,transform] duration-150");
    expect(source).toContain("active:scale-[0.99]");
    expect(source).toContain("[word-break:keep-all]");
  });
});