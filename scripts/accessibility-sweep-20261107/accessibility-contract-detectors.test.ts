// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { auditAccessibilityContracts } from "./route-inventory-audit";

const LANGUAGE = "apps/web/src/shared/components/LanguagePicker.tsx";
const FLOATING = "apps/web/src/shared/components/FloatingControls.tsx";
const LAB = "apps/web/src/domains/legal/AccessibilityLab.tsx";
const TRIGGER = "apps/web/src/shared/components/appearance/AppearanceTrigger.tsx";
const DIALOG = "apps/web/src/shared/components/appearance/AppearanceDialog.tsx";
const STUDIO = "apps/web/src/domains/creator/studio-chrome-ui.tsx";

// 정적 탐지기의 입력 fixture다. 실제 UI의 키보드·포커스 동작 검증을 대신하지 않는다.
const brokenSources = {
  [LANGUAGE]: '<section role="dialog"><button aria-label="언어 선택 닫기" /></section>',
  [FLOATING]: '{open && (<section />)}<button data-floating-controls-toggle />',
  [LAB]: [
    '<input max="160" />',
    '<button aria-pressed={pressed}><SwitchIndicator checked={pressed} /></button>',
    '<section data-accessibility-preview style={{ fontSize: `${textScale}%` }} />',
  ].join("\n"),
  [TRIGGER]: "const expanded = useAppearanceDialog((state) => state.scope === scope);",
  [DIALOG]: '<section role="dialog" />',
  [STUDIO]: 'export function StudioAppMenubar() { return <header role="banner" />; }',
};

const fixedCases = [
  ["GAP-A11Y-01", {
    [LANGUAGE]: '<section role="dialog" onKeyDown={handleKeyDown}><button aria-label="언어 선택 닫기" /></section>',
  }],
  ["GAP-A11Y-02", {
    [FLOATING]: '<button data-floating-controls-toggle />{open && (<section />)}',
  }],
  ["GAP-A11Y-03", {
    [LAB]: '<input max="200" /><button role="switch" aria-checked={pressed}><SwitchIndicator checked={pressed} /></button>',
  }],
  ["GAP-A11Y-04", {
    [TRIGGER]: "const expanded = useAppearanceDialog((state) => state.triggerId === triggerId);",
    [DIALOG]: '<section role="dialog" id="appearance-settings-dialog" />',
  }],
  ["GAP-A11Y-05", {
    [STUDIO]: 'export function StudioAppMenubar() { return <header role="menubar" />; }',
  }],
] as const;

const roots: string[] = [];

function writeSources(root: string, sources: Readonly<Record<string, string>>): void {
  for (const [filename, source] of Object.entries(sources)) {
    const absolutePath = path.join(root, filename);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, source);
  }
}

function createFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "toon-a11y-detectors-"));
  roots.push(root);
  writeSources(root, brokenSources);
  return root;
}

function results(root: string): Record<string, boolean> {
  return Object.fromEntries(auditAccessibilityContracts(root).map(({ id, reproduced }) =>
    [id, reproduced]));
}

const allReproduced = Object.fromEntries(fixedCases.map(([id]) => [id, true]));

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("접근성 정적 탐지기 독립 회귀", () => {
  it.each(fixedCases)("%s 결함 패턴의 수정과 재도입을 구별한다", (id, fixedSources) => {
    const root = createFixture();
    expect(results(root)).toEqual(allReproduced);

    writeSources(root, fixedSources);
    expect(results(root)).toEqual({ ...allReproduced, [id]: false });

    writeSources(root, brokenSources);
    expect(results(root)).toEqual(allReproduced);
  });

  it("다섯 결함 패턴이 모두 수정된 소스는 결함 재현을 요구하지 않는다", () => {
    const root = createFixture();
    for (const [, fixedSources] of fixedCases) writeSources(root, fixedSources);
    expect(results(root)).toEqual(Object.fromEntries(fixedCases.map(([id]) => [id, false])));
  });

  it("필수 출처 파일이 없으면 정상 결과로 숨기지 않고 실패한다", () => {
    const root = createFixture();
    fs.unlinkSync(path.join(root, LANGUAGE));
    expect(() => auditAccessibilityContracts(root)).toThrow(/ENOENT/u);
  });
});
