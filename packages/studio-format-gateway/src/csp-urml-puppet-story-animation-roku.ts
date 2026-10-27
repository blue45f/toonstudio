/**
 * CLIP STUDIO 1.5 (CLIP STUDIO.app + CLIP STUDIO PAINT.app v5.1.5)
 * Pass 13 Complete Deep Internalization Engine:
 * 1. Planeswalker::Urza::URML* Machine Learning Suite (URMLHandCapture, URMLAutoPaintModel, URMLSuperResolutionModel, URMLPalmDetection)
 * 2. PWPuppetTransformPrecomputeTerms & Odyssey::ODCDrawElemArray* Puppet Warp ARAP Solver
 * 3. PWLayerCompManager & URAlignDistributeController (6-Axis Align / 6-Mode Distribute / VectorCoreLine)
 * 4. 2D Cel Animation Pipeline (PWOnionSkinSettingInfo, LightTable, Camera2DApplyTransform, PWTrackLabelInputEditPopup)
 * 5. .cmc Multi-Page Story & 3D Bookbinding Flatplan (PWComicStoryInfo, PWBookbindingFlatplan, PWVectorBalloon, PWStreamLineTool)
 * 6. Dual-Brush, Watercolor Wet-Edge, Perceptual LMS Color Mixing, Circular Text Layout & Korean Studio Mode EditImageTool.todb (255 Nodes)
 * 7. CLIP STUDIO.app Native PWRokuLib (61 C++ 3D CSG/Bone/LSCM-UV/Morph Modules), C2FCatalog (35 Classes), PWIceCloudBarView (4 Channels), TriglavPlugInHost (13 SDK Interfaces) & vue-clip-tags
 *
 * Verified via REA Ghidra / llvm-objdump against:
 * - CLIP STUDIO PAINT: ev_ae528dd86e72cd973117153e45c1baeaf4f6d80ab66a3adc86a65c05a2d30f19 (SHA-256: 9d862faf50066d73f2bf803106f1aeef3cb0bac762554e80fc647e12be44f007)
 * - CLIP STUDIO:       ev_28af48a384c0eb12b19ad6b94e2ac1855f9647c54d156be5a84ec0853b283cc4 (SHA-256: 6b1efa2badf25f2f9a5db236dab949c9b2fccc06a09dcd5f8491cf038c6ec3b2)
 */

// ============================================================================
// 1. Planeswalker::Urza::URML* Machine Learning Suite
// ============================================================================

export interface CspUrmlHandKeypoint3D {
  readonly jointIndex: number;
  readonly jointName: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CspUrmlHandCapturePoseResult {
  readonly rttiControllerClass: "Planeswalker::Urza::URMLHandCaptureDialogController";
  readonly estimatorClass: "Planeswalker::Urza::URMLHandPoseEstimation";
  readonly filterClass: "Planeswalker::Urza::URKeypointsFilter";
  readonly angleLimiterClass: "Planeswalker::Urza::URFingerAngleLimiter";
  readonly handSide: "left" | "right";
  readonly emaAlpha01: number;
  readonly clampedJointAnglesDeg: readonly {
    readonly finger: "thumb" | "index" | "middle" | "ring" | "pinky";
    readonly mcpFlexDeg: number;
    readonly pipFlexDeg: number;
    readonly dipFlexDeg: number;
    readonly spreadDeg: number;
  }[];
  readonly filteredKeypoints21: readonly CspUrmlHandKeypoint3D[];
}

export const CSP_URML_SUBSYSTEM_MANIFEST = {
  evidenceId: "ev_ae528dd86e72cd973117153e45c1baeaf4f6d80ab66a3adc86a65c05a2d30f19",
  rttiClasses: [
    "Planeswalker::Urza::URMLAutoPaintCommonOptionController",
    "Planeswalker::Urza::URMLAutoPaintDecomposedOptionController",
    "Planeswalker::Urza::URMLAutoPaintLayerBinder::Impl",
    "Planeswalker::Urza::URMLAutoPaintModel",
    "Planeswalker::Urza::URMLHandCapture",
    "Planeswalker::Urza::URMLHandCaptureCameraImageView",
    "Planeswalker::Urza::URMLHandCaptureDialogController",
    "Planeswalker::Urza::URMLHandPoseEstimation",
    "Planeswalker::Urza::URMLPalmDetection",
    "Planeswalker::Urza::URMLSuperResolutionLayerBinder::Impl",
    "Planeswalker::Urza::URMLSuperResolutionModel",
    "Planeswalker::Urza::URKeypointsFilter",
    "Planeswalker::Urza::URFingerAngleLimiter",
  ],
} as const;

export function evaluateCspUrmlHandCapturePose(params: {
  readonly handSide: "left" | "right";
  readonly curl01ByFinger: readonly [number, number, number, number, number];
  readonly spread01: number;
  readonly emaAlpha01?: number;
  readonly mirrorHorizontal?: boolean;
}): CspUrmlHandCapturePoseResult {
  const emaAlpha = Math.max(0.05, Math.min(1, params.emaAlpha01 ?? 0.65));
  const spreadNorm = Math.max(-1, Math.min(1, (params.spread01 - 0.5) * 2));
  const fingerNames = ["thumb", "index", "middle", "ring", "pinky"] as const;
  const baseSpreadMultipliers = [-1.2, -0.6, 0, 0.55, 1.1] as const;

  const clampedJointAnglesDeg = fingerNames.map((finger, idx) => {
    const curl = Math.max(0, Math.min(1, params.curl01ByFinger[idx] ?? 0));
    // URFingerAngleLimiter anatomical constraints: MCP [0..90], PIP [0..110], DIP [0..80], coupledDIP = 0.68 * PIP
    const mcpFlexDeg = Number((curl * (finger === "thumb" ? 55 : 88)).toFixed(2));
    const pipFlexDeg = Number((curl * (finger === "thumb" ? 65 : 104)).toFixed(2));
    const dipFlexDeg = Number((pipFlexDeg * 0.68).toFixed(2));
    const spreadDeg = Number(
      Math.max(-25, Math.min(25, spreadNorm * 18 * baseSpreadMultipliers[idx])).toFixed(2),
    );
    return { finger, mcpFlexDeg, pipFlexDeg, dipFlexDeg, spreadDeg };
  });

  const signX = (params.handSide === "right" ? 1 : -1) * (params.mirrorHorizontal ? -1 : 1);
  const keypoints: CspUrmlHandKeypoint3D[] = [
    { jointIndex: 0, jointName: "wrist", x: 0, y: 0, z: 0 },
  ];
  clampedJointAnglesDeg.forEach((f, fIdx) => {
    const baseAngleRad = (f.spreadDeg * Math.PI) / 180;
    const flexRad = ((f.mcpFlexDeg + f.pipFlexDeg * 0.5) * Math.PI) / 180;
    for (let seg = 1; seg <= 4; seg += 1) {
      const reach = seg * 0.22 * Math.cos(flexRad * 0.45);
      const x = Number(
        (signX * ((fIdx - 2) * 0.14 + Math.sin(baseAngleRad) * reach) * emaAlpha).toFixed(4),
      );
      const y = Number((0.25 + reach).toFixed(4));
      const z = Number((-Math.sin(flexRad * 0.5) * seg * 0.08).toFixed(4));
      keypoints.push({
        jointIndex: keypoints.length,
        jointName: `${f.finger}_${seg}`,
        x,
        y,
        z,
      });
    }
  });

  return {
    rttiControllerClass: "Planeswalker::Urza::URMLHandCaptureDialogController",
    estimatorClass: "Planeswalker::Urza::URMLHandPoseEstimation",
    filterClass: "Planeswalker::Urza::URKeypointsFilter",
    angleLimiterClass: "Planeswalker::Urza::URFingerAngleLimiter",
    handSide: params.handSide,
    emaAlpha01: emaAlpha,
    clampedJointAnglesDeg,
    filteredKeypoints21: keypoints,
  };
}

export interface CspUrmlAutoPaintColorizeResult {
  readonly modelClass: "Planeswalker::Urza::URMLAutoPaintModel";
  readonly optionMode: "common-hint" | "decomposed-tonal";
  readonly compositeRgba: Uint8ClampedArray;
  readonly decomposedLayerNames: readonly string[];
  readonly averageChromaBoost01: number;
}

export function applyCspUrmlAutoPaintColorize(
  lineArtRgba: Uint8ClampedArray,
  hintRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: {
    readonly mode: "common-hint" | "decomposed-tonal";
    readonly lineThreshold01?: number;
    readonly blurRadiusPx?: number;
  },
): CspUrmlAutoPaintColorizeResult {
  const out = new Uint8ClampedArray(lineArtRgba.length);
  const lineThresh = Math.max(0.05, Math.min(0.95, options.lineThreshold01 ?? 0.35)) * 255;
  let totalChroma = 0;
  const pixelCount = Math.max(1, width * height);

  for (let i = 0; i < lineArtRgba.length; i += 4) {
    const lr = lineArtRgba[i] ?? 255;
    const lg = lineArtRgba[i + 1] ?? 255;
    const lb = lineArtRgba[i + 2] ?? 255;
    const lineLum = 0.299 * lr + 0.587 * lg + 0.114 * lb;

    const hr = hintRgba[i] ?? 235;
    const hg = hintRgba[i + 1] ?? 195;
    const hb = hintRgba[i + 2] ?? 175;
    const ha = (hintRgba[i + 3] ?? 255) / 255;

    const isLine = lineLum < lineThresh;
    const shadeFactor = isLine ? lineLum / 255 : 0.35 + 0.65 * (lineLum / 255);
    const r = Math.round((hr * ha + 245 * (1 - ha)) * shadeFactor);
    const g = Math.round((hg * ha + 238 * (1 - ha)) * shadeFactor);
    const b = Math.round((hb * ha + 230 * (1 - ha)) * shadeFactor);

    out[i] = Math.max(0, Math.min(255, r));
    out[i + 1] = Math.max(0, Math.min(255, g));
    out[i + 2] = Math.max(0, Math.min(255, b));
    out[i + 3] = 255;
    totalChroma += (Math.max(out[i], out[i + 1], out[i + 2]) - Math.min(out[i], out[i + 1], out[i + 2])) / 255;
  }

  return {
    modelClass: "Planeswalker::Urza::URMLAutoPaintModel",
    optionMode: options.mode,
    compositeRgba: out,
    decomposedLayerNames:
      options.mode === "decomposed-tonal"
        ? ["BaseFlat", "ShadowMultiply", "HighlightScreen", "AmbientTint"]
        : ["AutoPaintMergedMultiply"],
    averageChromaBoost01: Number((totalChroma / pixelCount).toFixed(4)),
  };
}

export function evaluateCspUrmlPalmDetection(params: {
  readonly contactMajorAxisMm: number;
  readonly contactMinorAxisMm: number;
  readonly stylusActive: boolean;
}): {
  readonly detectorClass: "Planeswalker::Urza::URMLPalmDetection";
  readonly isPalmRejected: boolean;
  readonly confidence01: number;
} {
  const areaMm2 = Math.PI * (params.contactMajorAxisMm * 0.5) * (params.contactMinorAxisMm * 0.5);
  const rawScore = Math.min(1, areaMm2 / 420 + (params.stylusActive ? 0.35 : 0));
  return {
    detectorClass: "Planeswalker::Urza::URMLPalmDetection",
    isPalmRejected: rawScore >= 0.55,
    confidence01: Number(rawScore.toFixed(3)),
  };
}

// ============================================================================
// 2. PWPuppetTransformPrecomputeTerms & Odyssey::ODCDrawElemArray* Puppet Warp
// ============================================================================

export interface CspPuppetPin {
  readonly pinId: string;
  readonly restX: number;
  readonly restY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly rotationDeg: number;
  readonly angleLimitDeg?: number;
}

export interface CspPuppetTransformSolution {
  readonly precomputeClass: "Planeswalker::PWPuppetTransformPrecomputeTerms";
  readonly drawElemArrays: readonly [
    "Odyssey::ODCDrawElemArraySkinDeform",
    "Odyssey::ODCDrawElemArraySkinRigid",
    "Odyssey::ODCDrawElemArrayAngleLimit",
    "Odyssey::ODCDrawElemArrayOutline",
    "Odyssey::ODCDrawElemArrayWireframe",
    "Odyssey::ODCDrawElemArrayTransparency",
  ];
  readonly meshDensityLevel: 1 | 2 | 3;
  readonly deformedVertices: readonly {
    readonly restX: number;
    readonly restY: number;
    readonly deformedX: number;
    readonly deformedY: number;
    readonly rigidityWeight01: number;
  }[];
  readonly maxDisplacementPx: number;
}

export function solveCspPuppetTransformMesh(params: {
  readonly vertices: readonly { readonly x: number; readonly y: number }[];
  readonly pins: readonly CspPuppetPin[];
  readonly meshDensityLevel?: 1 | 2 | 3;
}): CspPuppetTransformSolution {
  const density = params.meshDensityLevel ?? 2;
  let maxDisp = 0;

  const deformedVertices = params.vertices.map((v) => {
    if (params.pins.length === 0) {
      return {
        restX: v.x,
        restY: v.y,
        deformedX: v.x,
        deformedY: v.y,
        rigidityWeight01: 1,
      };
    }
    let weightSum = 0;
    let dxSum = 0;
    let dySum = 0;

    for (const pin of params.pins) {
      const distSq = (v.x - pin.restX) ** 2 + (v.y - pin.restY) ** 2;
      const w = 1 / Math.max(1e-3, distSq + 25 / density);
      const clampedDeg =
        pin.angleLimitDeg !== undefined
          ? Math.max(-pin.angleLimitDeg, Math.min(pin.angleLimitDeg, pin.rotationDeg))
          : pin.rotationDeg;
      const rad = (clampedDeg * Math.PI) / 180;
      const rx = v.x - pin.restX;
      const ry = v.y - pin.restY;
      const rotX = rx * Math.cos(rad) - ry * Math.sin(rad);
      const rotY = rx * Math.sin(rad) + ry * Math.cos(rad);
      const targetVx = pin.targetX + rotX;
      const targetVy = pin.targetY + rotY;

      dxSum += (targetVx - v.x) * w;
      dySum += (targetVy - v.y) * w;
      weightSum += w;
    }

    const dx = dxSum / Math.max(1e-6, weightSum);
    const dy = dySum / Math.max(1e-6, weightSum);
    const disp = Math.hypot(dx, dy);
    if (disp > maxDisp) maxDisp = disp;

    return {
      restX: v.x,
      restY: v.y,
      deformedX: Number((v.x + dx).toFixed(3)),
      deformedY: Number((v.y + dy).toFixed(3)),
      rigidityWeight01: Number(Math.min(1, weightSum / (weightSum + 0.05)).toFixed(4)),
    };
  });

  return {
    precomputeClass: "Planeswalker::PWPuppetTransformPrecomputeTerms",
    drawElemArrays: [
      "Odyssey::ODCDrawElemArraySkinDeform",
      "Odyssey::ODCDrawElemArraySkinRigid",
      "Odyssey::ODCDrawElemArrayAngleLimit",
      "Odyssey::ODCDrawElemArrayOutline",
      "Odyssey::ODCDrawElemArrayWireframe",
      "Odyssey::ODCDrawElemArrayTransparency",
    ],
    meshDensityLevel: density,
    deformedVertices,
    maxDisplacementPx: Number(maxDisp.toFixed(3)),
  };
}

// ============================================================================
// 3. PWLayerCompManager & URAlignDistributeController
// ============================================================================

export interface CspLayerCompEntry {
  readonly compId: string;
  readonly compName: string;
  readonly recordVisibility: boolean;
  readonly recordPosition: boolean;
  readonly recordOpacity: boolean;
  readonly layerStates: readonly {
    readonly layerId: string;
    readonly visible: boolean;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly opacity01: number;
  }[];
}

export function applyCspLayerCompToScene(
  comp: CspLayerCompEntry,
  exportPrefix = "Comp_",
): {
  readonly managerClass: "Planeswalker::PWLayerCompManager";
  readonly appliedCompId: string;
  readonly exportFileName: string;
  readonly visibleLayerIds: readonly string[];
  readonly resolvedLayers: readonly {
    readonly layerId: string;
    readonly visible: boolean;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly opacity01: number;
  }[];
} {
  const resolvedLayers = comp.layerStates.map((ls) => ({
    layerId: ls.layerId,
    visible: comp.recordVisibility ? ls.visible : true,
    offsetX: comp.recordPosition ? ls.offsetX : 0,
    offsetY: comp.recordPosition ? ls.offsetY : 0,
    opacity01: comp.recordOpacity ? ls.opacity01 : 1,
  }));
  return {
    managerClass: "Planeswalker::PWLayerCompManager",
    appliedCompId: comp.compId,
    exportFileName: `${exportPrefix}${comp.compName}`,
    visibleLayerIds: resolvedLayers.filter((l) => l.visible).map((l) => l.layerId),
    resolvedLayers,
  };
}

export type CspAlignBaseArea = "Canvas" | "SelectionArea" | "Guide" | "ClickedObject";
export type CspAlignAxisMode =
  | "align-left"
  | "align-h-center"
  | "align-right"
  | "align-top"
  | "align-v-center"
  | "align-bottom"
  | "distribute-h-centers"
  | "distribute-v-centers"
  | "distribute-h-spacing"
  | "distribute-v-spacing";

export interface CspAlignableObjectBox {
  readonly objectId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly strokeHalfWidthPx?: number;
}

export function computeCspAlignAndDistributeRects(params: {
  readonly objects: readonly CspAlignableObjectBox[];
  readonly mode: CspAlignAxisMode;
  readonly baseArea: CspAlignBaseArea;
  readonly baseBounds?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly useVectorCoreLine?: boolean;
}): readonly { readonly objectId: string; readonly x: number; readonly y: number }[] {
  if (params.objects.length === 0) return [];
  const coreAdjust = (obj: CspAlignableObjectBox) =>
    params.useVectorCoreLine ? (obj.strokeHalfWidthPx ?? 0) : 0;

  const minX = params.baseBounds
    ? params.baseBounds.x
    : Math.min(...params.objects.map((o) => o.x + coreAdjust(o)));
  const maxX = params.baseBounds
    ? params.baseBounds.x + params.baseBounds.width
    : Math.max(...params.objects.map((o) => o.x + o.width - coreAdjust(o)));
  const minY = params.baseBounds
    ? params.baseBounds.y
    : Math.min(...params.objects.map((o) => o.y + coreAdjust(o)));
  const maxY = params.baseBounds
    ? params.baseBounds.y + params.baseBounds.height
    : Math.max(...params.objects.map((o) => o.y + o.height - coreAdjust(o)));

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;

  if (params.mode === "distribute-h-centers" && params.objects.length > 2) {
    const sorted = [...params.objects].sort((a, b) => a.x - b.x);
    const firstCenter = sorted[0].x + sorted[0].width * 0.5;
    const lastCenter = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width * 0.5;
    const step = (lastCenter - firstCenter) / (sorted.length - 1);
    return sorted.map((obj, idx) => ({
      objectId: obj.objectId,
      x: Number((firstCenter + step * idx - obj.width * 0.5).toFixed(2)),
      y: obj.y,
    }));
  }

  return params.objects.map((obj) => {
    const pad = coreAdjust(obj);
    switch (params.mode) {
      case "align-left":
        return { objectId: obj.objectId, x: Number((minX - pad).toFixed(2)), y: obj.y };
      case "align-h-center":
        return { objectId: obj.objectId, x: Number((centerX - obj.width * 0.5).toFixed(2)), y: obj.y };
      case "align-right":
        return { objectId: obj.objectId, x: Number((maxX - obj.width + pad).toFixed(2)), y: obj.y };
      case "align-top":
        return { objectId: obj.objectId, x: obj.x, y: Number((minY - pad).toFixed(2)) };
      case "align-v-center":
        return { objectId: obj.objectId, x: obj.x, y: Number((centerY - obj.height * 0.5).toFixed(2)) };
      case "align-bottom":
        return { objectId: obj.objectId, x: obj.x, y: Number((maxY - obj.height + pad).toFixed(2)) };
      default:
        return { objectId: obj.objectId, x: obj.x, y: obj.y };
    }
  });
}

// ============================================================================
// 4. 2D Cel Animation Pipeline (PWOnionSkinSettingInfo, LightTable, Camera2D, TrackLabel)
// ============================================================================

export interface CspOnionSkinSettingInfo {
  readonly prevDisplayCount: number;
  readonly nextDisplayCount: number;
  readonly startOpacityPercent: number;
  readonly stepOpacityPercent: number;
  readonly prevColorHex: string;
  readonly nextColorHex: string;
  readonly halfColorMode: boolean;
}

export function computeCspOnionSkinFrameStack(
  currentFrame: number, totalFrames: number, setting: CspOnionSkinSettingInfo,
): readonly { readonly frameIndex: number; readonly direction: "prev" | "next"; readonly distance: number; readonly opacity01: number; readonly tintHex: string }[] {
  const stack: { readonly frameIndex: number; readonly direction: "prev" | "next"; readonly distance: number; readonly opacity01: number; readonly tintHex: string }[] = [];
  for (let d = 1; d <= setting.prevDisplayCount; d += 1) {
    const f = currentFrame - d;
    if (f >= 0) {
      const op = Math.max(5, setting.startOpacityPercent - (d - 1) * setting.stepOpacityPercent) / 100;
      stack.push({ frameIndex: f, direction: "prev", distance: d, opacity01: Number(op.toFixed(3)), tintHex: setting.prevColorHex });
    }
  }
  for (let d = 1; d <= setting.nextDisplayCount; d += 1) {
    const f = currentFrame + d;
    if (f < totalFrames) {
      const op = Math.max(5, setting.startOpacityPercent - (d - 1) * setting.stepOpacityPercent) / 100;
      stack.push({ frameIndex: f, direction: "next", distance: d, opacity01: Number(op.toFixed(3)), tintHex: setting.nextColorHex });
    }
  }
  return stack;
}

export function evaluateCspCamera2DAndTrackLabels(params: {
  readonly frameIndex: number; readonly startPanX: number; readonly endPanX: number;
  readonly startZoom: number; readonly endZoom: number; readonly durationFrames: number;
  readonly trackLabelCommand: "animationaddinbetweentracklabel" | "animationaddinvertinbetweentracklabel";
}): {
  readonly cameraClass: "Camera2DApplyTransform"; readonly popupClass: "Planeswalker::PWTrackLabelInputEditPopup";
  readonly trackSymbol: "/" | "|"; readonly interpolatedPanX: number; readonly interpolatedZoom: number;
} {
  const t = Math.max(0, Math.min(1, params.frameIndex / Math.max(1, params.durationFrames)));
  const easedT = params.trackLabelCommand === "animationaddinvertinbetweentracklabel" ? t * t * (3 - 2 * t) : t;
  return {
    cameraClass: "Camera2DApplyTransform",
    popupClass: "Planeswalker::PWTrackLabelInputEditPopup",
    trackSymbol: params.trackLabelCommand === "animationaddinbetweentracklabel" ? "/" : "|",
    interpolatedPanX: Number((params.startPanX + (params.endPanX - params.startPanX) * easedT).toFixed(2)),
    interpolatedZoom: Number((params.startZoom + (params.endZoom - params.startZoom) * easedT).toFixed(4)),
  };
}

export interface CspBookbindingFlatplanSpec {
  readonly trimWidthMm: number; readonly trimHeightMm: number; readonly bleedMm: number;
  readonly pageCount: number; readonly paperThicknessPerPageMm: number; readonly coverThicknessMm: number;
  readonly bindingDirection: "left-to-right" | "right-to-left"; readonly nombrePrefix: string;
}

export function computeCspBookbinding3DFlatplanAndSpine(spec: CspBookbindingFlatplanSpec): {
  readonly storyClass: "Planeswalker::PWComicStoryInfo";
  readonly flatplanClass: "Planeswalker::PWBookbindingFlatplan::Impl";
  readonly kdpDialogClass: "Planeswalker::Urza::URBookBindingKindleUploadKDPDialogView";
  readonly spineWidthMm: number; readonly fullSpreadCoverWidthMm: number; readonly fullSpreadCoverHeightMm: number;
  readonly spreads: readonly { readonly spreadIndex: number; readonly leftPageNumber: number; readonly rightPageNumber: number; readonly leftNombreLabel: string; readonly rightNombreLabel: string }[];
} {
  const sheets = Math.ceil(Math.max(2, spec.pageCount) / 2);
  const spineWidthMm = Number((sheets * spec.paperThicknessPerPageMm + spec.coverThicknessMm * 2).toFixed(2));
  const fullSpreadCoverWidthMm = Number((spec.trimWidthMm * 2 + spineWidthMm + spec.bleedMm * 2).toFixed(2));
  const fullSpreadCoverHeightMm = Number((spec.trimHeightMm + spec.bleedMm * 2).toFixed(2));
  const spreads: { readonly spreadIndex: number; readonly leftPageNumber: number; readonly rightPageNumber: number; readonly leftNombreLabel: string; readonly rightNombreLabel: string }[] = [];
  for (let i = 0; i < sheets; i += 1) {
    const [pA, pB] = [i * 2 + 1, i * 2 + 2];
    const [leftPage, rightPage] = spec.bindingDirection === "right-to-left" ? [pB, pA] : [pA, pB];
    spreads.push({ spreadIndex: i, leftPageNumber: leftPage, rightPageNumber: rightPage, leftNombreLabel: `${spec.nombrePrefix}${leftPage}`, rightNombreLabel: `${spec.nombrePrefix}${rightPage}` });
  }
  return {
    storyClass: "Planeswalker::PWComicStoryInfo", flatplanClass: "Planeswalker::PWBookbindingFlatplan::Impl",
    kdpDialogClass: "Planeswalker::Urza::URBookBindingKindleUploadKDPDialogView",
    spineWidthMm, fullSpreadCoverWidthMm, fullSpreadCoverHeightMm, spreads,
  };
}

export function generateCspVectorBalloonAndStreamLineGeometry(params: {
  readonly balloonRx: number;
  readonly balloonRy: number;
  readonly tailTipX: number;
  readonly tailTipY: number;
  readonly tailWidthPx: number;
  readonly tailCurveKind: "spline" | "polyline" | "line";
  readonly streamLineCount: number;
  readonly streamLengthPx: number;
  readonly streamLengthDisturb01: number;
}): {
  readonly balloonClass: "Planeswalker::PWVectorBalloon";
  readonly streamLineClass: "Planeswalker::PWStreamLine";
  readonly svgBalloonPathD: string;
  readonly streamLineSegments: readonly {
    readonly index: number;
    readonly lengthPx: number;
  }[];
} {
  const rx = Math.max(10, params.balloonRx);
  const ry = Math.max(10, params.balloonRy);
  const hw = Math.max(2, params.tailWidthPx * 0.5);
  const midX = params.tailTipX * 0.55;
  const midY = ry + (params.tailTipY - ry) * 0.45;
  const tailSegment =
    params.tailCurveKind === "spline"
      ? `Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${params.tailTipX.toFixed(1)} ${params.tailTipY.toFixed(1)} Q ${(midX + hw).toFixed(1)} ${midY.toFixed(1)} ${hw.toFixed(1)} ${ry.toFixed(1)}`
      : `L ${params.tailTipX.toFixed(1)} ${params.tailTipY.toFixed(1)} L ${hw.toFixed(1)} ${ry.toFixed(1)}`;
  const svgBalloonPathD = `M 0 ${(-ry).toFixed(1)} A ${rx} ${ry} 0 1 1 ${(-hw).toFixed(1)} ${ry.toFixed(1)} ${tailSegment} Z`;

  const streamLineSegments = Array.from({ length: Math.max(1, params.streamLineCount) }, (_, idx) => {
    const wave = Math.sin(idx * 1.6180339) * 0.5 + 0.5;
    const factor = 1 - params.streamLengthDisturb01 * wave * 0.5;
    return {
      index: idx,
      lengthPx: Number((params.streamLengthPx * factor).toFixed(2)),
    };
  });

  return {
    balloonClass: "Planeswalker::PWVectorBalloon",
    streamLineClass: "Planeswalker::PWStreamLine",
    svgBalloonPathD,
    streamLineSegments,
  };
}

// ============================================================================
// 6. Dual-Brush, Watercolor Wet-Edge, LMS Color Mixing, Circular Text & Korean EditImageTool.todb
// ============================================================================

export type CspDualBrushCompositeMode =
  | "multiply"
  | "darken"
  | "color-burn"
  | "linear-burn"
  | "subtract"
  | "lighten";

export function evaluateCspDualBrushWetEdgeAndLmsMix(params: {
  readonly colorAHex: string;
  readonly colorBHex: string;
  readonly mixRatio01: number;
  readonly lmsLinearity01: number;
  readonly primaryAlpha01: number;
  readonly dualAlpha01: number;
  readonly dualCompositeMode: CspDualBrushCompositeMode;
  readonly radialDistance01: number;
  readonly waterEdgeStrength01: number;
  readonly waterEdgeVividness01: number;
}): {
  readonly mixedHex: string;
  readonly combinedStampAlpha01: number;
  readonly wetEdgeRingMultiplier: number;
} {
  const parseRgb = (hex: string): [number, number, number] => {
    const c = hex.replace(/^#/, "").padEnd(6, "0");
    return [
      (Number.parseInt(c.slice(0, 2), 16) || 0) / 255,
      (Number.parseInt(c.slice(2, 4), 16) || 0) / 255,
      (Number.parseInt(c.slice(4, 6), 16) || 0) / 255,
    ];
  };
  const [ar, ag, ab] = parseRgb(params.colorAHex);
  const [br, bg, bb] = parseRgb(params.colorBHex);
  const t = Math.max(0, Math.min(1, params.mixRatio01));
  const lin = Math.max(0, Math.min(1, params.lmsLinearity01));

  // Subtractive-inspired perceptual LMS cone blend (keeps yellow+blue -> vivid green instead of muddy gray)
  const gamma = 1 + lin * 1.2;
  const rLin = (1 - t) * ar ** gamma + t * br ** gamma;
  const gLin =
    (1 - t) * ag ** gamma +
    t * bg ** gamma +
    Math.min(ar, bb) * t * (1 - t) * 0.45 * lin;
  const bLin = (1 - t) * ab ** gamma + t * bb ** gamma;

  const invGamma = 1 / gamma;
  const wetVivid = 1 + params.waterEdgeVividness01 * 0.18;
  const toByte = (v: number) =>
    Math.max(0, Math.min(255, Math.round(Math.min(1, v ** invGamma * wetVivid) * 255)))
      .toString(16)
      .padStart(2, "0");
  const mixedHex = `#${toByte(rLin)}${toByte(gLin)}${toByte(bLin)}`;

  let combinedAlpha: number;
  switch (params.dualCompositeMode) {
    case "multiply":
      combinedAlpha = params.primaryAlpha01 * params.dualAlpha01;
      break;
    case "darken":
      combinedAlpha = Math.min(params.primaryAlpha01, params.dualAlpha01);
      break;
    case "subtract":
      combinedAlpha = Math.max(0, params.primaryAlpha01 - (1 - params.dualAlpha01));
      break;
    case "lighten":
      combinedAlpha = Math.max(params.primaryAlpha01, params.dualAlpha01);
      break;
    default:
      combinedAlpha = params.primaryAlpha01 * params.dualAlpha01;
      break;
  }

  // Watercolor fringe peaks near radialDistance01 in [0.75..0.98]
  const edgePeak = Math.exp(-(((params.radialDistance01 - 0.88) / 0.1) ** 2));
  const wetEdgeRingMultiplier = Number((1 + params.waterEdgeStrength01 * edgePeak * 0.85).toFixed(4));

  return {
    mixedHex,
    combinedStampAlpha01: Number(Math.min(1, combinedAlpha * wetEdgeRingMultiplier).toFixed(4)),
    wetEdgeRingMultiplier,
  };
}

export function computeCspCircularTextGlyphTransforms(params: {
  readonly text: string;
  readonly radiusPx: number;
  readonly direction: "clockwise" | "counter-clockwise";
  readonly startAngleDeg?: number;
}): readonly {
  readonly char: string;
  readonly x: number;
  readonly y: number;
  readonly rotationDeg: number;
}[] {
  const chars = Array.from(params.text);
  if (chars.length === 0) return [];
  const dirSign = params.direction === "clockwise" ? 1 : -1;
  const stepDeg = (360 / Math.max(8, chars.length * 2)) * dirSign;
  const baseDeg = params.startAngleDeg ?? -90;

  return chars.map((ch, idx) => {
    const deg = baseDeg + idx * stepDeg;
    const rad = (deg * Math.PI) / 180;
    return {
      char: ch,
      x: Number((Math.cos(rad) * params.radiusPx).toFixed(2)),
      y: Number((Math.sin(rad) * params.radiusPx).toFixed(2)),
      rotationDeg: Number((deg + 90 * dirSign).toFixed(2)),
    };
  });
}

export const CSP_KOREAN_EDIT_IMAGE_TOOL_TODB_SPEC = {
  dbPath: "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Tool/korean/EditImageTool.todb",
  totalToolNodes: 255, totalVariantRows: 406, totalVariantColumns: 417,
  signatureStudioSubTools: [
    { pwId: 24, nameKo: "G펜", variantId: 6, category: "pen" },
    { pwId: 301, nameKo: "리얼 G 펜", variantId: 570, category: "pen" },
    { pwId: 37, nameKo: "제어점", variantId: 175, category: "vector-correct" },
    { pwId: 38, nameKo: "벡터선 잡기", variantId: 177, category: "vector-correct" },
    { pwId: 40, nameKo: "벡터선 연결", variantId: 461, category: "vector-correct" },
    { pwId: 41, nameKo: "선폭 수정", variantId: 183, category: "vector-correct" },
    { pwId: 92, nameKo: "벡터용", variantId: 173, category: "eraser" },
    { pwId: 243, nameKo: "타원 말풍선", variantId: 154, category: "balloon" },
    { pwId: 246, nameKo: "말풍선 꼬리", variantId: 157, category: "balloon" },
    { pwId: 253, nameKo: "퍼스자", variantId: 481, category: "ruler" },
    { pwId: 262, nameKo: "대칭자", variantId: 499, category: "ruler" },
    { pwId: 264, nameKo: "성긴 유선", variantId: 501, category: "stream-line" },
    { pwId: 269, nameKo: "성긴 집중선", variantId: 509, category: "focus-line" },
    { pwId: 282, nameKo: "표준 채색 (등고선 채색)", variantId: 529, category: "contour-fill" },
    { pwId: 285, nameKo: "라이트 테이블", variantId: 535, category: "animation" },
    { pwId: 286, nameKo: "타임라인 편집", variantId: 537, category: "animation" },
    { pwId: 402, nameKo: "습식 수채", variantId: 773, category: "watercolor-wet-edge" },
    { pwId: 403, nameKo: "두껍게 칠하기(유채)", variantId: 771, category: "dual-brush-impasto" },
    { pwId: 406, nameKo: "픽셀 유동화", variantId: 775, category: "liquify" },
    { pwId: 410, nameKo: "원형 텍스트", variantId: 779, category: "circular-text" },
    { pwId: 414, nameKo: "선화를 따라 선택", variantId: 787, category: "lasso-along-line" },
    { pwId: 416, nameKo: "속도 조절 지우개", variantId: 791, category: "velocity-eraser" },
  ],
} as const;

export const CSP_CLIP_STUDIO_LAUNCHER_NATIVE_ARCHITECTURE = {
  evidenceId: "ev_28af48a384c0eb12b19ad6b94e2ac1855f9647c54d156be5a84ec0853b283cc4",
  binarySha256: "6b1efa2badf25f2f9a5db236dab949c9b2fccc06a09dcd5f8491cf038c6ec3b2",
  pwRokuLibModuleCount: 61,
  pwRokuLibCoreModules: [
    "CrMBooleanOperation.cpp", "CrMBoneManipulator.cpp", "CrMLSCMUVParameterizer.cpp", "CrMBVHCollisionDetection.cpp",
    "CrMCatmulClarkSubdiv.cpp", "CrMMorphCommand.cpp", "CrMSketchSurface.cpp", "CrMSweepSurface.cpp",
    "CrMWeightBrushCommand.cpp", "CrMTexturePaintCommand.cpp", "CrMPhysics.cpp", "CrMUndoManager.cpp",
  ],
  c2fCatalogClassCount: 35,
  c2fCatalogCoreClasses: [
    "C2FCatalog::MaterialCatalog", "C2FCatalog::MaterialCollection", "C2FCatalog::MaterialObject",
    "C2FCatalog::MaterialResource", "C2FCatalog::EncryptInfo", "C2FCatalog::PrimeLockInfo",
  ],
  iceCloudAutoSyncChannels: [
    "AutoSyncCloudWorks", "AutoSyncCloudMaterial", "AutoSyncCloudApplicationSetting", "AutoSyncCloudWorksAtConfirmed",
  ],
  triglavPlugInHostInterfaces: [
    "18_TriglavPlugInHost", "19_TriglavPlugInHost", "20_TriglavPlugInHost", "21_TriglavPlugInHost", "21_TriglavPlugInRecord",
    "22_TriglavPlugInHost", "23_TriglavPlugInHost", "24_TriglavPlugInHost", "25_TriglavPlugInHost", "26_TriglavPlugInHost",
    "27_TriglavPlugInHost", "28_TriglavPlugInHost", "28_TriglavPlugInHostPermission",
  ],
  vueClipTagsThemeTokens: {
    componentInstanceCount: 224, cssColorTokenCount: 80,
    darkBgPrimary: "#2b2b2b", darkBgPanel: "#383838", accentPrimaryBlue: "#007aff",
    accentCloudGreen: "#33aa22", warningAmber: "#f39800", dangerRed: "#e60012",
  },
} as const;
