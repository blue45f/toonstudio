/** 키트 피부의 팽창 외곽선이 가까운 의상보다 앞의 깊이를 남기지 않게 한다. */
import type { CharacterRig } from "./character-rig";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { OutlineRenderer } from "@babylonjs/core/Rendering/outlineRenderer.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** 장면별 어댑터. 색 외곽선·투명 메시 stencil·overlay는 Babylon에 그대로 위임한다. */
export class KitOutlineDepthController {
  private readonly meshes = new WeakSet<Mesh>();
  private readonly renderer: OutlineRenderer;
  private readonly originalRender: OutlineRenderer["render"];
  private readonly render: OutlineRenderer["render"];
  private disposed = false;

  constructor(scene: Scene) {
    const engine = scene.getEngine();
    this.renderer = scene.getOutlineRenderer();
    this.originalRender = this.renderer.render;
    this.render = (subMesh, batch, useOverlay, renderPassId) => {
      // Babylon 9.31의 after-mesh 단계는 색을 끄고 팽창 hull 깊이를 다시 쓴다.
      // 피부 본체가 쓴 깊이는 유지하고, 이 추가 깊이만 생략해야 속옷의 연속면이 가려지지 않는다.
      if (!this.disposed && !useOverlay && !engine.getColorWrite() && engine.getDepthWrite() && this.meshes.has(subMesh.getRenderingMesh())) return;
      this.originalRender.call(this.renderer, subMesh, batch, useOverlay, renderPassId);
    };
    this.renderer.render = this.render;
  }

  set(mesh: Mesh, enabled: boolean): void {
    if (this.disposed) return;
    if (enabled) this.meshes.add(mesh);
    else this.meshes.delete(mesh);
  }

  sync(rig: CharacterRig, nativeHull: boolean): void {
    // renderOutline 대입보다 먼저 호출되므로 모드 인자를 기준으로 갱신한다.
    for (const part of rig.parts) {
      const enabled = nativeHull && rig.kind === "kit" && part.role === "skin";
      for (const mesh of part.meshes) this.set(mesh, enabled);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.renderer.render === this.render) this.renderer.render = this.originalRender;
  }
}
