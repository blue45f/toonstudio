import { WebGLRenderTarget, type Object3D, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";

export interface ReviewPropPixelCount {
  readonly visiblePixels: number;
  readonly isolatedPixels: number;
}

/** 같은 카메라·조명에서 소품을 켜고 끈 두 영상의 차이를 센다. 원래 색과 투명 재질도 그대로 렌더한다. */
export function measureReviewPropPixels(
  renderer: WebGLRenderer, camera: PerspectiveCamera, scene: Scene, avatar: Object3D, prop: Object3D,
): ReviewPropPixelCount {
  const width = 200, height = Math.max(1, Math.round(width / camera.aspect));
  const target = new WebGLRenderTarget(width, height);
  const previousTarget = renderer.getRenderTarget();
  const previousAvatar = avatar.visible, previousProp = prop.visible;
  const withProp = new Uint8Array(width * height * 4), withoutProp = new Uint8Array(withProp.length);

  function draw(showProp: boolean, pixels: Uint8Array) {
    prop.visible = showProp;
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  }

  function count(showAvatar: boolean) {
    avatar.visible = showAvatar;
    draw(true, withProp);
    draw(false, withoutProp);
    let changed = 0;
    for (let i = 0; i < withProp.length; i += 4) {
      let difference = 0;
      for (let channel = 0; channel < 4; channel++) {
        difference += Math.abs(withProp[i + channel] - withoutProp[i + channel]);
      }
      // 배경의 양자화 오차(채널당 1~2단계)는 소재 픽셀로 세지 않는다.
      if (difference >= 10) changed++;
    }
    return changed;
  }

  try {
    renderer.setRenderTarget(target);
    return { visiblePixels: count(true), isolatedPixels: count(false) };
  } finally {
    avatar.visible = previousAvatar;
    prop.visible = previousProp;
    renderer.setRenderTarget(previousTarget);
    target.dispose();
  }
}
