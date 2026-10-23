/**
 * Studio BG3D 프리미티브 표면 그리기 호스트 훅(2026-10-23).
 *
 * 표면 그리기 1단계 패널(StudioBg3dTexturePaintPanel)·저장된 획 렌더(StudioBg3dSceneNodes 의 페인트 텍스처)는 있었지만
 * 에디터 호스트가 패널과 뷰포트 포인터를 잇지 않아 화면에 닿지 않았다. 이 훅이 GLB 페인트 호스트
 * (useStudioBg3dGlbTexturePaintHost)와 같은 계약으로 그 연결을 맡는다:
 * - 그리기 모드가 켜져 있고 선택한 프리미티브에 그릴 수 있을 때만 `handlePrimitiveTexturePaintPointer` 를 함수로 내놓는다.
 *   SceneGraph 는 핸들러가 있을 때만 프리미티브 메시에 연결하고 그동안 궤도 회전을 멈추므로, 꺼져 있으면 기존 선택·스냅·
 *   회전 동선과 같다.
 * - 포인터 → 획 변환은 GLB 와 같은 세션 컨트롤러가 한다(상자 면처럼 UV 섬을 건너뛰면 획을 끊어 번짐을 막는다).
 * - 확정 획은 선택 프리미티브의 texturePaint(런타임 정본)로만 들어간다. 저장·다시 열기에서 획이 남는 것은
 *   studio-bg3d-runtime-organization 의 선택 필드 이동 규칙이 맡는다(예전에는 이 규칙에 획이 없어 저장 때 사라졌다).
 */

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { StudioBg3dGlbTexturePaintSession } from "./studio-bg3d-glb-texture-paint-controller";
import {
  appendStudioBg3dTexturePaintStroke,
  DEFAULT_STUDIO_BG3D_TEXTURE_PAINT_BRUSH,
  type StudioBg3dTexturePaint,
  type StudioBg3dTexturePaintBrush,
} from "./studio-bg3d-texture-paint";

import type { BgPrimitive } from "../studio-background-3d-primitives";

export type StudioBg3dPrimitivePaintPointerPhase = "down" | "move" | "up";

/** 그릴 수 없는 이유. 화면 문구는 마운트가 번역해 붙인다. */
export type StudioBg3dPrimitivePaintBlock = "locked" | "hidden" | "busy";

export interface StudioBg3dPrimitivePaintHostBag {
  /** 선택한 첫 항목이 프리미티브일 때 그 프리미티브(파생값 — 렌더마다 최신). */
  readonly primitive: BgPrimitive | null;
  readonly paintActive: boolean;
  readonly onPaintActiveChange: (active: boolean) => void;
  readonly brush: StudioBg3dTexturePaintBrush;
  readonly onBrushChange: (brush: StudioBg3dTexturePaintBrush) => void;
  /** 패널의 실행 취소·다시 실행·전체 지우기가 쓰는 유일한 쓰기 통로. null 이면 획을 모두 지운다. */
  readonly onPaintChange: (id: string, paint: StudioBg3dTexturePaint | null) => void;
  readonly blockedBy: StudioBg3dPrimitivePaintBlock | null;
  /**
   * SceneGraph 가 읽는 호스트 핸들러. 그리기 모드이고 그릴 수 있을 때만 함수이고, 그 밖에는 undefined 라
   * 프리미티브 메시의 기존 동선이 그대로 유지된다.
   */
  readonly handlePrimitiveTexturePaintPointer:
    | ((id: string, event: unknown, phase: StudioBg3dPrimitivePaintPointerPhase) => void)
    | undefined;
}

export interface StudioBg3dPrimitivePaintHostInput {
  readonly primitive: BgPrimitive | null;
  readonly setPrimitives: Dispatch<SetStateAction<BgPrimitive[]>>;
  /** 캡처·복원·물리 미리보기처럼 장면을 바꾸면 안 되는 동안 true. */
  readonly busy: boolean;
}

/** 프리미티브 한 개에서 획을 넣거나 지운 배열. 대상이 없거나 값이 같으면 같은 배열을 돌려준다(불필요한 커밋 방지). */
export function replaceStudioBg3dPrimitiveTexturePaint(
  primitives: BgPrimitive[],
  id: string,
  update: (current: StudioBg3dTexturePaint | null) => StudioBg3dTexturePaint | null,
): BgPrimitive[] {
  let changed = false;
  const next = primitives.map((primitive) => {
    if (primitive.id !== id) return primitive;
    const current = primitive.texturePaint ?? null;
    const paint = update(current);
    if (paint === current) return primitive;
    changed = true;
    if (paint) return { ...primitive, texturePaint: paint };
    const { texturePaint: _removed, ...rest } = primitive;
    return rest;
  });
  return changed ? next : primitives;
}

export function resolveStudioBg3dPrimitivePaintBlock(
  primitive: BgPrimitive | null,
  busy: boolean,
): StudioBg3dPrimitivePaintBlock | null {
  if (busy) return "busy";
  if (!primitive) return null;
  if (primitive.locked === true) return "locked";
  if (primitive.visible === false) return "hidden";
  return null;
}

export function useStudioBg3dPrimitivePaintHost(
  input: StudioBg3dPrimitivePaintHostInput,
): StudioBg3dPrimitivePaintHostBag {
  const [paintActive, setPaintActive] = useState(false);
  const [brush, setBrush] = useState<StudioBg3dTexturePaintBrush>(DEFAULT_STUDIO_BG3D_TEXTURE_PAINT_BRUSH);
  const sessionRef = useRef<StudioBg3dGlbTexturePaintSession | null>(null);
  const primitiveIdRef = useRef<string | null>(null);
  primitiveIdRef.current = input.primitive?.id ?? null;
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const setPrimitivesRef = useRef(input.setPrimitives);
  setPrimitivesRef.current = input.setPrimitives;

  const primitiveId = input.primitive?.id ?? null;
  const blockedBy = resolveStudioBg3dPrimitivePaintBlock(input.primitive, input.busy);

  // 선택이 바뀌거나 그리기를 끄거나 그릴 수 없게 되면 진행 중인 획은 확정하지 않고 버린다.
  useEffect(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
  }, [primitiveId]);

  useEffect(() => {
    if (!paintActive || blockedBy !== null) sessionRef.current?.cancel();
  }, [paintActive, blockedBy]);

  useEffect(() => {
    sessionRef.current?.setBrush(brush);
  }, [brush]);

  const ensureSession = (id: string): StudioBg3dGlbTexturePaintSession => {
    if (!sessionRef.current) {
      sessionRef.current = new StudioBg3dGlbTexturePaintSession({
        brush: brushRef.current,
        // 프리미티브는 텍스처가 하나뿐이라 대상 키가 하나다. UV 섬 건너뛰기 끊기는 세션이 그대로 해 준다.
        resolveTargetKey: () => "primitive",
        onCommitStroke: (_targetKey, stroke) => {
          // 한도(획 256·점 8192)에 닿으면 기존 페인트를 그대로 둔다(부분 적용 금지). 패널이 획·점 수를 보여 준다.
          setPrimitivesRef.current((previous) => replaceStudioBg3dPrimitiveTexturePaint(previous, id, (current) =>
            appendStudioBg3dTexturePaintStroke(current, stroke) ?? current));
        },
      });
    }
    return sessionRef.current;
  };

  const onPaintChange = (id: string, paint: StudioBg3dTexturePaint | null) => {
    input.setPrimitives((previous) => replaceStudioBg3dPrimitiveTexturePaint(previous, id, () => paint));
  };

  const handlePrimitiveTexturePaintPointer =
    paintActive && input.primitive && blockedBy === null
      ? (id: string, event: unknown, phase: StudioBg3dPrimitivePaintPointerPhase) => {
          if (id !== primitiveIdRef.current) return;
          ensureSession(id).handlePointer(phase, event);
        }
      : undefined;

  return {
    primitive: input.primitive,
    paintActive,
    onPaintActiveChange: setPaintActive,
    brush,
    onBrushChange: setBrush,
    onPaintChange,
    blockedBy,
    handlePrimitiveTexturePaintPointer,
  };
}
