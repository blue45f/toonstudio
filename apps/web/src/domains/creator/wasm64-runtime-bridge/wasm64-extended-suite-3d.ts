/**
 * `studio-wasm64-extended-suite.wasm` 3D · Virtual Studio · 물리 · Foley DSP 10종 C-ABI 래퍼.
 */

import {
  assertFfiOk,
  resolveDepthRangeCode,
  resolveFoleyModeCode,
  type ExtendedSuiteArenaManager,
  type RawExtendedSuiteExports,
} from "./wasm64-extended-suite-arena";
import type {
  StudioWasm64ExtendedSuiteRuntime,
  WasmFingerFabrikInput,
  WasmFingerFabrikResult,
  WasmFoleyBiquadInput,
  WasmFoleyBiquadResult,
  WasmLtLineartParams,
  WasmLtLineartResult,
  WasmSphereOverlapOptions,
  WasmSphereOverlapResult,
  WasmStageAcousticsLightingInput,
  WasmStageAcousticsLightingResult,
  WasmStageCullInput,
  WasmStageCullResult,
  WasmVerletSpringInput,
  WasmVerletSpringResult,
  WasmVrmSkinningInput,
  WasmVrmSkinningResult,
} from "./wasm64-extended-suite-types";

export type ExtendedSuite3dOps = Pick<
  StudioWasm64ExtendedSuiteRuntime,
  | "encodeMorton2d"
  | "encodeMorton3d"
  | "skinVrmMesh4BoneSoa"
  | "extractLtLineart"
  | "cullStageFrustumHiz"
  | "resolveStageSphereOverlaps"
  | "evaluateStageAcousticsAndLighting"
  | "stepVerletSpringChainsSoa"
  | "solveFingerFabrikChain"
  | "renderFoleyBiquadBlock"
>;

export function createExtended3dOps(
  e: RawExtendedSuiteExports,
  manager: ExtendedSuiteArenaManager,
): ExtendedSuite3dOps {
  const { assertActive, withArena } = manager;

  const encodeMorton2d = (x: number, y: number): number => {
    assertActive();
    return e.wasm_encode_morton_2d_u32(x >>> 0, y >>> 0) >>> 0;
  };

  const encodeMorton3d = (x: number, y: number, z: number): number => {
    assertActive();
    return e.wasm_encode_morton_3d_u32(x >>> 0, y >>> 0, z >>> 0) >>> 0;
  };

  const skinVrmMesh4BoneSoa = (input: WasmVrmSkinningInput): WasmVrmSkinningResult =>
    withArena((arena) => {
      const xyzLen = input.vertexCount * 3;
      const inPosPtr = arena.copyF32(input.inPosXyz);
      const inNormPtr = arena.copyF32(input.inNormXyz);
      const jointsPtr = arena.copyU16(input.joints);
      const weightsPtr = arena.copyF32(input.weights);
      const bonesPtr = arena.copyF32(input.boneMatrices);
      const outPosPtr = arena.zeroF32(xyzLen);
      const outNormPtr = arena.zeroF32(xyzLen);
      const skinnedVertices = assertFfiOk(
        e.wasm_skin_vrm_mesh_4bone_soa(
          inPosPtr,
          inNormPtr,
          jointsPtr,
          weightsPtr,
          bonesPtr,
          outPosPtr,
          outNormPtr,
          input.vertexCount >>> 0,
          input.boneCount >>> 0,
        ),
        "wasm_skin_vrm_mesh_4bone_soa",
      );
      return {
        outPosXyz: arena.readF32(outPosPtr, xyzLen),
        outNormXyz: arena.readF32(outNormPtr, xyzLen),
        skinnedVertices,
      };
    });

  const extractLtLineart = (
    normalXyz: Float32Array,
    depth: Float32Array,
    width: number,
    height: number,
    params?: WasmLtLineartParams,
  ): WasmLtLineartResult =>
    withArena((arena) => {
      const pixelCount = width * height;
      const normPtr = arena.copyF32(normalXyz);
      const depthPtr = arena.copyF32(depth);
      const outPtr = arena.zeroU8(pixelCount);
      const paramsPtr = params
        ? arena.copyF32([
            params.depthThreshold ?? 0.15,
            params.normalEdgeThreshold ?? 0.25,
            params.depthWeight ?? 1.0,
            params.normalWeight ?? 1.0,
            params.edgeSoftness ?? 0.15,
            params.minInkAlpha ?? 0,
          ])
        : 0;
      const inkPixels = assertFfiOk(
        e.wasm_extract_lt_lineart_from_gbuffer(
          normPtr,
          depthPtr,
          outPtr,
          width >>> 0,
          height >>> 0,
          paramsPtr,
        ),
        "wasm_extract_lt_lineart_from_gbuffer",
      );
      return { alpha: arena.readU8(outPtr, pixelCount), inkPixels };
    });

  const cullStageFrustumHiz = (input: WasmStageCullInput): WasmStageCullResult => {
    if (input.aabbs.length % 7 !== 0) {
      throw new RangeError(`AABB 배열은 7의 배수여야 합니다: actual=${input.aabbs.length}`);
    }
    const objectCount = input.aabbs.length / 7;
    return withArena((arena) => {
      const vpPtr = arena.copyF32(input.viewProj);
      const camPtr = arena.copyF32([
        input.cameraPos[0],
        input.cameraPos[1],
        input.cameraPos[2],
        input.lodDistances[0],
        input.lodDistances[1],
        input.lodDistances[2],
        resolveDepthRangeCode(input.depthRange),
      ]);
      const aabbsPtr = arena.copyF32(input.aabbs);
      const visIdxPtr = arena.zeroU32(objectCount);
      const visLodPtr = arena.zeroU8(objectCount);
      const statsPtr = arena.zeroU32(4);
      const visibleCount = assertFfiOk(
        e.wasm_cull_stage_frustum_hiz(
          vpPtr,
          camPtr,
          aabbsPtr,
          objectCount >>> 0,
          visIdxPtr,
          visLodPtr,
          statsPtr,
        ),
        "wasm_cull_stage_frustum_hiz",
      );
      const stats = arena.readU32(statsPtr, 4);
      return {
        visibleIndices: arena.readU32(visIdxPtr, visibleCount),
        visibleLods: arena.readU8(visLodPtr, visibleCount),
        visibleCount,
        frustumCulledCount: stats[1] ?? 0,
        occlusionCulledCount: stats[2] ?? 0,
        occludersRasterized: stats[3] ?? 0,
      };
    });
  };

  const resolveStageSphereOverlaps = (
    spheres: Float32Array,
    options: WasmSphereOverlapOptions = {},
  ): WasmSphereOverlapResult => {
    if (spheres.length % 5 !== 0) {
      throw new RangeError(`구체 배열은 5의 배수여야 합니다: actual=${spheres.length}`);
    }
    const sphereCount = spheres.length / 5;
    return withArena((arena) => {
      const spheresPtr = arena.copyF32(spheres);
      const resolvedPairs = assertFfiOk(
        e.wasm_resolve_stage_sphere_overlaps(
          spheresPtr,
          sphereCount >>> 0,
          options.cellSize ?? 0.0,
          (options.iterations ?? 4) >>> 0,
          options.relaxation ?? 0.8,
        ),
        "wasm_resolve_stage_sphere_overlaps",
      );
      const nextSpheres = arena.readF32(spheresPtr, spheres.length);
      if (options.mutateInPlace) spheres.set(nextSpheres);
      return { spheres: nextSpheres, resolvedPairs };
    });
  };

  const evaluateStageAcousticsAndLighting = (
    input: WasmStageAcousticsLightingInput,
  ): WasmStageAcousticsLightingResult => {
    if (
      input.listener.length !== 11 ||
      input.sources.length % 7 !== 0 ||
      input.lights.length % 9 !== 0 ||
      input.samples.length % 8 !== 0
    ) {
      throw new RangeError("Stage 음향·광원 입력 스트라이드가 C-ABI 규격과 일치하지 않습니다");
    }
    const sourceCount = input.sources.length / 7;
    const lightCount = input.lights.length / 9;
    const sampleCount = input.samples.length / 8;
    return withArena((arena) => {
      const listenerPtr = arena.copyF32(input.listener);
      const sourcesPtr = arena.copyF32(input.sources);
      const lightsPtr = arena.copyF32(input.lights);
      const samplesPtr = arena.copyF32(input.samples);
      const outAudioPtr = arena.zeroF32(sourceCount * 6);
      const outLightPtr = arena.zeroF32(sampleCount * 8);
      const evaluatedTotal = assertFfiOk(
        e.wasm_evaluate_stage_acoustics_and_lighting(
          listenerPtr,
          sourcesPtr,
          lightsPtr,
          samplesPtr,
          sourceCount >>> 0,
          lightCount >>> 0,
          sampleCount >>> 0,
          outAudioPtr,
          outLightPtr,
        ),
        "wasm_evaluate_stage_acoustics_and_lighting",
      );
      return {
        audioOut: arena.readF32(outAudioPtr, sourceCount * 6),
        lightingOut: arena.readF32(outLightPtr, sampleCount * 8),
        evaluatedTotal,
      };
    });
  };

  const stepVerletSpringChainsSoa = (input: WasmVerletSpringInput): WasmVerletSpringResult => {
    const particleCount = input.invMass.length;
    const colliders = input.colliders ?? new Float32Array(0);
    if (colliders.length % 4 !== 0) {
      throw new RangeError(`충돌체 배열은 4의 배수여야 합니다: actual=${colliders.length}`);
    }
    const colliderCount = colliders.length / 4;
    return withArena((arena) => {
      const posPtr = arena.copyF32(input.posXyz);
      const prevPtr = arena.copyF32(input.prevXyz);
      const invMassPtr = arena.copyF32(input.invMass);
      const restLenPtr = arena.copyF32(input.restLen);
      const colPtr = arena.copyF32(colliders);
      const p = input.params;
      const paramsPtr = p
        ? arena.copyF32([
            p.dt ?? 1 / 60,
            p.stiffness ?? 0.92,
            p.damping ?? 0.04,
            p.windX ?? 0,
            p.windY ?? 0,
            p.windZ ?? 0,
            p.gravityY ?? -9.81,
            p.floorY ?? 0,
            p.floorRestitution ?? 0.2,
            p.particleRadius ?? 0,
          ])
        : 0;
      const stepped = assertFfiOk(
        e.wasm_step_verlet_spring_chains_soa(
          posPtr,
          prevPtr,
          invMassPtr,
          restLenPtr,
          colPtr,
          particleCount >>> 0,
          colliderCount >>> 0,
          (input.iterations ?? 4) >>> 0,
          paramsPtr,
        ),
        "wasm_step_verlet_spring_chains_soa",
      );
      const nextPos = arena.readF32(posPtr, input.posXyz.length);
      const nextPrev = arena.readF32(prevPtr, input.prevXyz.length);
      if (input.mutateInPlace) {
        input.posXyz.set(nextPos);
        input.prevXyz.set(nextPrev);
      }
      return { posXyz: nextPos, prevXyz: nextPrev, particleCount: stepped };
    });
  };

  const solveFingerFabrikChain = (input: WasmFingerFabrikInput): WasmFingerFabrikResult =>
    withArena((arena) => {
      const jointsPtr = arena.copyF32(input.jointsXyz);
      const lensPtr = arena.copyF32(input.boneLengths);
      const targetPtr = arena.copyF32(input.targetXyz);
      const p = input.params;
      const paramsPtr = p
        ? arena.copyF32([
            p.palmForward?.[0] ?? 0,
            p.palmForward?.[1] ?? 0,
            p.palmForward?.[2] ?? 1,
            p.flexionNormal?.[0] ?? 0,
            p.flexionNormal?.[1] ?? -1,
            p.flexionNormal?.[2] ?? 0,
            p.mcpMaxFlexionRad ?? (90 * Math.PI) / 180,
            p.mcpMaxExtensionRad ?? (15 * Math.PI) / 180,
            p.mcpMaxSplayRad ?? (20 * Math.PI) / 180,
            p.pipMaxFlexionRad ?? (105 * Math.PI) / 180,
            p.dipMaxFlexionRad ?? (80 * Math.PI) / 180,
            p.tolerance ?? 1e-4,
          ])
        : 0;
      const iterations = assertFfiOk(
        e.wasm_solve_finger_fabrik_chain(
          jointsPtr,
          lensPtr,
          targetPtr,
          (input.maxIterations ?? 24) >>> 0,
          paramsPtr,
        ),
        "wasm_solve_finger_fabrik_chain",
      );
      const solved = arena.readF32(jointsPtr, 12);
      if (input.mutateInPlace) input.jointsXyz.set(solved);
      return { jointsXyz: solved, iterations };
    });

  const renderFoleyBiquadBlock = (input: WasmFoleyBiquadInput): WasmFoleyBiquadResult =>
    withArena((arena) => {
      const frames = input.monoIn.length;
      const initState = input.state ?? new Float32Array([0, 0, 0, 0, 1]);
      if (initState.length !== 5) {
        throw new RangeError(`Foley DSP 상태 길이는 5여야 합니다: actual=${initState.length}`);
      }
      const monoPtr = arena.copyF32(input.monoIn);
      const leftPtr = arena.zeroF32(frames);
      const rightPtr = arena.zeroF32(frames);
      const statePtr = arena.copyF32(initState);
      const p = input.params;
      const paramsPtr = p
        ? arena.copyF32([
            p.sampleRate ?? 48_000,
            p.cutoffHz ?? 2_400,
            p.qFactor ?? Math.SQRT1_2,
            p.pan ?? 0,
            p.gainDb ?? 0,
            p.limiterCeiling ?? 0.95,
            p.limiterReleaseMs ?? 50,
            p.targetLufs ?? -24,
            p.enableLufsLeveling ? 1 : 0,
          ])
        : 0;
      const renderedFrames = assertFfiOk(
        e.wasm_render_foley_biquad_block(
          monoPtr,
          leftPtr,
          rightPtr,
          statePtr,
          frames >>> 0,
          resolveFoleyModeCode(input.filterMode),
          paramsPtr,
        ),
        "wasm_render_foley_biquad_block",
      );
      const nextState = arena.readF32(statePtr, 5);
      if (input.mutateStateInPlace && input.state) input.state.set(nextState);
      return {
        outLeft: arena.readF32(leftPtr, frames),
        outRight: arena.readF32(rightPtr, frames),
        nextState,
        renderedFrames,
      };
    });

  return {
    encodeMorton2d,
    encodeMorton3d,
    skinVrmMesh4BoneSoa,
    extractLtLineart,
    cullStageFrustumHiz,
    resolveStageSphereOverlaps,
    evaluateStageAcousticsAndLighting,
    stepVerletSpringChainsSoa,
    solveFingerFabrikChain,
    renderFoleyBiquadBlock,
  };
}
