import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const canvas = readFileSync(new URL("./StudioVirtualSpacePhaserCanvas.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./StudioVirtualSpacePage.tsx", import.meta.url), "utf8");

describe("월드 캔버스의 사용자 줌 연결", () => {
  it("자동 줌(기준 줌·속도 줌)에 사용자 줌을 곱하고, 글자 해상도도 같은 배율로 맞춘다", () => {
    expect(canvas).toContain("const userZoom = new StudioUserZoomRuntime(bridge.userZoom);");
    expect(canvas).toContain("this.cameras.main.setZoom(cameraBaseZoom * directed.zoomFactor * userZoom.sample(dt, reducedMotion.matches));");
    expect(canvas).toContain("textResolution?.sync(Math.max(cameraBaseZoom * userZoom.current, viewport.ratio));");
  });

  it("화면·카메라 모드가 바뀔 때 하한과 사용 가능 여부를 다시 정한다", () => {
    expect(canvas).toMatch(/userZoom\.setView\(cameraBaseZoom, \{ cssWidth: gameSize\.width \/ viewport\.ratio, cssHeight: gameSize\.height \/ viewport\.ratio, ratio: viewport\.ratio \}, manifest, cameraFollows\);/u);
  });

  it("화면에 고정된 원경(cinematic-v9)은 줌이 바뀔 때마다 화면을 덮도록 다시 맞춘다(기본 화풍에서도 줌이 되어야 한다)", () => {
    expect(canvas).toContain('const screenFixedHorizon = horizonUrl.includes("/cinematic-v9/");');
    expect(canvas).toContain("if (horizonArtwork && screenFixedHorizon && cameraFollows) fitStudioHorizonArtwork(horizonArtwork, this.scale.gameSize, this.cameras.main.zoom);");
    const zoom = canvas.indexOf("userZoom.sample(dt, reducedMotion.matches)");
    const refit = canvas.indexOf("fitStudioHorizonArtwork(horizonArtwork, this.scale.gameSize, this.cameras.main.zoom)");
    expect(refit, "줌을 적용한 뒤에 맞춰야 새 배율로 계산된다").toBeGreaterThan(zoom);
  });

  it("휠·핀치는 장면이 준비되고 줌을 받을 수 있을 때만 받고, 정리 때 해제한다", () => {
    expect(canvas).toContain("cleanup.push(bindStudioUserZoomGestures(canvas, bridge.userZoom, () => sceneReady && bridge.userZoom.getSnapshot().available, ");
  });

  it("핀치가 시작되면 첫 손가락이 시작시킨 걷기를 멈춘다(터치로 월드를 누르면 조이스틱 모드에서도 그 자리로 걷기 시작한다)", () => {
    expect(canvas).toContain("() => sceneReady && bridge.userZoom.getSnapshot().available, stopMovement));");
    const gestures = canvas.indexOf("bindStudioUserZoomGestures(canvas");
    const stop = canvas.indexOf("const stopMovement = () => {");
    expect(stop, "stopMovement를 정의한 뒤에 연결해야 한다").toBeGreaterThan(-1);
    expect(gestures).toBeGreaterThan(stop);
  });
});

describe("월드 페이지의 사용자 줌·내 자리 연결", () => {
  it("단축키는 줌을 받을 수 있을 때만 줌 핸들러를 넘기고, H는 기억한 자리가 있으면 그 자리를 요청한다", () => {
    expect(page).toContain("onZoom: userZoom.available ? (action) => engineBridge.userZoom.apply(action) : undefined,");
    expect(page).toContain("onDesk: () => { if (preferredSlotId && !personal) slots.requestSlot(preferredSlotId); else openOfficeSeats(); },");
  });

  it("⋯ 메뉴와 화면 버튼도 같은 저장소를 쓴다", () => {
    expect(page).toContain("zoomLevel: userZoom.available ? userZoom.level : null");
    expect(page).toContain("zoom: (action) => engineBridge.userZoom.apply(action),");
    expect(page).toContain("<SpaceZoomControls store={engineBridge.userZoom} onPointerUse={() => engineBridge.focusWorld()} />");
  });
});
