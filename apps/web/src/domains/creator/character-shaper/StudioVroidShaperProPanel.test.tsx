// @vitest-environment jsdom

import { MToonMaterial, type VRM } from "@pixiv/three-vrm";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CHARACTER_SLOT_KINDS } from "./character-shaper-contract";
import { StudioVroidShaperProPanel } from "./StudioVroidShaperProPanel";

import type {
  CharacterCapabilityProfile,
  CharacterHostSnapshot,
  CharacterRecipe,
} from "./character-shaper-contract";
import type { CharacterShaperBinding } from "./character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

afterEach(cleanup);

function createTestVrm() {
  const scene = new THREE.Group();
  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.2, 0.25),
    new MToonMaterial({
      color: new THREE.Color(0.95, 0.85, 0.8),
      shadingToonyFactor: 0.88,
      outlineWidthMode: "worldCoordinates",
      outlineWidthFactor: 0.0019,
    }),
  );
  bodyMesh.name = "Body_Main";
  const originalHair = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new MToonMaterial({ color: new THREE.Color(0.2, 0.2, 0.25) }),
  );
  originalHair.name = "Hair_Original";
  scene.add(bodyMesh, originalHair);
  return { vrm: { scene } as unknown as VRM, originalHair };
}

function makeBinding(): CharacterShaperBinding {
  const slots = Object.fromEntries(
    CHARACTER_SLOT_KINDS.map((slot) => [slot, slot === "accessory" ? [] : null]),
  ) as unknown as CharacterRecipe["slots"];
  const recipe: CharacterRecipe = {
    version: 1,
    slots,
    colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null },
    handSide: "both",
  };
  return {
    catalog: { version: 1, slots: [], entries: [] },
    profile: {
      status: "ready",
      modelId: "lumi",
      modelName: "루미",
      humanoid: true,
      semanticMorphs: {} as CharacterCapabilityProfile["semanticMorphs"],
      expressions: ["happy", "surprised", "aa"],
      costumeSlots: ["tops", "bottoms"],
      wardrobeMetricsReady: true,
      propsReady: true,
      irisTintable: true,
      originalHairMeshCount: 1,
      surfacePaintReady: true,
    },
    snapshot: {
      forgeFace: { headWidth: 1, headHeight: 1, headDepth: 1, cheekVolume: 0.35, chinLength: 1 },
      semanticMorphs: {},
      hairStyle: "none",
      hairBangStyle: "full",
      hairReplaceOriginal: false,
      hairBaseColor: "oklch(21% 0.018 270)",
      hairTipColor: "oklch(32% 0.035 262)",
      proportionPresetId: "webtoon-7",
      bodyPresetId: "balanced",
      wardrobe: {},
      propIds: [],
      activePoseId: null,
      activeExpressionId: null,
      expressionWeights: {},
      customColors: {},
      irisColor: null,
      handSide: "both",
      lastHandPoseType: null,
    } as CharacterHostSnapshot,
    recipe,
    baselineRecipe: recipe,
    history: { canUndo: false, canRedo: false, recentLabels: [], length: 0 },
    busyReason: null,
    handSide: "both",
    compareActive: false,
    evaluate: vi.fn(() => ({ status: "available" as const, reason: null, missing: [] })),
    plan: vi.fn(),
    commit: vi.fn(),
    commitPreset: vi.fn(),
    clear: vi.fn(() => null),
    remove: vi.fn(() => null),
    setHandSide: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    setCompareActive: vi.fn(),
    resetToBaseline: vi.fn(),
    commitFaceParams: vi.fn(),
    commitSemanticMorphs: vi.fn(),
    commitHairParams: vi.fn(),
    commitColor: vi.fn(),
  };
}

function makeHost(vrm: VRM): StudioVrmPoserHost {
  return {
    status: "ready",
    vrm,
    activeModelId: "lumi",
    avatarForgeState: {
      version: 4,
      face: { headWidth: 1, headHeight: 1, headDepth: 1, cheekVolume: 0.35, chinLength: 1 },
      proportions: {
        version: 1,
        overallHeight: 1,
        headBodyRatio: 1,
        armLength: 1,
        legLength: 1,
        torsoLength: 1,
        shoulderWidth: 1,
        handScale: 1,
        footScale: 1,
        neckLength: 1,
      },
      hair: { style: "none", replaceOriginal: false },
    },
    wardrobeState: {},
    costumeMeshes: [
      { key: "Tops_Original", label: "원본 상의", slot: "tops" },
      { key: "Bottoms_Original", label: "원본 하의", slot: "bottoms" },
    ],
    costumeState: { hidden: [], recolor: {} },
    updateCostume: vi.fn(),
    handleAvatarForgeChange: vi.fn(),
    updateExpressionWeight: vi.fn(),
    updateFingerCurl: vi.fn(),
    setBodyRotation: vi.fn(),
    handlePoseSelect: vi.fn(),
    invalidateViewport: vi.fn(),
    captureRef: { current: { camera: { fov: 35, updateProjectionMatrix: vi.fn() } } },
  } as unknown as StudioVrmPoserHost;
}

describe("StudioVroidShaperProPanel", () => {
  it("접힘(collapsible) 모드에서는 런처만 노출해 복잡도를 0으로 억제하고 클릭 시 6개 탭을 펼친다", () => {
    const { vrm } = createTestVrm();
    render(
      <StudioVroidShaperProPanel
        h={makeHost(vrm)}
        binding={makeBinding()}
        collapsible
        defaultOpen={false}
      />,
    );

    const launcher = screen.getByTestId("vroid-pro-launcher");
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("tablist", { name: "VRoid Pro 제작 탭" })).toBeNull();

    fireEvent.click(launcher);
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("tab")).toHaveLength(6);
  });

  it("헤어·얼굴·체형·의상·표정·포즈IK 6개 탭을 1클릭·키보드로 전환하며 커스텀 교체 시 3D 품질 저하 0%를 보장한다", () => {
    const { vrm, originalHair } = createTestVrm();
    const binding = makeBinding();
    const h = makeHost(vrm);
    const onHandoffReady = vi.fn();

    const view = render(
      <StudioVroidShaperProPanel
        h={h}
        binding={binding}
        collapsible={false}
        onHandoffReady={onHandoffReady}
      />,
    );

    // 1. 헤어 교체: 이중 헤어 자동 차단 + MToon 동기화 + 재교체 시 이전 GPU 해제 검증
    expect(originalHair.visible).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "트윈테일" }));
    expect(originalHair.visible).toBe(false);
    expect(binding.commitHairParams).toHaveBeenCalledWith(
      expect.objectContaining({ style: "twintail", replaceOriginal: true }),
      "VRoid 헤어: twintail",
    );

    fireEvent.click(screen.getByRole("button", { name: "로판 샴페인 금발" }));
    const strip = screen.getByTestId("vroid-pro-quality-strip");
    expect(strip.textContent).toContain("3D 품질 100% 유지");
    expect(strip.textContent).toContain("법선용접 OK");
    expect(strip.textContent).toContain("MToon동기화 2회");
    expect(strip.textContent).toContain("GPU해제 1건");

    // 2. 키보드 화살표로 얼굴 탭 이동 → 동공 하이라이트 5종 선택
    const hairTab = screen.getByRole("tab", { name: "헤어" });
    hairTab.focus();
    fireEvent.keyDown(hairTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "얼굴" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "순정 더블 스파클" }));
    expect(binding.commitFaceParams).toHaveBeenCalled();

    // 3. 체형 탭 → 액션 8.5등신 1클릭 적용
    fireEvent.click(screen.getByRole("tab", { name: "체형" }));
    fireEvent.click(screen.getByRole("button", { name: /액션 8\.5등신/u }));
    expect(h.handleAvatarForgeChange).toHaveBeenCalledWith(
      expect.objectContaining({ presetId: "action-8.5" }),
    );

    // 4. 의상 탭 → 레이어드 패턴 교체 + 원본 의상 충돌 숨김 + MToon 하모나이즈
    fireEvent.click(screen.getByRole("tab", { name: "의상" }));
    fireEvent.click(screen.getByRole("button", { name: "레이스" }));
    expect(h.updateCostume).toHaveBeenCalledWith(
      expect.objectContaining({ hidden: expect.arrayContaining(["Tops_Original", "Bottoms_Original"]) }),
    );

    // 5. 표정 탭 → VRM 1.0 표정 + ARKit 립싱크
    fireEvent.click(screen.getByRole("tab", { name: "표정" }));
    fireEvent.click(screen.getByRole("button", { name: "놀람" }));
    expect(h.updateExpressionWeight).toHaveBeenCalledWith("surprised", 0.85);
    fireEvent.click(screen.getByRole("button", { name: "아 (aa)" }));
    expect(h.updateExpressionWeight).toHaveBeenCalledWith("aa", 0.85);

    // 6. 포즈IK 탭 → 소품 자동 그립 + 2인 포즈 12종 + 18mm 만화 원근 + BG3D 페이로드 생성
    fireEvent.click(screen.getByRole("tab", { name: "포즈IK" }));
    fireEvent.click(screen.getByRole("button", { name: "스마트폰" }));
    expect(h.updateFingerCurl).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "벽치기" }));
    expect(h.handlePoseSelect).toHaveBeenCalledWith("reach");

    fireEvent.click(screen.getByRole("button", { name: "18mm" }));
    expect((h.captureRef.current.camera.updateProjectionMatrix as ReturnType<typeof vi.fn>)).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("vroid-pro-bg3d-handoff-btn"));
    expect(onHandoffReady).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("vroid-pro-bg3d-handoff-status").textContent).toContain("VRM 1.0 → BG3D 준비 완료");

    // 언마운트 시 커스텀 헤어 GPU 자원 폐기 & 숨겼던 원본 헤어 원복 검증
    view.unmount();
    expect(originalHair.visible).toBe(true);
  });
});
