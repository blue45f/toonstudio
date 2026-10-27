import { useMemo, useState, type ReactElement } from "react";

import {
  CSP_CLIP_STUDIO_LAUNCHER_NATIVE_ARCHITECTURE,
  CSP_KOREAN_EDIT_IMAGE_TOOL_TODB_SPEC,
  CSP_URML_SUBSYSTEM_MANIFEST,
  applyCspLayerCompToScene,
  computeCspAlignAndDistributeRects,
  computeCspBookbinding3DFlatplanAndSpine,
  computeCspCircularTextGlyphTransforms,
  computeCspOnionSkinFrameStack,
  evaluateCspCamera2DAndTrackLabels,
  evaluateCspDualBrushWetEdgeAndLmsMix,
  evaluateCspUrmlHandCapturePose,
  evaluateCspUrmlPalmDetection,
  generateCspVectorBalloonAndStreamLineGeometry,
  solveCspPuppetTransformMesh,
  type CspAlignAxisMode,
  type CspDualBrushCompositeMode,
} from "../../../../../../packages/studio-format-gateway/src/csp-urml-puppet-story-animation-roku";
import { CspPwEditSliderJoint } from "./StudioCspPwuiBentoToonSection";

export function StudioCspUrmlPuppetStoryAnimationSection(): ReactElement {
  // 1. URML* HandCapture + PalmDetection
  const [handSide, setHandSide] = useState<"left" | "right">("right");
  const [fingerCurlPercent, setFingerCurlPercent] = useState<number>(35);
  const [fingerSpreadPercent, setFingerSpreadPercent] = useState<number>(60);
  const [contactAxisMm, setContactAxisMm] = useState<number>(28);

  // 2. PWPuppetTransformPrecomputeTerms (Puppet Warp ARAP)
  const [puppetPinRotDeg, setPuppetPinRotDeg] = useState<number>(25);
  const [puppetDensity, setPuppetDensity] = useState<1 | 2 | 3>(2);

  // 3. PWLayerCompManager & URAlignDistributeController
  const [alignMode, setAlignMode] = useState<CspAlignAxisMode>("align-h-center");
  const [useVectorCoreLine, setUseVectorCoreLine] = useState<boolean>(true);

  // 4. 2D Cel Animation (OnionSkin + LightTable + Camera2D + TrackLabel '/' & '|')
  const [currentFrame, setCurrentFrame] = useState<number>(4);
  const [onionPrevCount, setOnionPrevCount] = useState<number>(2);
  const [onionNextCount, setOnionNextCount] = useState<number>(2);
  const [trackLabelCmd, setTrackLabelCmd] = useState<
    "animationaddinbetweentracklabel" | "animationaddinvertinbetweentracklabel"
  >("animationaddinvertinbetweentracklabel");

  // 5. .cmc Story & 3D Bookbinding Flatplan + VectorBalloon + StreamLine
  const [bookPageCount, setBookPageCount] = useState<number>(32);
  const [bindingDirection, setBindingDirection] = useState<"right-to-left" | "left-to-right">(
    "right-to-left",
  );
  const [tailCurveKind, setTailCurveKind] = useState<"spline" | "polyline" | "line">("spline");

  // 6. Dual-Brush + Watercolor Wet-Edge + LMS Perceptual Color Mixing + Circular Text
  const [lmsLinearityPercent, setLmsLinearityPercent] = useState<number>(85);
  const [waterEdgeStrengthPercent, setWaterEdgeStrengthPercent] = useState<number>(75);
  const [dualCompositeMode, setDualCompositeMode] = useState<CspDualBrushCompositeMode>("multiply");
  const [circularText, setCircularText] = useState<string>("CLIP STUDIO 5.1.5");

  const handPose = useMemo(
    () =>
      evaluateCspUrmlHandCapturePose({
        handSide,
        curl01ByFinger: [
          fingerCurlPercent / 100,
          fingerCurlPercent / 100,
          fingerCurlPercent / 100,
          fingerCurlPercent / 100,
          fingerCurlPercent / 100,
        ],
        spread01: fingerSpreadPercent / 100,
        emaAlpha01: 0.75,
      }),
    [handSide, fingerCurlPercent, fingerSpreadPercent],
  );

  const palmResult = useMemo(
    () =>
      evaluateCspUrmlPalmDetection({
        contactMajorAxisMm: contactAxisMm,
        contactMinorAxisMm: contactAxisMm * 0.75,
        stylusActive: true,
      }),
    [contactAxisMm],
  );

  const puppetSolution = useMemo(
    () =>
      solveCspPuppetTransformMesh({
        vertices: [
          { x: 0, y: 0 },
          { x: 40, y: 10 },
          { x: 80, y: 30 },
        ],
        pins: [
          {
            pinId: "shoulder",
            restX: 0,
            restY: 0,
            targetX: 0,
            targetY: 0,
            rotationDeg: 0,
            angleLimitDeg: 45,
          },
          {
            pinId: "wrist",
            restX: 80,
            restY: 30,
            targetX: 86,
            targetY: 18,
            rotationDeg: puppetPinRotDeg,
            angleLimitDeg: 60,
          },
        ],
        meshDensityLevel: puppetDensity,
      }),
    [puppetPinRotDeg, puppetDensity],
  );

  const layerCompSample = useMemo(
    () =>
      applyCspLayerCompToScene({
        compId: "comp_night_ver",
        compName: "NightVariant",
        recordVisibility: true,
        recordPosition: true,
        recordOpacity: true,
        layerStates: [
          { layerId: "LineArt", visible: true, offsetX: 0, offsetY: 0, opacity01: 1 },
          { layerId: "NightRimLight", visible: true, offsetX: 2, offsetY: -1, opacity01: 0.85 },
          { layerId: "DaySunGlow", visible: false, offsetX: 0, offsetY: 0, opacity01: 0 },
        ],
      }),
    [],
  );

  const alignedRects = useMemo(
    () =>
      computeCspAlignAndDistributeRects({
        objects: [
          { objectId: "FrameA", x: 12, y: 20, width: 100, height: 60, strokeHalfWidthPx: 2 },
          { objectId: "FrameB", x: 140, y: 45, width: 80, height: 50, strokeHalfWidthPx: 4 },
          { objectId: "FrameC", x: 260, y: 15, width: 120, height: 70, strokeHalfWidthPx: 3 },
        ],
        mode: alignMode,
        baseArea: "Canvas",
        baseBounds: { x: 0, y: 0, width: 400, height: 200 },
        useVectorCoreLine,
      }),
    [alignMode, useVectorCoreLine],
  );

  const onionStack = useMemo(
    () =>
      computeCspOnionSkinFrameStack(currentFrame, 12, {
        prevDisplayCount: onionPrevCount,
        nextDisplayCount: onionNextCount,
        startOpacityPercent: 50,
        stepOpacityPercent: 15,
        prevColorHex: "#ef4444",
        nextColorHex: "#22c55e",
        halfColorMode: true,
      }),
    [currentFrame, onionPrevCount, onionNextCount],
  );

  const cameraTrack = useMemo(
    () =>
      evaluateCspCamera2DAndTrackLabels({
        frameIndex: currentFrame,
        startPanX: 0,
        endPanX: 120,
        startZoom: 1,
        endZoom: 1.35,
        durationFrames: 12,
        trackLabelCommand: trackLabelCmd,
      }),
    [currentFrame, trackLabelCmd],
  );

  const flatplan = useMemo(
    () =>
      computeCspBookbinding3DFlatplanAndSpine({
        trimWidthMm: 148,
        trimHeightMm: 210,
        bleedMm: 3,
        pageCount: bookPageCount,
        paperThicknessPerPageMm: 0.12,
        coverThicknessMm: 0.35,
        bindingDirection,
        nombrePrefix: "P.",
      }),
    [bookPageCount, bindingDirection],
  );

  const balloonStream = useMemo(
    () =>
      generateCspVectorBalloonAndStreamLineGeometry({
        balloonRx: 48,
        balloonRy: 32,
        tailTipX: 18,
        tailTipY: 54,
        tailWidthPx: 12,
        tailCurveKind,
        streamLineCount: 6,
        streamLengthPx: 90,
        streamLengthDisturb01: 0.35,
      }),
    [tailCurveKind],
  );

  const lmsWetMix = useMemo(
    () =>
      evaluateCspDualBrushWetEdgeAndLmsMix({
        colorAHex: "#facc15",
        colorBHex: "#2563eb",
        mixRatio01: 0.5,
        lmsLinearity01: lmsLinearityPercent / 100,
        primaryAlpha01: 0.9,
        dualAlpha01: 0.8,
        dualCompositeMode,
        radialDistance01: 0.88,
        waterEdgeStrength01: waterEdgeStrengthPercent / 100,
        waterEdgeVividness01: 0.7,
      }),
    [lmsLinearityPercent, waterEdgeStrengthPercent, dualCompositeMode],
  );

  const circularGlyphs = useMemo(
    () =>
      computeCspCircularTextGlyphTransforms({
        text: circularText,
        radiusPx: 64,
        direction: "clockwise",
      }),
    [circularText],
  );

  return (
    <div
      data-testid="csp-urml-puppet-story-animation-section"
      className="grid grid-cols-1 gap-2.5 lg:grid-cols-2"
    >
      {/* 1. URML* Machine Learning Suite */}
      <div className="rounded border border-line bg-panel p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-semibold">
            1. URML* 머신러닝 (HandCapture 21관절·AutoPaint·PalmDetection)
          </span>
          <span className="rounded bg-card px-1.5 py-0.5 text-[0.62rem] text-accent">
            {CSP_URML_SUBSYSTEM_MANIFEST.rttiClasses.length} RTTI Classes
          </span>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5 text-[0.66rem]">
          <button
            type="button"
            onClick={() => setHandSide(handSide === "right" ? "left" : "right")}
            className="rounded border border-line bg-card px-2 py-0.5"
          >
            손 방향: {handSide === "right" ? "오른손" : "왼손"}
          </button>
          <span className="rounded bg-card px-2 py-0.5 text-fg-2">
            팜 리젝션: {palmResult.isPalmRejected ? "차단됨" : "통과"} ({(palmResult.confidence01 * 100).toFixed(0)}%)
          </span>
        </div>
        <div className="space-y-1.5">
          <CspPwEditSliderJoint
            label="손가락 굽힘 (URFingerAngleLimiter)"
            value={fingerCurlPercent}
            min={0}
            max={100}
            unit="%"
            onChange={setFingerCurlPercent}
          />
          <CspPwEditSliderJoint
            label="손가락 벌림 & 접촉 반경(mm)"
            value={contactAxisMm}
            min={8}
            max={60}
            unit="mm"
            onChange={(v) => {
              setContactAxisMm(v);
              setFingerSpreadPercent(Math.min(100, v * 2));
            }}
          />
        </div>
        <div
          data-testid="csp-urml-hand-readout"
          className="mt-1.5 rounded bg-card p-1.5 text-[0.65rem]"
        >
          21관절 키포인트: {handPose.filteredKeypoints21.length}개 · 검지 PIP:{" "}
          {handPose.clampedJointAnglesDeg[1]?.pipFlexDeg ?? 0}° / DIP:{" "}
          {handPose.clampedJointAnglesDeg[1]?.dipFlexDeg ?? 0}°
        </div>
      </div>

      {/* 2. PWPuppetTransformPrecomputeTerms & PWLayerComp / AlignDistribute */}
      <div className="rounded border border-line bg-panel p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-semibold">
            2. 퍼핏 변형(ARAP) · 레이어 콤프 · 정렬/분포(VectorCoreLine)
          </span>
          <span className="rounded bg-card px-1.5 py-0.5 text-[0.62rem] text-accent">
            ODCDrawElemArray×6
          </span>
        </div>
        <CspPwEditSliderJoint
          label="퍼핏 핀 회전각 (AngleLimit 60°)"
          value={puppetPinRotDeg}
          min={-60}
          max={60}
          unit="°"
          onChange={setPuppetPinRotDeg}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.65rem]">
          {[1, 2, 3].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setPuppetDensity(d as 1 | 2 | 3)}
              className={`rounded border px-1.5 py-0.5 ${
                puppetDensity === d ? "border-accent text-accent" : "border-line bg-card"
              }`}
            >
              메쉬 밀도 {d}단
            </button>
          ))}
          <select
            aria-label="정렬 모드"
            value={alignMode}
            onChange={(e) => setAlignMode(e.target.value as CspAlignAxisMode)}
            className="rounded border border-line bg-card px-1.5 py-0.5"
          >
            <option value="align-h-center">수평 중앙 정렬</option>
            <option value="align-left">좌측 정렬</option>
            <option value="distribute-h-centers">수평 등간격 분포</option>
          </select>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={useVectorCoreLine}
              onChange={(e) => setUseVectorCoreLine(e.target.checked)}
            />
            <span>벡터 중심선 기준</span>
          </label>
        </div>
        <div
          data-testid="csp-puppet-layercomp-readout"
          className="mt-1.5 rounded bg-card p-1.5 text-[0.65rem]"
        >
          최대 변위: {puppetSolution.maxDisplacementPx}px · 콤프 내보내기:{" "}
          <strong>{layerCompSample.exportFileName}</strong> ({layerCompSample.visibleLayerIds.length}레이어) ·
          FrameA X={alignedRects[0]?.x ?? 0}
        </div>
      </div>

      {/* 3. 2D Cel Animation & .cmc 3D Bookbinding Flatplan */}
      <div className="rounded border border-line bg-panel p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-semibold">
            3. 2D 셀 애니메이션(어니언스킨·트랙라벨) & .cmc 제본·말풍선·유선
          </span>
          <span className="rounded bg-card px-1.5 py-0.5 text-[0.62rem] text-accent">
            트랙기호 {cameraTrack.trackSymbol} · 책등 {flatplan.spineWidthMm}mm
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <CspPwEditSliderJoint
            label="현재 프레임 (Camera2D)"
            value={currentFrame}
            min={0}
            max={11}
            unit="f"
            onChange={setCurrentFrame}
          />
          <CspPwEditSliderJoint
            label="단행본 페이지 수 (.cmc)"
            value={bookPageCount}
            min={8}
            max={120}
            unit="p"
            onChange={(v) => {
              setBookPageCount(v);
              setOnionPrevCount(2);
              setOnionNextCount(2);
            }}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[0.65rem]">
          <button
            type="button"
            onClick={() =>
              setTrackLabelCmd(
                trackLabelCmd === "animationaddinbetweentracklabel"
                  ? "animationaddinvertinbetweentracklabel"
                  : "animationaddinbetweentracklabel",
              )
            }
            className="rounded border border-line bg-card px-2 py-0.5"
          >
            트랙 라벨: {cameraTrack.trackSymbol === "/" ? "정방향 동화(/)" : "역방향 동화(|)"}
          </button>
          <button
            type="button"
            onClick={() =>
              setBindingDirection(
                bindingDirection === "right-to-left" ? "left-to-right" : "right-to-left",
              )
            }
            className="rounded border border-line bg-card px-2 py-0.5"
          >
            제본: {bindingDirection === "right-to-left" ? "우철(일본/만화)" : "좌철(한국/교양)"}
          </button>
          <button
            type="button"
            onClick={() =>
              setTailCurveKind(tailCurveKind === "spline" ? "polyline" : "spline")
            }
            className="rounded border border-line bg-card px-2 py-0.5"
          >
            말풍선 꼬리: {tailCurveKind}
          </button>
        </div>
        <div
          data-testid="csp-anim-story-readout"
          className="mt-1.5 rounded bg-card p-1.5 text-[0.65rem]"
        >
          어니언스킨: {onionStack.length}장 · 카메라 PanX: {cameraTrack.interpolatedPanX}px (Zoom{" "}
          {cameraTrack.interpolatedZoom}x) · 표지 펼침폭: {flatplan.fullSpreadCoverWidthMm}mm · 유선:{" "}
          {balloonStream.streamLineSegments.length}가닥
        </div>
      </div>

      {/* 4. Dual-Brush + Wet-Edge + LMS Mixing + Korean EditImageTool.todb + PWRokuLib */}
      <div className="rounded border border-line bg-panel p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-semibold">
            4. 듀얼브러시·습식수채·LMS 감산혼색·원형텍스트·한국어 255도구·PWRokuLib
          </span>
          <span className="rounded bg-card px-1.5 py-0.5 text-[0.62rem] text-accent">
            {CSP_KOREAN_EDIT_IMAGE_TOOL_TODB_SPEC.totalToolNodes}노드 /{" "}
            {CSP_CLIP_STUDIO_LAUNCHER_NATIVE_ARCHITECTURE.pwRokuLibModuleCount}모듈
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <CspPwEditSliderJoint
            label="LMS 선형 감산혼색 (BrushLMSLinearity)"
            value={lmsLinearityPercent}
            min={0}
            max={100}
            unit="%"
            onChange={setLmsLinearityPercent}
          />
          <CspPwEditSliderJoint
            label="수채 물 경계 강도 (BrushWaterEdgeStrength)"
            value={waterEdgeStrengthPercent}
            min={0}
            max={100}
            unit="%"
            onChange={setWaterEdgeStrengthPercent}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.65rem]">
          <select
            aria-label="듀얼 브러시 합성 모드"
            value={dualCompositeMode}
            onChange={(e) => setDualCompositeMode(e.target.value as CspDualBrushCompositeMode)}
            className="rounded border border-line bg-card px-1.5 py-0.5"
          >
            <option value="multiply">듀얼 곱하기(Multiply)</option>
            <option value="darken">듀얼 어둡게(Darken)</option>
            <option value="subtract">듀얼 빼기(Subtract)</option>
          </select>
          <input
            type="text"
            aria-label="원형 텍스트 입력"
            value={circularText}
            onChange={(e) => setCircularText(e.target.value)}
            className="rounded border border-line bg-card px-1.5 py-0.5"
          />
        </div>
        <div
          data-testid="csp-dualbrush-roku-readout"
          className="mt-1.5 rounded bg-card p-1.5 text-[0.65rem]"
        >
          노랑+파랑 LMS 혼색: <strong>{lmsWetMix.mixedHex}</strong> · 물 경계 배율:{" "}
          {lmsWetMix.wetEdgeRingMultiplier}x · 원형 글리프: {circularGlyphs.length}자 · 클라우드 동기화:{" "}
          {CSP_CLIP_STUDIO_LAUNCHER_NATIVE_ARCHITECTURE.iceCloudAutoSyncChannels.length}채널
        </div>
      </div>
    </div>
  );
}
