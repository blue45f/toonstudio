/**
 * 캡처 렌더 타깃 풀과 비동기 readback(브라우저 GPU 레인 최적화, 결과 바이트는 기존 경로와 같다).
 *
 * 1) 렌더 타깃 재사용: 캡처마다 `new RenderTargetTexture`를 만들고 버리면 Babylon이 매번 새 renderPassId(`++카운터`, 재사용 없음)를 받는다.
 *    모든 서브메시의 `_drawWrappers`는 그 id를 인덱스로 쓰는 희소 배열이라 길이가 캡처 누적 수만큼 계속 늘고, 재질을 dirty로 표시할 때마다
 *    (`_markAllSubMeshesAsDirty`) 장면 메시 × 그 길이를 훑는다. 실측(2026-10-23, M2 Max): 썸네일 수천 장 뒤 SSS 토글 한 번이 수 ms → 수백 ms,
 *    헤어 카드 1회에 이 훑기만 5초. 같은 장면·크기·MSAA 샘플 수의 작은 타깃(한 변 ≤ `POOLED_CAPTURE_MAX_EDGE`)은 하나를 계속 쓴다.
 *    엔진의 캡처 큐가 한 번에 하나만 돌리므로 같은 키를 동시에 쓰지 않지만, 혹시 겹치면 풀 밖의 임시 타깃을 만든다(기존 동작).
 *    풀 타깃은 장면 텍스처 목록에서 빼(장면 점검·직렬화에 캡처 부산물이 남지 않게) 장면 해제 때 이 모듈이 직접 해제한다.
 * 2) WebGL2 비동기 readback: `render/gl-readback.ts`(PBO + fence 폴링). WebGPU는 Babylon이 이미 mapAsync로 비동기다.
 */
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";

import { submitTextureReadback } from "../gl-readback";

import type { GlReadbackContext } from "../gl-readback";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** 풀에 두는 타깃의 최대 한 변(px). 썸네일(128)은 풀을 쓰고 큰 내보내기 해상도는 매번 만들고 버린다(GPU 메모리). */
export const POOLED_CAPTURE_MAX_EDGE = 512;

export interface CaptureTargetLease {
  readonly rtt: RenderTargetTexture;
  /** 풀에서 빌린 타깃이면 true(돌려줄 때 해제하지 않는다) */
  readonly pooled: boolean;
  release(): void;
}

interface PoolSlot {
  readonly rtt: RenderTargetTexture;
  busy: boolean;
}

const pools = new WeakMap<Scene, Map<string, PoolSlot>>();

/** 장면의 캡처 타깃 풀. 풀 타깃은 장면 텍스처 목록에 두지 않으므로(장면 점검·직렬화에 캡처 부산물이 보이지 않게) 장면 해제 때 직접 해제한다. */
function poolOf(scene: Scene): Map<string, PoolSlot> {
  let pool = pools.get(scene);
  if (!pool) {
    const created = new Map<string, PoolSlot>();
    pools.set(scene, created);
    scene.onDisposeObservable.addOnce(() => {
      for (const slot of created.values()) slot.rtt.dispose();
      created.clear();
      pools.delete(scene);
    });
    pool = created;
  }
  return pool;
}

function createTarget(scene: Scene, name: string, width: number, height: number, samples: number): RenderTargetTexture {
  const rtt = new RenderTargetTexture(name, { width, height }, scene, {
    generateMipMaps: false,
    type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
    format: Constants.TEXTUREFORMAT_RGBA,
    samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
    generateDepthBuffer: true,
    generateStencilBuffer: false,
  });
  if (samples > 1) rtt.samples = samples;
  return rtt;
}

/** 캡처 한 패스용 RGBA8 타깃을 빌린다. 작은 크기는 장면별 풀에서 재사용한다. */
export function acquireCaptureTarget(scene: Scene, pass: string, width: number, height: number, samples: number): CaptureTargetLease {
  const poolable = width <= POOLED_CAPTURE_MAX_EDGE && height <= POOLED_CAPTURE_MAX_EDGE;
  if (poolable) {
    const pool = poolOf(scene);
    const key = `${width}x${height}:${samples}`;
    let slot = pool.get(key);
    if (slot && slot.rtt.getInternalTexture() === null) {
      // 컨텍스트 손실 등으로 이미 해제된 타깃은 버린다.
      pool.delete(key);
      slot = undefined;
    }
    if (!slot) {
      const rtt = createTarget(scene, `capture-${pass}`, width, height, samples);
      scene.removeTexture(rtt);
      slot = { rtt, busy: false };
      pool.set(key, slot);
    }
    if (!slot.busy) {
      const leased = slot;
      leased.busy = true;
      // 이름은 패스를 나타낸다(진단·테스트 모의 readback이 `capture-<패스>`로 구분한다).
      leased.rtt.name = `capture-${pass}`;
      return {
        rtt: leased.rtt,
        pooled: true,
        release() {
          // 렌더 목록·패스 재질 참조를 남기지 않는다(임시 리그 메시가 해제된 뒤에도 잡혀 있지 않게).
          leased.rtt.renderList = [];
          leased.busy = false;
        },
      };
    }
  }
  const rtt = createTarget(scene, `capture-${pass}`, width, height, samples);
  return { rtt, pooled: false, release: () => rtt.dispose() };
}

/** 테스트·진단: 장면 풀에 있는 타깃 수 */
export function pooledCaptureTargetCount(scene: Scene): number {
  return pools.get(scene)?.size ?? 0;
}

interface WebGl2EngineInternals {
  readonly _gl?: unknown;
  readonly _currentFramebuffer?: WebGLFramebuffer | null;
}

function webgl2Of(engine: AbstractEngine): GlReadbackContext | null {
  if (engine.isWebGPU || typeof WebGL2RenderingContext === "undefined") return null;
  const gl = (engine as unknown as WebGl2EngineInternals)._gl;
  return gl instanceof WebGL2RenderingContext ? gl : null;
}

/**
 * 렌더가 끝난 타깃을 읽는다. WebGL2는 PBO 비동기 readback, 그 밖(WebGPU·NullEngine)은 Babylon 기본 `readPixels()`(NullEngine은 null).
 * 읽기 명령은 이 호출 안에서 동기로 제출된다 — 호출 직후 리그를 되돌려도 결과는 렌더한 상태다(capture.ts 일시 적용 구간 규약).
 */
export function readCaptureTarget(engine: AbstractEngine, rtt: RenderTargetTexture, width: number, height: number): Promise<ArrayBufferView> | null {
  const gl = webgl2Of(engine);
  const resource: unknown = rtt.getInternalTexture()?._hardwareTexture?.underlyingResource;
  if (gl && typeof WebGLTexture !== "undefined" && resource instanceof WebGLTexture) {
    const restoreFramebuffer = (engine as unknown as WebGl2EngineInternals)._currentFramebuffer ?? null;
    const pending = submitTextureReadback({ gl, texture: resource, width, height, restoreFramebuffer });
    if (pending) return pending;
  }
  return rtt.readPixels();
}
