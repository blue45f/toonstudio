/**
 * 추론 서비스 공개 훅 — 줄자·이동·밀기/당기기뿐 아니라 방 빌더 벽 그리기 같은 다른 도구도 같은 규칙을 쓴다.
 *
 * 방 빌더(`StudioBg3dRoomBuilderPanel`·`studio-bg3d-room-builder.ts`)는 이 훅을 수정 없이 붙일 수 있다.
 *
 * ```tsx
 * const { service } = useStudioBg3dInference();
 * // 벽 그리기 시작: 핸들러는 길이 입력(Enter) 때 끝점 좌표를 받는다.
 * service.begin("wall", { handlers: { applyLength: ({ reference, endPoint }) => addWall(reference, endPoint) } });
 * // 포인터 이동마다(R3F View 안): <StudioBg3dInferenceController service={service} active objectsRef={...} />
 * // 클릭: const { point } = service.resolveFreshPoint(hit.point);   // 추론이 있으면 그 점으로 치환
 * // 화면: <StudioBg3dInferenceHud service={service} /> 과 <StudioBg3dInferenceOverlay service={service} />
 * ```
 */

import { useEffect, useState, useSyncExternalStore } from "react";

import { attachStudioBg3dInferenceKeyboard } from "./studio-bg3d-inference-keyboard";
import { createStudioBg3dInferenceService } from "./studio-bg3d-inference-service";

import type {
  CreateStudioBg3dInferenceServiceOptions,
  StudioBg3dInferenceService,
  StudioBg3dInferenceServiceSnapshot,
} from "./studio-bg3d-inference-service";

export interface UseStudioBg3dInferenceOptions {
  /** 이미 만든 서비스를 재사용한다 (에디터가 만든 서비스를 하위 컴포넌트가 읽을 때). */
  readonly service?: StudioBg3dInferenceService;
  /** 창 수준 키보드 라우팅(방향키 잠금·Shift·Esc·숫자 입력)을 붙일지. 기본 true. */
  readonly keyboard?: boolean;
  readonly serviceOptions?: CreateStudioBg3dInferenceServiceOptions;
}

export interface StudioBg3dInferenceHandle {
  readonly service: StudioBg3dInferenceService;
  readonly snapshot: StudioBg3dInferenceServiceSnapshot;
}

/** 서비스의 스냅샷을 구독한다. */
export function useStudioBg3dInferenceSnapshot(
  service: StudioBg3dInferenceService,
): StudioBg3dInferenceServiceSnapshot {
  return useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
}

/** 서비스에 창 수준 키보드 라우팅을 붙인다. 세션이 없는 동안에는 어떤 키도 가로채지 않는다. */
export function useStudioBg3dInferenceKeyboard(service: StudioBg3dInferenceService, enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    return attachStudioBg3dInferenceKeyboard({ window, document, service });
  }, [enabled, service]);
}

export function useStudioBg3dInference(options: UseStudioBg3dInferenceOptions = {}): StudioBg3dInferenceHandle {
  const [created] = useState(() =>
    options.service ? null : createStudioBg3dInferenceService(options.serviceOptions));
  const service = options.service ?? created;
  if (!service) throw new Error("추론 서비스를 만들지 못했습니다.");
  const snapshot = useStudioBg3dInferenceSnapshot(service);
  useStudioBg3dInferenceKeyboard(service, options.keyboard !== false);
  return { service, snapshot };
}
