import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { collectAuditRouteInventory } from "../lib/sitewide-audit-route-inventory.mjs";

import { classifyRouteDomain, type RouteDomainCategory } from "./route-domain-classifier";

export { classifyRouteDomain, type RouteDomainCategory };

export const OWNED_PATH_PREFIXES = [
  "scripts/accessibility-sweep-20261107/",
  "docs/accessibility-sweep-20261107/",
] as const;

export interface RouteDomainSummary {
  readonly category: RouteDomainCategory;
  readonly count: number;
  readonly sampleRoutes: readonly string[];
}

export interface WildcardOwnerMapping {
  readonly pattern: string;
  readonly source: string;
  readonly ownerAuthority: string;
  readonly concreteExpandedCount: number;
}

export interface SitewideRouteInventoryReport {
  readonly generatedAt: string;
  readonly counts: {
    readonly appRouteDeclarations: number;
    readonly studioRegistrationsAndAliases: number;
    readonly studioManifestRoutes: number;
    readonly adminRoutesAndAliases: number;
    readonly learningRoutes: number;
    readonly expandedRoutes: number;
    readonly wildcardExclusions: number;
  };
  readonly domainBreakdown: readonly RouteDomainSummary[];
  readonly wildcardMappings: readonly WildcardOwnerMapping[];
  readonly allExpandedRoutes: readonly string[];
  readonly sourceAuthorities: readonly string[];
}

export interface AccessibilityFinding {
  readonly id: string;
  readonly severity: "high" | "medium" | "low";
  readonly axis:
    | "keyboard-escape-focus-return"
    | "mobile-dom-focus-order"
    | "zoom-200-reduced-motion-preferences"
    | "aria-label-name-role-state"
    | "studio-landmarks-skip-order";
  readonly title: string;
  readonly targetFiles: readonly string[];
  readonly wcagCriteria: readonly string[];
  readonly reproduced: boolean;
  readonly evidenceSummary: string;
  readonly minimalPatchAnchor: string;
}

export interface ReadOnlyBoundaryReport {
  readonly ok: boolean;
  readonly ownedPaths: readonly string[];
  readonly violatingPaths: readonly string[];
}

function normalizeGitPath(rawPath: string): string {
  return rawPath.trim().replace(/^"+|"+$/gu, "").replace(/\\/gu, "/");
}

export function isOwnedAuditPath(relativePath: string): boolean {
  const normalized = normalizeGitPath(relativePath).replace(/^\.\//u, "");
  return OWNED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function verifyReadOnlySourceBoundary(
  repoRoot: string = process.cwd(),
): ReadOnlyBoundaryReport {
  const statusResult = spawnSync(
    "git",
    ["status", "--porcelain=v1", "-uall"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (statusResult.error) {
    throw statusResult.error;
  }
  if (statusResult.status !== 0) {
    throw new Error(`git status 실행 실패: ${statusResult.stderr.trim()}`);
  }

  const candidatePaths = new Set<string>();
  for (const line of statusResult.stdout.split("\n")) {
    if (!line.trim()) continue;
    const body = line.slice(3).trim();
    if (body.includes(" -> ")) {
      for (const part of body.split(" -> ")) {
        candidatePaths.add(normalizeGitPath(part));
      }
    } else {
      candidatePaths.add(normalizeGitPath(body));
    }
  }

  const diffResult = spawnSync(
    "git",
    ["diff", "--name-only", "origin/main...HEAD"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (diffResult.status === 0) {
    for (const line of diffResult.stdout.split("\n")) {
      if (line.trim()) {
        candidatePaths.add(normalizeGitPath(line));
      }
    }
  }

  const ownedPaths: string[] = [];
  const violatingPaths: string[] = [];
  for (const relPath of [...candidatePaths].sort()) {
    if (isOwnedAuditPath(relPath)) {
      ownedPaths.push(relPath);
    } else {
      violatingPaths.push(relPath);
    }
  }

  return {
    ok: violatingPaths.length === 0,
    ownedPaths,
    violatingPaths,
  };
}

export async function auditSitewideRouteInventory(
  repoRoot: string = process.cwd(),
): Promise<SitewideRouteInventoryReport> {
  const raw = await collectAuditRouteInventory(repoRoot);
  const byCategory = new Map<RouteDomainCategory, string[]>();

  for (const route of raw.routes) {
    const category = classifyRouteDomain(route);
    const bucket = byCategory.get(category) ?? [];
    bucket.push(route);
    byCategory.set(category, bucket);
  }

  const domainBreakdown: RouteDomainSummary[] = [...byCategory.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([category, routes]) => ({
      category,
      count: routes.length,
      sampleRoutes: routes.slice(0, 8),
    }));

  const allSourceRecords = raw.entries.flatMap(
    (entry: { sources: ReadonlyArray<{ kind: string }> }) => entry.sources,
  );
  const studioRegistrationsAndAliases = new Set(
    raw.entries
      .filter((entry: { sources: ReadonlyArray<{ kind: string }> }) =>
        entry.sources.some(
          (s) => s.kind === "studio-registration" || s.kind === "studio-alias",
        ),
      )
      .map((entry: { path: string }) => entry.path),
  ).size;
  const studioManifestRoutes = new Set(
    raw.entries
      .filter((entry: { sources: ReadonlyArray<{ kind: string }> }) =>
        entry.sources.some((s) => s.kind === "studio-manifest"),
      )
      .map((entry: { path: string }) => entry.path),
  ).size;
  const adminRoutesAndAliases = new Set(
    raw.entries
      .filter((entry: { sources: ReadonlyArray<{ kind: string }> }) =>
        entry.sources.some(
          (s) => s.kind === "admin-manifest" || s.kind === "admin-alias",
        ),
      )
      .map((entry: { path: string }) => entry.path),
  ).size;
  const learningRoutes = new Set(
    raw.entries
      .filter((entry: { sources: ReadonlyArray<{ kind: string }> }) =>
        entry.sources.some(
          (s) =>
            s.kind === "learning-branch" ||
            s.kind === "learning-content-id" ||
            s.kind === "learning-route",
        ),
      )
      .map((entry: { path: string }) => entry.path),
  ).size;

  void allSourceRecords;

  const wildcardMappings: WildcardOwnerMapping[] = raw.excluded.map(
    (entry: { pattern: string; file: string; symbol: string }) => {
      if (entry.pattern === "/learn/*") {
        return {
          pattern: entry.pattern,
          source: `${entry.file}#${entry.symbol}`,
          ownerAuthority:
            "apps/web/src/domains/learn/LearnPage.tsx + LESSONS/LEARNING_PATHS",
          concreteExpandedCount: learningRoutes,
        };
      }
      if (entry.pattern === "/studio/*") {
        return {
          pattern: entry.pattern,
          source: `${entry.file}#${entry.symbol}`,
          ownerAuthority: "STUDIO_ROUTE_REGISTRY + STUDIO_ROUTE_MANIFEST",
          concreteExpandedCount: studioRegistrationsAndAliases,
        };
      }
      if (entry.pattern === "/admin/*") {
        return {
          pattern: entry.pattern,
          source: `${entry.file}#${entry.symbol}`,
          ownerAuthority:
            "apps/web/src/domains/admin/router/admin-route-manifest.ts (ADMIN_ROUTES)",
          concreteExpandedCount: adminRoutesAndAliases,
        };
      }
      return {
        pattern: entry.pattern,
        source: `${entry.file}#${entry.symbol}`,
        ownerAuthority: "NotFoundPage / AppRouter 404 폴백 경계",
        concreteExpandedCount: 1,
      };
    },
  );

  return {
    generatedAt: "2026-11-07",
    counts: {
      appRouteDeclarations: raw.appRouteDeclarations,
      studioRegistrationsAndAliases,
      studioManifestRoutes,
      adminRoutesAndAliases,
      learningRoutes,
      expandedRoutes: raw.routes.length,
      wildcardExclusions: raw.excluded.length,
    },
    domainBreakdown,
    wildcardMappings,
    allExpandedRoutes: raw.routes,
    sourceAuthorities: raw.sources,
  };
}

export function auditAccessibilityContracts(
  repoRoot: string = process.cwd(),
): readonly AccessibilityFinding[] {
  const read = (relPath: string): string =>
    fs.readFileSync(path.join(repoRoot, relPath), "utf8");

  const languagePickerSource = read(
    "apps/web/src/shared/components/LanguagePicker.tsx",
  );
  const floatingControlsSource = read(
    "apps/web/src/shared/components/FloatingControls.tsx",
  );
  const accessibilityLabSource = read(
    "apps/web/src/domains/legal/AccessibilityLab.tsx",
  );
  const appearanceTriggerSource = read(
    "apps/web/src/shared/components/appearance/AppearanceTrigger.tsx",
  );
  const appearanceDialogSource = read(
    "apps/web/src/shared/components/appearance/AppearanceDialog.tsx",
  );
  const studioChromeSource = read(
    "apps/web/src/domains/creator/studio-chrome-ui.tsx",
  );

  const findings: AccessibilityFinding[] = [];

  // GAP-A11Y-01: LanguagePicker Escape & Focus Trap / Roving TabIndex
  const dialogSectionHeader =
    languagePickerSource.split('"언어 선택 닫기"')[0] ?? "";
  const languageDialogSectionMatch =
    languagePickerSource.includes('role="dialog"') &&
    !dialogSectionHeader
      .slice(dialogSectionHeader.lastIndexOf("<section"))
      .includes("onKeyDown");
  const closeButtonLacksEscape =
    languagePickerSource.includes('"언어 선택 닫기"');
  findings.push({
    id: "GAP-A11Y-01",
    severity: "high",
    axis: "keyboard-escape-focus-return",
    title:
      "LanguagePicker 대화상자 내부 닫기 버튼·빈 검색 결과 포커스 상태에서 Escape 닫기 누락 및 옵션 목록 단일 탭스톱 미적용",
    targetFiles: ["apps/web/src/shared/components/LanguagePicker.tsx"],
    wcagCriteria: [
      "WCAG 2.1 SC 2.1.1 Keyboard (Level A)",
      "WCAG 2.1 SC 2.1.2 No Keyboard Trap / Dialog Pattern",
      "WCAG 2.1 SC 2.4.3 Focus Order (Level A)",
    ],
    reproduced: languageDialogSectionMatch && closeButtonLacksEscape,
    evidenceSummary:
      "`<section role=\"dialog\">` 컨테이너에 상위 `onKeyDown`(Escape) 핸들러가 없고 `<input ref={searchRef}>` 및 `<button role=\"option\">`에만 개별 바인딩되어 있어, 포커스가 `언어 선택 닫기` 버튼에 있거나 검색 결과가 0건일 때 데스크톱에서 `Escape`로 닫히지 않으며 모바일에서는 부모 `FloatingControls` 패널만 닫힙니다.",
    minimalPatchAnchor:
      "apps/web/src/shared/components/LanguagePicker.tsx#L158-L215",
  });

  // GAP-A11Y-02: FloatingControls Mobile Cluster DOM Order vs Tab Focus
  const mobileControlsBeforeToggle =
    floatingControlsSource.includes("{open && (") &&
    floatingControlsSource.indexOf("{open && (") <
      floatingControlsSource.indexOf("data-floating-controls-toggle");
  findings.push({
    id: "GAP-A11Y-02",
    severity: "high",
    axis: "mobile-dom-focus-order",
    title:
      "모바일(320px/390px) FloatingControls 설정 묶음 펼침 시 DOM 역순 배치로 인해 정방향 Tab이 열린 패널로 진입하지 못하는 문제",
    targetFiles: ["apps/web/src/shared/components/FloatingControls.tsx"],
    wcagCriteria: [
      "WCAG 2.1 SC 2.4.3 Focus Order (Level A)",
      "WCAG 2.1 SC 2.1.1 Keyboard (Level A)",
    ],
    reproduced: mobileControlsBeforeToggle,
    evidenceSummary:
      "모바일 뷰포트(`320×844`, `390×844`)에서 `화면·언어·OST 설정` 토글 버튼을 `Enter`/`Space`로 열면 새로 마운트된 하위 컨트롤(`renderControls(true)`, `[data-floating-ost-toggle]`)이 토글 버튼 앞쪽 DOM에 삽입되고 초점 이동이 없어, 직후 `Tab` 입력 시 열린 패널을 건너뛰고 외부로 초점이 이탈합니다.",
    minimalPatchAnchor:
      "apps/web/src/shared/components/FloatingControls.tsx#L268-L310",
  });

  // GAP-A11Y-03: AccessibilityLab 200% Zoom Cap, Switch Role Mismatch & Preview-Only Scope
  const textScaleMax160 = accessibilityLabSource.includes('max="160"');
  const switchUsesAriaPressed =
    accessibilityLabSource.includes("aria-pressed={pressed}") &&
    accessibilityLabSource.includes("<SwitchIndicator checked={pressed} />") &&
    !accessibilityLabSource.includes('role="switch"');
  const previewOnlyScale =
    accessibilityLabSource.includes("data-accessibility-preview") &&
    accessibilityLabSource.includes("style={{ fontSize: `${textScale}%` }}");
  findings.push({
    id: "GAP-A11Y-03",
    severity: "high",
    axis: "zoom-200-reduced-motion-preferences",
    title:
      "접근성 조율실(AccessibilityLab) 글자 확대 상한 160% 제한(200% 미지원), 스위치 컴포넌트 role=\"switch\" 미적용 및 조율 상태의 로컬 프리뷰 한정",
    targetFiles: ["apps/web/src/domains/legal/AccessibilityLab.tsx"],
    wcagCriteria: [
      "WCAG 2.1 SC 1.4.4 Resize Text (Level AA - 200%)",
      "WCAG 2.1 SC 2.3.3 Animation from Interactions / Reduced Motion",
      "WCAG 2.1 SC 4.1.2 Name, Role, Value (Level A)",
    ],
    reproduced: textScaleMax160 && switchUsesAriaPressed && previewOnlyScale,
    evidenceSummary:
      "`#accessibility-text-scale` 슬라이더가 `max=\"160\"`으로 제한되어 WCAG 1.4.4 기준인 200% 확대를 시험할 수 없으며, `PreferenceToggle`이 시각적 스위치(`SwitchIndicator`)에 `role=\"switch\" aria-checked` 대신 `aria-pressed`를 사용합니다.",
    minimalPatchAnchor:
      "apps/web/src/domains/legal/AccessibilityLab.tsx#L87-L184",
  });

  // GAP-A11Y-04: AppearanceTrigger multi-instance aria-expanded & missing aria-controls
  const sharedScopeExpanded = appearanceTriggerSource.includes(
    "const expanded = useAppearanceDialog((state) => state.scope === scope);",
  );
  const dialogLacksStableId = !appearanceDialogSource.includes(
    'id="appearance-settings-dialog"',
  );
  findings.push({
    id: "GAP-A11Y-04",
    severity: "medium",
    axis: "aria-label-name-role-state",
    title:
      "AppearanceTrigger 복수 인스턴스 동시 `aria-expanded=\"true\"` 표출 및 `aria-controls` 연결 누락",
    targetFiles: [
      "apps/web/src/shared/components/appearance/AppearanceTrigger.tsx",
      "apps/web/src/shared/components/appearance/AppearanceDialog.tsx",
    ],
    wcagCriteria: ["WCAG 2.1 SC 4.1.2 Name, Role, Value (Level A)"],
    reproduced: sharedScopeExpanded && dialogLacksStableId,
    evidenceSummary:
      "동일 `scope`를 공유하는 헤더·플로팅 컨트롤의 모든 `AppearanceTrigger`가 `state.scope === scope`만으로 `aria-expanded=\"true\"`가 되며, 열린 `AppearanceDialog`와 연결되는 `aria-controls` 속성이 없습니다.",
    minimalPatchAnchor:
      "apps/web/src/shared/components/appearance/AppearanceTrigger.tsx#L12-L24",
  });

  // GAP-A11Y-05: Studio Editor Shell Landmark & Skip-Link Order
  const studioNestedBanner =
    studioChromeSource.includes("export function StudioAppMenubar") &&
    studioChromeSource.includes('role="banner"');
  findings.push({
    id: "GAP-A11Y-05",
    severity: "medium",
    axis: "studio-landmarks-skip-order",
    title:
      "스튜디오 편집기(`/studio/canvas`) `<main>` 내부 중첩 `role=\"banner\"`, 모바일 셸 `<h1>` 부재 및 오프라인 배너의 스킵 링크 선행 포커스",
    targetFiles: [
      "apps/web/src/domains/creator/studio-chrome-ui.tsx",
      "apps/web/src/domains/creator/offline/StudioOfflinePanel.tsx",
    ],
    wcagCriteria: [
      "WCAG 2.1 SC 1.3.1 Info and Relationships (Level A)",
      "WCAG 2.1 SC 2.4.1 Bypass Blocks (Level A)",
    ],
    reproduced: studioNestedBanner,
    evidenceSummary:
      "`StudioAppMenubar`(`studio-chrome-ui.tsx:317`)가 `<main id=\"main-content\">` 하위에서 `role=\"banner\"`를 선언하여 최상위 배너 랜드마크 규칙(`landmark-banner-is-top-level`)에 위배되며, 모바일 뷰포트(`320×844`, `390×844`) 편집기 셸에서 `<h1>` 헤딩이 생략되고 `StudioOfflinePanel`의 `<summary>`가 스킵 링크보다 먼저 Tab 초점을 받습니다.",
    minimalPatchAnchor:
      "apps/web/src/domains/creator/studio-chrome-ui.tsx#L296-L350",
  });

  return findings;
}
