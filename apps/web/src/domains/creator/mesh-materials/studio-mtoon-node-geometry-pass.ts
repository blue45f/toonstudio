/** 승인된 WebGPU MToon 본체의 고정 시각 coverage만 사용하는 일회성 기하 pass다. */
import { MToonNodeMaterial } from "@pixiv/three-vrm/nodes";
import { Material, NoBlending, type Texture } from "three";
import { depth as fragmentDepth, float, materialReference, nodeObject, vec4 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";

import { StudioMToonAnimatedUVNode } from "./studio-mtoon-node-animated-uv";
import { readStudioMToonRuntimeIdentity } from "./studio-mtoon-runtime-identity";
import { cloneStudioMToonTextureSnapshot } from "./studio-mtoon-texture-snapshot";
import { studioThreeNodePackDepthToRgba } from "./studio-three-node-depth-packing";

export type StudioMToonNodeGeometryPassKind = "depth" | "normal-depth";

class StudioMToonNodeGeometryPass extends MeshBasicNodeMaterial {
  readonly uvAnimationMaskTexture: Texture | null;
  readonly uvAnimationScrollXOffset: number;
  readonly uvAnimationScrollYOffset: number;
  readonly uvAnimationRotationPhase: number;
  readonly #ownedTextures = new Set<Texture>();
  #disposed = false;

  constructor(source: MToonNodeMaterial, kind: StudioMToonNodeGeometryPassKind) {
    super();
    this.uvAnimationScrollXOffset = source.uvAnimationScrollXOffset;
    this.uvAnimationScrollYOffset = source.uvAnimationScrollYOffset;
    this.uvAnimationRotationPhase = source.uvAnimationRotationPhase;
    this.uvAnimationMaskTexture = null;
    const snapshots = new Map<Texture, Texture>();
    const copyTexture = (texture: Texture | null): Texture | null => {
      if (!texture) return null;
      const previous = snapshots.get(texture); if (previous) return previous;
      const snapshot = cloneStudioMToonTextureSnapshot(texture);
      snapshots.set(texture, snapshot); this.#ownedTextures.add(snapshot); return snapshot;
    };
    try {
      // 공개 기본 Material 복사로 side·clip·stencil·depth 상태를 보존한다. SDK node graph/Texture는 복사하지 않는다.
      Material.prototype.copy.call(this, source);
      this.name = `Studio MToon WebGPU ${kind}`;
      this.map = copyTexture(source.map);
      this.uvAnimationMaskTexture = copyTexture(source.uvAnimationMaskTexture);
      this.flatShading = source.flatShading ?? false;
      this.depthWrite = true;
      this.blending = NoBlending; this.transparent = false; this.toneMapped = false; this.fog = false;
      const uv = nodeObject(new StudioMToonAnimatedUVNode(this.uvAnimationMaskTexture !== null, this));
      const alpha = this.map ? materialReference("map", "texture", this).context({ getUV: () => uv }).a : float(1);
      this.colorNode = vec4(1, 1, 1, alpha);
      // 표준 diffuse/opacity/alphaTest/clip 경로를 통과한 뒤 출력만 교체한다. fragmentNode는 사용하지 않는다.
      this.outputNode = studioThreeNodePackDepthToRgba(float(fragmentDepth));
      // normal-depth의 MRT normalView는 MeshBasicNodeMaterial의 기하 법선이다. normalMap·조명용 map은 복제하지 않는다.
      this.normalNode = null;
    } catch (error) { this.dispose(); throw error; }
  }

  override clone(): this { throw new Error("일회성 MToon 기하 pass는 복제하지 않고 원본 본체에서 새로 생성해야 합니다."); }

  override dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const failures: unknown[] = [];
    for (const texture of this.#ownedTextures) try { texture.dispose(); } catch (error) { failures.push(error); }
    this.#ownedTextures.clear();
    try { super.dispose(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, "MToon 기하 pass의 독립 자원을 정리하지 못했습니다.");
  }
}

/** 원본 map·mask의 image payload를 빌리고 sampling/clock/clip 값만 독립 소유한다. beauty registry에는 등록하지 않는다. */
export function createStudioMToonNodeGeometryPass(source: Material, kind: StudioMToonNodeGeometryPassKind): MeshBasicNodeMaterial {
  if (kind !== "depth" && kind !== "normal-depth") throw new Error("지원하지 않는 MToon WebGPU 기하 pass입니다.");
  if (!(source instanceof MToonNodeMaterial) || source.isOutline || readStudioMToonRuntimeIdentity(source)?.backend !== "webgpu") {
    throw new Error("승인된 WebGPU MToon 본체만 기하 pass로 복제할 수 있습니다.");
  }
  if (![source.opacity, source.alphaTest, source.uvAnimationScrollXOffset, source.uvAnimationScrollYOffset, source.uvAnimationRotationPhase].every(Number.isFinite)) {
    throw new Error("MToon 기하 pass의 coverage·UV 시각 입력이 유한하지 않습니다.");
  }
  return new StudioMToonNodeGeometryPass(source, kind);
}
