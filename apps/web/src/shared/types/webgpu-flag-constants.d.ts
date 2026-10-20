/**
 * Narrow WebGPU flag-constant declarations for the app type program.
 *
 * TypeScript's lib.dom (typescript ~6.0.3, pinned in the root package.json) already
 * ships every WebGPU interface (GPUDevice, GPUBuffer, GPUCanvasContext, ...) and the
 * `GPU*Flags` aliases, but it declares NO value objects for the five flag namespaces.
 * Code that reads `GPUShaderStage.COMPUTE`, `GPUBufferUsage.UNIFORM`,
 * `GPUTextureUsage.RENDER_ATTACHMENT` or `GPUMapMode.READ` therefore fails with
 * TS2304 "Cannot find name" even though the types around it resolve.
 *
 * `@webgpu/types` declares these values, but the app deliberately keeps that
 * package's global declarations out of its type universe: loading them reorders
 * lib.dom's HTMLCanvasElement overloads and breaks unrelated Canvas2D test mocks
 * (see `shared/types/vendor/canvaskit-wasm-shim.d.ts`). It is also not a direct
 * dependency — it only reaches the lockfile transitively via canvaskit-wasm and
 * pixi.js — so a bare `/// <reference types="@webgpu/types" />` would not resolve
 * from the root under pnpm's isolated node_modules.
 *
 * This file therefore declares only the five flag-constant objects, with member
 * types taken from lib.dom's own `GPUFlagsConstant`. Interface and variable names
 * are unused by lib.dom for these five namespaces, so nothing here merges with or
 * overrides an existing declaration, and no interface/getContext overload is
 * touched. Values are the fixed WebGPU spec constants; this is a type-only file.
 */

interface GPUShaderStage {
  readonly VERTEX: GPUFlagsConstant;
  readonly FRAGMENT: GPUFlagsConstant;
  readonly COMPUTE: GPUFlagsConstant;
}

declare var GPUShaderStage: GPUShaderStage;

interface GPUBufferUsage {
  readonly MAP_READ: GPUFlagsConstant;
  readonly MAP_WRITE: GPUFlagsConstant;
  readonly COPY_SRC: GPUFlagsConstant;
  readonly COPY_DST: GPUFlagsConstant;
  readonly INDEX: GPUFlagsConstant;
  readonly VERTEX: GPUFlagsConstant;
  readonly UNIFORM: GPUFlagsConstant;
  readonly STORAGE: GPUFlagsConstant;
  readonly INDIRECT: GPUFlagsConstant;
  readonly QUERY_RESOLVE: GPUFlagsConstant;
}

declare var GPUBufferUsage: GPUBufferUsage;

interface GPUTextureUsage {
  readonly COPY_SRC: GPUFlagsConstant;
  readonly COPY_DST: GPUFlagsConstant;
  readonly TEXTURE_BINDING: GPUFlagsConstant;
  readonly STORAGE_BINDING: GPUFlagsConstant;
  readonly RENDER_ATTACHMENT: GPUFlagsConstant;
  readonly TRANSIENT_ATTACHMENT: GPUFlagsConstant;
}

declare var GPUTextureUsage: GPUTextureUsage;

interface GPUMapMode {
  readonly READ: GPUFlagsConstant;
  readonly WRITE: GPUFlagsConstant;
}

declare var GPUMapMode: GPUMapMode;

interface GPUColorWrite {
  readonly RED: GPUFlagsConstant;
  readonly GREEN: GPUFlagsConstant;
  readonly BLUE: GPUFlagsConstant;
  readonly ALPHA: GPUFlagsConstant;
  readonly ALL: GPUFlagsConstant;
}

declare var GPUColorWrite: GPUColorWrite;
