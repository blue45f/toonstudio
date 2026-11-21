/**
 * ToonStudio MCP — 포토샵 프로(4종) · 3D/VRoid/Blender/SketchUp(4종) 툴 모듈.
 */

function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeVec3(raw, fallback) {
  if (!Array.isArray(raw) || raw.length !== 3) return fallback;
  const nums = raw.map((n, idx) => {
    const parsed = Number(n);
    return Number.isFinite(parsed) ? parsed : fallback[idx];
  });
  return [nums[0], nums[1], nums[2]];
}

export function createProMediaMcpTools({ state, persistState, syncToRemoteApi }) {
  return [
    {
      name: "studio.photoshop.apply_layer_fx",
      description: "포토샵 비파괴 레이어 스타일(드롭섀도·외곽광선·내부광선·베벨·스트로크·그라데이션)을 적용합니다.",
      inputSchema: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          effect: {
            type: "string",
            enum: [
              "drop-shadow",
              "outer-glow",
              "inner-glow",
              "bevel-emboss",
              "stroke",
              "gradient-overlay",
            ],
          },
          blendMode: { type: "string" },
          opacityPct: { type: "number" },
          radiusPx: { type: "number" },
          colorToken: { type: "string" },
        },
        required: ["effect"],
      },
      handler: (args = {}) => {
        const entry = {
          id: `ps-fx-${state.photoshop.layerFx.length + 1}`,
          layerId: String(args.layerId || state.canvas.layers[0]?.id || "layer-base"),
          effect: String(args.effect || "outer-glow"),
          blendMode: String(args.blendMode || "screen"),
          opacityPct: Math.round(clampNumber(args.opacityPct, 40, 0, 100)),
          radiusPx: clampNumber(args.radiusPx, 16, 0, 250),
          colorToken: String(args.colorToken || "oklch(0.84 0.12 72)"),
          nonDestructive: true,
        };
        state.photoshop.layerFx.push(entry);
        state.canvas.fxLayers.push({
          id: entry.id,
          presetId: `photoshop:${entry.effect}`,
          intensity: entry.opacityPct,
          blendMode: entry.blendMode,
        });
        persistState();
        return { ok: true, layerFx: entry, totalLayerFx: state.photoshop.layerFx.length };
      },
    },
    {
      name: "studio.photoshop.apply_camera_raw",
      description: "비파괴 Adobe Camera Raw(ACR) 노출·대비·명료도·안개제거·색온도·그레인 보정 스택을 적용합니다.",
      inputSchema: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          exposure: { type: "number" },
          contrast: { type: "number" },
          highlights: { type: "number" },
          shadows: { type: "number" },
          clarity: { type: "number" },
          dehaze: { type: "number" },
          vibrance: { type: "number" },
          temperature: { type: "number" },
          grainPct: { type: "number" },
        },
      },
      handler: (args = {}) => {
        const adjustment = {
          id: `acr-${state.photoshop.cameraRawAdjustments.length + 1}`,
          layerId: String(args.layerId || state.canvas.layers[0]?.id || "layer-base"),
          exposure: Number(clampNumber(args.exposure, 0.15, -4, 4).toFixed(2)),
          contrast: Math.round(clampNumber(args.contrast, 10, -100, 100)),
          highlights: Math.round(clampNumber(args.highlights, -6, -100, 100)),
          shadows: Math.round(clampNumber(args.shadows, 12, -100, 100)),
          clarity: Math.round(clampNumber(args.clarity, 14, -100, 100)),
          dehaze: Math.round(clampNumber(args.dehaze, 6, -100, 100)),
          vibrance: Math.round(clampNumber(args.vibrance, 8, -100, 100)),
          temperature: Math.round(clampNumber(args.temperature, 4, -100, 100)),
          grainPct: Math.round(clampNumber(args.grainPct, 8, 0, 100)),
          nonDestructive: true,
        };
        state.photoshop.cameraRawAdjustments.push(adjustment);
        persistState();
        return {
          ok: true,
          cameraRaw: adjustment,
          totalAdjustments: state.photoshop.cameraRawAdjustments.length,
        };
      },
    },
    {
      name: "studio.photoshop.frequency_separate",
      description: "주파수 분리(저주파 톤/색상 + 고주파 선화/질감) 비파괴 리터칭 레이어 쌍을 생성합니다.",
      inputSchema: {
        type: "object",
        properties: {
          sourceLayerId: { type: "string" },
          radiusPx: { type: "number" },
          bitDepth: { type: "number", enum: [8, 16] },
        },
      },
      handler: (args = {}) => {
        const sourceLayerId = String(args.sourceLayerId || state.canvas.layers[0]?.id || "layer-base");
        const radiusPx = Number(clampNumber(args.radiusPx, 6, 1, 48).toFixed(1));
        const bitDepth = Number(args.bitDepth) === 16 ? 16 : 8;
        const lowLayer = {
          id: `layer-freq-low-${state.canvas.layers.length + 1}`,
          name: `${sourceLayerId} · Low Freq (색상·톤 ${radiusPx}px)`,
          visible: true,
          opacity: 1,
        };
        const highLayer = {
          id: `layer-freq-high-${state.canvas.layers.length + 2}`,
          name: `${sourceLayerId} · High Freq (선화·질감 Linear Light)`,
          visible: true,
          opacity: 1,
        };
        state.canvas.layers.push(lowLayer, highLayer);
        const record = {
          id: `freq-${state.photoshop.frequencySeparations.length + 1}`,
          sourceLayerId,
          radiusPx,
          bitDepth,
          lowLayerId: lowLayer.id,
          highLayerId: highLayer.id,
          highBlendMode: "linear-light",
        };
        state.photoshop.frequencySeparations.push(record);
        persistState();
        return { ok: true, frequencySeparation: record, totalLayers: state.canvas.layers.length };
      },
    },
    {
      name: "studio.photoshop.run_action_batch",
      description: "포토샵 비파괴 액션 매크로를 여러 컷/레이어에 일괄 실행합니다.",
      inputSchema: {
        type: "object",
        properties: {
          actionName: { type: "string" },
          cutIds: { type: "array", items: { type: "string" } },
          dryRun: { type: "boolean" },
        },
        required: ["actionName"],
      },
      handler: (args = {}) => {
        const actionName = String(args.actionName || "webtoon-finish-clean");
        const cutIds =
          Array.isArray(args.cutIds) && args.cutIds.length > 0
            ? args.cutIds.map((id) => String(id)).slice(0, 120)
            : ["cut-01", "cut-02", "cut-03"];
        const dryRun = Boolean(args.dryRun);
        const run = {
          id: `ps-batch-${state.photoshop.batchRuns.length + 1}`,
          actionName,
          processedCuts: cutIds,
          processedCount: cutIds.length,
          dryRun,
          status: dryRun ? "simulated" : "completed",
          completedAt: new Date().toISOString(),
        };
        if (!dryRun) {
          state.photoshop.batchRuns.push(run);
          persistState();
        }
        return { ok: true, batchRun: run };
      },
    },
    {
      name: "studio.bg3d.compose_scene",
      description: "3D 배경 장면(카메라 렌즈·좌표·조명 시간대·바닥 접지 소품)을 구성합니다.",
      inputSchema: {
        type: "object",
        properties: {
          sceneName: { type: "string" },
          preset: { type: "string" },
          lensMm: { type: "number" },
          position: { type: "array", items: { type: "number" } },
          target: { type: "array", items: { type: "number" } },
          timeOfDay: { type: "string" },
          props: { type: "array", items: { type: "string" } },
        },
      },
      handler: (args = {}) => {
        const lensMm = Math.round(clampNumber(args.lensMm, 35, 12, 200));
        const fovDeg = Number(((2 * Math.atan(36 / (2 * lensMm)) * 180) / Math.PI).toFixed(1));
        const scene = {
          id: `bg3d-${state.bg3d.scenes.length + 1}`,
          sceneName: String(args.sceneName || state.canvas.title || "3D 배경 장면"),
          preset: String(args.preset || "seoul-rooftop-sunset"),
          camera: {
            lensMm,
            fovDeg,
            position: normalizeVec3(args.position, [2.4, 1.45, 4.2]),
            target: normalizeVec3(args.target, [0, 1.35, 0]),
          },
          lighting: {
            timeOfDay: String(args.timeOfDay || "golden-hour"),
            groundPlaneY: 0,
            metricScale: 1,
          },
          props: Array.isArray(args.props)
            ? args.props.map((p) => String(p)).slice(0, 32)
            : ["rooftop-railing", "water-tank", "skyline-backdrop"],
        };
        state.bg3d.scenes.push(scene);
        persistState();
        return { ok: true, scene, totalScenes: state.bg3d.scenes.length };
      },
    },
    {
      name: "studio.vrm.apply_pose_expression",
      description: "VRM 휴머노이드 캐릭터의 포즈 프리셋과 표정 블렌드셰이프를 적용합니다.",
      inputSchema: {
        type: "object",
        properties: {
          avatarId: { type: "string" },
          posePreset: { type: "string" },
          expressions: { type: "object" },
          eyeLookAt: { type: "array", items: { type: "number" } },
        },
      },
      handler: (args = {}) => {
        const avatarId = String(args.avatarId || "vrm-lead-01");
        const rawExpr =
          args.expressions && typeof args.expressions === "object" && !Array.isArray(args.expressions)
            ? args.expressions
            : { happy: 0.35, blink: 0.1 };
        const clampedExpressions = Object.fromEntries(
          Object.entries(rawExpr)
            .slice(0, 16)
            .map(([key, val]) => [String(key), Number(clampNumber(val, 0, 0, 1).toFixed(2))]),
        );
        const avatarState = {
          avatarId,
          posePreset: String(args.posePreset || "contrapposto-talk"),
          expressions: clampedExpressions,
          eyeLookAt: normalizeVec3(args.eyeLookAt, [0, 1.5, 2]),
          groundedY: 0,
          updatedAt: new Date().toISOString(),
        };
        state.vrm.avatars[avatarId] = avatarState;
        persistState();
        return { ok: true, avatar: avatarState };
      },
    },
    {
      name: "studio.blender.compile_npr_recipe",
      description: "Blender 5.3 Eevee/Freestyle/Grease Pencil 웹툰 NPR 셰이딩 레시피를 컴파일합니다.",
      inputSchema: {
        type: "object",
        properties: {
          styleName: { type: "string" },
          celBands: { type: "number" },
          outlineThicknessPx: { type: "number" },
          shadowTint: { type: "string" },
          enforceManifoldAndFloorZ0: { type: "boolean" },
        },
      },
      handler: (args = {}) => {
        const recipe = {
          id: `blender-npr-${state.blender.recipes.length + 1}`,
          blenderTarget: "5.3",
          styleName: String(args.styleName || "korean-webtoon-cel-v2"),
          celBands: Math.round(clampNumber(args.celBands, 3, 2, 6)),
          outlineThicknessPx: Number(clampNumber(args.outlineThicknessPx, 1.8, 0.5, 8).toFixed(1)),
          shadowTint: String(args.shadowTint || "oklch(0.32 0.06 258)"),
          geometryGates: {
            enforceManifold: args.enforceManifoldAndFloorZ0 !== false,
            metricScaleMeters: 1.0,
            floorGroundZ: 0,
          },
          renderPasses: ["lineart-grease-pencil", "flat-albedo", "cel-shadow", "rim-light"],
        };
        state.blender.recipes.push(recipe);
        persistState();
        return { ok: true, recipe };
      },
    },
    {
      name: "studio.sketchup.toggle_dynamic_component",
      description: "SketchUp Dynamic Component(문 개폐 각도·블라인드·조명·가구 변형) 상태를 전환합니다.",
      inputSchema: {
        type: "object",
        properties: {
          componentId: { type: "string" },
          attribute: { type: "string" },
          value: {},
        },
        required: ["componentId", "attribute"],
      },
      handler: (args = {}) => {
        const componentId = String(args.componentId || "skp-door-main");
        const attribute = String(args.attribute || "door_open_deg");
        const prev = state.sketchup.components[componentId] || {};
        const nextValue = args.value !== undefined ? args.value : !prev[attribute];
        state.sketchup.components[componentId] = {
          ...prev,
          [attribute]: nextValue,
          updatedAt: new Date().toISOString(),
        };
        persistState();
        syncToRemoteApi("/api/studio-ecosystem/sketchup/dynamic-component", {
          componentId,
          attribute,
          value: nextValue,
        });
        return {
          ok: true,
          componentId,
          state: state.sketchup.components[componentId],
        };
      },
    },
  ];
}
