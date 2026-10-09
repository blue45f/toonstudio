import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const canvas = readFileSync(new URL("./StudioVirtualSpacePhaserCanvas.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./StudioVirtualSpacePage.tsx", import.meta.url), "utf8");

describe("월드 캔버스의 카메라 둘러보기 연결", () => {
  it("브리지의 저장소를 런타임이 매 프레임 읽어 카메라 목표에 더한다", () => {
    expect(canvas).toContain("const cameraPan = new StudioCameraPanRuntime(bridge.cameraPan);");
    expect(canvas).toContain("const lookAround = cameraPan.sample({");
    expect(canvas).toContain("cameraTarget.x = cameraBase.x + directed.shakeX + lookAround.x;");
    expect(canvas).toContain("cameraTarget.y = cameraBase.y + directed.shakeY + lookAround.y;");
  });

  it("카메라가 아바타를 따라가는 장소에서만 쓰고, 방 전환·대화 연출·순간 이동·모션 줄이기를 런타임에 알린다", () => {
    expect(canvas).toContain("available: cameraFollows, directed: directed.roomTransitioning || conversationFocus !== null, snap: snapCamera, reducedMotion: reducedMotion.matches, moving: nextMoving,");
    expect(canvas).toContain("cssToWorld: viewport.ratio / this.cameras.main.zoom, base: cameraBase, center: this.cameras.main.midPoint, view: this.cameras.main.worldView, world: manifest");
  });

  it("시점을 끌거나 되돌리는 동안에는 Phaser 데드존을 건너뛰고 카메라를 목표에 바로 맞춘다(추종 계산은 카메라 모듈이 맡는다)", () => {
    expect(canvas).toContain("immediate: snapCamera || reducedMotion.matches || lookAround.direct,");
    expect(canvas).toContain("centerOn: snapCamera ? cameraVisualTarget : lookAround.direct ? cameraTarget : null });");
    expect(canvas, "추종 비율 계산이 캔버스로 되돌아오지 않았는지").not.toContain("studioCameraEdgeLerpFactor");
    expect(canvas).not.toContain("this.cameras.main.setLerp(followLerp");
    const sample = canvas.indexOf("cameraPan.sample({");
    const follow = canvas.indexOf("applyStudioCameraFollow(this.cameras.main, {");
    expect(sample).toBeGreaterThan(-1);
    expect(follow, "오프셋을 먼저 구한 뒤 추종을 적용해야 한다").toBeGreaterThan(sample);
  });

  it("마우스 둘러보기와 두 손가락 끌기는 줌 제스처와 한 묶음으로, 장면 준비 뒤·입력이 막히지 않았을 때만 받는다", () => {
    expect(canvas).toContain("canPan: () => sceneReady && bridge.cameraPan.getSnapshot().available && !runtimeInputBlocked()");
    expect(canvas).not.toContain("bindStudioUserZoomGestures");
  });

  it("가구 배치 중에는 둘러보기를 받지 않는다: 그 동안 오른쪽 버튼은 배치 취소, 왼쪽 버튼은 확정이라 끌기가 가로채면 안 된다", () => {
    expect(canvas).toContain("!runtimeInputBlocked() && !buildPlacement?.active, onPinchStart: stopMovement }));");
    // 배치 컨트롤러가 오른쪽 버튼을 취소로 쓰는 전제가 바뀌면 이 시험을 다시 봐야 한다.
    const placement = readFileSync(new URL("./studio-virtual-space-build-placement-canvas.ts", import.meta.url), "utf8");
    expect(placement).toMatch(/if \(pointer\.rightButtonDown\(\)\) \{\s*this\.cancelSession\(\);/u);
  });
});

describe("월드 페이지의 카메라 둘러보기 연결", () => {
  it("L 키는 시점을 되돌리고, 이동·시점 상태 칩이 같은 저장소를 쓴다", () => {
    expect(page).toContain("onLocate: () => engineBridge.cameraPan.recenter(),");
    expect(page).toContain("cameraPan={engineBridge.cameraPan}");
    expect(page).toContain("onRecentered={() => engineBridge.focusWorld()}");
  });
});
