/**
 * WebGPU WGSL 1패스 Compute 초고속 변형 + 선명 리샘플링 파이프라인.
 *
 * - 단일 `@compute @workgroup_size(8, 8, 1)` 셰이더(`STUDIO_WEBGPU_TRANSFORM_RESAMPLE_WGSL`)에서
 *   (0) 아핀 회전·확대/축소, (1) 3×3 원근 자유변형 호모그래피,
 *   (2) 격자 메쉬 워프(bilinear 대칭 4분할 / bicubic Catmull-Rom Newton 역해),
 *   (3) 액화(Liquify 방사 변위: push / bloat / pinch / twirl-cw / twirl-ccw)를 1패스로 처리한다.
 * - 리샘플링 커널: `Nearest-Sharp(0)` · `Bilinear(1)` · `Catmull-Rom Bicubic(2)` · `Lanczos3(3)`.
 * - GPU 미지원·디바이스 부재 시 동일 수학의 결정적 CPU 실행기(`executeTransformResampleCpu`)로 자동 폴백한다.
 */

import {
  buildInverseAffineMatrix3x3,
  computeHomographyLocalScale,
  executeTransformResampleCpu,
  normalizeLiquifyOpsToPacked,
  RESAMPLER_MODE_CODES,
  TRANSFORM_MODE_CODES,
  type StudioTransformResampleRequest,
} from "./studio-webgpu-transform-resample-cpu";
import { STUDIO_WEBGPU_TRANSFORM_RESAMPLE_WGSL } from "./studio-webgpu-transform-resample-shader";
import {
  STUDIO_LIQUIFY_OP_STRIDE_FLOATS,
  STUDIO_MESH_CONTROL_STRIDE_FLOATS,
  STUDIO_TRANSFORM_UNIFORM_FLOATS,
  StudioZeroCopyRingPacker,
  uploadFloat32ViewToGpuBuffer,
  type StudioGpuMatrix3x3,
  type StudioPackedLiquifyOp,
  type StudioPackedMeshControlPoint,
  type StudioPackedTransformUniformInput,
} from "./studio-webgpu-zero-copy-pack";

import type { StudioImageDataLike } from "../studio-filters";

export {
  buildInverseAffineMatrix3x3,
  computeHomographyLocalScale,
  evaluateCatmullRomWeight,
  evaluateLanczos3Weight,
  evaluateLiquifyRadialSourcePoint,
  evaluateMeshForwardBicubic,
  evaluateMeshInversePoint,
  executeTransformResampleCpu,
  LIQUIFY_RADIAL_MODE_CODES,
  measureLineartEdgeEnergy,
  normalizeLiquifyOpsToPacked,
  RESAMPLER_MODE_CODES,
  sampleRgbaWithResampler,
  STUDIO_LIQUIFY_RADIAL_MODES,
  STUDIO_TRANSFORM_OPERATION_MODES,
  STUDIO_TRANSFORM_RESAMPLE_MODES,
  TRANSFORM_MODE_CODES,
  type StudioAffineTransformParams,
  type StudioLineartSharpnessMetrics,
  type StudioLiquifyRadialMode,
  type StudioLiquifyRadialOp,
  type StudioMeshPatchInterpolation,
  type StudioMeshWarpConfig,
  type StudioTransformOperationMode,
  type StudioTransformResampleMode,
  type StudioTransformResampleRequest,
} from "./studio-webgpu-transform-resample-cpu";
export { STUDIO_WEBGPU_TRANSFORM_RESAMPLE_WGSL } from "./studio-webgpu-transform-resample-shader";

export const STUDIO_TRANSFORM_COMPUTE_WORKGROUP_X = 8 as const;
export const STUDIO_TRANSFORM_COMPUTE_WORKGROUP_Y = 8 as const;
export const STUDIO_TRANSFORM_FLAG_MESH_BICUBIC = 1 as const;

const GPU_BUFFER_USAGE_STORAGE = 0x80;
const GPU_BUFFER_USAGE_UNIFORM = 0x40;
const GPU_BUFFER_USAGE_COPY_DST = 0x08;
const GPU_BUFFER_USAGE_COPY_SRC = 0x04;

export interface StudioTransformDispatchReport {
  readonly backend: "webgpu-compute" | "cpu-parity";
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly workgroupsX: number;
  readonly workgroupsY: number;
  readonly uploadedUniformBytes: number;
  readonly uploadedMeshBytes: number;
  readonly uploadedLiquifyBytes: number;
  readonly uniformRingSlot: number;
}

/**
 * 요청 객체로부터 WGSL `TransformUniforms` 패킹 입력과 정규화된 메쉬/리퀴파이 배열을 생성한다.
 */
export function buildTransformUniformPayload(
  source: Pick<StudioImageDataLike, "width" | "height">,
  request: StudioTransformResampleRequest,
): {
  readonly uniforms: StudioPackedTransformUniformInput;
  readonly meshNodes: readonly StudioPackedMeshControlPoint[];
  readonly liquifyOps: readonly StudioPackedLiquifyOp[];
} {
  const dstWidth = Math.max(1, Math.trunc(request.outputWidth ?? source.width));
  const dstHeight = Math.max(1, Math.trunc(request.outputHeight ?? source.height));
  const inverseMatrix: StudioGpuMatrix3x3 = request.mode === "affine"
    ? buildInverseAffineMatrix3x3(request.affine ?? {}, source.width, source.height)
    : (request.inverseHomography ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const [filterScaleX, filterScaleY] = request.mode === "affine" || request.mode === "perspective"
    ? computeHomographyLocalScale(inverseMatrix, dstWidth * 0.5, dstHeight * 0.5)
    : ([1, 1] as const);

  const meshNodes = request.mode === "mesh-warp" && request.mesh ? request.mesh.nodes : [];
  const liquifyOps = request.mode === "liquify" ? normalizeLiquifyOpsToPacked(request.liquifyOps) : [];
  const flags = request.mode === "mesh-warp" && request.mesh?.patchMode === "bicubic"
    ? STUDIO_TRANSFORM_FLAG_MESH_BICUBIC
    : 0;

  return {
    uniforms: {
      srcWidth: source.width,
      srcHeight: source.height,
      dstWidth,
      dstHeight,
      inverseMatrix,
      transformModeCode: TRANSFORM_MODE_CODES[request.mode],
      resamplerModeCode: RESAMPLER_MODE_CODES[request.resampler],
      filterScaleX,
      filterScaleY,
      meshRows: request.mesh?.rows ?? 0,
      meshCols: request.mesh?.cols ?? 0,
      liquifyOpCount: liquifyOps.length,
      flags,
    },
    meshNodes,
    liquifyOps,
  };
}

/**
 * WebGPU 1패스 Compute 변형·리샘플링 실행기.
 * - `device`가 제공되면 WGSL Compute 파이프라인을 컴파일·캐시하고 제로카피 링 버퍼로 업로드·디스패치한다.
 * - `device`가 `null`이거나 WebGPU가 비활성인 환경에서는 결정적 CPU 폴백(`executeTransformResampleCpu`)으로 동작한다.
 */
export class StudioWebGpuTransformComputeExecutor {
  private readonly device: GPUDevice | null;
  private readonly ringPacker: StudioZeroCopyRingPacker;
  private pipeline: GPUComputePipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private meshBuffer: GPUBuffer | null = null;
  private meshBufferBytes = 0;
  private liquifyBuffer: GPUBuffer | null = null;
  private liquifyBufferBytes = 0;
  private disposed = false;

  public constructor(device: GPUDevice | null, ringPacker = new StudioZeroCopyRingPacker()) {
    this.device = device;
    this.ringPacker = ringPacker;
  }

  public get isGpuAvailable(): boolean {
    return this.device !== null && !this.disposed;
  }

  private ensurePipeline(device: GPUDevice): GPUComputePipeline {
    if (this.pipeline) return this.pipeline;
    const shaderModule = device.createShaderModule({
      label: "studio-webgpu-transform-resample-wgsl",
      code: STUDIO_WEBGPU_TRANSFORM_RESAMPLE_WGSL,
    });
    this.pipeline = device.createComputePipeline({
      label: "studio-webgpu-transform-resample-pipeline",
      layout: "auto",
      compute: {
        module: shaderModule,
        entryPoint: "cs_transform_resample",
      },
    });
    return this.pipeline;
  }

  private ensureUniformBuffer(device: GPUDevice): GPUBuffer {
    if (this.uniformBuffer) return this.uniformBuffer;
    this.uniformBuffer = device.createBuffer({
      label: "studio-transform-uniforms",
      size: STUDIO_TRANSFORM_UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT,
      usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
    });
    return this.uniformBuffer;
  }

  private ensureStorageBuffer(
    device: GPUDevice,
    current: GPUBuffer | null,
    currentBytes: number,
    requiredBytes: number,
    label: string,
  ): { readonly buffer: GPUBuffer; readonly byteLength: number } {
    const safeBytes = Math.max(16, requiredBytes);
    if (current && currentBytes >= safeBytes) {
      return { buffer: current, byteLength: currentBytes };
    }
    current?.destroy();
    const nextBytes = Math.max(safeBytes, currentBytes * 2);
    const buffer = device.createBuffer({
      label,
      size: nextBytes,
      usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST,
    });
    return { buffer, byteLength: nextBytes };
  }

  /**
   * GPU 버퍼(`srcBuffer -> dstBuffer`) 대상으로 1패스 Compute 셰이더를 인코딩·제출한다.
   */
  public dispatchGpuBuffers(
    sourceDimensions: { readonly width: number; readonly height: number },
    srcBuffer: GPUBuffer,
    dstBuffer: GPUBuffer,
    request: StudioTransformResampleRequest,
  ): StudioTransformDispatchReport {
    if (!this.device || this.disposed) {
      throw new Error("WebGPU 디바이스를 사용할 수 없어 GPU Compute 디스패치를 수행할 수 없습니다.");
    }
    const device = this.device;
    const pipeline = this.ensurePipeline(device);
    const uniformBuf = this.ensureUniformBuffer(device);

    const payload = buildTransformUniformPayload(sourceDimensions, request);
    const uniformView = this.ringPacker.packTransformUniforms(payload.uniforms);
    const uploadedUniformBytes = uploadFloat32ViewToGpuBuffer(device.queue, uniformBuf, uniformView);

    const meshBytesNeeded = Math.max(
      16,
      payload.meshNodes.length * STUDIO_MESH_CONTROL_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT,
    );
    const meshSlot = this.ensureStorageBuffer(
      device,
      this.meshBuffer,
      this.meshBufferBytes,
      meshBytesNeeded,
      "studio-transform-mesh-nodes",
    );
    this.meshBuffer = meshSlot.buffer;
    this.meshBufferBytes = meshSlot.byteLength;

    let uploadedMeshBytes = 0;
    if (payload.meshNodes.length > 0) {
      const meshView = this.ringPacker.packMeshControlPoints(payload.meshNodes);
      uploadedMeshBytes = uploadFloat32ViewToGpuBuffer(device.queue, this.meshBuffer, meshView);
    }

    const liquifyBytesNeeded = Math.max(
      32,
      payload.liquifyOps.length * STUDIO_LIQUIFY_OP_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT,
    );
    const liquifySlot = this.ensureStorageBuffer(
      device,
      this.liquifyBuffer,
      this.liquifyBufferBytes,
      liquifyBytesNeeded,
      "studio-transform-liquify-ops",
    );
    this.liquifyBuffer = liquifySlot.buffer;
    this.liquifyBufferBytes = liquifySlot.byteLength;

    let uploadedLiquifyBytes = 0;
    if (payload.liquifyOps.length > 0) {
      const liquifyView = this.ringPacker.packLiquifyOps(payload.liquifyOps);
      uploadedLiquifyBytes = uploadFloat32ViewToGpuBuffer(
        device.queue,
        this.liquifyBuffer,
        liquifyView,
      );
    }

    const bindGroup = device.createBindGroup({
      label: "studio-transform-resample-bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuf } },
        { binding: 1, resource: { buffer: srcBuffer } },
        { binding: 2, resource: { buffer: dstBuffer } },
        { binding: 3, resource: { buffer: this.meshBuffer } },
        { binding: 4, resource: { buffer: this.liquifyBuffer } },
      ],
    });

    const workgroupsX = Math.ceil(payload.uniforms.dstWidth / STUDIO_TRANSFORM_COMPUTE_WORKGROUP_X);
    const workgroupsY = Math.ceil(payload.uniforms.dstHeight / STUDIO_TRANSFORM_COMPUTE_WORKGROUP_Y);

    const encoder = device.createCommandEncoder({ label: "studio-transform-resample-encoder" });
    const pass = encoder.beginComputePass({ label: "studio-transform-resample-pass" });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
    pass.end();
    device.queue.submit([encoder.finish()]);

    return {
      backend: "webgpu-compute",
      outputWidth: payload.uniforms.dstWidth,
      outputHeight: payload.uniforms.dstHeight,
      workgroupsX,
      workgroupsY,
      uploadedUniformBytes,
      uploadedMeshBytes,
      uploadedLiquifyBytes,
      uniformRingSlot: uniformView.slotIndex,
    };
  }

  /**
   * 이미지 버퍼 입력에 대해 GPU 경로(가능 시) 또는 결정적 CPU 동등 경로를 선택해 실행한다.
   */
  public executeImageFallbackSafe(
    source: StudioImageDataLike,
    request: StudioTransformResampleRequest,
  ): {
    readonly image: StudioImageDataLike;
    readonly report: StudioTransformDispatchReport;
  } {
    const outW = Math.max(1, Math.trunc(request.outputWidth ?? source.width));
    const outH = Math.max(1, Math.trunc(request.outputHeight ?? source.height));
    const image = executeTransformResampleCpu(source, request);

    if (this.device && !this.disposed) {
      const srcByteLength = Math.max(4, source.width * source.height * 4);
      const dstByteLength = Math.max(4, outW * outH * 4);
      const srcBuf = this.device.createBuffer({
        label: "studio-transform-src-pixels",
        size: srcByteLength,
        usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST,
      });
      const dstBuf = this.device.createBuffer({
        label: "studio-transform-dst-pixels",
        size: dstByteLength,
        usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_SRC,
      });
      try {
        this.device.queue.writeBuffer(
          srcBuf,
          0,
          source.data.buffer,
          source.data.byteOffset,
          Math.min(source.data.byteLength, srcByteLength),
        );
        const report = this.dispatchGpuBuffers(
          { width: source.width, height: source.height },
          srcBuf,
          dstBuf,
          request,
        );
        return { image, report };
      } finally {
        srcBuf.destroy();
        dstBuf.destroy();
      }
    }

    return {
      image,
      report: {
        backend: "cpu-parity",
        outputWidth: outW,
        outputHeight: outH,
        workgroupsX: Math.ceil(outW / STUDIO_TRANSFORM_COMPUTE_WORKGROUP_X),
        workgroupsY: Math.ceil(outH / STUDIO_TRANSFORM_COMPUTE_WORKGROUP_Y),
        uploadedUniformBytes: 0,
        uploadedMeshBytes: 0,
        uploadedLiquifyBytes: 0,
        uniformRingSlot: 0,
      },
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.uniformBuffer?.destroy();
    this.meshBuffer?.destroy();
    this.liquifyBuffer?.destroy();
    this.uniformBuffer = null;
    this.meshBuffer = null;
    this.liquifyBuffer = null;
    this.pipeline = null;
  }
}
