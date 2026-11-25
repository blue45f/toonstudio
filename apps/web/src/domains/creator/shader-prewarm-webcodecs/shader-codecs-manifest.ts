import { buildShaderWebCodecsPlan, WGSL_PIPELINE_IDS, WEBCODECS_CODEC_IDS,
  type ShaderWebCodecsCombinedPlan, type WebCodecsCodecId, type ShaderPrewarmTask, type CodecFallbackStep } from "./shader-prewarm-webcodecs-engine";
import { assertPlanMatches } from "./shader-codecs-input-contract";

function canonicalPlan(plan: ShaderWebCodecsCombinedPlan): ShaderWebCodecsCombinedPlan {
  if (!plan?.prewarm?.config || !plan.webCodecsExport?.codecResolution || !Array.isArray(plan.prewarm.tasks) || plan.prewarm.tasks.length !== 12 || !Array.isArray(plan.webCodecsExport.codecResolution.fallbackSteps) || plan.webCodecsExport.codecResolution.fallbackSteps.length > 3) throw new Error("지원 범위를 벗어난 계획 구조입니다.");
  const tasks: readonly ShaderPrewarmTask[] = plan.prewarm.tasks;
  const steps: readonly CodecFallbackStep[] = plan.webCodecsExport.codecResolution.fallbackSteps;
  const ids = new Set<string>();
  for (const task of tasks) {
    if (!task.pipeline || !WGSL_PIPELINE_IDS.includes(task.pipeline.id) || ids.has(task.pipeline.id) || typeof task.cacheHit !== "boolean") throw new Error("계획 task ID·cache 가정이 잘못됐습니다.");
    ids.add(task.pipeline.id);
  }
  const hardwareSupport: Partial<Record<WebCodecsCodecId, boolean>> = {};
  for (const step of steps) {
    if (!WEBCODECS_CODEC_IDS.includes(step.codecId) || hardwareSupport[step.codecId] !== undefined || typeof step.hardwareSupported !== "boolean") throw new Error("폴백 지원 가정·ID가 잘못됐습니다.");
    hardwareSupport[step.codecId] = step.hardwareSupported;
  }
  const local = plan.webCodecsExport;
  const result = buildShaderWebCodecsPlan({ prewarm: { ...plan.prewarm.config, cachedPipelineIds: tasks.filter(task => task.cacheHit).map(task => task.pipeline.id) },
    exportConfig: { presetId: local.preset.id, codecId: local.codecResolution.requestedCodecId, durationSec: local.durationSec, opfsFreeMb: local.opfsSafetyGate.opfsFreeMb,
      audioCodec: local.audioCodec, hardwareSupport, cloudRenderRateUsdPerMin: local.serverCostSavings.cloudReferenceRateUsdPerMin } });
  assertPlanMatches(plan, result);
  return result;
}

/** 통합 셰이더 프리컴파일 캐시 & 로컬 WebCodecs 4K 출고 매니페스트를 JSON 문자열로 직렬화한다. */
export function exportShaderWebCodecsManifestJson(provided: ShaderWebCodecsCombinedPlan): string {
  const plan = canonicalPlan(provided);
  const { prewarm, webCodecsExport } = plan;
  return JSON.stringify(
    {
      gpuCompiled: false, encoded: false, opfsWritten: false, runtimeCanStartExport: false,
      cacheIdentitySource: "metadata-signature-not-wgsl-bytes", capabilitySource: "caller-assumption", supportVerified: false, zeroCopyMeasured: false, audioMeasured: false, storageEstimateVerified: false,
      schemaVersion: plan.schemaVersion,
      modelKind: plan.modelKind,
      prewarm: {
        cacheNamespaceKey: prewarm.cacheNamespaceKey,
        config: prewarm.config,
        stutterComparison: prewarm.stutterComparison,
        waves: prewarm.waves.map((w) => ({
          wave: w.wave, tier: w.tier, dispatchStrategy: w.dispatchStrategy,
          startMs: w.startMs, endMs: w.endMs, durationMs: w.durationMs,
          idleSlicesRequired: w.idleSlicesRequired, cachedCount: w.cachedCount, coldCount: w.coldCount,
          pipelines: w.tasks.map((t) => ({
            id: t.pipeline.id, entryPoint: t.pipeline.entryPoint, workgroupSize: t.pipeline.workgroupSize,
            laneIndex: t.laneIndex, cacheKey: t.cacheKey, contentHash: t.contentHash,
            cacheHit: t.cacheHit, startMs: t.startMs, endMs: t.endMs, compileCostMs: t.compileCostMs,
          })),
        })),
      },
      webCodecsExport: {
        presetId: webCodecsExport.preset.id,
        resolution: `${webCodecsExport.preset.width}x${webCodecsExport.preset.height}`,
        fps: webCodecsExport.preset.fps, durationSec: webCodecsExport.durationSec,
        totalFrames: webCodecsExport.totalFrames, gopFrames: webCodecsExport.gopFrames, keyframeCount: webCodecsExport.keyframeCount,
        codecResolution: {
          requestedCodecId: webCodecsExport.codecResolution.requestedCodecId,
          activeCodecId: webCodecsExport.codecResolution.activeCodec.id,
          activeCodecString: webCodecsExport.codecResolution.activeCodecString,
          fallbackApplied: webCodecsExport.codecResolution.fallbackApplied,
          hardwareAccelerated: webCodecsExport.codecResolution.hardwareAccelerated,
        },
        encoderConfigPreview: webCodecsExport.encoderConfigPreview,
        audio: {
          measured: false,
          codec: webCodecsExport.audioCodec, bitrateKbps: webCodecsExport.audioBitrateKbps,
          loudnessLufs: webCodecsExport.audioLoudnessLufs, truePeakDbtp: webCodecsExport.audioTruePeakDbtp,
        },
        sizeBudgetMb: {
          videoMb: webCodecsExport.estimatedVideoMb, audioMb: webCodecsExport.estimatedAudioMb,
          muxOverheadMb: webCodecsExport.muxContainerOverheadMb, totalOutputMb: webCodecsExport.estimatedOutputMb,
        },
        zeroCopyPath: webCodecsExport.zeroCopyStages.map((s) => ({
          order: s.order, id: s.id, apiName: s.apiName, cpuReadbackCopies: s.cpuReadbackCopies,
        })),
        opfsSafetyGate: webCodecsExport.opfsSafetyGate,
        serverCostSavings: webCodecsExport.serverCostSavings,
      },
      honestScopeDisclosure: prewarm.honestScopeDisclosure,
    },
    null,
    2,
  );
}
