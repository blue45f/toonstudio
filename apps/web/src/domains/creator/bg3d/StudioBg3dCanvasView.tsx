"use no memo";
// 가변 R3F 상태·ref 를 프레임 콜백에서 직접 만지는 렌더 루프 컴포넌트라 React Compiler 대상에서 뺀다.

import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useEffectEvent, useLayoutEffect, useReducer, useRef, useState } from "react";
import { Scene } from "three";

import {
  clearStudioBg3dView,
  drawStudioBg3dView,
  placeStudioBg3dViewOnRenderer,
} from "./studio-bg3d-view-track-render";

import type { RootState } from "@react-three/fiber";
import type { ReactNode, RefObject } from "react";

import type { StudioBg3dViewRenderer } from "./studio-bg3d-view-track-render";

/**
 * `@react-three/drei` 10.7.9 의 `View`(web/View.js, MIT License, Copyright (c) 2020 react-spring) 중 캔버스 안에서
 * 쓰는 경로를 옮겨 고친 것이다.
 * 하나의 캔버스에 추적 요소(트랙)마다 장면을 그리는 방식·이벤트 연결·프레임 우선순위는 그대로이고, 다음만 다르다.
 * - 화면 밖 판정과 viewport 좌표를 캔버스 요소의 실제 사각형 기준으로 계산한다(`placeStudioBg3dViewTrack`).
 *   Drei 는 viewport 좌표의 `track.top` 을 캔버스 높이와 비교해, 뷰포트 위에 다른 패널이 있으면(3D 정밀
 *   편집) 멀쩡한 View 를 화면 밖으로 보고 그리기를 멈췄다. 이어지는 `gl.setSize` 가 캔버스를 비워 흰 화면이 됐다.
 * - 화면 밖 여부는 React 상태가 아니라 그 프레임에 계산한 값으로 정한다. Drei 는 상태가 갱신된 뒤에야 따라가 한 프레임
 *   늦었고, 다시 보일 때는 그릴 프레임 없이 자기 칸을 지우기만 했다.
 * - 포털에 넘기는 트랙 크기는 ResizeObserver 로 따라간다(Drei 는 마운트 시점 값이 그대로 남을 수 있다).
 * - 쓰지 않는 `frames`·HTML 터널(`View.Port`) 경로는 옮기지 않았다.
 */
interface StudioBg3dCanvasViewProps {
  readonly track: RefObject<HTMLElement | null>;
  readonly visible?: boolean;
  readonly index?: number;
  readonly children?: ReactNode;
}

interface TrackBox {
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly left: number;
}

interface ContainerProps {
  readonly visible: boolean;
  readonly scene: Scene;
  readonly index: number;
  readonly track: RefObject<HTMLElement | null>;
  readonly children?: ReactNode;
}

function Container({ visible, scene, index, track, children }: ContainerProps) {
  const rootState = useThree();
  const rect = useRef<DOMRect | null>(null);

  useFrame((state) => {
    // 트랙이 자리를 옮기거나 크기가 바뀌는 것은 ResizeObserver 로 알 수 없어 프레임마다 다시 잰다.
    rect.current = track.current?.getBoundingClientRect() ?? null;
    if (!visible || !rect.current) return;
    const renderer = state.gl as unknown as StudioBg3dViewRenderer;
    const placement = placeStudioBg3dViewOnRenderer(renderer, rect.current);
    if (placement.isOffscreen) return;
    // 자식이 있으면 포털 장면(state.scene)을, 없으면 기본 장면을 그린다.
    drawStudioBg3dView(renderer, state.camera, children ? state.scene : scene, placement);
  }, index);

  const clearOwnView = useEffectEvent(() => {
    if (!rect.current) return;
    const renderer = rootState.gl as unknown as StudioBg3dViewRenderer;
    clearStudioBg3dView(renderer, rootState.camera, placeStudioBg3dViewOnRenderer(renderer, rect.current));
  });
  const requestFrame = useEffectEvent(() => rootState.invalidate());

  useLayoutEffect(() => {
    // 보이지 않게 되면 자기 칸을 한 번 지우고, 다시 보이면 그릴 프레임을 요청한다(demand 루프는 스스로 깨지 않는다).
    if (visible) requestFrame();
    else clearOwnView();
  }, [visible]);

  const connectEvents = useEffectEvent((connected: HTMLElement | undefined) => {
    const previous = rootState.get().events.connected;
    rootState.setEvents({ connected });
    return previous;
  });
  const restoreEvents = useEffectEvent((previous: unknown) => rootState.setEvents({ connected: previous }));

  useEffect(() => {
    // 트랙 요소에 이벤트 층을 연결하고, 내려갈 때 자기 칸을 지우고 이전 연결을 되돌린다.
    const previous = connectEvents(track.current ?? undefined);
    return () => {
      clearOwnView();
      restoreEvents(previous);
    };
  }, [track]);

  return (
    <>
      {children}
      <group onPointerOver={() => null} />
    </>
  );
}

export function StudioBg3dCanvasView({
  track,
  visible = true,
  index = 1,
  children,
}: StudioBg3dCanvasViewProps) {
  const scene = useThree((state) => state.scene);
  const [virtualScene] = useState(() => new Scene());
  const [ready, toggle] = useReducer(() => true, false);
  const [trackBox, setTrackBox] = useState<TrackBox | null>(null);

  useEffect(() => {
    // 포털에 넘길 트랙 크기를 먼저 알아야 한다.
    const element = track.current;
    if (!element) {
      toggle();
      return;
    }
    const measure = () => {
      const { width, height, top, left } = element.getBoundingClientRect();
      setTrackBox((previous) => (
        previous && previous.width === width && previous.height === height
          && previous.top === top && previous.left === left
          ? previous
          : { width, height, top, left }
      ));
    };
    measure();
    toggle();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [track]);

  // 포인터 좌표를 트랙 칸 기준으로 바꾼다. 이벤트 대상이 트랙 요소일 때만 동작한다.
  const compute = (event: { target: EventTarget | null; clientX: number; clientY: number }, state: RootState) => {
    const element = track.current;
    if (!element || event.target !== element) return;
    const { width, height, left, top } = element.getBoundingClientRect();
    state.pointer.set(((event.clientX - left) / width) * 2 - 1, -((event.clientY - top) / height) * 2 + 1);
    state.raycaster.setFromCamera(state.pointer, state.camera);
  };

  return (
    <group>
      {ready && createPortal(
        <Container visible={visible} scene={scene} track={track} index={index}>
          {children}
        </Container>,
        virtualScene,
        { events: { compute, priority: index }, ...(trackBox ? { size: trackBox } : {}) },
      )}
    </group>
  );
}
