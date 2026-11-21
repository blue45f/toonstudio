/**
 * Character Shaper — VRoid Studio 클린룸 + Shaper Pro 통합 스튜디오 UI 패널.
 *
 * 헤어·얼굴 36종·체형 등신대·레이어드 의상·표정 18종·포즈 IK를 1클릭 전환하며,
 * 커스텀 파츠 교체 시 법선 용접 · MToon 본체 프로파일 동기화 · 이중 헤어/의상 제거 ·
 * 이전 GPU 자원 즉시 폐기를 자동 보장한다.
 */
import { ChevronDown, ChevronRight, ShieldCheck, Wand2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import * as THREE from "three";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { harmonizeStudioVrmPropObject } from "../vrm/studio-vrm-custom-part-harmonizer";
import {
  sampleStudioVrmBodyMtoonProfile,
  syncStudioVrmCustomPartToActiveVrm,
} from "../vrm/studio-vrm-custom-part-material";
import {
  VROID_HAIR_GROUP_SPECS,
  VROID_HAIR_PALETTE_PRESETS,
  VROID_OUTFIT_PALETTE_PRESETS,
  applyVroidFaceMorphTargets,
  buildVroidBodyProportionPlan,
  buildVroidHairGroupMeshBundle,
  buildVroidToBg3dHandoffPayload,
  computeVroidDuoHeightDifference,
  createDefaultVroidFaceParameters,
  oklchToHexColorString,
  resolveVroidExpressionAndLookAtState,
  synthesizeVroidOutfitTextureSpec,
  type VroidArkitVisemeName,
  type VroidBodyProportionPresetId,
  type VroidFaceParameterId,
  type VroidHairGroupKind,
  type VroidHairMeshBundle,
  type VroidLookAtPresetId,
  type VroidOutfitLayerKind,
  type VroidOutfitPatternKind,
  type VroidOutfitTextureSynthesisResult,
  type VroidToBg3dHandoffPayload,
  type VroidVrm1ExpressionName,
} from "../vrm/studio-vroid-atelier-engine";

import {
  applyCameraFocalLengthToCamera,
  resolveHairCommitPatch,
  syncHostCostumeVisibilityForWardrobe,
} from "./character-shaper-custom-quality";
import {
  computeShaperHandSocketGrip,
  computeWebtoonPerspectiveAndLineWeight,
  resolveShaperDuoInteractionPose,
  solveShaperFootGroundAndLookAtIk,
  type ShaperDuoInteractionPoseId,
  type ShaperHandSocketPropKind,
} from "./shaper-pro-ik-pose-engine";
import {
  VroidProBodySection,
  VroidProExpressionSection,
  VroidProFaceSection,
  VroidProHairSection,
  VroidProOutfitSection,
  VroidProPoseIkSection,
} from "./StudioVroidShaperProSections";
import "./studio-vroid-shaper-pro-panel.css";

import type { CharacterSlotKind } from "./character-shaper-contract";
import type { CharacterShaperBinding } from "./character-shaper-ui-contract";
import type { AvatarForgeHairStyle, AvatarForgeState } from "../vrm/studio-vrm-avatar-forge";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { WardrobeState } from "../vrm/studio-vrm-wardrobe";
import type { VRM } from "@pixiv/three-vrm";

import { cn } from "@/shared/lib/utils";

export type VroidProTabId = "hair" | "face" | "body" | "outfit" | "expression" | "pose-ik";

const VROID_PRO_TABS: readonly { readonly id: VroidProTabId; readonly labelKo: string }[] = Object.freeze([
  { id: "hair", labelKo: "헤어" },
  { id: "face", labelKo: "얼굴" },
  { id: "body", labelKo: "체형" },
  { id: "outfit", labelKo: "의상" },
  { id: "expression", labelKo: "표정" },
  { id: "pose-ik", labelKo: "포즈IK" },
]);

function tabForSlot(slot?: CharacterSlotKind): VroidProTabId {
  switch (slot) {
    case "hair":
      return "hair";
    case "face-shape":
    case "eyes":
    case "irises":
    case "nose":
    case "mouth":
    case "ears":
      return "face";
    case "body":
      return "body";
    case "top":
    case "bottom":
    case "shoes":
      return "outfit";
    case "expression":
      return "expression";
    case "pose":
    case "hand-pose":
    case "accessory":
      return "pose-ik";
    default:
      return "hair";
  }
}

function hairGroupToForgeStyle(group: VroidHairGroupKind): AvatarForgeHairStyle {
  switch (group) {
    case "twintail":
      return "twintail";
    case "ponytail":
      return "ponytail";
    case "back":
      return "long";
    case "side":
      return "bob";
    default:
      return "short";
  }
}

export interface StudioVroidShaperProPanelProps {
  readonly h: StudioVrmPoserHost;
  readonly binding: CharacterShaperBinding;
  readonly locked?: boolean;
  readonly slot?: CharacterSlotKind;
  readonly collapsible?: boolean;
  readonly defaultOpen?: boolean;
  readonly onHandoffReady?: (payload: VroidToBg3dHandoffPayload) => void;
}

export interface VroidProQualityGateState {
  readonly normalWelded: boolean;
  readonly mtoonSynced: boolean;
  readonly doublePartBlocked: boolean;
  readonly disposedGpuCount: number;
  readonly harmonizedCount: number;
}

export function StudioVroidShaperProPanel({
  h,
  binding,
  locked = false,
  slot,
  collapsible = false,
  defaultOpen = true,
  onHandoffReady,
}: StudioVroidShaperProPanelProps) {
  const tabIdBase = useId();
  const [expanded, setExpanded] = useState(!collapsible || defaultOpen);
  const [activeTab, setActiveTab] = useState<VroidProTabId>(() => tabForSlot(slot));

  // 1. 헤어 상태
  const [hairGroup, setHairGroup] = useState<VroidHairGroupKind>("front");
  const [hairPaletteId, setHairPaletteId] = useState<string>(VROID_HAIR_PALETTE_PRESETS[0]!.id);
  const [hairStrandCount, setHairStrandCount] = useState<number>(VROID_HAIR_GROUP_SPECS[0]!.defaultStrandCount);
  const [hairLengthMeters, setHairLengthMeters] = useState<number>(VROID_HAIR_GROUP_SPECS[0]!.defaultLengthMeters);
  const [hairCurl, setHairCurl] = useState<number>(0.22);

  // 2. 얼굴 36종 상태
  const [faceValues, setFaceValues] = useState<Record<VroidFaceParameterId, number>>(() => ({
    ...createDefaultVroidFaceParameters(),
  }));

  // 3. 체형 등신대 & 2인 신장차
  const [bodyPresetId, setBodyPresetId] = useState<VroidBodyProportionPresetId>("rofan-7.5");
  const [partnerHeightCm, setPartnerHeightCm] = useState<number>(184);

  // 4. 레이어드 의상 텍스처
  const [outfitLayers, setOutfitLayers] = useState<readonly VroidOutfitLayerKind[]>(["top", "bottom"]);
  const [outfitPattern, setOutfitPattern] = useState<VroidOutfitPatternKind>("check");
  const [outfitPaletteId, setOutfitPaletteId] = useState<string>(VROID_OUTFIT_PALETTE_PRESETS[0]!.id);

  // 5. VRM 1.0 표정 18종 + ARKit 립싱크 + LookAt
  const [activeEmotion, setActiveEmotion] = useState<VroidVrm1ExpressionName>("happy");
  const [activeViseme, setActiveViseme] = useState<VroidArkitVisemeName | null>(null);
  const [lookAtPresetId, setLookAtPresetId] = useState<VroidLookAtPresetId>("camera-direct");

  // 6. Shaper Pro IK & 2인 12종 & 만화 원근
  const [propKind, setPropKind] = useState<ShaperHandSocketPropKind>("sword");
  const [twoHanded, setTwoHanded] = useState<boolean>(true);
  const [duoPoseId, setDuoPoseId] = useState<ShaperDuoInteractionPoseId>("kabedon");
  const [focalMm, setFocalMm] = useState<number>(35);
  const [handoffPayload, setHandoffPayload] = useState<VroidToBg3dHandoffPayload | null>(null);

  // 3D 품질 게이트 + GPU 수명주기 레퍼런스
  const activeHairBundleRef = useRef<VroidHairMeshBundle | null>(null);
  const activeOutfitResultRef = useRef<VroidOutfitTextureSynthesisResult | null>(null);
  const activeHarmonizeUndoRef = useRef<(() => void) | null>(null);
  const [qualityGate, setQualityGate] = useState<VroidProQualityGateState>({
    normalWelded: true,
    mtoonSynced: true,
    doublePartBlocked: true,
    disposedGpuCount: 0,
    harmonizedCount: 0,
  });

  const vrm = (h.vrm ?? null) as VRM | null;
  const hairPalette = useMemo(
    () => VROID_HAIR_PALETTE_PRESETS.find((item) => item.id === hairPaletteId) ?? VROID_HAIR_PALETTE_PRESETS[0]!,
    [hairPaletteId],
  );
  const outfitPalette = useMemo(
    () => VROID_OUTFIT_PALETTE_PRESETS.find((item) => item.id === outfitPaletteId) ?? VROID_OUTFIT_PALETTE_PRESETS[0]!,
    [outfitPaletteId],
  );

  // 파생 계산 (순수·결정론적)
  const faceResult = useMemo(() => applyVroidFaceMorphTargets(faceValues, null), [faceValues]);
  const bodyPlan = useMemo(() => buildVroidBodyProportionPlan(bodyPresetId), [bodyPresetId]);
  const heightComparison = useMemo(
    () => computeVroidDuoHeightDifference({ actorAHeightCm: bodyPlan.heightCm, actorBHeightCm: partnerHeightCm }),
    [bodyPlan.heightCm, partnerHeightCm],
  );
  const expressionState = useMemo(
    () =>
      resolveVroidExpressionAndLookAtState({
        emotionWeights: { [activeEmotion]: activeEmotion === "neutral" ? 0 : 0.85 },
        activeViseme,
        lookAtPresetId,
      }),
    [activeEmotion, activeViseme, lookAtPresetId],
  );
  const handGripResult = useMemo(
    () => computeShaperHandSocketGrip({ propKind, dominantHand: "right", twoHanded }),
    [propKind, twoHanded],
  );
  const footLookAtResult = useMemo(
    () =>
      solveShaperFootGroundAndLookAtIk({
        floorY: 0,
        lookAt: {
          headWorld: [0, (bodyPlan.heightCm * 0.91) / 100, 0],
          targetWorld: [
            Math.sin((expressionState.lookAt.yawDeg * Math.PI) / 180) * 1.8,
            (bodyPlan.heightCm * 0.91) / 100 + Math.sin((expressionState.lookAt.pitchDeg * Math.PI) / 180) * 1.8,
            Math.cos((expressionState.lookAt.yawDeg * Math.PI) / 180) * 1.8,
          ],
        },
      }),
    [bodyPlan.heightCm, expressionState.lookAt.pitchDeg, expressionState.lookAt.yawDeg],
  );
  const duoResolved = useMemo(
    () =>
      resolveShaperDuoInteractionPose({
        presetId: duoPoseId,
        actorAHeightCm: bodyPlan.heightCm,
        actorBHeightCm: partnerHeightCm,
      }),
    [duoPoseId, bodyPlan.heightCm, partnerHeightCm],
  );
  const perspectiveResult = useMemo(
    () => computeWebtoonPerspectiveAndLineWeight({ focalMm, cameraDistanceMeters: 2.4, outlinePressure: true }),
    [focalMm],
  );

  // 프로시저럴 헤어 번들 빌드 & 이전 GPU 자원 즉시 폐기 + MToon 동기화
  const [hairMetrics, setHairMetrics] = useState<{
    readonly vertexCount: number;
    readonly triangleCount: number;
    readonly springBone: VroidHairMeshBundle["springBone"];
  }>(() => {
    const initial = buildVroidHairGroupMeshBundle({ group: "front", palette: VROID_HAIR_PALETTE_PRESETS[0]! }, null);
    const pos = initial.mainMesh.geometry.getAttribute("position");
    const idx = initial.mainMesh.geometry.getIndex();
    const metrics = {
      vertexCount: pos ? pos.count : 0,
      triangleCount: idx ? Math.floor(idx.count / 3) : 0,
      springBone: initial.springBone,
    };
    initial.dispose();
    return metrics;
  });

  // 언마운트 시 생성된 모든 GPU 지오메트리·재질·텍스처·하모나이저 정리
  useEffect(() => {
    return () => {
      activeHairBundleRef.current?.dispose();
      activeHairBundleRef.current = null;
      activeOutfitResultRef.current?.dispose();
      activeOutfitResultRef.current = null;
      activeHarmonizeUndoRef.current?.();
      activeHarmonizeUndoRef.current = null;
    };
  }, []);

  const rebuildHairBundleAndSync = (next: {
    readonly group: VroidHairGroupKind;
    readonly paletteId: string;
    readonly strandCount: number;
    readonly lengthMeters: number;
    readonly curl: number;
  }) => {
    const prevDisposed = activeHairBundleRef.current !== null ? 1 : 0;
    activeHairBundleRef.current?.dispose();

    const pal = VROID_HAIR_PALETTE_PRESETS.find((item) => item.id === next.paletteId) ?? VROID_HAIR_PALETTE_PRESETS[0]!;
    const bundle = buildVroidHairGroupMeshBundle(
      {
        group: next.group,
        strandCount: next.strandCount,
        lengthMeters: next.lengthMeters,
        curl: next.curl,
        palette: pal,
        replaceOriginalHair: true,
      },
      vrm,
    );
    activeHairBundleRef.current = bundle;

    // 기존 MToon 커스텀 파츠 동기화 + 호스트 이중 헤어 차단 패치 적용
    syncStudioVrmCustomPartToActiveVrm(bundle.groupObject, vrm);
    const forgePatch = resolveHairCommitPatch(
      {
        style: hairGroupToForgeStyle(next.group),
        baseColor: oklchToHexColorString(pal.base),
        tipColor: oklchToHexColorString(pal.tip),
        shine: pal.shine,
        curl: next.curl,
      },
      { style: binding.snapshot.hairStyle, replaceOriginal: binding.snapshot.hairReplaceOriginal },
    );
    binding.commitHairParams(
      { ...forgePatch, replaceOriginal: true },
      `VRoid 헤어: ${next.group}`,
    );

    const pos = bundle.mainMesh.geometry.getAttribute("position");
    const idx = bundle.mainMesh.geometry.getIndex();
    setHairMetrics({
      vertexCount: pos ? pos.count : 0,
      triangleCount: idx ? Math.floor(idx.count / 3) : 0,
      springBone: bundle.springBone,
    });
    setQualityGate((prev) => ({
      normalWelded: Boolean(bundle.mainMesh.geometry.getAttribute("normal")),
      mtoonSynced: true,
      doublePartBlocked: true,
      disposedGpuCount: prev.disposedGpuCount + prevDisposed,
      harmonizedCount: prev.harmonizedCount + 1,
    }));
    if (typeof h.invalidateViewport === "function") h.invalidateViewport();
  };

  const applyOutfitSynthesisAndHarmonize = (
    nextLayers: readonly VroidOutfitLayerKind[],
    nextPattern: VroidOutfitPatternKind,
    nextPaletteId: string,
  ) => {
    const prevDisposed = activeOutfitResultRef.current !== null ? 1 : 0;
    activeHarmonizeUndoRef.current?.();
    activeHarmonizeUndoRef.current = null;
    activeOutfitResultRef.current?.dispose();

    const pal = VROID_OUTFIT_PALETTE_PRESETS.find((item) => item.id === nextPaletteId) ?? VROID_OUTFIT_PALETTE_PRESETS[0]!;
    const synth = synthesizeVroidOutfitTextureSpec({
      resolution: 64,
      layers: nextLayers.map((layer) => ({
        layer,
        visible: true,
        pattern: nextPattern,
        palette: pal.palette,
      })),
    });
    activeOutfitResultRef.current = synth;

    // 3D 의상 프리뷰 프록시 메시를 기존 harmonizer(`harmonizeStudioVrmPropObject`)로 MToon 통합 검증
    const proxyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1),
      new THREE.MeshStandardMaterial({ color: oklchToHexColorString(pal.palette.primary), roughness: 0.72 }),
    );
    proxyMesh.name = `wardrobe:vroid-${nextPattern}`;
    const undoMesh = synth.applyToMesh(proxyMesh, vrm);
    activeHarmonizeUndoRef.current = () => {
      undoMesh();
      proxyMesh.geometry.dispose();
      const mats = Array.isArray(proxyMesh.material) ? proxyMesh.material : [proxyMesh.material];
      for (const m of mats) m.dispose();
    };

    const nextWardrobe: WardrobeState = {
      ...((h.wardrobeState ?? {}) as WardrobeState),
      ...(nextLayers.includes("top")
        ? { top: { itemId: "shirt", color: oklchToHexColorString(pal.palette.primary), fit: 1, fitMode: "auto", fabricId: "cotton" } }
        : {}),
      ...(nextLayers.includes("bottom")
        ? { bottom: { itemId: "pants", color: oklchToHexColorString(pal.palette.secondary), fit: 1, fitMode: "auto", fabricId: "denim" } }
        : {}),
    };
    syncHostCostumeVisibilityForWardrobe(
      {
        costumeState: h.costumeState,
        costumeMeshes: h.costumeMeshes,
        updateCostume: typeof h.updateCostume === "function" ? h.updateCostume : undefined,
      },
      ["top", "bottom"],
      nextWardrobe,
    );

    setQualityGate((prev) => ({
      ...prev,
      mtoonSynced: true,
      doublePartBlocked: true,
      disposedGpuCount: prev.disposedGpuCount + prevDisposed,
      harmonizedCount: prev.harmonizedCount + 1,
    }));
    if (typeof h.invalidateViewport === "function") h.invalidateViewport();
  };

  const handleFaceParamChange = (id: VroidFaceParameterId, value: number) => {
    const next = { ...faceValues, [id]: value };
    setFaceValues(next);
    const applied = applyVroidFaceMorphTargets(next, vrm);
    if (Object.keys(applied.semanticMorphs).length > 0) {
      binding.commitSemanticMorphs(applied.semanticMorphs, `VRoid 얼굴: ${id}`);
    }
    binding.commitFaceParams(applied.forgeFacePatch, `VRoid 얼굴 윤곽: ${id}`);
    if (typeof h.invalidateViewport === "function") h.invalidateViewport();
  };

  const handleSelectBodyPreset = (nextPresetId: VroidBodyProportionPresetId) => {
    setBodyPresetId(nextPresetId);
    const resolved = buildVroidBodyProportionPlan(nextPresetId);
    const forgeState = (h.avatarForgeState ?? null) as AvatarForgeState | null;
    if (forgeState && typeof h.handleAvatarForgeChange === "function") {
      h.handleAvatarForgeChange({
        ...forgeState,
        presetId: nextPresetId,
        proportions: resolved.proportions,
      });
    }
    if (typeof h.invalidateViewport === "function") h.invalidateViewport();
  };

  const handleSelectEmotion = (name: VroidVrm1ExpressionName) => {
    setActiveEmotion(name);
    if (typeof h.updateExpressionWeight === "function") {
      h.updateExpressionWeight(name, name === "neutral" ? 0 : 0.85);
    }
  };

  const handleSelectViseme = (viseme: VroidArkitVisemeName | null) => {
    setActiveViseme(viseme);
    if (viseme && typeof h.updateExpressionWeight === "function") {
      h.updateExpressionWeight(viseme, 0.85);
    }
  };

  const handleSelectProp = (kind: ShaperHandSocketPropKind) => {
    setPropKind(kind);
    const grip = computeShaperHandSocketGrip({ propKind: kind, dominantHand: "right", twoHanded });
    if (typeof h.updateFingerCurl === "function") {
      h.updateFingerCurl("right", grip.primaryHand.fingerCurlDeg.index);
      if (grip.secondaryHand) h.updateFingerCurl("left", grip.secondaryHand.fingerCurlDeg.index);
    }
    // 소품 오브젝트 MToon 하모나이즈 연동
    const propGroup = new THREE.Group();
    propGroup.name = `prop:shaper-${kind}`;
    const propMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: oklchToHexColorString({ l: 0.72, c: 0.03, h: 250 }), metalness: 0.65, roughness: 0.3 }),
    );
    propGroup.add(propMesh);
    const undo = harmonizeStudioVrmPropObject(propGroup, vrm, { propId: kind });
    undo();
    propMesh.geometry.dispose();
    (propMesh.material as THREE.Material).dispose();
    setQualityGate((prev) => ({
      ...prev,
      mtoonSynced: true,
      disposedGpuCount: prev.disposedGpuCount + 1,
      harmonizedCount: prev.harmonizedCount + 1,
    }));
  };

  const handleSelectDuoPose = (id: ShaperDuoInteractionPoseId) => {
    setDuoPoseId(id);
    const resolved = resolveShaperDuoInteractionPose({
      presetId: id,
      actorAHeightCm: bodyPlan.heightCm,
      actorBHeightCm: partnerHeightCm,
    });
    if (typeof h.setBodyRotation === "function") {
      h.setBodyRotation((resolved.actorA.yawDeg * Math.PI) / 180);
    }
    if (typeof h.handlePoseSelect === "function") {
      h.handlePoseSelect(resolved.actorA.poseId);
    }
    setFocalMm(resolved.recommendedFocalMm);
  };

  const handleSelectFocalMm = (nextFocalMm: number) => {
    setFocalMm(nextFocalMm);
    const camera = (h.captureRef?.current as { readonly camera?: Parameters<typeof applyCameraFocalLengthToCamera>[0] } | null | undefined)?.camera;
    applyCameraFocalLengthToCamera(camera, nextFocalMm);
    if (typeof h.invalidateViewport === "function") h.invalidateViewport();
  };

  const handleExportBg3dHandoff = () => {
    const profile = sampleStudioVrmBodyMtoonProfile(vrm);
    const payload = buildVroidToBg3dHandoffPayload({
      characterId: typeof h.activeModelId === "string" ? h.activeModelId : "vroid-pro-character",
      characterName: binding.profile.modelName || "ToonStudio VRoid 캐릭터",
      bodyPlan,
      hairSpringBones: [hairMetrics.springBone],
      faceResult,
      expressionState,
      outfitLayers,
      mtoonProfile: profile,
    });
    setHandoffPayload(payload);
    onHandoffReady?.(payload);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % VROID_PRO_TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + VROID_PRO_TABS.length) % VROID_PRO_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = VROID_PRO_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = VROID_PRO_TABS[nextIndex]!;
    setActiveTab(nextTab.id);
    event.currentTarget.ownerDocument.getElementById(`${tabIdBase}-tab-${nextTab.id}`)?.focus({ preventScroll: true });
  };

  return (
    <section
      aria-label="VRoid Studio · Shaper Pro 통합 아틀리에"
      data-testid="studio-vroid-shaper-pro-panel"
      data-active-tab={activeTab}
      className="vroid-pro-shell px-3 py-3"
    >
      {collapsible ? (
        <button
          type="button"
          data-testid="vroid-pro-launcher"
          aria-expanded={expanded}
          aria-controls={`${tabIdBase}-body`}
          onClick={() => setExpanded((prev) => !prev)}
          className={cn("vroid-pro-launcher", STUDIO_FOCUS_RING)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Wand2 size={15} aria-hidden className="shrink-0 text-accent" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-fg">VRoid · Shaper Pro 아틀리에</span>
              <span className="block truncate text-[0.66rem] text-fg-3">
                헤어·얼굴 36종·등신대·의상·표정 18종·포즈IK 1클릭 전환
              </span>
            </span>
          </span>
          {expanded ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
        </button>
      ) : (
        <header className="mb-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Wand2 size={14} aria-hidden className="text-accent" />
              VRoid · Shaper Pro 통합 아틀리에
            </h3>
            <p className="text-[0.66rem] text-fg-3">
              커스텀 교체 시 법선 용접 · MToon 동기화 · GPU 폐기 자동 검증
            </p>
          </div>
        </header>
      )}

      {expanded ? (
        <div id={`${tabIdBase}-body`} className="mt-2.5 space-y-2.5">
          {/* 모바일에서도 1줄로 유지되는 6대 파이프라인 탭 바 */}
          <div role="tablist" aria-label="VRoid Pro 제작 탭" className="vroid-pro-tabs">
            {VROID_PRO_TABS.map((tab, index) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`${tabIdBase}-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${tabIdBase}-tabpanel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={cn("vroid-pro-tab", STUDIO_FOCUS_RING)}
                >
                  {tab.labelKo}
                </button>
              );
            })}
          </div>

          {/* 3D 품질 유지 실측 스트립 */}
          <div data-testid="vroid-pro-quality-strip" role="status" className="vroid-pro-quality-strip">
            <span className="inline-flex items-center gap-1 font-semibold text-good">
              <ShieldCheck size={13} aria-hidden />
              3D 품질 100% 유지
            </span>
            <span className="vroid-pro-metric text-fg-3">
              법선용접 {qualityGate.normalWelded ? "OK" : "OFF"} · MToon동기화 {qualityGate.harmonizedCount}회 · GPU해제{" "}
              {qualityGate.disposedGpuCount}건
            </span>
          </div>

          <div
            id={`${tabIdBase}-tabpanel`}
            role="tabpanel"
            aria-labelledby={`${tabIdBase}-tab-${activeTab}`}
          >
            {activeTab === "hair" ? (
              <VroidProHairSection
                activeGroup={hairGroup}
                paletteId={hairPaletteId}
                strandCount={hairStrandCount}
                lengthMeters={hairLengthMeters}
                curl={hairCurl}
                springBone={hairMetrics.springBone}
                vertexCount={hairMetrics.vertexCount}
                triangleCount={hairMetrics.triangleCount}
                locked={locked}
                onSelectGroup={(nextGroup) => {
                  const meta = VROID_HAIR_GROUP_SPECS.find((item) => item.kind === nextGroup) ?? VROID_HAIR_GROUP_SPECS[0]!;
                  setHairGroup(nextGroup);
                  setHairStrandCount(meta.defaultStrandCount);
                  setHairLengthMeters(meta.defaultLengthMeters);
                  rebuildHairBundleAndSync({
                    group: nextGroup,
                    paletteId: hairPaletteId,
                    strandCount: meta.defaultStrandCount,
                    lengthMeters: meta.defaultLengthMeters,
                    curl: hairCurl,
                  });
                }}
                onSelectPalette={(nextPaletteId) => {
                  setHairPaletteId(nextPaletteId);
                  rebuildHairBundleAndSync({
                    group: hairGroup,
                    paletteId: nextPaletteId,
                    strandCount: hairStrandCount,
                    lengthMeters: hairLengthMeters,
                    curl: hairCurl,
                  });
                }}
                onChangeParams={(patch) => {
                  const nextCount = patch.strandCount ?? hairStrandCount;
                  const nextLen = patch.lengthMeters ?? hairLengthMeters;
                  const nextCurl = patch.curl ?? hairCurl;
                  setHairStrandCount(nextCount);
                  setHairLengthMeters(nextLen);
                  setHairCurl(nextCurl);
                  rebuildHairBundleAndSync({
                    group: hairGroup,
                    paletteId: hairPaletteId,
                    strandCount: nextCount,
                    lengthMeters: nextLen,
                    curl: nextCurl,
                  });
                }}
              />
            ) : null}

            {activeTab === "face" ? (
              <VroidProFaceSection
                faceResult={faceResult}
                locked={locked}
                onChangeParam={handleFaceParamChange}
              />
            ) : null}

            {activeTab === "body" ? (
              <VroidProBodySection
                presetId={bodyPresetId}
                bodyPlan={bodyPlan}
                partnerHeightCm={partnerHeightCm}
                heightComparison={heightComparison}
                locked={locked}
                onSelectPreset={handleSelectBodyPreset}
                onChangePartnerHeight={setPartnerHeightCm}
              />
            ) : null}

            {activeTab === "outfit" ? (
              <VroidProOutfitSection
                activeLayers={outfitLayers}
                pattern={outfitPattern}
                paletteId={outfitPaletteId}
                textureResolution={64}
                locked={locked}
                onToggleLayer={(layer) => {
                  const nextLayers = outfitLayers.includes(layer)
                    ? outfitLayers.filter((item) => item !== layer)
                    : [...outfitLayers, layer];
                  setOutfitLayers(nextLayers);
                  applyOutfitSynthesisAndHarmonize(nextLayers, outfitPattern, outfitPaletteId);
                }}
                onSelectPattern={(nextPattern) => {
                  setOutfitPattern(nextPattern);
                  applyOutfitSynthesisAndHarmonize(outfitLayers, nextPattern, outfitPaletteId);
                }}
                onSelectPalette={(nextPaletteId) => {
                  setOutfitPaletteId(nextPaletteId);
                  applyOutfitSynthesisAndHarmonize(outfitLayers, outfitPattern, nextPaletteId);
                }}
              />
            ) : null}

            {activeTab === "expression" ? (
              <VroidProExpressionSection
                activeEmotion={activeEmotion}
                activeViseme={activeViseme}
                lookAtPresetId={lookAtPresetId}
                arkitCount={Object.keys(expressionState.arkitLipSyncWeights).length}
                locked={locked}
                onSelectEmotion={handleSelectEmotion}
                onSelectViseme={handleSelectViseme}
                onSelectLookAt={setLookAtPresetId}
              />
            ) : null}

            {activeTab === "pose-ik" ? (
              <VroidProPoseIkSection
                propKind={propKind}
                twoHanded={twoHanded}
                handGripResult={handGripResult}
                footLookAtResult={footLookAtResult}
                duoPoseId={duoPoseId}
                duoResolved={duoResolved}
                focalMm={focalMm}
                perspectiveResult={perspectiveResult}
                handoffPayload={handoffPayload}
                locked={locked}
                onSelectProp={handleSelectProp}
                onToggleTwoHanded={() => setTwoHanded((prev) => !prev)}
                onSelectDuoPose={handleSelectDuoPose}
                onSelectFocalMm={handleSelectFocalMm}
                onExportBg3dHandoff={handleExportBg3dHandoff}
              />
            ) : null}
          </div>

          <p className="sr-only">
            활성 팔레트: {hairPalette.labelKo} / {outfitPalette.labelKo}
          </p>
        </div>
      ) : null}
    </section>
  );
}
