import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { APP_I18N_NAMESPACES } from "../i18n-asset-manifest";
import { APP_I18N_ASSET_LOCALES } from "../i18n-locale-catalog";
import {
  checkI18nNamespaceContract,
  checkI18nNamespaceRegistry,
  scanInlineBilingualUsage,
  type I18nNamespaceSnapshot,
} from "../i18n-namespace-contract";

/**
 * Key-based i18n approach contract (apps/web/I18N_GUIDE.md).
 *
 * New surfaces and namespaces use exactly one approach: keys authored in
 * `apps/web/public/i18n/app/<namespace>/<locale>.json` with ko/en as the
 * canonical pair, resolved through `useT()`. The inline bilingual bridges
 * (`useBilingual`, `defineBilingualText`, …) are legacy-only.
 *
 * This test enforces the contract in three places:
 *  1. Every published app namespace satisfies the namespace contract.
 *  2. The namespace directories and APP_I18N_NAMESPACES name the same set.
 *  3. Files registered as new surfaces contain no inline bilingual usage.
 *     Registering a file here is part of adding a new surface — see the guide.
 */

const ASSET_DIRECTORY = path.resolve(process.cwd(), "apps/web/public", "i18n", "app");
const ASSET_LOCALES = [...APP_I18N_ASSET_LOCALES];

/**
 * Legacy exceptions to the contract. `contact`, `fortune` and `play` used to
 * publish only de/es/fr/ja/zh/zh-hant assets while ko/en lived in code (the
 * reversed direction). They now publish the ko/en canonical pair and every
 * shipped locale like any other namespace (2026-10-14, c5913641), so they left
 * this list as the guide requires (apps/web/I18N_GUIDE.md §5). The list is
 * empty and must stay empty: adding an exception here is forbidden, and a
 * namespace that regresses to the reversed shape fails the full-contract
 * assertion below instead of being exempted.
 */
const LEGACY_REVERSED_NAMESPACES: readonly string[] = [];

/**
 * Source files for surfaces created under the contract. A new surface adds
 * its files here in the same change; the scan then keeps inline bilingual
 * authoring out of them for good.
 */
const GUARDED_NEW_SURFACE_FILES = [
  "apps/web/src/app/AppShell.tsx",
  // 컷 감지·카드뉴스 가져오기 화면(panelImport 네임스페이스). 화면 문구는 키로만 쓰고, 사용자 값은 번역 원문이 아니라 {자리표시} 값으로만
  // 넘긴다(번역 서비스로 파일 이름·행 번호가 나가지 않게 하는 일은 panel-detect 의 시험이 따로 지킨다).
  "apps/web/src/domains/creator/panel-detect/panel-import-i18n.ts",
  "apps/web/src/domains/creator/panel-detect/ui/panel-import-copy.ts",
  "apps/web/src/domains/creator/panel-detect/ui/use-panel-t.ts",
  "apps/web/src/domains/creator/panel-detect/ui/PanelCanvasEditor.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelCardCutControls.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelCardFlow.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelCardPreview.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelCutInspector.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelCutList.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelDetectControls.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelImportEntry.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelImportWorkbench.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelJobStatus.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelReflowFlow.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelReflowPreview.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelReflowStep.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelReviewStep.tsx",
  "apps/web/src/domains/creator/panel-detect/ui/PanelSourceStep.tsx",
  // 3D 배경 편집기의 태그·컴포넌트·장면 정보 화면과 .skp 원본 이름·소재 이름 검색 안내(studio.bg3dScene 네임스페이스).
  "apps/web/src/domains/creator/bg3d/StudioBg3dAssetNameMatchHint.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dOutlinerComponentGroupRow.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dOutlinerComponentSection.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dOutlinerOrganizationPanel.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dOutlinerSceneInfoSection.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dOutlinerSkpSourceSection.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dOutlinerTagSection.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dSkpSidecarScopeNote.tsx",
  "apps/web/src/domains/creator/bg3d/studio-bg3d-organization-feedback.ts",
  // 분기형 컷툰 실험 화면(branchingCuttoon 네임스페이스). 화면 문구는 키로만 쓴다. 사용자가 쓴 제목·라벨은 번역 원문이 아니라
  // {자리표시} 값으로만 넘기고, 샘플 이야기도 키로 적는다.
  "apps/web/src/domains/creator/branching-cuttoon/branching-cuttoon-copy.ts",
  "apps/web/src/domains/creator/branching-cuttoon/branching-cuttoon-i18n.ts",
  "apps/web/src/domains/creator/branching-cuttoon/branching-cuttoon-sample.ts",
  "apps/web/src/domains/creator/branching-cuttoon/use-branching-t.ts",
  "apps/web/src/domains/creator/branching-cuttoon/BranchingChoiceRow.tsx",
  "apps/web/src/domains/creator/branching-cuttoon/BranchingCuttoonLabPage.tsx",
  "apps/web/src/domains/creator/branching-cuttoon/BranchingCuttoonPlayer.tsx",
  "apps/web/src/domains/creator/branching-cuttoon/BranchingCutRow.tsx",
  "apps/web/src/domains/creator/branching-cuttoon/BranchingIssuePanel.tsx",
  "apps/web/src/domains/creator/branching-cuttoon/BranchingNodeForm.tsx",
  "apps/web/src/domains/creator/branching-cuttoon/BranchingNodeList.tsx",
  "apps/web/src/domains/creator/branching-cuttoon/BranchingPlayerStates.tsx",
  "apps/web/src/domains/creator/branching-cuttoon/BranchingTransferPanel.tsx",
  // 캐릭터 앵커 연구실(anchorLab 네임스페이스). 화면 문구는 키로만 쓰고 파일 이름·앵커 id 같은 사용자 값은 {자리표시} 값으로만 넘긴다.
  "apps/web/src/domains/creator/anchor-consistency/anchor-lab-i18n.ts",
  "apps/web/src/domains/creator/anchor-consistency/anchor-lab-copy.ts",
  "apps/web/src/domains/creator/anchor-consistency/ui/AnchorCandidateList.tsx",
  "apps/web/src/domains/creator/anchor-consistency/ui/AnchorCandidatePanel.tsx",
  "apps/web/src/domains/creator/anchor-consistency/ui/AnchorCompareView.tsx",
  "apps/web/src/domains/creator/anchor-consistency/ui/AnchorDropZone.tsx",
  "apps/web/src/domains/creator/anchor-consistency/ui/AnchorExportPanel.tsx",
  "apps/web/src/domains/creator/anchor-consistency/ui/AnchorIdentityPanel.tsx",
  "apps/web/src/domains/creator/anchor-consistency/ui/AnchorLabPage.tsx",
  "apps/web/src/domains/creator/anchor-consistency/ui/AnchorLimitsNotice.tsx",
  "apps/web/src/domains/creator/anchor-consistency/ui/AnchorSetPanel.tsx",
  "apps/web/src/domains/creator/anchor-consistency/ui/AnchorShotPanel.tsx",
  "apps/web/src/domains/creator/anchor-consistency/ui/AnchorSlotCard.tsx",
];

function readNamespaceSnapshot(namespace: string): I18nNamespaceSnapshot {
  const directory = path.join(ASSET_DIRECTORY, namespace);
  const files = readdirSync(directory).filter((name) => name.endsWith(".json"));
  const locales = files.map((name) => name.slice(0, -".json".length)).sort();
  const readDictionary = (locale: string): Record<string, string> | undefined => {
    if (!locales.includes(locale)) return undefined;
    return JSON.parse(
      readFileSync(path.join(directory, `${locale}.json`), "utf8"),
    ) as Record<string, string>;
  };
  return { namespace, locales, ko: readDictionary("ko"), en: readDictionary("en") };
}

function rulesOf(violations: { rule: string }[]): string[] {
  return [...new Set(violations.map((violation) => violation.rule))].sort();
}

describe("i18n namespace contract checker", () => {
  const options = { assetLocales: ["ko", "en", "ja"] };

  it("accepts a namespace that follows the contract", () => {
    const snapshot: I18nNamespaceSnapshot = {
      namespace: "guide",
      locales: ["en", "ja", "ko"],
      ko: { "guide.title": "안내" },
      en: { "guide.title": "Guide" },
    };
    expect(checkI18nNamespaceContract(snapshot, options)).toEqual([]);
  });

  it("rejects the reversed shape: assets without the ko/en canonical pair", () => {
    const snapshot: I18nNamespaceSnapshot = {
      namespace: "contact",
      locales: ["de", "es", "fr", "ja", "zh", "zh-hant"],
    };
    const violations = checkI18nNamespaceContract(snapshot, {
      assetLocales: ["de", "es", "fr", "ja", "zh", "zh-hant"],
    });
    expect(rulesOf(violations)).toContain("missing-canonical-locale");
  });

  it("rejects a namespace that skips a shipped locale asset", () => {
    const snapshot: I18nNamespaceSnapshot = {
      namespace: "guide",
      locales: ["en", "ko"],
      ko: { "guide.title": "안내" },
      en: { "guide.title": "Guide" },
    };
    expect(rulesOf(checkI18nNamespaceContract(snapshot, options))).toContain(
      "missing-locale-asset",
    );
  });

  it("rejects keys that do not carry the namespace prefix", () => {
    const snapshot: I18nNamespaceSnapshot = {
      namespace: "guide",
      locales: ["en", "ja", "ko"],
      ko: { "guide.title": "안내", "home.title": "홈" },
      en: { "guide.title": "Guide", "home.title": "Home" },
    };
    expect(rulesOf(checkI18nNamespaceContract(snapshot, options))).toContain("key-prefix");
  });

  it("rejects a key authored in only one canonical locale", () => {
    const snapshot: I18nNamespaceSnapshot = {
      namespace: "guide",
      locales: ["en", "ja", "ko"],
      ko: { "guide.title": "안내", "guide.extra": "추가" },
      en: { "guide.title": "Guide" },
    };
    expect(rulesOf(checkI18nNamespaceContract(snapshot, options))).toContain(
      "canonical-key-parity",
    );
  });

  it("rejects registry drift in both directions", () => {
    const violations = checkI18nNamespaceRegistry(["guide", "toast"], ["guide", "search"]);
    expect(rulesOf(violations)).toEqual([
      "missing-namespace-directory",
      "unregistered-namespace",
    ]);
  });
});

describe("inline bilingual detector", () => {
  it("flags inline bilingual authoring in new-surface source", () => {
    const source = [
      'import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";',
      'const bt = useBilingual("checkout");',
      'const label = bt("결제하기", "Check out");',
      'const title = defineBilingualText("checkout", "title", "결제", "Checkout");',
    ].join("\n");
    expect(scanInlineBilingualUsage(source).map((usage) => usage.api)).toEqual([
      "useBilingual",
      "defineBilingualText",
    ]);
  });

  it("allows key-based resolution and non-authoring helpers", () => {
    const source = [
      'const t = useT();',
      'useBilingualI18nRevision();',
      'const label = t("guide.title");',
      'const formatted = formatI18nTemplate(t("guide.count"), { count: 3 });',
    ].join("\n");
    expect(scanInlineBilingualUsage(source)).toEqual([]);
  });

  it("honours comment lines and the i18n-exempt opt-out", () => {
    const source = [
      '// legacy note: useBilingual("old") was replaced by keys.',
      'const legacy = useBilingual("kept"); // i18n-exempt: legacy surface, see guide §5',
    ].join("\n");
    expect(scanInlineBilingualUsage(source)).toEqual([]);
  });
});

describe("published app namespaces follow the key-based contract", () => {
  const directoryNamespaces = readdirSync(ASSET_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it("keeps namespace directories and APP_I18N_NAMESPACES in sync", () => {
    expect(
      checkI18nNamespaceRegistry(directoryNamespaces, [...APP_I18N_NAMESPACES]),
    ).toEqual([]);
  });

  it("keeps every non-legacy namespace inside the contract", () => {
    const failures = new Map<string, string[]>();
    for (const namespace of directoryNamespaces) {
      if (LEGACY_REVERSED_NAMESPACES.includes(namespace)) continue;
      const violations = checkI18nNamespaceContract(readNamespaceSnapshot(namespace), {
        assetLocales: ASSET_LOCALES,
      });
      if (violations.length > 0) failures.set(namespace, rulesOf(violations));
    }
    expect(Object.fromEntries(failures)).toEqual({});
  });

  it("keeps the legacy exception list empty and honest", () => {
    // The exception list may only shrink and it is now empty; a new exception
    // is forbidden (I18N_GUIDE §5). Every exempted namespace must still be
    // reversed, so an entry that already satisfies the contract fails here.
    expect(LEGACY_REVERSED_NAMESPACES).toEqual([]);
    for (const namespace of LEGACY_REVERSED_NAMESPACES) {
      const violations = checkI18nNamespaceContract(readNamespaceSnapshot(namespace), {
        assetLocales: ASSET_LOCALES,
      });
      expect(rulesOf(violations)).toContain("missing-canonical-locale");
    }
  });

  it("publishes the unified ko/en pair for the namespaces that used to be reversed", () => {
    // Anti-regression for the three former exceptions: they must keep passing
    // the same contract as every other namespace, which the full-contract
    // assertion proves, and they must still be published at all.
    for (const namespace of ["contact", "fortune", "play"]) {
      expect(directoryNamespaces).toContain(namespace);
      const snapshot = readNamespaceSnapshot(namespace);
      expect(snapshot.ko, `${namespace} must publish ko`).toBeDefined();
      expect(snapshot.en, `${namespace} must publish en`).toBeDefined();
    }
  });
});

describe("new surfaces stay key-based", () => {
  it("finds no inline bilingual authoring in guarded new-surface files", () => {
    const findings = new Map<string, string[]>();
    for (const relativePath of GUARDED_NEW_SURFACE_FILES) {
      const source = readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
      const usages = scanInlineBilingualUsage(source);
      if (usages.length > 0) {
        findings.set(
          relativePath,
          usages.map((usage) => `${usage.api} (line ${usage.line})`),
        );
      }
    }
    expect(Object.fromEntries(findings)).toEqual({});
  });
});
