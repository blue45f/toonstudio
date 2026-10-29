/**
 * Studio3dCharacterStudioInspectorPanel.tsx
 *
 * Tooning 3D Studio (TD) 5-탭 캐릭터 인스펙터(스타일 7파츠·체형 21본 슬라이더·액션 타임라인/웹캠 트래킹·
 * 비대칭 5영역 표정 및 3×3 시선 그리드·북마크) + 23종 카메라 구도 프리셋 + 10종 3D 기본 도형 +
 * 3D 에셋 스토어(3dasset.tooning.io 5종 카테고리) 및 씬 템플릿 슬롯 매핑 통합 패널.
 */
import { Box, Bookmark, Camera, Eye, Move3d, Palette, Sliders, Sparkles, Video } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  applyTdCharacterStyleAcrossSceneCuts,
  applyTdSceneTemplateWithCharacterMapping,
  clampTdBoneValue,
  computeTdCameraCompositionTransform,
  createDefaultTdBodyBoneValues,
  evaluateTdBoneScaleMultipliers,
  setTdEyeGazeDirection,
  syncTdSymmetricExpression,
  TD_BONE_SLIDER_SPECS,
  TD_CAMERA_ANGLE_SPECS,
  TD_CAMERA_LENS_SPECS,
  TD_CAMERA_POSITION_SPECS,
  TD_ELEMENT_PRIMITIVES,
  TD_GAZE_GRID_3X3,
  TD_MEDIAPIPE_RETARGET_CONFIG,
  TD_SHOT_SIZE_SPECS,
  TD_STYLE_PART_CATEGORIES,
  CREATOR_PLUS_3D_ASSET_STORE_CATALOG,
  updateTdStylePartPreset,
  type TdActionControlState,
  type TdBoneSliderKey,
  type TdCameraAnglePreset,
  type TdCameraLensPreset,
  type TdCameraPositionPreset,
  type TdCharacterBookmark,
  type TdCutRecord,
  type TdElementPrimitiveType,
  type TdFacialExpressionState,
  type TdSceneTemplateApplyScope,
  type TdShotSizePreset,
  type TdStylePartSlotConfig,
  type CreatorPlus3DAssetCategory,
} from "../scene-3d/studio-3d-character-studio-suite";

export interface Studio3dCharacterStudioInspectorPanelProps {
  readonly disabled?: boolean;
}

type InspectorTabId = "style" | "body21" | "action" | "expression" | "camera23" | "assetStore";

export function Studio3dCharacterStudioInspectorPanel({
  disabled = false,
}: Studio3dCharacterStudioInspectorPanelProps): ReactElement {
  const [inspectorTab, setInspectorTab] = useState<InspectorTabId>("body21");
  const [boneGroup, setBoneGroup] = useState<"머리·목" | "상체" | "팔·손" | "하체·발">("상체");
  const [bodyBones, setBodyBones] = useState(createDefaultTdBodyBoneValues);

  const [styleParts, setStyleParts] = useState<readonly TdStylePartSlotConfig[]>(() =>
    TD_STYLE_PART_CATEGORIES.map((cat) => ({
      partType: cat.type,
      presetId: `${cat.type}-preset-01`,
      mainColorHex: "#3b82f6",
      subColorHex: "#f8fafc",
      isKeepMainColor: true,
    })),
  );
  const [sceneStyleAppliedCount, setSceneStyleAppliedCount] = useState(0);

  const [actionState, setActionState] = useState<TdActionControlState>({
    animationType: "Motion",
    presetId: "motion-walk-confident",
    playTimePercent: 45,
    isPreserveCustomPose: true,
    webcamTrackingActive: false,
  });

  const [expressionState, setExpressionState] = useState<TdFacialExpressionState>({
    isAsymmetric: true,
    leftEyebrowPreset: "brow-serious",
    leftEyebrowIntensity: 75,
    rightEyebrowPreset: "brow-raised",
    rightEyebrowIntensity: 60,
    leftEyePreset: "eye-sharp",
    leftEyeIntensity: 80,
    rightEyePreset: "eye-wink",
    rightEyeIntensity: 90,
    mouthPreset: "mouth-smirk",
    mouthIntensity: 70,
    isDirectionLink: true,
    leftEyeGaze: "Center",
    rightEyeGaze: "Center",
  });

  const [shotSize, setShotSize] = useState<TdShotSizePreset>("BustShot");
  const [cameraAngle, setCameraAngle] = useState<TdCameraAnglePreset>("EyeLevelAngle");
  const [cameraPosition, setCameraPosition] = useState<TdCameraPositionPreset>("FrontLeft");
  const [cameraLens, setCameraLens] = useState<TdCameraLensPreset>("Standard");
  const [isCameraLocked, setIsCameraLocked] = useState(false);
  const [selectedPrimitive, setSelectedPrimitive] = useState<TdElementPrimitiveType>("Box");

  const [assetCategory, setAssetCategory] = useState<CreatorPlus3DAssetCategory>("씬");
  const [templateScope, setTemplateScope] = useState<TdSceneTemplateApplyScope>("Both");
  const [bookmarks, setBookmarks] = useState<readonly TdCharacterBookmark[]>([
    {
      bookmarkId: "bm-default-1",
      name: "주인공 기본 전투복 (Pose 516)",
      thumbnailPoseId: 516,
      styleParts: [],
      bodyBones: createDefaultTdBodyBoneValues(),
    },
  ]);

  const boneMultipliers = useMemo(() => evaluateTdBoneScaleMultipliers(bodyBones), [bodyBones]);

  const cameraTransform = useMemo(
    () =>
      computeTdCameraCompositionTransform({
        shotSize,
        angle: cameraAngle,
        position: cameraPosition,
        lens: cameraLens,
        isLocked: isCameraLocked,
      }),
    [shotSize, cameraAngle, cameraPosition, cameraLens, isCameraLocked],
  );

  const visibleBoneSpecs = useMemo(
    () => TD_BONE_SLIDER_SPECS.filter((spec) => spec.groupKo === boneGroup),
    [boneGroup],
  );

  const filteredAssets = useMemo(
    () => CREATOR_PLUS_3D_ASSET_STORE_CATALOG.filter((item) => item.category === assetCategory),
    [assetCategory],
  );

  const handleBoneChange = (key: TdBoneSliderKey, raw: number) => {
    setBodyBones((prev) => ({
      ...prev,
      [key]: clampTdBoneValue(raw),
    }));
  };

  const handleApplyStyleToAllSceneCuts = () => {
    const sampleCuts: TdCutRecord[] = [1, 2, 3].map((num) => ({
      cutId: `td-cut-${num}`,
      cutNumber: num,
      storyboardContent: `컷 #${num} 콘티`,
      cutPrompt: "",
      aspectRatio: "9:16",
      camera: cameraTransform,
      lightType: "Directional",
      shadowMapSize: 4096,
      characters: [
        {
          characterId: "char-main",
          characterName: "주인공",
          styleParts,
          bodyBones,
          action: actionState,
          expression: expressionState,
        },
      ],
    }));
    const updated = applyTdCharacterStyleAcrossSceneCuts(sampleCuts, "char-main", styleParts);
    setSceneStyleAppliedCount(updated.length);
  };

  const handleSaveBookmark = () => {
    const nextBm: TdCharacterBookmark = {
      bookmarkId: `bm-${bookmarks.length + 1}`,
      name: `커스텀 캐릭터 프리셋 #${bookmarks.length + 1} (Pose 516)`,
      thumbnailPoseId: 516,
      styleParts,
      bodyBones,
    };
    setBookmarks((prev) => [...prev, nextBm]);
  };

  return (
    <section
      aria-label="투닝 3D 스튜디오 정밀 인스펙터 및 에셋 스토어"
      data-testid="tooning-3d-studio-inspector-panel"
      className="flex flex-col gap-2.5 rounded-xl border border-line bg-card/70 p-2.5 text-[0.68rem] text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="inline-flex items-center gap-1.5 font-bold text-fg">
          <Move3d className="h-3.5 w-3.5 text-accent" aria-hidden />
          <span>투닝 3D 스튜디오 (TD) 정밀 인스펙터 & 3D 에셋 스토어</span>
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={handleSaveBookmark}
          className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent-soft px-2 py-0.5 text-[0.62rem] font-bold text-accent hover:bg-raised"
        >
          <Bookmark className="h-3 w-3" aria-hidden />
          북마크 저장 ({bookmarks.length})
        </button>
      </div>

      {/* 6 Sub-Inspector Tabs */}
      <div
        role="tablist"
        aria-label="투닝 3D 스튜디오 세부 탭"
        className="grid grid-cols-3 gap-1 sm:grid-cols-6"
      >
        {(
          [
            { id: "body21", label: "체형 21본", icon: Sliders },
            { id: "expression", label: "비대칭·시선", icon: Eye },
            { id: "camera23", label: "23종 카메라", icon: Camera },
            { id: "style", label: "7파츠 의상", icon: Palette },
            { id: "action", label: "모션·웹캠", icon: Video },
            { id: "assetStore", label: "3D 에셋스토어", icon: Box },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = inspectorTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => setInspectorTab(tab.id)}
              className={`flex items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-[0.62rem] font-bold transition-all ${
                active
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line bg-card text-fg-3 hover:text-fg"
              }`}
            >
              <Icon className="h-3 w-3 shrink-0" aria-hidden />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. 21 Bone Transform Sliders (-100 to +100) */}
      {inspectorTab === "body21" && (
        <div className="flex flex-col gap-2" data-testid="td-body-21-bones-tab">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex flex-wrap gap-1" role="group" aria-label="신체 부위 그룹">
              {(["머리·목", "상체", "팔·손", "하체·발"] as const).map((grp) => (
                <button
                  key={grp}
                  type="button"
                  aria-pressed={boneGroup === grp}
                  onClick={() => setBoneGroup(grp)}
                  className={`rounded border px-2 py-0.5 text-[0.6rem] font-bold ${
                    boneGroup === grp
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2"
                  }`}
                >
                  {grp}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setBodyBones(createDefaultTdBodyBoneValues())}
              className="rounded border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-3 hover:bg-raised"
            >
              21종 본 초기화 (0)
            </button>
          </div>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {visibleBoneSpecs.map((spec) => {
              const val = bodyBones[spec.key];
              const scale = boneMultipliers[spec.key];
              return (
                <label
                  key={spec.key}
                  className="flex flex-col gap-0.5 rounded border border-line bg-card p-1.5 text-[0.62rem]"
                >
                  <span className="flex items-center justify-between font-semibold">
                    <span>{spec.labelKo}</span>
                    <span className="font-mono text-accent">
                      {val > 0 ? `+${val}` : val} (×{scale})
                    </span>
                  </span>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={val}
                    disabled={disabled}
                    aria-label={spec.labelKo}
                    onChange={(e) => handleBoneChange(spec.key, Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Asymmetric 5-Region Facial Expression + 9-Direction 3x3 Gaze Grid */}
      {inspectorTab === "expression" && (
        <div className="flex flex-col gap-2" data-testid="td-asymmetric-expression-tab">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 font-semibold text-fg">
              <input
                type="checkbox"
                checked={expressionState.isAsymmetric}
                onChange={(e) =>
                  setExpressionState((prev) => ({ ...prev, isAsymmetric: e.target.checked }))
                }
              />
              비대칭 5영역 표정 제어 (좌·우 눈썹/눈/입 독립 블렌드셰이프)
            </label>
            <label className="inline-flex items-center gap-1.5 text-[0.62rem] font-semibold text-accent">
              <input
                type="checkbox"
                checked={expressionState.isDirectionLink}
                onChange={(e) =>
                  setExpressionState((prev) => ({ ...prev, isDirectionLink: e.target.checked }))
                }
              />
              양안 시선 연동 (isDirectionLink)
            </label>
          </div>

          {expressionState.isAsymmetric ? (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-2 rounded border border-line bg-card px-2 py-1">
                <span>왼쪽 눈썹 강도 ({expressionState.leftEyebrowIntensity}%)</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={expressionState.leftEyebrowIntensity}
                  onChange={(e) =>
                    setExpressionState((prev) => ({
                      ...prev,
                      leftEyebrowIntensity: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-2 rounded border border-line bg-card px-2 py-1">
                <span>오른쪽 눈썹 강도 ({expressionState.rightEyebrowIntensity}%)</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={expressionState.rightEyebrowIntensity}
                  onChange={(e) =>
                    setExpressionState((prev) => ({
                      ...prev,
                      rightEyebrowIntensity: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-2 rounded border border-line bg-card px-2 py-1">
                <span>왼쪽 눈 강도 ({expressionState.leftEyeIntensity}%)</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={expressionState.leftEyeIntensity}
                  onChange={(e) =>
                    setExpressionState((prev) => ({
                      ...prev,
                      leftEyeIntensity: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-2 rounded border border-line bg-card px-2 py-1">
                <span>오른쪽 눈 강도 ({expressionState.rightEyeIntensity}%)</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={expressionState.rightEyeIntensity}
                  onChange={(e) =>
                    setExpressionState((prev) => ({
                      ...prev,
                      rightEyeIntensity: Number(e.target.value),
                    }))
                  }
                />
              </label>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded border border-line bg-card px-2 py-1">
              <span>대칭 눈·눈썹 통합 강도 ({expressionState.leftEyeIntensity}%)</span>
              <input
                type="range"
                min={0}
                max={100}
                value={expressionState.leftEyeIntensity}
                onChange={(e) =>
                  setExpressionState((prev) =>
                    syncTdSymmetricExpression(prev, "eye", prev.leftEyePreset, Number(e.target.value)),
                  )
                }
              />
            </div>
          )}

          <div className="rounded border border-line bg-card p-2">
            <span className="mb-1 block text-[0.62rem] font-bold text-fg-2">
              9방향 3×3 아일릿 시선 그리드 (좌안: {expressionState.leftEyeGaze} / 우안:{" "}
              {expressionState.rightEyeGaze})
            </span>
            <div className="grid grid-cols-3 gap-1">
              {TD_GAZE_GRID_3X3.map((cell) => {
                const isSelected = expressionState.leftEyeGaze === cell.direction;
                return (
                  <button
                    key={cell.direction}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      setExpressionState((prev) => setTdEyeGazeDirection(prev, "left", cell.direction))
                    }
                    className={`rounded border py-1 text-[0.6rem] font-semibold ${
                      isSelected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-raised text-fg-2"
                    }`}
                  >
                    {cell.labelKo}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. 23 Camera Composition Presets + 10 Primitives */}
      {inspectorTab === "camera23" && (
        <div className="flex flex-col gap-2" data-testid="td-camera-23-presets-tab">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <label className="flex flex-col gap-0.5 text-[0.6rem] font-semibold">
              샷 사이즈 (7종)
              <select
                aria-label="3D 카메라 샷 사이즈"
                value={shotSize}
                onChange={(e) => setShotSize(e.target.value as TdShotSizePreset)}
                className="rounded border border-line bg-field px-1.5 py-1 text-[0.62rem]"
              >
                {TD_SHOT_SIZE_SPECS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.labelKo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[0.6rem] font-semibold">
              카메라 앵글 (5종)
              <select
                aria-label="3D 카메라 앵글"
                value={cameraAngle}
                onChange={(e) => setCameraAngle(e.target.value as TdCameraAnglePreset)}
                className="rounded border border-line bg-field px-1.5 py-1 text-[0.62rem]"
              >
                {TD_CAMERA_ANGLE_SPECS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.labelKo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[0.6rem] font-semibold">
              카메라 방위 (8종)
              <select
                aria-label="3D 카메라 방위"
                value={cameraPosition}
                onChange={(e) => setCameraPosition(e.target.value as TdCameraPositionPreset)}
                className="rounded border border-line bg-field px-1.5 py-1 text-[0.62rem]"
              >
                {TD_CAMERA_POSITION_SPECS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.labelKo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[0.6rem] font-semibold">
              렌즈 화각 (3종)
              <select
                aria-label="3D 카메라 렌즈 화각"
                value={cameraLens}
                onChange={(e) => setCameraLens(e.target.value as TdCameraLensPreset)}
                className="rounded border border-line bg-field px-1.5 py-1 text-[0.62rem]"
              >
                {TD_CAMERA_LENS_SPECS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.labelKo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-card px-2 py-1.5 font-mono text-[0.6rem]">
            <span>
              Camera XYZ: [{cameraTransform.cameraPositionWorld.join(", ")}] · FOV:{" "}
              {cameraTransform.fovDeg}°
            </span>
            <button
              type="button"
              aria-pressed={isCameraLocked}
              onClick={() => setIsCameraLocked((prev) => !prev)}
              className={`rounded border px-2 py-0.5 font-sans font-bold ${
                isCameraLocked
                  ? "border-accent bg-accent text-bg"
                  : "border-line bg-raised text-fg-2"
              }`}
            >
              {isCameraLocked ? "카메라 잠금됨 (Locked)" : "카메라 잠금 해제"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[0.6rem] font-semibold text-fg-3">10종 기본 3D 도형:</span>
            {TD_ELEMENT_PRIMITIVES.map((prim) => (
              <button
                key={prim}
                type="button"
                aria-pressed={selectedPrimitive === prim}
                onClick={() => setSelectedPrimitive(prim)}
                className={`rounded border px-1.5 py-0.5 text-[0.58rem] font-semibold ${
                  selectedPrimitive === prim
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3"
                }`}
              >
                {prim}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. 7-Part Character Style Inspector */}
      {inspectorTab === "style" && (
        <div className="flex flex-col gap-2" data-testid="td-style-7-parts-tab">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {styleParts.map((slot) => {
              const label =
                TD_STYLE_PART_CATEGORIES.find((c) => c.type === slot.partType)?.labelKo ??
                slot.partType;
              return (
                <div
                  key={slot.partType}
                  className="flex flex-col gap-1 rounded border border-line bg-card p-1.5 text-[0.6rem]"
                >
                  <span className="font-bold text-fg">{label}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setStyleParts((prev) =>
                        prev.map((item) =>
                          item.partType === slot.partType
                            ? updateTdStylePartPreset(item, `${slot.partType}-preset-02`)
                            : item,
                        ),
                      )
                    }
                    className="rounded border border-line bg-raised px-1.5 py-0.5 text-[0.58rem] text-fg-2"
                  >
                    {slot.presetId}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleApplyStyleToAllSceneCuts}
              className="rounded-md border border-accent bg-accent-soft px-2.5 py-1 text-[0.62rem] font-bold text-accent hover:bg-raised"
            >
              씬 내 모든 컷에 의상·헤어 일괄 동기화 (applyCharacterStyleToScene)
            </button>
            {sceneStyleAppliedCount > 0 && (
              <span className="text-[0.6rem] font-bold text-good">
                {sceneStyleAppliedCount}개 컷 동기화 완료
              </span>
            )}
          </div>
        </div>
      )}

      {/* 5. Motion Timeline Scrubber & MediaPipe Webcam Tracking */}
      {inspectorTab === "action" && (
        <div className="flex flex-col gap-2" data-testid="td-action-webcam-tab">
          <label className="flex flex-col gap-1 rounded border border-line bg-card p-2 text-[0.62rem]">
            <span>모션 타임라인 프레임 고정 스크러버 ({actionState.playTimePercent}% 프레임)</span>
            <input
              type="range"
              aria-label="모션 타임라인 프레임 고정 스크러버"
              min={0}
              max={100}
              value={actionState.playTimePercent}
              onChange={(e) =>
                setActionState((prev) => ({ ...prev, playTimePercent: Number(e.target.value) }))
              }
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-card p-2 text-[0.6rem]">
            <span>
              MediaPipe 웹캠 전신·손가락 리타겟팅 (Z_SCALE={TD_MEDIAPIPE_RETARGET_CONFIG.LANDMARK_Z_SCALE} ·
              Slerp={TD_MEDIAPIPE_RETARGET_CONFIG.QUATERNION_SLERP_FACTOR})
            </span>
            <button
              type="button"
              aria-pressed={actionState.webcamTrackingActive}
              onClick={() =>
                setActionState((prev) => ({
                  ...prev,
                  webcamTrackingActive: !prev.webcamTrackingActive,
                }))
              }
              className={`rounded border px-2 py-0.5 font-bold ${
                actionState.webcamTrackingActive
                  ? "border-accent bg-accent text-bg"
                  : "border-line bg-raised text-fg-2"
              }`}
            >
              {actionState.webcamTrackingActive ? "웹캠 트래킹 활성" : "웹캠 트래킹 시작"}
            </button>
          </div>
        </div>
      )}

      {/* 6. 3D Asset Store (3dasset.tooning.io) & Scene Template Slot Mapping */}
      {inspectorTab === "assetStore" && (
        <div className="flex flex-col gap-2" data-testid="td-3d-asset-store-tab">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex flex-wrap gap-1" role="group" aria-label="3D 에셋 스토어 카테고리">
              {(["씬", "공간", "요소", "포즈", "기타"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={assetCategory === cat}
                  onClick={() => setAssetCategory(cat)}
                  className={`rounded border px-2 py-0.5 text-[0.6rem] font-bold ${
                    assetCategory === cat
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <select
              aria-label="씬 템플릿 적용 범위"
              value={templateScope}
              onChange={(e) => setTemplateScope(e.target.value as TdSceneTemplateApplyScope)}
              className="rounded border border-line bg-field px-1.5 py-0.5 text-[0.6rem]"
            >
              <option value="Both">배경 + 캐릭터 포즈 동시 적용 (Both)</option>
              <option value="Background">배경·조명만 적용 (Background)</option>
              <option value="Character">캐릭터 포즈 슬롯만 매핑 (Character)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            {filteredAssets.map((asset) => (
              <div
                key={asset.assetId}
                className="flex items-center justify-between rounded border border-line bg-card px-2 py-1.5 text-[0.62rem]"
              >
                <div>
                  <span className="font-bold text-fg">{asset.titleKo}</span>
                  <span className="ml-1.5 text-[0.58rem] text-fg-3">
                    ({asset.objectCount}개 오브젝트 · {asset.tagsKo.join("/")})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const dummyCut: TdCutRecord = {
                      cutId: "cut-1",
                      cutNumber: 1,
                      storyboardContent: asset.titleKo,
                      cutPrompt: "",
                      aspectRatio: "9:16",
                      camera: cameraTransform,
                      lightType: "Directional",
                      shadowMapSize: 4096,
                      characters: [],
                    };
                    applyTdSceneTemplateWithCharacterMapping({
                      cut: dummyCut,
                      scope: templateScope,
                      templatePoseId: asset.assetId,
                      templateCamera: cameraTransform,
                      slotMap: { slot1: "char-main" },
                    });
                  }}
                  className="inline-flex items-center gap-1 rounded border border-accent bg-accent-soft px-2 py-0.5 text-[0.6rem] font-bold text-accent"
                >
                  <Sparkles className="h-3 w-3" aria-hidden />씬 적용
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
