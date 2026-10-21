import { describe, expect, it } from "vitest";

import { STUDIO_COMMAND_CATALOG } from "./studio-command-catalog";
import {
  buildCommandBundleExport,
  buildHardwareProfileExport,
  hardwareProfileCommandIds,
  serializeHardwareExport,
  STUDIO_COMMAND_BUNDLE_PRESETS,
  STUDIO_HARDWARE_PROFILE_PRESETS,
  STUDIO_STREAM_DECK_PRODUCTION_PROFILE,
  STUDIO_TOURBOX_DRAWING_PROFILE,
  validateHardwareProfile,
  type StudioCommandBundleDefinition,
} from "./studio-hardware-profiles";

import type { StudioCommandCatalogEntry } from "./studio-command-catalog";

function entry(
  partial: Partial<StudioCommandCatalogEntry> & Pick<StudioCommandCatalogEntry, "id">,
): StudioCommandCatalogEntry {
  return {
    category: partial.id.split(".")[0] ?? "",
    labels: [{ locale: "ko", label: `라벨 ${partial.id}` }],
    aliases: [],
    helpNodeId: `help/${partial.id.replace(/\./gu, "/")}`,
    origins: [{ source: "menu", nativeId: `menu/${partial.id}` }],
    ...partial,
  };
}

const FIXTURE: readonly StudioCommandCatalogEntry[] = [
  entry({ id: "edit.undo" }),
  entry({ id: "edit.redo" }),
  entry({
    id: "filter.legacy",
    origins: [{ source: "menu", nativeId: "filter/legacy", status: "dead" }],
  }),
];

describe("하드웨어 프로필 프리셋 — 실카탈로그 정합", () => {
  it("두 프리셋 모두 실카탈로그에서 검증 이슈가 없다", () => {
    for (const preset of STUDIO_HARDWARE_PROFILE_PRESETS) {
      expect(validateHardwareProfile(preset, STUDIO_COMMAND_CATALOG), preset.id).toEqual([]);
    }
  });

  it("묶음 프리셋은 실카탈로그에서 dropped 없이 전부 내보내진다", () => {
    for (const preset of STUDIO_COMMAND_BUNDLE_PRESETS) {
      const exported = buildCommandBundleExport(preset, STUDIO_COMMAND_CATALOG);
      expect(exported.dropped, preset.id).toEqual([]);
      expect(exported.commands.map((command) => command.id)).toEqual(preset.commandIds);
    }
  });

  it("Stream Deck 프리셋은 3×5=15키를 중복 없이 채운다", () => {
    const { slots, rows, columns } = STUDIO_STREAM_DECK_PRODUCTION_PROFILE;
    expect(slots).toHaveLength(rows * columns);
    expect(new Set(slots.map((key) => key.slot)).size).toBe(15);
    expect(new Set(slots.map((key) => key.commandId)).size).toBe(15);
    for (const key of slots) {
      expect(key.slot).toBe(`key-${key.row}-${key.column}`);
      expect(key.iconText.length).toBeGreaterThan(0);
    }
  });

  it("TourBox 프리셋은 다이얼 증감 쌍을 갖춘다", () => {
    const dial = STUDIO_TOURBOX_DRAWING_PROFILE.slots.find((slot) => slot.kind === "dial");
    expect(dial?.increaseCommandId).toBe("brush.size-increase");
    expect(dial?.decreaseCommandId).toBe("brush.size-decrease");
    expect(hardwareProfileCommandIds(STUDIO_TOURBOX_DRAWING_PROFILE)).toContain("edit.undo");
  });
});

describe("프로필 검증 — 낡은 프리셋 감지", () => {
  it("없는 명령·실행 불가 명령을 이슈로 보고한다", () => {
    const issues = validateHardwareProfile(
      {
        id: "stale",
        device: "tourbox",
        nameKo: "낡음",
        nameEn: "Stale",
        descriptionKo: "",
        slots: [
          { slot: "b1", kind: "button", labelKo: "x", labelEn: "x", commandId: "nope.nope" as never },
          { slot: "b2", kind: "button", labelKo: "y", labelEn: "y", commandId: "filter.legacy" },
          { slot: "b2", kind: "button", labelKo: "z", labelEn: "z", commandId: "edit.undo" },
        ],
      },
      FIXTURE,
    );
    expect(issues.map((issue) => issue.reason)).toEqual([
      "unknown-command",
      "not-executable",
      "duplicate-slot",
    ]);
  });
});

describe("프로필·묶음 내보내기", () => {
  it("프로필 내보내기는 참조 명령 매니페스트와 미해결 id를 함께 싣는다", () => {
    const exported = buildHardwareProfileExport(
      {
        id: "mini",
        device: "stream-deck",
        nameKo: "미니",
        nameEn: "Mini",
        descriptionKo: "",
        slots: [
          { slot: "key-1-1", kind: "key", labelKo: "취소", labelEn: "Undo", commandId: "edit.undo" },
          { slot: "key-1-2", kind: "key", labelKo: "?", labelEn: "?", commandId: "nope.nope" as never },
        ],
      },
      FIXTURE,
    );
    expect(exported.commands.map((command) => command.id)).toEqual(["edit.undo"]);
    expect(exported.unresolvedCommandIds).toEqual(["nope.nope"]);
    expect(JSON.parse(serializeHardwareExport(exported))).toEqual(exported);
  });

  it("묶음 내보내기는 unknown·not-executable·duplicate를 dropped로 명시한다", () => {
    const definition: StudioCommandBundleDefinition = {
      id: "mixed",
      nameKo: "혼합",
      nameEn: "Mixed",
      commandIds: ["edit.undo", "nope.nope" as never, "filter.legacy", "edit.undo"],
    };
    const exported = buildCommandBundleExport(definition, FIXTURE);
    expect(exported.commands.map((command) => command.id)).toEqual(["edit.undo"]);
    expect(exported.dropped).toEqual([
      { commandId: "nope.nope", reason: "unknown-command" },
      { commandId: "filter.legacy", reason: "not-executable" },
      { commandId: "edit.undo", reason: "duplicate" },
    ]);
    expect(JSON.parse(serializeHardwareExport(exported))).toEqual(exported);
  });
});
