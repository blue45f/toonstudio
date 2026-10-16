// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hasErrorActionGuidance, isFailureCopy, violatesErrorPattern } from "@/shared/language/error-pattern";
import { findToneViolations, registersInFlow } from "@/shared/language/tone-policy";

import { StudioBg3dLensShiftControls } from "./StudioBg3dLensShiftControls";
import { StudioBg3dRoomBuilderPanel } from "./StudioBg3dRoomBuilderPanel";
import { StudioBg3dWebtoonBackgroundPicker } from "./StudioBg3dWebtoonBackgroundPicker";
import {
  describeStudioBg3dBuildNotice,
  STUDIO_BG3D_AUTO_CUTAWAY_LABEL,
  STUDIO_BG3D_BUILD_FAILED_NOTICE,
  STUDIO_BG3D_FOCUS_BUILT_LABEL,
  STUDIO_BG3D_PICKER_CUTAWAY_HELP,
  STUDIO_BG3D_PICKER_INTRO,
  STUDIO_BG3D_RESTORE_WALLS_LABEL,
  STUDIO_BG3D_ROOM_PANEL_CUTAWAY_HELP,
  type StudioBg3dBuildNoticeInput,
} from "./studio-bg3d-build-notice";
import { STUDIO_BG3D_CUT_ASPECT_LINKED_HINT, STUDIO_BG3D_CUT_ASPECT_MEMO_HINT } from "./studio-bg3d-cut-aspect-link";
import { STUDIO_BG3D_LENS_SHIFT_SIGN_HELP, STUDIO_BG3D_LENS_SHIFT_USAGE_HELP } from "./studio-bg3d-lens-shift-help";
import { getStudioBg3dRoomPreset, planStudioBg3dRoomBuild } from "./studio-bg3d-room-builder";

import type { BgPrimitive } from "../studio-background-3d-metadata";

afterEach(cleanup);

// ── 말투·오류 문형 가드 ───────────────────────────────────────────────────────
// shared/language 의 두 가드(tone-policy 의 해요체 통일, error-pattern 의 "원인 + 다음 행동")는 사전(JSON)만
// 훑는다 — 컴포넌트에 직접 적은 문구는 지나쳐서, 새 문구 중 여섯이 한 단락에서 해요체와 합니다체를 섞었고
// 실패 안내에는 다음 행동이 없었다. 새 문구를 이 목록에 모아 두 가드를 직접 돌린다.

const NOTICE_SAMPLES: StudioBg3dBuildNoticeInput[] = [
  { label: "교실", objectCount: 99, hiddenWalls: { ids: [], walls: [] }, wallsRestored: false, anchorX: 0 },
  { label: "복도", objectCount: 39, hiddenWalls: { ids: ["a"], walls: [{ label: "앞벽", pieces: 13 }] }, wallsRestored: false, anchorX: 0 },
  { label: "복도", objectCount: 39, hiddenWalls: { ids: ["a"], walls: [{ label: "앞벽", pieces: 13 }] }, wallsRestored: true, anchorX: 0 },
  {
    label: "거리",
    objectCount: 96,
    hiddenWalls: { ids: ["a", "b"], walls: [{ label: "앞벽", pieces: 1 }, { label: "오른벽", pieces: 1 }] },
    wallsRestored: false,
    anchorX: 424.4,
  },
  { label: "방", objectCount: 60, hiddenWalls: { ids: [], walls: [] }, wallsRestored: false, anchorX: 7 },
];

const NEW_COPY: ReadonlyArray<readonly [string, string]> = [
  ["선택기 소개", STUDIO_BG3D_PICKER_INTRO],
  ["선택기 단면 설명", STUDIO_BG3D_PICKER_CUTAWAY_HELP],
  ["방 만들기 단면 설명", STUDIO_BG3D_ROOM_PANEL_CUTAWAY_HELP],
  ["추가 실패 안내", STUDIO_BG3D_BUILD_FAILED_NOTICE],
  ["렌즈 시프트 부호 설명", STUDIO_BG3D_LENS_SHIFT_SIGN_HELP],
  ["렌즈 시프트 사용 설명", STUDIO_BG3D_LENS_SHIFT_USAGE_HELP],
  ["컷 비율(연결) 설명", STUDIO_BG3D_CUT_ASPECT_LINKED_HINT],
  ["컷 비율(메모) 설명", STUDIO_BG3D_CUT_ASPECT_MEMO_HINT],
  ...NOTICE_SAMPLES.map((input, index): readonly [string, string] => [`추가 직후 안내 ${index + 1}`, describeStudioBg3dBuildNotice(input)]),
];

describe("새 문구의 말투·오류 문형 가드", () => {
  it.each(NEW_COPY)("%s: 해요체 한 가지로만 쓰고 실패 문구면 다음 행동이 있다", (_name, text) => {
    expect(text.length).toBeGreaterThan(10);
    expect(findToneViolations(text, "polite"), "합니다체 문장").toEqual([]);
    const registers = registersInFlow([text]);
    expect(registers.has("formal")).toBe(false);
    expect(registers.size).toBeLessThanOrEqual(1);
    expect(violatesErrorPattern(text)).toBe(false);
  });

  it("가드는 이 문구들을 실제로 읽는다(해요체 문장이 하나도 안 잡히는 빈 검사가 아니다)", () => {
    for (const [name, text] of NEW_COPY) {
      // 숨긴 것도 밀린 것도 없는 안내(1)는 명사형 한 문장이라 말투가 없다.
      if (name === "추가 직후 안내 1") continue;
      expect(registersInFlow([text]).has("polite"), name).toBe(true);
    }
  });

  it("실패 안내는 실패 계열이고 다음 행동이 있어 오류 문형을 지킨다", () => {
    expect(isFailureCopy(STUDIO_BG3D_BUILD_FAILED_NOTICE)).toBe(true);
    expect(hasErrorActionGuidance(STUDIO_BG3D_BUILD_FAILED_NOTICE)).toBe(true);
    expect(violatesErrorPattern(STUDIO_BG3D_BUILD_FAILED_NOTICE)).toBe(false);
  });

  it("대조군: 예전 문구(합니다체 섞임, 다음 행동 없는 실패)는 두 가드가 실제로 잡는다", () => {
    const oldPickerIntro = "사람 키 기준 실제 크기로 한 번에 만듭니다. 추가한 뒤에는 하나씩 골라 옮기고 지울 수 있어요.";
    expect(registersInFlow([oldPickerIntro]).size).toBe(2);
    expect(findToneViolations(oldPickerIntro, "polite")).toHaveLength(1);
    const oldFailure = "지금은 추가하지 못했어요. 편집기를 준비하는 중이거나 오브젝트 한도에 닿았을 수 있어요.";
    expect(violatesErrorPattern(oldFailure)).toBe(true);
  });

  it("라벨은 말투를 가리지 않는 명사구다", () => {
    for (const label of [STUDIO_BG3D_AUTO_CUTAWAY_LABEL, STUDIO_BG3D_RESTORE_WALLS_LABEL, STUDIO_BG3D_FOCUS_BUILT_LABEL]) {
      expect(registersInFlow([label]).size, label).toBe(0);
      expect(violatesErrorPattern(label), label).toBe(false);
    }
  });

  it("사이드바의 지연 로드 안내도 해요체다(컴포넌트에 직접 적힌 문구)", () => {
    const sidebar = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "StudioBg3dEditorSidebar.tsx"), "utf8");
    const labels = [...sidebar.matchAll(/label="([^"]*(?:웹툰 배경|방 만들기) 도구를 불러오는[^"]*)"/gu)].map((match) => match[1]!);
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(findToneViolations(label, "polite"), label).toEqual([]);
      expect(registersInFlow([label]).has("polite"), label).toBe(true);
    }
  });
});

// ── 화면에 실제로 그려진 문단 ─────────────────────────────────────────────────
// 위 목록은 상수만 본다. 누군가 컴포넌트에 새 문구를 직접 적으면 지나치므로, 새로 만든 컴포넌트(선택기·렌즈 시프트
// 컨트롤)는 그려진 모든 문단에, 기존 패널(방 만들기)은 새로 더한 문단에 같은 가드를 돌린다.

function expectCleanCopy(label: string, text: string): void {
  expect(text.trim().length, label).toBeGreaterThan(0);
  expect(findToneViolations(text, "polite"), `${label}: 합니다체 문장`).toEqual([]);
  expect(registersInFlow([text]).size, `${label}: 말투 혼재`).toBeLessThanOrEqual(1);
  expect(violatesErrorPattern(text), `${label}: 오류 문형`).toBe(false);
}

const paragraphs = (container: HTMLElement): string[] =>
  [...container.querySelectorAll("p")].map((node) => node.textContent ?? "").filter((text) => text.trim().length > 0);

const OUTSIDE_SOUTH = { position: [0, 2, 14], target: [0, 1, 0] } as const;

describe("그려진 새 문단의 말투·오류 문형", () => {
  it("웹툰 배경 선택기: 처음 화면, 숨긴 벽 안내, 밀린 배경 안내, 실패 안내의 모든 문단", () => {
    let existing = 0;
    let accept = true;
    const onBuild = vi.fn((buildParts: (count: number, view: typeof OUTSIDE_SOUTH) => BgPrimitive[]) => {
      const parts = buildParts(existing, OUTSIDE_SOUTH);
      return accept ? parts : false;
    });
    const { container } = render(
      <StudioBg3dWebtoonBackgroundPicker
        autoCutaway
        onAutoCutawayChange={vi.fn()}
        onBuild={onBuild}
        onShowParts={vi.fn()}
        onFocusBuilt={vi.fn()}
      />,
    );
    paragraphs(container).forEach((text, index) => expectCleanCopy(`선택기 처음 ${index}`, text));
    const states: Array<[string, () => void]> = [
      ["숨긴 벽", () => { existing = 0; accept = true; fireEvent.click(screen.getByRole("button", { name: /^교실 만들기/u })); }],
      ["되돌린 뒤", () => fireEvent.click(screen.getByRole("button", { name: STUDIO_BG3D_RESTORE_WALLS_LABEL }))],
      ["밀린 배경", () => { existing = 99; fireEvent.click(screen.getByRole("button", { name: /^복도 만들기/u })); }],
      ["실패", () => { accept = false; fireEvent.click(screen.getByRole("button", { name: /^거리 만들기/u })); }],
    ];
    for (const [name, act] of states) {
      act();
      const texts = paragraphs(container);
      expect(texts.length, name).toBeGreaterThan(0);
      texts.forEach((text, index) => expectCleanCopy(`선택기 ${name} ${index}`, text));
    }
    expect(screen.getByTestId("studio-bg3d-build-notice").textContent).toBe(STUDIO_BG3D_BUILD_FAILED_NOTICE);
  });

  it("렌즈 시프트 컨트롤: 그려진 모든 문단", () => {
    const { container } = render(
      <StudioBg3dLensShiftControls
        lensShift={[0.1, -0.2]}
        disabled={false}
        twoPointPerspectiveActive={false}
        onPreviewShift={vi.fn()}
        onFinishShift={vi.fn()}
        onResetShift={vi.fn()}
        onApplyTwoPointPerspective={vi.fn()}
      />,
    );
    const texts = paragraphs(container);
    expect(texts).toEqual([STUDIO_BG3D_LENS_SHIFT_SIGN_HELP, STUDIO_BG3D_LENS_SHIFT_USAGE_HELP]);
    texts.forEach((text, index) => expectCleanCopy(`렌즈 시프트 ${index}`, text));
  });

  it("방 만들기 패널: 새로 더한 단면 설명과 추가 직후 안내(기존 문단은 이번에 고치지 않았다)", () => {
    const cafe = getStudioBg3dRoomPreset("cafe")!.spec;
    const onInsert = vi.fn((): BgPrimitive[] =>
      planStudioBg3dRoomBuild(cafe, 0, undefined, { autoCutawayCamera: OUTSIDE_SOUTH }).primitives,
    );
    const { container } = render(
      <StudioBg3dRoomBuilderPanel
        spec={cafe}
        onSpecChange={vi.fn()}
        onApplyPreset={vi.fn()}
        onInsert={onInsert}
        autoCutaway
        onAutoCutawayChange={vi.fn()}
        onShowParts={vi.fn()}
      />,
    );
    const help = paragraphs(container).find((text) => text === STUDIO_BG3D_ROOM_PANEL_CUTAWAY_HELP);
    expect(help).toBeTruthy();
    expectCleanCopy("방 만들기 단면 설명", help!);
    fireEvent.click(screen.getByRole("button", { name: /방 추가/u }));
    expectCleanCopy("방 추가 직후 안내", screen.getByTestId("studio-bg3d-build-notice").textContent ?? "");
    fireEvent.click(screen.getByRole("button", { name: STUDIO_BG3D_RESTORE_WALLS_LABEL }));
    expectCleanCopy("방 되돌린 뒤 안내", screen.getByTestId("studio-bg3d-build-notice").textContent ?? "");
  });
});
