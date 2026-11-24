// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MOUSE, Object3D, PerspectiveCamera } from "three";
import { OrbitControls as NativeOrbitControls } from "three-stdlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CharacterShaperCameraStyleSelect, CharacterShaperGazeSelect } from "./CharacterShaperCameraControls";
import { CharacterShaperOrbitControls } from "./CharacterShaperOrbitControls";
import { CharacterShaperSessionSettingsProvider } from "./CharacterShaperSessionSettingsProvider";
import {
  characterShaperOrbitMouseButtons,
  installCharacterShaperGaze,
  resolveCharacterShaperGazeForPosePreset,
  resolveCharacterShaperGazeFromPoseIntent,
} from "./character-shaper-camera-runtime";

import type { CharacterShaperLookAtPort } from "./character-shaper-camera-runtime";

const bridge = vi.hoisted(() => ({ state: null as unknown, controls: { mouseButtons: {} } as Pick<NativeOrbitControls, "mouseButtons"> }));
vi.mock("@react-three/fiber", () => ({ useThree: () => bridge.state }));
vi.mock("@react-three/drei/core/OrbitControls.js", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return { OrbitControls: forwardRef(function TestOrbit(_props, ref) {
    useImperativeHandle(ref, () => bridge.controls); return null;
  }) };
});
afterEach(cleanup);

describe("셰이퍼 설정과 실제 카메라 포트 연결", () => {
  it("UI 변경 뒤 pointerdown의 modifier가 OrbitControls mouseButtons에 반영된다", () => {
    const canvas = document.createElement("canvas");
    bridge.state = { camera: new PerspectiveCamera(), gl: { domElement: canvas }, invalidate: vi.fn() };
    render(<CharacterShaperSessionSettingsProvider>
      <CharacterShaperCameraStyleSelect /><CharacterShaperOrbitControls />
    </CharacterShaperSessionSettingsProvider>);
    expect(bridge.controls.mouseButtons.RIGHT).toBe(MOUSE.ROTATE);
    fireEvent.change(screen.getByLabelText("카메라 조작 방식"), { target: { value: "blender" } });
    expect(bridge.controls.mouseButtons.MIDDLE).toBe(MOUSE.ROTATE);
    fireEvent(canvas, new MouseEvent("pointerdown", { button: 1, shiftKey: true }));
    expect(bridge.controls.mouseButtons.MIDDLE).toBe(MOUSE.ROTATE);
    fireEvent(canvas, new MouseEvent("pointerdown", { button: 1, ctrlKey: true }));
    expect(bridge.controls.mouseButtons.MIDDLE).toBe(MOUSE.DOLLY);
    expect(characterShaperOrbitMouseButtons("max", { altKey: true, ctrlKey: true }).MIDDLE).toBe(MOUSE.DOLLY);
  });

  it("실제 pointer 이벤트의 Blender Shift+MMB는 카메라와 target을 같이 이동하고 MMB는 target 주위로 회전한다", () => {
    const canvas = document.createElement("canvas"); document.body.appendChild(canvas);
    Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
    canvas.releasePointerCapture = vi.fn();
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 100); camera.position.set(0, 2, 5);
    const native = new NativeOrbitControls(camera, canvas); native.target.set(0, 1, 0); native.update();
    bridge.controls = native;
    bridge.state = { camera, gl: { domElement: canvas }, invalidate: vi.fn() };
    const view = render(<CharacterShaperSessionSettingsProvider>
      <CharacterShaperCameraStyleSelect /><CharacterShaperOrbitControls />
    </CharacterShaperSessionSettingsProvider>);
    const pointer = (type: string, clientX: number, shiftKey: boolean) => {
      const event = new MouseEvent(type, { button: 1, clientX, clientY: 200, shiftKey, bubbles: true });
      Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "mouse" } });
      return event;
    };
    const drag = (shiftKey: boolean) => {
      fireEvent(canvas, pointer("pointerdown", 200, shiftKey));
      fireEvent(document, pointer("pointermove", 280, shiftKey));
      fireEvent(document, pointer("pointerup", 280, shiftKey));
    };
    try {
      fireEvent.change(screen.getByLabelText("카메라 조작 방식"), { target: { value: "blender" } });
      const cameraBefore = camera.position.clone(); const targetBefore = native.target.clone();
      const offsetBefore = camera.position.clone().sub(native.target);
      drag(true);
      expect(camera.position.distanceTo(cameraBefore)).toBeGreaterThan(0.1);
      expect(native.target.distanceTo(targetBefore)).toBeGreaterThan(0.1);
      expect(camera.position.clone().sub(cameraBefore).distanceTo(native.target.clone().sub(targetBefore))).toBeLessThan(1e-8);
      expect(camera.position.clone().sub(native.target).distanceTo(offsetBefore)).toBeLessThan(1e-8);
      const orbitTarget = native.target.clone(); const orbitOffset = camera.position.clone().sub(native.target);
      drag(false);
      expect(native.target.distanceTo(orbitTarget)).toBeLessThan(1e-8);
      expect(camera.position.clone().sub(native.target).distanceTo(orbitOffset)).toBeGreaterThan(0.1);
      expect(camera.position.distanceTo(native.target)).toBeCloseTo(orbitOffset.length());
    } finally {
      view.unmount(); native.dispose(); canvas.remove(); bridge.controls = { mouseButtons: {} };
    }
  });

  it("시선 선택과 F10이 LookAt을 바꾸며 웹캠 재개·unmount가 이전 소유권을 복원한다", () => {
    const camera = new PerspectiveCamera(); const previousTarget = new Object3D();
    const lookAt: CharacterShaperLookAtPort = { target: previousTarget, autoUpdate: false, yaw: 12, pitch: -8, update: vi.fn() };
    bridge.state = { camera, gl: { domElement: document.createElement("canvas") }, invalidate: vi.fn() };
    function App({ paused = false }: { readonly paused?: boolean }) {
      return <CharacterShaperSessionSettingsProvider gazeAvailable={!paused}>
        <CharacterShaperGazeSelect h={{ status: "ready", vrm: { lookAt }, webcamActive: paused }} />
        <CharacterShaperOrbitControls lookAt={lookAt} gazePaused={paused} />
      </CharacterShaperSessionSettingsProvider>;
    }
    const view = render(<App />);
    expect(lookAt.target).toBe(camera); expect(lookAt.autoUpdate).toBe(true);
    fireEvent.change(screen.getByLabelText("시선 추적 모드"), { target: { value: "fix" } });
    expect(lookAt.target).toBeUndefined(); expect(lookAt.autoUpdate).toBe(false);
    expect(lookAt.yaw).toBe(0); expect(lookAt.pitch).toBe(0);
    fireEvent.keyDown(window, { key: "F10" });
    expect(lookAt.target).toBe(camera);
    view.rerender(<App paused />);
    expect(lookAt.target).toBe(previousTarget); expect(lookAt.yaw).toBe(12); expect(lookAt.pitch).toBe(-8);
    expect((screen.getByLabelText("시선 추적 모드") as HTMLSelectElement).disabled).toBe(true);
    view.rerender(<App />);
    expect(lookAt.target).toBe(camera);
    act(() => view.unmount());
    expect(lookAt.target).toBe(previousTarget); expect(lookAt.autoUpdate).toBe(false);
  });

  it("포즈 프리셋의 gazeIntent를 시선 모드·오프셋으로 변환하고 xp_phone_look은 아래(world), xp_wave_greeting은 카메라(cam)로 매핑한다", () => {
    const phoneGaze = resolveCharacterShaperGazeForPosePreset("xp_phone_look");
    expect(phoneGaze).not.toBeNull();
    expect(phoneGaze?.gazeMode).toBe("world");
    expect(phoneGaze?.gazeOffset.pitchDeg).toBe(-22);
    expect(phoneGaze?.gazeOffset.pitchDeg).toBeLessThan(0);
    expect(phoneGaze?.gazeOffset.yawDeg).toBe(0);

    const waveGaze = resolveCharacterShaperGazeForPosePreset("xp_wave_greeting");
    expect(waveGaze).not.toBeNull();
    expect(waveGaze?.gazeMode).toBe("cam");
    expect(Math.abs(waveGaze!.gazeOffset.yawDeg)).toBeLessThanOrEqual(8);
    expect(Math.abs(waveGaze!.gazeOffset.pitchDeg)).toBeLessThanOrEqual(6);

    // gazeIntent가 없는 포즈나 빈 입력은 null을 반환해 기존 시선을 유지한다.
    expect(resolveCharacterShaperGazeFromPoseIntent(undefined)).toBeNull();
    expect(resolveCharacterShaperGazeForPosePreset("default")).toBeNull();
    expect(resolveCharacterShaperGazeForPosePreset(null)).toBeNull();

    // 각도 클램프 및 방향 타깃(ground/down/up/left/right/forward) 검증
    expect(resolveCharacterShaperGazeFromPoseIntent({ target: "ground", pitchDeg: -90, yawDeg: 80 })).toEqual({
      gazeMode: "world",
      gazeOffset: { yawDeg: 30, pitchDeg: -24 },
    });
    expect(resolveCharacterShaperGazeFromPoseIntent({ target: "down" })?.gazeOffset.pitchDeg).toBeLessThan(0);
    expect(resolveCharacterShaperGazeFromPoseIntent({ target: "up" })?.gazeOffset.pitchDeg).toBeGreaterThan(0);
    expect(resolveCharacterShaperGazeFromPoseIntent({ target: "left" })?.gazeOffset.yawDeg).toBeLessThan(0);
    expect(resolveCharacterShaperGazeFromPoseIntent({ target: "right" })?.gazeOffset.yawDeg).toBeGreaterThan(0);
    expect(resolveCharacterShaperGazeFromPoseIntent({ target: "forward", pitchDeg: 0, yawDeg: 0 })).toEqual({
      gazeMode: "world",
      gazeOffset: { yawDeg: 0, pitchDeg: 0 },
    });

    // 실제 LookAt 리스에 적용하면 xp_phone_look은 카메라 추종을 끄고 pitch=-22로 내려다본다.
    const camera = new PerspectiveCamera();
    const lookAt: CharacterShaperLookAtPort = { target: camera, autoUpdate: true, yaw: 0, pitch: 0, update: vi.fn() };
    const lease = installCharacterShaperGaze(lookAt, camera);
    lease.update(phoneGaze!.gazeMode, false, phoneGaze!.gazeOffset);
    expect(lookAt.autoUpdate).toBe(false);
    expect(lookAt.target).toBeUndefined();
    expect(lookAt.pitch).toBe(-22);
    expect(lookAt.yaw).toBe(0);
    lease.update(waveGaze!.gazeMode, false, waveGaze!.gazeOffset);
    expect(lookAt.autoUpdate).toBe(true);
    expect(lookAt.target).toBe(camera);
    lease.release();
  });
});
