// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/lib/i18n";
import {
  ACCESSIBILITY_AUDIT_PRESETS, StudioErgonomicsMasterPanel, auditStudioAccessibilityBudget,
  createShortcutBindingsFromPreset, exportShortcutProfileJson, importShortcutProfileJson,
  normalizeShortcutChord, remapShortcutCommand, SHORTCUT_PROFILE_FORMAT,
  type ShortcutOsPlatform,
} from "./index";

beforeEach(() => useI18n.setState({ lang: "ko" }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (reason: Error) => void } {
  let resolve = (): void => {};
  let reject = (_reason: Error): void => {};
  const promise = new Promise<void>((accept, deny) => { resolve = accept; reject = deny; });
  return { promise, resolve, reject };
}

function profileJson(profileName = "  원문 이름 👩🏽‍🎨  ", platform: ShortcutOsPlatform = "mac"): string {
  return exportShortcutProfileJson({
    format: SHORTCUT_PROFILE_FORMAT, schemaVersion: 1, profileName,
    presetId: "toonstudio", platform, exportedAtIso: "2026-11-25T00:00:00.000Z",
    bindings: remapShortcutCommand(createShortcutBindingsFromPreset("toonstudio"), "brush", "Mod+Plus", platform),
  });
}

describe("단축키·배치·가독성 예제의 경계", () => {
  it.each<ShortcutOsPlatform>(["mac", "windows", "ipad"])("%s의 Plus 키는 정규화와 JSON 왕복에서 보존된다", (platform) => {
    const first = normalizeShortcutChord("Mod+Shift+Plus", platform);
    expect(first.valid).toBe(true);
    expect(normalizeShortcutChord(first.canonical, platform)).toMatchObject({ valid: true, canonical: first.canonical, platformKey: first.platformKey, key: "+" });
    const imported = importShortcutProfileJson(profileJson(undefined, platform));
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.messageKo);
    expect(imported.conflicts.hasBlockingConflicts).toBe(false);
    expect(normalizeShortcutChord(imported.profile.bindings.brush, platform).valid).toBe(true);
    expect(normalizeShortcutChord("Mod++Z", platform).valid).toBe(false);
    expect(normalizeShortcutChord("constructor", platform).valid).toBe(false);
  });

  it("길고 공백·이모지가 포함된 프로필 이름을 자르지 않는다", () => {
    const name = "  " + "한글👩🏽‍🎨".repeat(30) + "  ";
    const imported = importShortcutProfileJson(profileJson(name));
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.messageKo);
    expect(imported.profile.profileName).toBe(name);
    expect(JSON.parse(exportShortcutProfileJson(imported.profile)).profileName).toBe(name);
  });

  it("JSON 크기 한도는 UTF-8 바이트를 기준으로 거부한다", () => {
    const raw = profileJson("한".repeat(22_000));
    expect(raw.length).toBeLessThan(64_000);
    const result = importShortcutProfileJson(raw);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected byte limit rejection");
    expect(result.errorCode).toBe("payload-too-large");
  });

  it("프리셋 판정은 DOM·W3C 전체 인증·임상 검증 결과가 아니다", () => {
    const report = auditStudioAccessibilityBudget(ACCESSIBILITY_AUDIT_PRESETS["atelier-aaa"].input);
    expect(report.passesProvidedAaaChecks).toBe(true);
    expect(report.passesW3cAaa).toBe(false);
    expect(report.passesW3cAa).toBe(false);
    expect(report.domAudited).toBe(false);
    expect(report.clinicalAssessmentPerformed).toBe(false);
    render(<StudioErgonomicsMasterPanel initialTab="accessibility" />);
    expect(screen.getByTestId("ergonomics-example-scope").textContent).toContain("OS·기기를 탐지하지 않으며");
    expect(screen.getByText(/앱 전체의 WCAG 준수나 의학적 효과를 인증하지 않습니다/)).toBeTruthy();
  });

  it("프로필 콜백 대기·거부·동기 예외에도 원문 JSON과 기존 키맵을 유지한다", async () => {
    const gate = deferred();
    const onChanged = vi.fn().mockImplementationOnce(() => gate.promise).mockImplementationOnce(() => { throw new Error("sync rejected"); }).mockResolvedValue(undefined);
    render(<StudioErgonomicsMasterPanel onShortcutProfileChanged={onChanged} />);
    const json = profileJson();
    const textarea = screen.getByTestId("textarea-shortcut-json") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: json } });
    const button = screen.getByTestId("btn-import-json");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("cmd-kbd-brush").textContent).toBe("B");
    expect(screen.queryByTestId("json-import-notice")).toBeNull();
    await act(async () => gate.reject(new Error("async rejected")));
    expect(textarea.value).toBe(json);
    expect(screen.getByRole("alert").textContent).toContain("async rejected");
    fireEvent.click(screen.getByRole("button", { name: "같은 입력으로 다시 시도" }));
    expect(screen.getByRole("alert").textContent).toContain("sync rejected");
    fireEvent.click(screen.getByRole("button", { name: "같은 입력으로 다시 시도" }));
    await waitFor(() => expect(screen.getByTestId("json-import-notice").textContent).toContain("예제 가져오기 완료"));
    expect(onChanged).toHaveBeenCalledTimes(3);
    expect(onChanged.mock.calls[2]).toEqual(onChanged.mock.calls[0]);
    fireEvent.click(screen.getByTestId("btn-export-json"));
    expect(JSON.parse(textarea.value).profileName).toBe("  원문 이름 👩🏽‍🎨  ");
  });

  it("배치 콜백 대기 중 중복을 막고 실패 재시도 전에는 미러 상태를 바꾸지 않는다", async () => {
    const gate = deferred();
    const onPlan = vi.fn().mockImplementationOnce(() => gate.promise).mockResolvedValue(undefined);
    render(<StudioErgonomicsMasterPanel initialTab="handedness" onHandednessPlanChanged={onPlan} />);
    const before = screen.getByTestId("metric-mirror-state").textContent;
    fireEvent.click(screen.getByTestId("hand-mode-left-handed"));
    fireEvent.click(screen.getByTestId("hand-mode-left-handed"));
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("metric-mirror-state").textContent).toBe(before);
    await act(async () => gate.reject(new Error("plan rejected")));
    fireEvent.click(screen.getByRole("button", { name: "같은 입력으로 다시 시도" }));
    await waitFor(() => expect(screen.getByTestId("metric-mirror-state").textContent).toContain("우측 배치 예제"));
    expect(onPlan.mock.calls[1]).toEqual(onPlan.mock.calls[0]);
  });

  it("가독성 콜백 대기·거부에는 이전 판정을 유지하고 같은 예제만 재시도한다", async () => {
    const gate = deferred();
    const onAudit = vi.fn().mockImplementationOnce(() => gate.promise).mockResolvedValue(undefined);
    render(<StudioErgonomicsMasterPanel initialTab="accessibility" onAccessibilityAudited={onAudit} />);
    fireEvent.click(screen.getByTestId("a11y-preset-compact-violation"));
    fireEvent.click(screen.getByTestId("a11y-preset-compact-violation"));
    expect(onAudit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("a11y-grade-pill").textContent).toContain("AAA");
    await act(async () => gate.reject(new Error("audit rejected")));
    fireEvent.click(screen.getByRole("button", { name: "같은 입력으로 다시 시도" }));
    await waitFor(() => expect(screen.getByTestId("a11y-grade-pill").textContent).toContain("FAIL"));
    expect(onAudit.mock.calls[1]).toEqual(onAudit.mock.calls[0]);
  });
});
