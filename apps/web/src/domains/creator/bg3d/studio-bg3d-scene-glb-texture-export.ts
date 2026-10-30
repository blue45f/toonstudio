import { CanvasTexture, CompressedTexture, DataTexture, FloatType, HalfFloatType, LinearSRGBColorSpace, Mesh,
  NearestFilter, NoBlending, NoColorSpace, NoToneMapping, Object3D, OrthographicCamera, PlaneGeometry,
  RenderTarget, RGB_BPTC_SIGNED_Format, RGB_BPTC_UNSIGNED_Format, RGBAFormat, RGBA_BPTC_Format,
  Scene, ShaderMaterial, SIGNED_R11_EAC_Format, SIGNED_RED_GREEN_RGTC2_Format, SIGNED_RED_RGTC1_Format,
  SIGNED_RG11_EAC_Format, SRGBColorSpace, Texture, UnsignedByteType, WebGLRenderer } from "three";

export type StudioBg3dSceneGlbTextureEngine = "webgl" | "webgpu";
export class StudioBg3dSceneGlbTextureExportError extends Error {
  constructor(readonly code: "aborted" | "texture-unavailable" | "gpu-unavailable" | "decode-failed" | "disposed", readonly reason: string) {
    super(code === "aborted" ? "장면 텍스처 저장을 취소했습니다."
      : code === "gpu-unavailable" ? "같은 렌더 엔진에서 텍스처를 원본 해상도로 읽을 GPU를 준비하지 못했습니다."
      : code === "disposed" ? "이미 정리된 장면 텍스처 내보내기를 다시 사용할 수 없습니다."
      : "텍스처를 같은 해상도와 색으로 PNG에 보존하지 못했습니다.");
    this.name = "StudioBg3dSceneGlbTextureExportError";
  }
}
export interface StudioBg3dSceneGlbPrivateTextureDecoder {
  decompress(texture: Texture, maxTextureSize: number): StudioBg3dSceneGlbTexturePixels | Promise<StudioBg3dSceneGlbTexturePixels>;
  dispose(): void | Promise<void>;
}
export interface StudioBg3dSceneGlbTexturePixels {
  readonly texture: CanvasTexture;
  /** 원래 alpha를 보관한다. texture.image는 RGB 손실을 막기 위해 alpha가 모두 255다. */
  readonly rgba: Uint8Array<ArrayBuffer>;
}
export interface StudioBg3dSceneGlbTextureCapture extends StudioBg3dSceneGlbTexturePixels {
  readonly width: number;
  readonly height: number;
  /** rgba와 texture.image는 같은 행순서다. 최종 PNG에는 texture.flipY를 한 번 적용한다. */
  readonly rowOrder: "top-down";
}
export interface StudioBg3dSceneGlbTextureExportOptions {
  readonly engine: StudioBg3dSceneGlbTextureEngine;
  readonly signal: AbortSignal;
  /** 테스트 대체는 개인 GPU 생성·디코드 경계에만 둔다. */
  readonly createPrivateDecoder?: (engine: StudioBg3dSceneGlbTextureEngine, signal: AbortSignal) => Promise<StudioBg3dSceneGlbPrivateTextureDecoder>;
}
export interface StudioBg3dSceneGlbTextureExportSupport {
  readonly textureUtils: { decompress(texture: Texture, maxTextureSize?: number): Promise<CanvasTexture> };
  capture(texture: Texture): Promise<StudioBg3dSceneGlbTextureCapture>;
  dispose(): Promise<void>;
}
function active(signal: AbortSignal): void {
  if (signal.aborted) throw new StudioBg3dSceneGlbTextureExportError("aborted", "signal-aborted");
}
function readableImage(image: object): boolean {
  return (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement)
    || (typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement)
    || (typeof OffscreenCanvas !== "undefined" && image instanceof OffscreenCanvas)
    || (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)
    || (typeof ImageData !== "undefined" && image instanceof ImageData);
}
function dimensions(texture: Texture): { width: number; height: number } {
  const image: unknown = texture.image;
  if (!image || typeof image !== "object" || !("width" in image) || !("height" in image)
    || typeof image.width !== "number" || !Number.isSafeInteger(image.width) || image.width < 1
    || typeof image.height !== "number" || !Number.isSafeInteger(image.height) || image.height < 1
    || !Number.isSafeInteger(image.width * image.height * 4)
    || "depth" in image || texture.isArrayTexture || "isCubeTexture" in texture
    || "isData3DTexture" in texture || "isDepthTexture" in texture || "isVideoTexture" in texture
    || texture.isRenderTargetTexture || texture.source.dataReady === false) {
    throw new StudioBg3dSceneGlbTextureExportError("texture-unavailable", "image-not-ready-2d");
  }
  if (texture.type === FloatType || texture.type === HalfFloatType || texture.type !== UnsignedByteType
    || texture.format === RGB_BPTC_SIGNED_Format || texture.format === RGB_BPTC_UNSIGNED_Format
    || texture.format === SIGNED_R11_EAC_Format || texture.format === SIGNED_RG11_EAC_Format
    || texture.format === SIGNED_RED_RGTC1_Format || texture.format === SIGNED_RED_GREEN_RGTC2_Format) {
    throw new StudioBg3dSceneGlbTextureExportError("texture-unavailable", "hdr-png-loss-not-supported");
  }
  if (texture.colorSpace !== NoColorSpace && texture.colorSpace !== LinearSRGBColorSpace && texture.colorSpace !== SRGBColorSpace) {
    throw new StudioBg3dSceneGlbTextureExportError("texture-unavailable", "image-color-space-not-supported");
  }
  if (!(texture instanceof CompressedTexture)) {
    if (texture.format !== RGBAFormat) throw new StudioBg3dSceneGlbTextureExportError("texture-unavailable", "image-format-not-rgba8");
    if (texture instanceof DataTexture) {
      if (!("data" in image) || (!(image.data instanceof Uint8Array) && !(image.data instanceof Uint8ClampedArray))
        || image.data.length !== image.width * image.height * 4) {
        throw new StudioBg3dSceneGlbTextureExportError("texture-unavailable", "data-texture-rgba8-invalid");
      }
      if (texture.premultiplyAlpha) throw new StudioBg3dSceneGlbTextureExportError("texture-unavailable", "premultiplied-data-texture-requires-gpu-sampling");
    } else if (!readableImage(image) || ("complete" in image && image.complete !== true)
      || ("naturalWidth" in image && image.naturalWidth !== image.width)
      || ("naturalHeight" in image && image.naturalHeight !== image.height)) {
      throw new StudioBg3dSceneGlbTextureExportError("texture-unavailable", "image-not-loaded-at-natural-size");
    }
    return { width: image.width, height: image.height };
  }
  if (!Array.isArray(texture.mipmaps) || texture.mipmaps.length === 0) {
    throw new StudioBg3dSceneGlbTextureExportError("texture-unavailable", "compressed-mipmaps-not-ready");
  }
  for (let index = 0; index < texture.mipmaps.length; index += 1) {
    const mip = texture.mipmaps[index];
    if (!Object.hasOwn(texture.mipmaps, index) || !mip || !(mip.data instanceof Uint8Array) || mip.data.byteLength === 0
      || mip.width !== Math.max(1, Math.floor(image.width / 2 ** index))
      || mip.height !== Math.max(1, Math.floor(image.height / 2 ** index))) {
      throw new StudioBg3dSceneGlbTextureExportError("texture-unavailable", "compressed-mipmap-invalid");
    }
  }
  return { width: image.width, height: image.height };
}
function usedTextures(scene: Object3D): Set<Texture> {
  const textures = new Set<Texture>();
  scene.traverse((object) => {
    if (!("material" in object)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || typeof material !== "object") continue;
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  return textures;
}
/** Texture.copy/clone는 Source를 공유하고 needsUpdate로 원본 Source.version도 올리므로 쓰지 않는다. */
function samplingCopy(texture: Texture): Texture {
  const { width, height } = dimensions(texture);
  const copy = texture instanceof CompressedTexture
    ? new CompressedTexture(texture.mipmaps.map((mip) => ({ ...mip, data: Uint8Array.from(mip.data) })),
      width, height, texture.format, texture.type)
    : new Texture(texture.image);
  copy.colorSpace = texture.colorSpace;
  // 화면 좌표를 변환하지 않고 각 base texel의 중심을 읽는다. 원래 sampler는 결과에 별도로 보존한다.
  copy.minFilter = NearestFilter; copy.magFilter = NearestFilter; copy.anisotropy = 1;
  copy.generateMipmaps = false; copy.flipY = texture.flipY;
  copy.internalFormat = texture.internalFormat;
  copy.premultiplyAlpha = texture.premultiplyAlpha;
  copy.unpackAlignment = texture.unpackAlignment;
  copy.needsUpdate = true;
  return copy;
}
function copyExportMetadata(source: Texture, result: CanvasTexture): void {
  result.name = source.name; result.colorSpace = source.colorSpace; result.mapping = source.mapping;
  result.minFilter = source.minFilter; result.magFilter = source.magFilter;
  result.wrapS = source.wrapS; result.wrapT = source.wrapT; result.anisotropy = source.anisotropy;
  result.channel = source.channel; result.offset.copy(source.offset); result.repeat.copy(source.repeat);
  result.center.copy(source.center); result.rotation = source.rotation;
  result.matrixAutoUpdate = source.matrixAutoUpdate; result.matrix.copy(source.matrix);
  // GPU 결과는 화면의 top-down, CPU DataTexture는 원래 image 행을 그대로 사용한다.
  result.flipY = source instanceof DataTexture ? source.flipY : true;
  result.userData = { mimeType: "image/png" };
}
/** WebGPU의 256바이트 행 pitch와 WebGL의 아래쪽 원점을 PNG image 행으로 정규화한다. */
export function normalizeStudioBg3dSceneGlbTextureReadback(input: {
  readonly width: number; readonly height: number; readonly rgba: Uint8Array;
  readonly rowStrideBytes: number; readonly origin: "top-left" | "bottom-left";
}): Uint8Array<ArrayBuffer> {
  const { width, height, rgba, rowStrideBytes, origin } = input, rowBytes = width * 4;
  const minimum = (height - 1) * rowStrideBytes + rowBytes;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1
    || !Number.isSafeInteger(rowStrideBytes) || rowStrideBytes < rowBytes || !Number.isSafeInteger(minimum)
    || (rgba.length !== minimum && rgba.length !== height * rowStrideBytes)
    || (origin !== "top-left" && origin !== "bottom-left")) {
    throw new StudioBg3dSceneGlbTextureExportError("decode-failed", "readback-layout-invalid");
  }
  const result = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = origin === "bottom-left" ? height - y - 1 : y;
    result.set(rgba.subarray(sourceY * rowStrideBytes, sourceY * rowStrideBytes + rowBytes), y * rowBytes);
  }
  return result;
}
function opaqueCanvas(width: number, height: number, rgba: Uint8Array<ArrayBuffer>): StudioBg3dSceneGlbTexturePixels {
  const image = document.createElement("canvas"); image.width = width; image.height = height;
  const context = image.getContext("2d");
  if (!context) throw new StudioBg3dSceneGlbTextureExportError("decode-failed", "canvas-2d-unavailable");
  const pixels = context.createImageData(width, height); pixels.data.set(rgba);
  for (let index = 3; index < pixels.data.length; index += 4) pixels.data[index] = 255;
  context.putImageData(pixels, 0, 0);
  return { texture: new CanvasTexture(image), rgba };
}
async function webGlDecoder(canvas: HTMLCanvasElement): Promise<StudioBg3dSceneGlbPrivateTextureDecoder> {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) throw new StudioBg3dSceneGlbTextureExportError("gpu-unavailable", "private-webgl2-unavailable");
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ canvas, context: gl, antialias: false, alpha: true, premultipliedAlpha: false }); }
  catch (error) { gl.getExtension("WEBGL_lose_context")?.loseContext(); throw error; }
  const geometry = new PlaneGeometry(2, 2), material = new ShaderMaterial({
    uniforms: { map: { value: null } }, depthTest: false, depthWrite: false, blending: NoBlending, toneMapped: false,
    vertexShader: "varying vec2 texUv; void main(){ texUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }",
    fragmentShader: "uniform sampler2D map; varying vec2 texUv; void main(){ gl_FragColor=texture2D(map,texUv);\n#if SOURCE_SRGB\ngl_FragColor=sRGBTransferOETF(gl_FragColor);\n#endif\n}",
  });
  const scene = new Scene(), camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(new Mesh(geometry, material));
  renderer.debug.onShaderError = () => { throw new StudioBg3dSceneGlbTextureExportError("decode-failed", "private-webgl-shader-failed"); };
  renderer.setPixelRatio(1); renderer.outputColorSpace = LinearSRGBColorSpace; renderer.toneMapping = NoToneMapping;
  try {
    const { WebGLUtils } = await import("three/src/renderers/webgl/WebGLUtils.js");
    const utils = new WebGLUtils(gl, renderer.extensions);
    return {
      decompress(texture) {
        const { width, height } = dimensions(texture);
        if (utils.convert(texture.format, texture.colorSpace) === null || width > renderer.capabilities.maxTextureSize || height > renderer.capabilities.maxTextureSize) {
          throw new StudioBg3dSceneGlbTextureExportError("gpu-unavailable", "private-webgl-format-or-size-unavailable");
        }
        material.uniforms.map.value = texture; material.defines = { SOURCE_SRGB: texture.colorSpace === SRGBColorSpace ? 1 : 0 }; material.needsUpdate = true;
        renderer.setSize(width, height, false); renderer.clear(); renderer.render(scene, camera);
        if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR || gl.drawingBufferWidth !== width || gl.drawingBufferHeight !== height) {
          throw new StudioBg3dSceneGlbTextureExportError("decode-failed", "private-webgl-readback-failed");
        }
        const rgba = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        if (gl.getError() !== gl.NO_ERROR) throw new StudioBg3dSceneGlbTextureExportError("decode-failed", "private-webgl-readback-failed");
        return opaqueCanvas(width, height, normalizeStudioBg3dSceneGlbTextureReadback({
          width, height, rgba, rowStrideBytes: width * 4, origin: "bottom-left",
        }));
      },
      dispose() { material.uniforms.map.value = null; geometry.dispose(); material.dispose(); try { renderer.dispose(); } finally { renderer.forceContextLoss(); canvas.width = 0; canvas.height = 0; } },
    };
  } catch (error) { geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss(); throw error; }
}
interface PrivateGpuDevice {
  readonly limits: { readonly maxTextureDimension2D: number };
  readonly queue: { onSubmittedWorkDone(): Promise<void> };
  pushErrorScope(filter: "validation"): void;
  popErrorScope(): Promise<{ readonly message: string } | null>;
}
function gpuDevice(value: unknown): value is PrivateGpuDevice {
  if (!value || typeof value !== "object" || !("limits" in value) || !value.limits || typeof value.limits !== "object"
    || !("maxTextureDimension2D" in value.limits) || typeof value.limits.maxTextureDimension2D !== "number"
    || !("queue" in value) || !value.queue || typeof value.queue !== "object" || !("onSubmittedWorkDone" in value.queue)
    || typeof value.queue.onSubmittedWorkDone !== "function") return false;
  return "pushErrorScope" in value && typeof value.pushErrorScope === "function" && "popErrorScope" in value && typeof value.popErrorScope === "function";
}
function compressionFeature(format: number): string | null {
  if (format === RGBAFormat) return null;
  if ((format >= 33776 && format <= 33779) || (format >= 36283 && format <= 36286) || format === RGBA_BPTC_Format) return "texture-compression-bc";
  if (format === 36196 || (format >= 37488 && format <= 37497)) return "texture-compression-etc2";
  if (format >= 37808 && format <= 37821) return "texture-compression-astc";
  throw new StudioBg3dSceneGlbTextureExportError("gpu-unavailable", "private-webgpu-compression-format-unavailable");
}
async function webGpuDecoder(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<StudioBg3dSceneGlbPrivateTextureDecoder> {
  const [{ createStudioBg3dThreeWebGpuRenderer }, { NodeMaterial, ConvertNode }, nodes] = await Promise.all([
    import("./studio-bg3d-three-webgpu-renderer"), import("three/webgpu"), import("three/tsl"),
  ]);
  active(signal); let deviceLost = false;
  const runtime = await createStudioBg3dThreeWebGpuRenderer(canvas, { antialias: false, alpha: true, onDeviceLost: () => { deviceLost = true; } });
  const { renderer } = runtime, material = new NodeMaterial(), geometry = new PlaneGeometry(2, 2);
  const scene = new Scene(), camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  material.depthTest = false; material.depthWrite = false; material.blending = NoBlending; material.toneMapped = false;
  // 원래 alpha는 출력 색의 premultiply에 쓰지 않고 별도의 불투명 패스로 읽는다.
  material.premultipliedAlpha = false;
  scene.add(new Mesh(geometry, material)); renderer.setPixelRatio(1); renderer.toneMapping = NoToneMapping;
  const device: unknown = "device" in renderer.backend ? renderer.backend.device : undefined;
  if (!gpuDevice(device)) { geometry.dispose(); material.dispose(); await runtime.dispose(); throw new StudioBg3dSceneGlbTextureExportError("gpu-unavailable", "private-webgpu-device-unavailable"); }
  return {
    async decompress(texture) {
      const { width, height } = dimensions(texture), feature = compressionFeature(texture.format);
      if (deviceLost || (feature !== null && !renderer.hasFeature(feature)) || width > device.limits.maxTextureDimension2D || height > device.limits.maxTextureDimension2D) {
        throw new StudioBg3dSceneGlbTextureExportError("gpu-unavailable", "private-webgpu-format-or-size-unavailable");
      }
      const target = new RenderTarget(width, height, { format: RGBAFormat, type: UnsignedByteType,
        colorSpace: NoColorSpace, depthBuffer: false, stencilBuffer: false, samples: 0 });
      const sampled = nodes.texture(texture, nodes.uv());
      const rgb = texture.colorSpace === SRGBColorSpace
        ? new ConvertNode<"vec3">(nodes.sRGBTransferOETF(sampled.rgb), "vec3") : sampled.rgb;
      const read = async () => {
        active(signal); renderer.setRenderTarget(target); renderer.render(scene, camera);
        const data = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
        if (!(data instanceof Uint8Array)) throw new StudioBg3dSceneGlbTextureExportError("decode-failed", "private-webgpu-readback-type-invalid");
        return normalizeStudioBg3dSceneGlbTextureReadback({ width, height, rgba: data,
          rowStrideBytes: Math.ceil(width * 4 / 256) * 256, origin: "top-left" });
      };
      device.pushErrorScope("validation"); let popped = false;
      try {
        material.fragmentNode = nodes.vec4(rgb, 1); material.needsUpdate = true;
        const rgba = await read();
        material.fragmentNode = nodes.vec4(sampled.aaa, 1); material.needsUpdate = true;
        const alpha = await read();
        const error = await device.popErrorScope(); popped = true;
        await device.queue.onSubmittedWorkDone();
        if (error || deviceLost) throw new StudioBg3dSceneGlbTextureExportError("decode-failed", "private-webgpu-readback-failed");
        for (let index = 3; index < rgba.length; index += 4) rgba[index] = alpha[index - 3];
        active(signal); return opaqueCanvas(width, height, rgba);
      } finally {
        try { if (!popped) await device.popErrorScope(); }
        finally { renderer.setRenderTarget(null); target.dispose(); }
      }
    },
    async dispose() { material.fragmentNode = null; geometry.dispose(); material.dispose(); try { await runtime.dispose(); } finally { canvas.width = 0; canvas.height = 0; } },
  };
}
async function defaultDecoder(engine: StudioBg3dSceneGlbTextureEngine, signal: AbortSignal): Promise<StudioBg3dSceneGlbPrivateTextureDecoder> {
  active(signal);
  if (typeof document === "undefined") throw new StudioBg3dSceneGlbTextureExportError("gpu-unavailable", "private-canvas-unavailable");
  const canvas = document.createElement("canvas");
  return engine === "webgl" ? webGlDecoder(canvas) : webGpuDecoder(canvas, signal);
}
/** 입력·live renderer는 소유하지 않는다. 디코드 물리 종료 뒤 개인 GPU와 결과 texture만 정리한다. */
export async function createStudioBg3dSceneGlbTextureExport(scene: Object3D, options: StudioBg3dSceneGlbTextureExportOptions): Promise<StudioBg3dSceneGlbTextureExportSupport> {
  active(options.signal);
  const textures = usedTextures(scene);
  const compressed = [...textures].filter((texture) => texture instanceof CompressedTexture);
  for (const texture of compressed) dimensions(texture);
  let decoder: StudioBg3dSceneGlbPrivateTextureDecoder | undefined;
  try {
    if (compressed.length > 0) decoder = await (options.createPrivateDecoder ?? defaultDecoder)(options.engine, options.signal);
    active(options.signal);
  } catch (error) {
    await decoder?.dispose();
    if (error instanceof StudioBg3dSceneGlbTextureExportError) throw error;
    throw new StudioBg3dSceneGlbTextureExportError(options.signal.aborted ? "aborted" : "gpu-unavailable", "private-decoder-initialization-failed");
  }
  let disposed = false, disposal: Promise<void> | undefined, tail = Promise.resolve();
  const owned = new Set<CanvasTexture>(), pending = new Map<Texture, Promise<StudioBg3dSceneGlbTextureCapture>>();
  const check = () => { active(options.signal); if (disposed) throw new StudioBg3dSceneGlbTextureExportError("disposed", "texture-export-disposed"); };
  const dispose = (): Promise<void> => {
    if (!disposal) {
      disposed = true;
      disposal = (async () => {
        await tail; const failures: unknown[] = [];
        for (const texture of owned) {
          try { texture.dispose(); } catch (error) { failures.push(error); }
          texture.image.width = 0; texture.image.height = 0;
        }
        owned.clear(); pending.clear();
        try { await decoder?.dispose(); } catch (error) { failures.push(error); }
        if (failures.length > 0) throw new AggregateError(failures, "개인 텍스처 내보내기 자원 정리에 실패했습니다.");
      })();
    }
    return disposal;
  };
  const capture = (texture: Texture): Promise<StudioBg3dSceneGlbTextureCapture> => {
    try {
      check();
      if (!textures.has(texture)) throw new StudioBg3dSceneGlbTextureExportError("texture-unavailable", "texture-outside-export-scene");
      const existing = pending.get(texture); if (existing) return existing;
      const task = tail.then(async () => {
        check(); const size = dimensions(texture);
        let result: StudioBg3dSceneGlbTexturePixels;
        if (texture instanceof DataTexture) {
          const data: unknown = texture.image.data;
          if (!(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) throw new StudioBg3dSceneGlbTextureExportError("texture-unavailable", "data-texture-rgba8-invalid");
          result = opaqueCanvas(size.width, size.height, Uint8Array.from(data));
        } else {
          if (!decoder) {
            try { decoder = await (options.createPrivateDecoder ?? defaultDecoder)(options.engine, options.signal); }
            catch (error) {
              if (error instanceof StudioBg3dSceneGlbTextureExportError) throw error;
              throw new StudioBg3dSceneGlbTextureExportError(options.signal.aborted ? "aborted" : "gpu-unavailable", "private-decoder-initialization-failed");
            }
          }
          check(); const copy = samplingCopy(texture);
          try {
            result = await decoder.decompress(copy, Infinity);
            if (result.texture instanceof CanvasTexture) owned.add(result.texture);
          }
          finally { copy.dispose(); }
        }
        if (!(result.texture instanceof CanvasTexture)) throw new StudioBg3dSceneGlbTextureExportError("decode-failed", "decoder-result-not-owned-canvas");
        owned.add(result.texture);
        if (result.texture.image?.width !== size.width || result.texture.image?.height !== size.height) {
          throw new StudioBg3dSceneGlbTextureExportError("decode-failed", "decoder-result-size-changed");
        }
        if (!(result.rgba instanceof Uint8Array) || result.rgba.length !== size.width * size.height * 4) {
          throw new StudioBg3dSceneGlbTextureExportError("decode-failed", "decoder-result-rgba-invalid");
        }
        copyExportMetadata(texture, result.texture); check();
        return { texture: result.texture, rgba: Uint8Array.from(result.rgba), ...size, rowOrder: "top-down" } satisfies StudioBg3dSceneGlbTextureCapture;
      });
      tail = task.then(() => undefined, () => undefined);
      const guarded = task.catch(async (error: unknown) => {
        await dispose();
        if (error instanceof StudioBg3dSceneGlbTextureExportError) throw error;
        throw new StudioBg3dSceneGlbTextureExportError(options.signal.aborted ? "aborted" : "decode-failed", "private-decoder-failed");
      });
      pending.set(texture, guarded); return guarded;
    } catch (error) { return Promise.reject(error); }
  };
  return {
    textureUtils: {
      decompress(texture, maxTextureSize = Infinity) {
        try {
          check();
          if (maxTextureSize !== Infinity || !(texture instanceof CompressedTexture)) {
            throw new StudioBg3dSceneGlbTextureExportError("texture-unavailable", "compressed-texture-scope-or-quality-invalid");
          }
          return capture(texture).then((result) => result.texture);
        } catch (error) { return Promise.reject(error); }
      },
    },
    capture,
    dispose,
  };
}
