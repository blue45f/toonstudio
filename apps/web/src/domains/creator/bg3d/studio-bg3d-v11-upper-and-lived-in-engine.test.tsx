// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bg3dObjectClusterArchetypeId } from "./studio-bg3d-background-object-cluster";
import { useI18n } from "@/shared/lib/i18n";
import { createStudioBg3dOrganizationController } from "./studio-bg3d-organization-controller";
import { buildStudioBg3dOrganizationView } from "./studio-bg3d-scene-organization";
import { getStudioBg3dRoomPreset } from "./studio-bg3d-room-builder";
import { findStudioBg3dEssentialAsset } from "./studio-bg3d-essential-pose-prop-catalog";
import { StudioBg3dV11UpperRoomAssemblerPanel } from "./StudioBg3dV11UpperRoomAssemblerPanel";
import {
  STUDIO_BG3D_V11_UPPER_ARCHETYPES,
  STUDIO_BG3D_LOWER_ARCHETYPE_LABELS_KO,
  applyBg3dDeterministicLivedInJitter,
  assembleBg3dV11RoomPipeline,
  assembleBg3dV11UpperRoomPlacement,
  buildBg3dV11UpperClusterPrimitives,
  buildBg3dV11VisibilityHiddenTags,
  measureV11PrimitivesWorldBounds,
  resolveBg3dClusterHumanSnapPoints,
  type Bg3dV11ScenePrimitive,
} from "./studio-bg3d-v11-upper-and-lived-in-engine";

beforeEach(() => useI18n.setState({ lang: "ko" }));

afterEach(() => {
  cleanup();
});

describe("studio-bg3d-v11-upper-and-lived-in-engine", () => {
  it("마운트 높이 이내에 6종 상부 클러스터를 배치하고 문서 v3 스키마 불변식을 준수한다", () => {
    const idRegex = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;
    const colorRegex = /^#[a-f0-9]{6}$/u;

    for (const meta of STUDIO_BG3D_V11_UPPER_ARCHETYPES) {
      const asset = findStudioBg3dEssentialAsset(`kitbash-v11-${meta.id}`);
      expect(asset?.glbUrl).toBe(meta.glbAssetPath);
      expect(asset?.labelKo).toBe(meta.labelKo);
      const prims = buildBg3dV11UpperClusterPrimitives({
        archetype: meta.id,
        density: "lived-in",
        mountHeightMeters: 2.9,
        yawDeg: 35,
      });
      expect(prims.length).toBeGreaterThanOrEqual(4);
      const bounds = measureV11PrimitivesWorldBounds(prims);
      expect(bounds.min[1]).toBeGreaterThanOrEqual(0);
      expect(bounds.max[1]).toBeLessThanOrEqual(2.9001);

      for (const p of prims) {
        expect(p.componentRef).toEqual({
          id: asset?.id,
          name: asset?.labelKo,
        });
        expect(idRegex.test(p.id)).toBe(true);
        expect(colorRegex.test(p.color)).toBe(true);
        for (const angle of p.rotation) {
          expect(Object.is(angle, -0)).toBe(false);
          expect(angle).toBeGreaterThanOrEqual(-Math.PI);
          expect(angle).toBeLessThan(Math.PI);
        }
        for (const tag of p.tags ?? []) {
          expect([...tag].length).toBeLessThanOrEqual(32);
        }
      }
    }
  });

  it("동일 시드에서는 동일한 생활감 지터를 생성하고 다른 시드에서는 미세 분산을 만든다", () => {
    const base = buildBg3dV11UpperClusterPrimitives({
      archetype: "ceiling-track-spotlight-rig",
      density: "lived-in",
    });
    const runA = applyBg3dDeterministicLivedInJitter(base, {
      seed: 42,
      messiness: 0.7,
    });
    const runB = applyBg3dDeterministicLivedInJitter(base, {
      seed: 42,
      messiness: 0.7,
    });
    const runC = applyBg3dDeterministicLivedInJitter(base, {
      seed: 99,
      messiness: 0.7,
    });

    expect(runA).toEqual(runB);
    expect(runA).not.toEqual(runC);
  });

  it("4단계 룸 조립 시 상부 엣지 밀도가 증가하고 빈 벽면 노출 감소율을 산출한다", () => {
    const assembled = assembleBg3dV11RoomPipeline({
      room: { width: 6.4, depth: 5.2, wallHeight: 2.85 },
      lowerArchetype: "classroom-front-locker-rig",
      lowerAnchor: "north-wall",
      density: "lived-in",
      theme: "daylight-neutral",
      seed: 777,
      messiness: 0.5,
    });

    expect(assembled.pairedUpperArchetype).toBe(
      "classroom-ceiling-speaker-projector",
    );
    expect(assembled.afterUpperEdgeMetrics.upperBandRatio).toBeGreaterThan(
      assembled.beforeUpperEdgeMetrics.upperBandRatio,
    );
    expect(
      assembled.afterUpperEdgeMetrics.wallBlankAreaReductionPct,
    ).toBeGreaterThan(0);

    const hiddenTags = buildBg3dV11VisibilityHiddenTags({
      hideUpperZone: true,
      hiddenShortCodes: ["class"],
    });
    expect(hiddenTags).toEqual([
      "BgV11_Upper",
      "BgCluster_class",
      "BgV11_class",
    ]);
  });

  it("인체 상호작용 스냅 포인트를 월드 오프셋 및 회전각에 맞춰 정확히 변환한다", () => {
    const snaps = resolveBg3dClusterHumanSnapPoints({
      archetype: "office-creator-workstation",
      offsetXZ: [1.5, -2.0],
      yawDeg: 90,
    });
    expect(snaps).toHaveLength(2);
    expect(snaps[0]?.role).toBe("seat");
    expect(snaps[0]?.worldPosition[1]).toBe(0.45);
    expect(snaps[1]?.role).toBe("desk-hands");
    expect(snaps[1]?.worldPosition[1]).toBe(0.76);
    expect(snaps[0]?.forwardNormal).toEqual([-1, 0, 0]);
  });

  it("V11 룸 어셈블러 UI 패널에서 접근성 계약 및 원클릭 세트 배치가 동작한다", () => {
    const onInsert = vi.fn((_primitives: readonly Bg3dV11ScenePrimitive[]) => true);
    const onHidden = vi.fn(() => ({ ok: true as const }));
    const organization = createStudioBg3dOrganizationController({
      view: buildStudioBg3dOrganizationView({
        entities: [{ id: "upper", tags: ["BgV11_Upper"] }],
        document: {},
      }),
      skpSourceByEntityId: new Map(),
      apply: onHidden,
      selectEntities: () => {},
    });
    render(
      <StudioBg3dV11UpperRoomAssemblerPanel
        onInsertPrimitives={onInsert}
        organization={organization}
      />,
    );

    const toggleBtn = screen.getByRole("button", {
      name: /V11 상부 설비 · 원클릭 룸 조립/u,
    });
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");
    expect(toggleBtn.getAttribute("aria-controls")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "상·하부 세트 원클릭 배치" }),
    );
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert.mock.calls[0]?.[0]?.length).toBeGreaterThan(6);

    fireEvent.click(
      screen.getByRole("button", { name: "컷별 상부 설비 숨김" }),
    );
    expect(onHidden).toHaveBeenCalledWith({
      type: "toggle-tag-visibility",
      tag: "BgV11_Upper",
    });

    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
    expect(toggleBtn.getAttribute("aria-controls")).toBeNull();
  });
});

describe("V11 방 치수·밀도·주요 설비 계약", () => {
  it("하부가 맞지 않아도 상부를 독립 배치하고 전체 배치와 같은 상부 결과를 사용한다", () => {
    const spec = {
      room: { width: 5, depth: 4, wallHeight: 2.5 },
      lowerArchetype: "classroom-front-locker-rig" as const,
      upperArchetype: "ceiling-hvac-cassette-duct" as const,
      density: "lived-in" as const,
      seed: 20261113,
      messiness: 0.4,
    };
    expect(() => assembleBg3dV11RoomPipeline(spec)).toThrow("방보다 큽니다");
    const upper = assembleBg3dV11UpperRoomPlacement(spec);
    const bounds = measureV11PrimitivesWorldBounds(upper.upperPrimitives);
    expect(upper.upperPrimitives).toHaveLength(4);
    expect(bounds.min[0]).toBeGreaterThanOrEqual(-spec.room.width / 2);
    expect(bounds.max[0]).toBeLessThanOrEqual(spec.room.width / 2);
    expect(bounds.min[2]).toBeGreaterThanOrEqual(-spec.room.depth / 2);
    expect(bounds.max[2]).toBeLessThanOrEqual(spec.room.depth / 2);
    expect(bounds.min[1]).toBeGreaterThanOrEqual(0);
    expect(bounds.max[1]).toBeLessThanOrEqual(spec.room.wallHeight);
    const larger = { ...spec, room: { width: 6.4, depth: 5.2, wallHeight: 2.85 } };
    expect(assembleBg3dV11UpperRoomPlacement(larger).upperPrimitives).toEqual(
      assembleBg3dV11RoomPipeline(larger).upperPrimitives,
    );
    for (const room of [
      { width: 2, depth: 2, wallHeight: 2.5 },
      { width: 6.4, depth: 5.2, wallHeight: 1 },
    ]) {
      expect(() => assembleBg3dV11UpperRoomPlacement({ ...spec, room })).toThrow(
        "방보다 큽니다",
      );
    }
  });

  it("8종 하부·3밀도·4테마·2앵커에서 전체 파츠를 방 안에 유지한다", () => {
    for (const lowerArchetype of Object.keys(
      STUDIO_BG3D_LOWER_ARCHETYPE_LABELS_KO,
    ) as Bg3dObjectClusterArchetypeId[]) {
      for (const density of ["essential", "detailed", "lived-in"] as const) {
        for (const theme of [
          "daylight-neutral",
          "weathered-urban",
          "night-glow",
          "warm-wood",
        ] as const) {
          for (const lowerAnchor of ["north-wall", "nw-corner"] as const) {
            const result = assembleBg3dV11RoomPipeline({
              room: { width: 6.4, depth: 5.2, wallHeight: 2.85 },
              lowerArchetype,
              density,
              theme,
              lowerAnchor,
              messiness: 0.9,
              seed: 42,
            });
            const bounds = measureV11PrimitivesWorldBounds(
              result.combinedPrimitives,
            );
            expect(bounds.min[0]).toBeGreaterThanOrEqual(-3.2001);
            expect(bounds.max[0]).toBeLessThanOrEqual(3.2001);
            expect(bounds.min[2]).toBeGreaterThanOrEqual(-2.6001);
            expect(bounds.max[2]).toBeLessThanOrEqual(2.6001);
            expect(bounds.min[1]).toBeGreaterThanOrEqual(-0.0001);
            expect(bounds.max[1]).toBeLessThanOrEqual(2.8501);
            expect(
              result.combinedPrimitives.every((p) =>
                p.tags?.includes("BgCluster"),
              ),
            ).toBe(true);
            const metric = result.afterUpperEdgeMetrics;
            expect(
              metric.lowerBandRatio +
                metric.midBandRatio +
                metric.upperBandRatio,
            ).toBeCloseTo(1, 3);
            expect(metric.totalEdgeScore).toBeGreaterThan(
              result.beforeUpperEdgeMetrics.totalEdgeScore,
            );
          }
        }
      }
    }
  });

  it("방이 너무 작거나 숫자가 잘못되면 조립 전체를 거부한다", () => {
    const base = {
      room: { width: 6.4, depth: 5.2, wallHeight: 2.85 },
      lowerArchetype: "classroom-front-locker-rig" as const,
    };
    for (const room of [
      { width: 1, depth: 1, wallHeight: 2.85 },
      { width: 6.4, depth: 5.2, wallHeight: 1.5 },
    ]) {
      expect(() => assembleBg3dV11RoomPipeline({ ...base, room })).toThrow(
        "선택한 세트가 방보다 큽니다",
      );
    }
    expect(() => assembleBg3dV11RoomPipeline({ ...base, seed: NaN })).toThrow(
      "유효한 숫자",
    );
    expect(() =>
      assembleBg3dV11RoomPipeline({
        ...base,
        room: { ...base.room, depth: Infinity },
      }),
    ).toThrow("유효한 숫자");
  });

  it("편집 가능한 blind 높이1.5m와 projector·방송speaker를 모든 밀도에서 보존한다", () => {
    for (const density of ["essential", "detailed", "lived-in"] as const) {
      const blind = buildBg3dV11UpperClusterPrimitives({
        archetype: "window-venetian-blind-pelmet",
        density,
        mountHeightMeters: 2.8,
      });
      const bounds = measureV11PrimitivesWorldBounds(blind);
      expect(bounds.max[1] - bounds.min[1]).toBeCloseTo(1.5, 4);
      const classroom = buildBg3dV11UpperClusterPrimitives({
        archetype: "classroom-ceiling-speaker-projector",
        density,
      });
      expect(classroom.some((p) => p.name?.includes("프로젝터 본체"))).toBe(
        true,
      );
      expect(classroom.some((p) => p.name?.includes("방송 스피커"))).toBe(true);
    }
  });

  it("조립 인체 기준점은 실제 책상·교탁 표면의 월드 높이를 따른다", () => {
    for (const lowerArchetype of [
      "office-creator-workstation",
      "classroom-front-locker-rig",
      "hospital-ward-corridor-set",
    ] as const) {
      const result = assembleBg3dV11RoomPipeline({
        room: { width: 6.4, depth: 5.2, wallHeight: 2.85 },
        lowerArchetype,
      });
      const targetName =
        lowerArchetype === "office-creator-workstation"
          ? "MotionDesk_Walnut_Slab"
          : lowerArchetype === "classroom-front-locker-rig"
            ? "Teacher_Oak_Podium"
            : "Ward_Seat_2";
      const target = result.lowerPrimitives.find((p) =>
        p.name?.startsWith(targetName),
      );
      if (!target) throw new Error("접점 대상 가구가 없습니다.");
      const point = result.humanSnapPoints.find(
        (p) =>
          p.role ===
          (lowerArchetype === "office-creator-workstation"
            ? "desk-hands"
            : lowerArchetype === "classroom-front-locker-rig"
              ? "counter-rest"
              : "seat"),
      );
      expect(point?.worldPosition).toEqual([
        target.position[0],
        target.position[1] + target.scale[1] / 2,
        target.position[2],
      ]);
    }
  });
});

describe("V11 패널 거부·상태·다국어 계약", () => {
  it("전체 세트 오류와 상부 단독 가능 상태를 구분하고 상부 경계 실패는 거부한다", () => {
    const insert = vi.fn((_primitives: readonly Bg3dV11ScenePrimitive[]) => true);
    const view = render(
      <StudioBg3dV11UpperRoomAssemblerPanel
        roomDimensions={{ width: 5, depth: 4, wallHeight: 2.5 }}
        onInsertPrimitives={insert}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "하부 메인 클러스터" }), {
      target: { value: "classroom-front-locker-rig" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "상부 페어링 설비 (천장·창호·간판)" }), {
      target: { value: "ceiling-hvac-cassette-duct" },
    });
    const full = screen.getByRole("button", { name: "상·하부 세트 원클릭 배치" });
    const upper = screen.getByRole("button", { name: "상부 설비만 단독 배치" });
    expect(full.hasAttribute("disabled")).toBe(true);
    expect(upper.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("alert").textContent).toContain("상·하부 세트가 방보다 커요");
    expect(screen.getByText("상부 설비는 현재 방에 맞아 단독 배치할 수 있어요.")).toBeTruthy();
    fireEvent.click(full);
    expect(insert).not.toHaveBeenCalled();
    fireEvent.click(upper);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]![0].every((p) => p.tags?.includes("BgV11_Upper"))).toBe(true);
    view.rerender(
      <StudioBg3dV11UpperRoomAssemblerPanel
        roomDimensions={{ width: 2, depth: 2, wallHeight: 1 }}
        onInsertPrimitives={insert}
      />,
    );
    expect(upper.hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByText("상부 설비는 현재 방에 맞아 단독 배치할 수 있어요.")).toBeNull();
    fireEvent.click(upper);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("실제 기본 원룸에서 맞는 초기 세트를 추천하고 두 삽입 명령을 바로 사용할 수 있다", () => {
    const room = getStudioBg3dRoomPreset("studio-flat")!.spec;
    const insert = vi.fn((_primitives: readonly Bg3dV11ScenePrimitive[]) => true);
    render(
      <StudioBg3dV11UpperRoomAssemblerPanel
        roomDimensions={room}
        onInsertPrimitives={insert}
      />,
    );
    const lower = screen.getByRole("combobox", { name: "하부 메인 클러스터" });
    expect(within(lower).getAllByRole("option")).toHaveLength(8);
    expect(lower).not.toHaveProperty("value", "classroom-front-locker-rig");
    expect(screen.queryByRole("alert")).toBeNull();
    for (const name of ["상·하부 세트 원클릭 배치", "상부 설비만 단독 배치"]) {
      const button = screen.getByRole("button", { name });
      expect(button.hasAttribute("disabled")).toBe(false);
      fireEvent.click(button);
    }
    expect(insert).toHaveBeenCalledTimes(2);
    const bounds = measureV11PrimitivesWorldBounds(insert.mock.calls[0]![0]);
    expect(bounds.min[0]).toBeGreaterThanOrEqual(-room.width / 2 - 0.0001);
    expect(bounds.max[0]).toBeLessThanOrEqual(room.width / 2 + 0.0001);
    expect(bounds.min[2]).toBeGreaterThanOrEqual(-room.depth / 2 - 0.0001);
    expect(bounds.max[2]).toBeLessThanOrEqual(room.depth / 2 + 0.0001);
    expect(bounds.max[1]).toBeLessThanOrEqual(room.wallHeight + 0.0001);
  });

  it("사용자가 고른 세트는 이후 방 크기가 바뀌어도 자동 교체하지 않는다", () => {
    const room = getStudioBg3dRoomPreset("studio-flat")!.spec;
    const insert = vi.fn(() => true);
    const view = render(
      <StudioBg3dV11UpperRoomAssemblerPanel
        roomDimensions={room}
        onInsertPrimitives={insert}
      />,
    );
    const lower = screen.getByRole("combobox", { name: "하부 메인 클러스터" });
    fireEvent.change(lower, { target: { value: "classroom-front-locker-rig" } });
    view.rerender(
      <StudioBg3dV11UpperRoomAssemblerPanel
        roomDimensions={{ width: 6.4, depth: 5.2, wallHeight: 2.85 }}
        onInsertPrimitives={insert}
      />,
    );
    expect(lower).toHaveProperty("value", "classroom-front-locker-rig");
    expect(
      screen.getByRole("button", { name: "상·하부 세트 원클릭 배치" })
        .hasAttribute("disabled"),
    ).toBe(false);
    view.rerender(
      <StudioBg3dV11UpperRoomAssemblerPanel
        roomDimensions={room}
        onInsertPrimitives={insert}
      />,
    );
    expect(lower).toHaveProperty("value", "classroom-front-locker-rig");
    expect(screen.getByRole("alert").textContent).toContain("방 치수를 늘리거나");
    fireEvent.click(
      screen.getByRole("button", { name: "상·하부 세트 원클릭 배치" }),
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("작은 방·미연결 명령에서는 원자 삽입을 보내지 않는다", () => {
    const insert = vi.fn(() => true);
    const view = render(
      <StudioBg3dV11UpperRoomAssemblerPanel
        roomDimensions={{ width: 1, depth: 1, wallHeight: 2.85 }}
        onInsertPrimitives={insert}
      />,
    );
    const button = screen.getByRole("button", {
      name: "상·하부 세트 원클릭 배치",
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(insert).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "방 치수를 늘리거나",
    );
    view.rerender(<StudioBg3dV11UpperRoomAssemblerPanel />);
    expect(
      screen
        .getByRole("button", { name: "상·하부 세트 원클릭 배치" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "컷별 상부 설비 숨김" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("삽입 거부·예외와 숨김 거부를 성공으로 표시하지 않는다", () => {
    const insert = vi.fn(() => false);
    const apply = vi.fn(() => ({
      ok: false as const,
      reason: "busy" as const,
    }));
    const organization = createStudioBg3dOrganizationController({
      view: buildStudioBg3dOrganizationView({
        entities: [{ id: "upper", tags: ["BgV11_Upper"] }],
        document: {},
      }),
      skpSourceByEntityId: new Map(),
      apply,
      selectEntities: () => {},
    });
    render(
      <StudioBg3dV11UpperRoomAssemblerPanel
        onInsertPrimitives={insert}
        organization={organization}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "상·하부 세트 원클릭 배치" }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "변경하지 못했어요",
    );
    insert.mockImplementation(() => {
      throw new Error("거부");
    });
    fireEvent.click(
      screen.getByRole("button", { name: "상부 설비만 단독 배치" }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "변경하지 못했어요",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "컷별 상부 설비 숨김" }),
    );
    expect(apply).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole("button", { name: "컷별 상부 설비 숨김" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByRole("status").textContent).toContain(
      "변경하지 못했어요",
    );
  });

  it("영어 번역과 disabled 경계를 유지한다", () => {
    useI18n.setState({ lang: "en" });
    const insert = vi.fn(() => true);
    render(
      <StudioBg3dV11UpperRoomAssemblerPanel
        disabled
        onInsertPrimitives={insert}
      />,
    );
    expect(
      screen.getByRole("region", {
        name: "V11 upper and lower room assembler",
      }),
    ).toBeTruthy();
    for (const button of screen.getAllByRole("button"))
      expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Insert upper and lower set" }),
    );
    expect(insert).not.toHaveBeenCalled();
  });
});
