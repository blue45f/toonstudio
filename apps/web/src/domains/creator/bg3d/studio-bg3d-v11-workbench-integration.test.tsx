// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useI18n } from "@/shared/lib/i18n";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import { StudioBg3dAdvancedWorkbenchHub } from "./StudioBg3dAdvancedWorkbenchHub";
import { createStudioBg3dGeneratedPartsCommand } from "./studio-bg3d-generated-parts-command";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import {
  commitStudioBg3dHistoryTransition,
  resetStudioBg3dCommandHistory,
  stepStudioBg3dCommandHistory,
  type StudioBg3dHistoryCommandRefs,
} from "./studio-bg3d-history-command-adapter";
import {
  createDefaultStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import {
  adaptStudioBg3dRuntimeToDocument,
  hydrateStudioBg3dDocumentToRuntime,
} from "./studio-bg3d-scene-runtime";
import { createStudioBg3dOrganizationController } from "./studio-bg3d-organization-controller";
import { buildStudioBg3dOrganizationView } from "./studio-bg3d-scene-organization";
import { planStudioBg3dOrganizationMutation } from "./studio-bg3d-organization-mutation";
import { createStudioBg3dWorkbenchHostPorts } from "./studio-bg3d-workbench-host-ports";
import { STUDIO_BG3D_V11_UPPER_ARCHETYPES } from "./studio-bg3d-v11-upper-catalog";
import { findStudioBg3dEssentialAsset } from "./studio-bg3d-essential-pose-prop-catalog";

type GeneratedPorts = Parameters<
  typeof createStudioBg3dGeneratedPartsCommand
>[0];

/** 실제 생성 묶음·조직 계획·history·문서 adapter를 연결하고 renderer 입출력만 대체한다. */
function fixture(roomBuilderSpec = { width: 6.4, depth: 5.2, wallHeight: 2.85 }) {
  const existing: BgPrimitive = {
    id: "existing",
    kind: "box",
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#ffffff",
    tags: ["Existing"],
  };
  let live: ReturnType<GeneratedPorts["readRuntime"]> = {
    primitives: [existing],
    customModels: [],
    document: {
      ...createDefaultStudioBg3dSceneDocument(),
      meta: { hiddenTags: ["Existing"] },
    },
  };
  const history: StudioBg3dHistoryCommandRefs = {
    historyRef: { current: [] },
    historyIndexRef: { current: -1 },
    historyCommandTimelineRef: { current: null },
  };
  resetStudioBg3dCommandHistory(history, createStudioBg3dHistorySnapshot(live));
  let nodeLimit = 2000;
  const addGeneratedParts = createStudioBg3dGeneratedPartsCommand({
    readRuntime: () => live,
    readView: () => live.document.camera,
    canAdmitSceneNodes: (count) => live.primitives.length + count <= nodeLimit,
    replace: ({ primitives }) => {
      live = { ...live, primitives };
    },
    select: () => {},
    commitHistory: (primitives, customModels, document, before, options) => {
      commitStudioBg3dHistoryTransition(history, {
        before,
        after: createStudioBg3dHistorySnapshot({
          primitives,
          customModels,
          document,
        }),
        ...options,
      });
    },
  });
  const organization = () =>
    createStudioBg3dOrganizationController({
      view: buildStudioBg3dOrganizationView({
        entities: live.primitives,
        document: live.document,
      }),
      skpSourceByEntityId: new Map(),
      selectEntities: () => {},
      apply: (action) => {
        const plan = planStudioBg3dOrganizationMutation({
          snapshot: live,
          action,
          dependencies: { createComponentId: () => "unused-component" },
        });
        if (!plan.ok) return { ok: false, reason: plan.reason };
        commitStudioBg3dHistoryTransition(history, {
          before: createStudioBg3dHistorySnapshot(live),
          after: createStudioBg3dHistorySnapshot(plan.snapshot),
          commandId: plan.command.id,
          label: plan.command.label,
        });
        live = plan.snapshot;
        return { ok: true };
      },
    });
  const host = {
    open: true,
    modelRenderer: {},
    selectedIds: new Set<string>(),
    physicsRuntimeSourceRef: { current: live },
    addGeneratedParts,
  };
  return {
    ports: () => {
      host.physicsRuntimeSourceRef.current = live;
      return createStudioBg3dWorkbenchHostPorts({
        ...host,
        outlinerController: { organization: organization() },
        roomBuilderSpec,
      });
    },
    read: () => live,
    history,
    reject: () => {
      nodeLimit = 1;
    },
    restore: (direction: "undo" | "redo") => {
      const step = stepStudioBg3dCommandHistory(history, direction);
      if (step?.state) live = step.state;
    },
  };
}

beforeEach(() => useI18n.setState({ lang: "ko" }));
afterEach(cleanup);

describe("V11 실제 작업대 삽입·표시·영속화 계약", () => {
  it("하부가 맞지 않는 방의 상부 단독 삽입을 원자 Undo/Redo하고 정본 참조를 저장한다", () => {
    const f = fixture({ width: 5, depth: 4, wallHeight: 2.5 });
    render(
      <StudioBg3dAdvancedWorkbenchHub
        defaultTab="spatial-modeler"
        {...f.ports()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "하부 메인 클러스터" }), {
      target: { value: "classroom-front-locker-rig" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "상부 페어링 설비 (천장·창호·간판)" }), {
      target: { value: "ceiling-hvac-cassette-duct" },
    });
    const before = createStudioBg3dHistorySnapshot(f.read());
    const full = screen.getByRole("button", { name: "상·하부 세트 원클릭 배치" });
    const upper = screen.getByRole("button", { name: "상부 설비만 단독 배치" });
    expect(full.hasAttribute("disabled")).toBe(true);
    expect(upper.hasAttribute("disabled")).toBe(false);
    fireEvent.click(full);
    expect(createStudioBg3dHistorySnapshot(f.read())).toEqual(before);
    fireEvent.click(upper);
    const after = createStudioBg3dHistorySnapshot(f.read());
    expect(after.primitives).toHaveLength(5);
    expect(after.primitives[0]).toEqual(before.primitives[0]);
    expect(after.document.meta?.hiddenTags).toEqual(["Existing"]);
    const asset = findStudioBg3dEssentialAsset("kitbash-v11-ceiling-hvac-cassette-duct");
    const expectUpper = (primitives: readonly BgPrimitive[]) => {
      const inserted = primitives.filter(({ id }) => id !== "existing");
      expect(inserted).toHaveLength(4);
      expect(new Set(primitives.map(({ id }) => id)).size).toBe(primitives.length);
      for (const part of inserted) {
        expect(part.tags).toContain("BgV11_Upper");
        expect(part.componentRef).toEqual({ id: asset?.id, name: asset?.labelKo });
      }
    };
    expectUpper(after.primitives);
    f.restore("undo");
    expect(createStudioBg3dHistorySnapshot(f.read())).toEqual(before);
    f.restore("redo");
    expect(createStudioBg3dHistorySnapshot(f.read())).toEqual(after);
    const saved = adaptStudioBg3dRuntimeToDocument({
      ...f.read(),
      baseDocument: f.read().document,
      attachmentByStorageModelId: new Map(),
    });
    const parsed = parseStudioBg3dSceneDocument(saved.serialized);
    if (!parsed) throw new Error("상부 단독 배치 장면을 다시 읽지 못했습니다.");
    const reopened = hydrateStudioBg3dDocumentToRuntime({
      document: parsed,
      storageModelIdByAttachmentId: new Map(),
    });
    expect(reopened.ok).toBe(true);
    expectUpper(reopened.primitives);
    f.reject();
    const historyIndex = f.history.historyIndexRef.current;
    fireEvent.click(upper);
    expect(createStudioBg3dHistorySnapshot(f.read())).toEqual(after);
    expect(f.history.historyIndexRef.current).toBe(historyIndex);
  });

  it("6종 상부의 정본 카탈로그 참조와 기존 하부 참조를 저장·재열기 뒤에도 보존한다", () => {
    const f = fixture();
    render(
      <StudioBg3dAdvancedWorkbenchHub
        defaultTab="spatial-modeler"
        {...f.ports()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "상·하부 세트 원클릭 배치" }),
    );
    const lowerReferences = f.read().primitives
      .filter((p) => p.tags?.includes("BgCluster") && !p.tags.includes("BgV11_Upper"))
      .map(({ id, componentRef }) => ({ id, componentRef }));
    expect(lowerReferences.length).toBeGreaterThan(0);
    expect(lowerReferences.every(({ componentRef }) =>
      componentRef?.id === "kitbash-v10-classroom-podium-locker-wall-v10",
    )).toBe(true);
    for (const meta of STUDIO_BG3D_V11_UPPER_ARCHETYPES) {
      fireEvent.change(
        screen.getByRole("combobox", { name: "상부 페어링 설비 (천장·창호·간판)" }),
        { target: { value: meta.id } },
      );
      fireEvent.click(
        screen.getByRole("button", { name: "상부 설비만 단독 배치" }),
      );
    }
    const expectReferences = (primitives: readonly BgPrimitive[]) => {
      for (const meta of STUDIO_BG3D_V11_UPPER_ARCHETYPES) {
        const asset = findStudioBg3dEssentialAsset(`kitbash-v11-${meta.id}`);
        const upper = primitives.filter((p) => p.tags?.includes(`BgV11_${meta.shortCode}`));
        expect(upper.length).toBeGreaterThan(0);
        for (const part of upper) {
          expect(part.componentRef).toEqual({ id: asset?.id, name: asset?.labelKo });
        }
      }
      expect(primitives
        .filter((p) => p.tags?.includes("BgCluster") && !p.tags.includes("BgV11_Upper"))
        .map(({ id, componentRef }) => ({ id, componentRef })),
      ).toEqual(lowerReferences);
    };
    expectReferences(f.read().primitives);
    const saved = adaptStudioBg3dRuntimeToDocument({
      ...f.read(),
      baseDocument: f.read().document,
      attachmentByStorageModelId: new Map(),
    });
    const parsed = parseStudioBg3dSceneDocument(saved.serialized);
    if (!parsed) throw new Error("V11 장면을 다시 읽지 못했습니다.");
    const reopened = hydrateStudioBg3dDocumentToRuntime({
      document: parsed,
      storageModelIdByAttachmentId: new Map(),
    });
    expect(reopened.ok).toBe(true);
    expect(reopened.primitives).toHaveLength(f.read().primitives.length);
    expectReferences(reopened.primitives);
  });

  it("production importer에서 삽입하고 전체 묶음 Undo/Redo·문서 재열기·태그 보존을 수행한다", () => {
    const f = fixture();
    const ui = render(
      <StudioBg3dAdvancedWorkbenchHub
        defaultTab="spatial-modeler"
        {...f.ports()}
      />,
    );
    // 실제 편집 패널은 닫힌 예제 아코디언에 숨겨지지 않아야 한다.
    expect(screen.getByRole("region", { name: "V11 상·하부 룸 어셈블러" }).closest("details")).toBeNull();
    expect(screen.getByTestId("spatial-modeler-example-tools").hasAttribute("open")).toBe(false);
    const refresh = () =>
      ui.rerender(
        <StudioBg3dAdvancedWorkbenchHub
          defaultTab="spatial-modeler"
          {...f.ports()}
        />,
      );
    fireEvent.click(
      screen.getByRole("button", { name: "상·하부 세트 원클릭 배치" }),
    );
    const first = createStudioBg3dHistorySnapshot(f.read());
    expect(first.primitives.length).toBeGreaterThan(12);
    expect(first.primitives.some(({ id }) => id.startsWith("v11r"))).toBe(
      false,
    );
    refresh();
    fireEvent.click(
      screen.getByRole("button", { name: "컷별 상부 설비 숨김" }),
    );
    expect(f.read().document.meta?.hiddenTags).toEqual([
      "BgV11_Upper",
      "Existing",
    ]);
    refresh();
    expect(
      screen
        .getByRole("button", { name: "상부 설비 다시 표시" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    const saved = adaptStudioBg3dRuntimeToDocument({
      ...f.read(),
      baseDocument: f.read().document,
      attachmentByStorageModelId: new Map(),
    });
    const parsed = parseStudioBg3dSceneDocument(saved.serialized);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error("V11 장면을 다시 읽지 못했습니다.");
    const reopened = hydrateStudioBg3dDocumentToRuntime({
      document: parsed,
      storageModelIdByAttachmentId: new Map(),
    });
    expect(reopened.ok).toBe(true);
    expect(reopened.primitives).toHaveLength(first.primitives.length);
    expect(parsed.meta?.hiddenTags).toEqual(["BgV11_Upper", "Existing"]);
    expect(
      reopened.primitives.filter((p) => p.tags?.includes("BgV11_Upper")).length,
    ).toBeGreaterThan(0);
    f.restore("undo");
    refresh();
    expect(f.read().document.meta?.hiddenTags).toEqual(["Existing"]);
    expect(
      screen
        .getByRole("button", { name: "컷별 상부 설비 숨김" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    f.restore("undo");
    refresh();
    expect(f.read().primitives.map(({ id }) => id)).toEqual(["existing"]);
    f.restore("redo");
    f.restore("redo");
    refresh();
    expect(f.read().primitives.map(({ id }) => id)).toEqual(
      first.primitives.map(({ id }) => id),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "상부 설비 다시 표시" }),
    );
    expect(f.read().document.meta?.hiddenTags).toEqual(["Existing"]);
    ui.unmount();
    render(
      <StudioBg3dAdvancedWorkbenchHub
        defaultTab="spatial-modeler"
        {...f.ports()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "상부 설비만 단독 배치" }),
    );
    const ids = f.read().primitives.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(first.primitives.length);
  });

  it("admission 거부 시 장면·history를 보존하고 성공 문구를 표시하지 않는다", () => {
    const f = fixture();
    f.reject();
    const before = createStudioBg3dHistorySnapshot(f.read());
    render(
      <StudioBg3dAdvancedWorkbenchHub
        defaultTab="spatial-modeler"
        {...f.ports()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "상·하부 세트 원클릭 배치" }),
    );
    expect(createStudioBg3dHistorySnapshot(f.read())).toEqual(before);
    expect(screen.getByText(/변경하지 못했어요/u)).toBeTruthy();
    expect(stepStudioBg3dCommandHistory(f.history, "undo")?.status).toBe(
      "empty",
    );
  });
});
