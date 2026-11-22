import { describe, expect, it } from "vitest";

import { DEFAULT_SHORTCUT_BINDINGS } from "../workspace-layout/shortcut-bindings";
import { RADIAL_DIAL_CONTEXT_IDS } from "./studio-radial-quick-dial-engine";
import {
  BUILTIN_SHORTCUT_AND_DIAL_PROFILES,
  STUDIO_SHORTCUT_PROFILE_SCHEMA_VERSION,
  autoResolveShortcutProfileConflicts,
  bridgeBindingsToShortcutProfile,
  createDefaultShortcutAndDialProfile,
  detectShortcutProfileConflicts,
  diffShortcutProfiles,
  exportShortcutProfileToJson,
  extractShortcutBindingsFromProfile,
  importShortcutProfileFromJson,
  normalizeProfileShortcutChord,
} from "./studio-shortcut-profile-engine";

describe("studio-shortcut-profile-engine", () => {
  it("내장 프로필 3종은 모두 중복 충돌이 0건이고 5개 컨텍스트×8슬롯을 유효하게 갖춘다", () => {
    expect(BUILTIN_SHORTCUT_AND_DIAL_PROFILES).toHaveLength(3);
    for (const profile of BUILTIN_SHORTCUT_AND_DIAL_PROFILES) {
      const report = detectShortcutProfileConflicts(profile);
      expect(report.errorCount).toBe(0);
      expect(report.hasBlockingConflicts).toBe(false);
      for (const ctxId of RADIAL_DIAL_CONTEXT_IDS) {
        expect(profile.dialContexts[ctxId]).toHaveLength(8);
      }
    }
  });

  it("단축키 정규화·중복 단축키·퀵 다이얼 호출키 충돌·브라우저 예약키 경고를 정확히 분리 감지한다", () => {
    expect(normalizeProfileShortcutChord("shift+ctrl+z")).toBe("Mod+Shift+Z");
    expect(normalizeProfileShortcutChord("Option+q")).toBe("Alt+Q");
    expect(normalizeProfileShortcutChord("Ctrl++")).toBe("Mod++");
    expect(normalizeProfileShortcutChord("   ")).toBe("");

    const base = createDefaultShortcutAndDialProfile({
      shortcutOverrides: {
        "tool-fill": "B", // tool-pen("B")와 중복
        "tool-crop": "Mod+W", // 브라우저 탭 닫기 예약키 경고
      },
      dialTriggerShortcut: "H", // flip-canvas("H")와 다이얼 호출키 충돌
    });

    const report = detectShortcutProfileConflicts(base);
    expect(report.errorCount).toBe(2);
    expect(report.warningCount).toBe(1);
    expect(report.hasBlockingConflicts).toBe(true);
    expect(report.conflictedActionIds.has("tool-pen")).toBe(true);
    expect(report.conflictedActionIds.has("tool-fill")).toBe(true);
    expect(report.conflictedActionIds.has("radial-quick-dial")).toBe(true);

    const resolved = autoResolveShortcutProfileConflicts(base);
    const resolvedReport = detectShortcutProfileConflicts(resolved);
    expect(resolvedReport.errorCount).toBe(0);
    expect(resolved.shortcuts["tool-fill"]).toBe("G");
    expect(resolved.dialTriggerShortcut).toBe("Alt+Q");
  });

  it("프로필 JSON 직렬화/역직렬화가 모든 단축키·데드존·히스테리시스·5개 컨텍스트 슬롯을 무손실 왕복한다", () => {
    const custom = createDefaultShortcutAndDialProfile({
      id: "artist-custom-01",
      name: "작가 전용 펜터치",
      descriptionKo: "마감용 단축키 및 8방향 다이얼",
      shortcutOverrides: { "flip-canvas": "Shift+F" },
      dialTriggerShortcut: "Alt+D",
      dialDeadzonePx: 24,
      dialHysteresisDeg: 8,
      dialContexts: {
        lettering: [
          "tool-lettering",
          "lettering-overflow-check",
          "lettering-batch-edit",
          "lettering-sfx-place",
          "toggle-webtoon-guides",
          "actual-size-view",
          "tool-select",
          "undo",
        ],
      },
    });

    const json = exportShortcutProfileToJson(custom);
    const imported = importShortcutProfileFromJson(json);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    expect(imported.warnings).toEqual([]);
    expect(imported.profile.schemaVersion).toBe(STUDIO_SHORTCUT_PROFILE_SCHEMA_VERSION);
    expect(imported.profile.id).toBe("artist-custom-01");
    expect(imported.profile.name).toBe("작가 전용 펜터치");
    expect(imported.profile.dialTriggerShortcut).toBe("Alt+D");
    expect(imported.profile.dialDeadzonePx).toBe(24);
    expect(imported.profile.dialHysteresisDeg).toBe(8);
    expect(imported.profile.dialContexts.lettering[1]).toBe("lettering-overflow-check");

    const diff = diffShortcutProfiles(createDefaultShortcutAndDialProfile(), imported.profile);
    expect(diff.changedShortcutIds).toContain("flip-canvas");
    expect(diff.dialTriggerChanged).toBe(true);
    expect(diff.dialDeadzoneChanged).toBe(true);
    expect(diff.dialHysteresisChanged).toBe(true);
    expect(diff.changedDialSlots.length).toBeGreaterThanOrEqual(2);
  });

  it("손상·버전 불일치·과대 크기 JSON을 명확한 한글 오류로 차단하고 일부 손상 슬롯은 경고와 함께 안전 복구한다", () => {
    const emptyRes = importShortcutProfileFromJson("   ");
    expect(emptyRes.ok).toBe(false);
    if (!emptyRes.ok) expect(emptyRes.errorCode).toBe("empty-input");

    const hugeRes = importShortcutProfileFromJson("x".repeat(100_005));
    expect(hugeRes.ok).toBe(false);
    if (!hugeRes.ok) expect(hugeRes.errorCode).toBe("payload-too-large");

    const badJson = importShortcutProfileFromJson("{not-json");
    expect(badJson.ok).toBe(false);
    if (!badJson.ok) expect(badJson.errorCode).toBe("invalid-json");

    const arrayRoot = importShortcutProfileFromJson("[]");
    expect(arrayRoot.ok).toBe(false);
    if (!arrayRoot.ok) expect(arrayRoot.errorCode).toBe("invalid-root");

    const wrongVersion = importShortcutProfileFromJson(JSON.stringify({ schemaVersion: 99 }));
    expect(wrongVersion.ok).toBe(false);
    if (!wrongVersion.ok) expect(wrongVersion.errorCode).toBe("unsupported-version");

    const partialCorrupt = importShortcutProfileFromJson(
      JSON.stringify({
        schemaVersion: 1,
        name: "부분 손상 프로필",
        shortcuts: { "unknown-action": "K", "tool-pen": 123 },
        dialContexts: {
          drawing: ["undo", "invalid-slot-id", "tool-fill"],
        },
      }),
    );
    expect(partialCorrupt.ok).toBe(true);
    if (!partialCorrupt.ok) return;
    expect(partialCorrupt.warnings.length).toBeGreaterThanOrEqual(3);
    expect(partialCorrupt.profile.dialContexts.drawing).toHaveLength(8);
    expect(partialCorrupt.profile.dialContexts.drawing[0]).toBe("undo");
  });

  it("ShortcutCustomizer 간이 바인딩과 통합 프로필 간 양방향 브리지가 정상 동작한다", () => {
    const base = createDefaultShortcutAndDialProfile();
    const modifiedBindings = DEFAULT_SHORTCUT_BINDINGS.map((item) =>
      item.commandId === "brush" ? { ...item, keys: "Ctrl+K" } : item,
    );

    const bridged = bridgeBindingsToShortcutProfile(modifiedBindings, base);
    expect(bridged.shortcuts["tool-pen"]).toBe("Mod+K");

    const extracted = extractShortcutBindingsFromProfile(bridged, DEFAULT_SHORTCUT_BINDINGS);
    expect(extracted.find((b) => b.commandId === "brush")?.keys).toBe("Ctrl+K");
  });
});
