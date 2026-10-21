/**
 * Studio BG3D GLB 텍스처 페인트 호스트 훅 (D4 호스트 마운트, 2026-10-22).
 *
 * 패널(StudioBg3dGlbTexturePaintPanel)·세션 컨트롤러·SceneNodes 계약은 완성돼
 * 있었지만 에디터 호스트가 이를 잇지 않아 화면에 닿지 않았다. 이 훅이 그 연결을
 * 소유한다:
 * - 선택된 커스텀 모델의 저장 레코드(GLB 바이트)로 페인트 가능 여부를 판정한다.
 * - 그리기 모드가 켜지고 판정이 paintable일 때만 `handleModelTexturePaintPointer`를
 *   함수로 내놓는다 — SceneGraph는 핸들러가 있을 때만 모델 메시에 연결하므로,
 *   꺼져 있을 때는 기존 선택/스냅 동선과 완전히 동일하게 동작한다.
 * - 확정 획은 세션 콜백 → 인스턴스의 modelTexturePaint(정본 상태)로만 들어간다.
 *   문서 왕복·렌더 합성은 D4에서 배선된 runtime 어댑터와 SceneNodes effect가 맡는다.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Object3D } from "three";

import { getStoredBg3dModel } from "./bg3d-model-library";
import {
  analyzeStudioBg3dGlbPaintabilityFromBytes,
  type StudioBg3dGlbPaintability,
  type StudioBg3dModelTexturePaint,
} from "./studio-bg3d-glb-texture-paint";
import { StudioBg3dGlbTexturePaintSession } from "./studio-bg3d-glb-texture-paint-controller";
import {
  appendStudioBg3dGlbPaintStroke,
  resolveStudioBg3dGlbPaintTargetKey,
  type StudioBg3dGlbPaintEventLike,
} from "./studio-bg3d-glb-texture-paint-host-logic";
import { collectStudioBg3dGlbTexturePaintTargets } from "./studio-bg3d-glb-texture-paint-three";
import {
  DEFAULT_STUDIO_BG3D_TEXTURE_PAINT_BRUSH,
  type StudioBg3dTexturePaintBrush,
} from "./studio-bg3d-texture-paint";

import type { BgCustomModelInstance } from "../studio-background-3d-model";

export type StudioBg3dGlbPaintPointerPhase = "down" | "move" | "up";

export interface StudioBg3dGlbTexturePaintHostBag {
  readonly instance: BgCustomModelInstance | null;
  readonly paintability: StudioBg3dGlbPaintability | null;
  readonly paintActive: boolean;
  readonly onPaintActiveChange: (active: boolean) => void;
  readonly brush: StudioBg3dTexturePaintBrush;
  readonly onBrushChange: (brush: StudioBg3dTexturePaintBrush) => void;
  readonly activeTargetKey: string | null;
  readonly onActiveTargetChange: (targetKey: string) => void;
  readonly onPaintChange: (id: string, paint: StudioBg3dModelTexturePaint | null) => void;
  readonly baseImageSource: unknown | null;
  readonly baseImageSize: { readonly width: number; readonly height: number } | null;
  /**
   * SceneGraph가 읽는 호스트 핸들러. 그리기 모드+paintable일 때만 함수이고,
   * 그 외에는 undefined라 모델 메시의 기존 동선이 그대로 유지된다.
   */
  readonly handleModelTexturePaintPointer:
    | ((id: string, event: unknown, phase: StudioBg3dGlbPaintPointerPhase) => void)
    | undefined;
}

export interface StudioBg3dGlbTexturePaintHostInput {
  /** 현재 선택된 커스텀 모델 인스턴스(파생값 — 렌더마다 최신). */
  readonly instance: BgCustomModelInstance | null;
  readonly setCustomModels: Dispatch<SetStateAction<BgCustomModelInstance[]>>;
  /** 선택 모델의 캐시된 원본 루트(내보내기 원본 텍스처 조회용). 없으면 null. */
  readonly cachedRoot: unknown | null;
}

const INVALID_PAINTABILITY = (): StudioBg3dGlbPaintability =>
  analyzeStudioBg3dGlbPaintabilityFromBytes(new Uint8Array(0));

export function useStudioBg3dGlbTexturePaintHost(
  input: StudioBg3dGlbTexturePaintHostInput,
): StudioBg3dGlbTexturePaintHostBag {
  const [paintActive, setPaintActive] = useState(false);
  const [brush, setBrush] = useState<StudioBg3dTexturePaintBrush>(
    DEFAULT_STUDIO_BG3D_TEXTURE_PAINT_BRUSH,
  );
  const [activeTargetKey, setActiveTargetKey] = useState<string | null>(null);
  const [paintability, setPaintability] = useState<StudioBg3dGlbPaintability | null>(null);
  const sessionRef = useRef<StudioBg3dGlbTexturePaintSession | null>(null);
  const instanceIdRef = useRef<string | null>(null);
  instanceIdRef.current = input.instance?.id ?? null;
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const setCustomModelsRef = useRef(input.setCustomModels);
  setCustomModelsRef.current = input.setCustomModels;

  const instanceId = input.instance?.id ?? null;
  const modelId = input.instance?.modelId ?? null;

  // 페인트 가능 판정 — 선택 모델의 저장 레코드 바이트가 유일한 근거다.
  // 레코드가 없거나 GLB가 아니면 "확인 불가(invalid)"로 정직하게 떨어진다.
  useEffect(() => {
    if (!modelId) {
      setPaintability(null);
      return undefined;
    }
    let cancelled = false;
    setPaintability(null);
    void (async () => {
      try {
        const record = await getStoredBg3dModel(modelId);
        const blob = record?.blob ?? null;
        if (!(blob instanceof Blob)) {
          if (!cancelled) setPaintability(INVALID_PAINTABILITY());
          return;
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (!cancelled) setPaintability(analyzeStudioBg3dGlbPaintabilityFromBytes(bytes));
      } catch {
        if (!cancelled) setPaintability(INVALID_PAINTABILITY());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  // 선택 인스턴스가 바뀌면 진행 중 획 세션과 대상 선택을 버린다.
  useEffect(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setActiveTargetKey(null);
  }, [instanceId]);

  useEffect(() => {
    if (!paintActive) sessionRef.current?.cancel();
  }, [paintActive]);

  useEffect(() => {
    sessionRef.current?.setBrush(brush);
  }, [brush]);

  const ensureSession = (id: string): StudioBg3dGlbTexturePaintSession => {
    if (!sessionRef.current) {
      sessionRef.current = new StudioBg3dGlbTexturePaintSession({
        brush: brushRef.current,
        onCommitStroke: (targetKey, stroke) => {
          setCustomModelsRef.current((previous) =>
            previous.map((model) => {
              if (model.id !== id) return model;
              const next = appendStudioBg3dGlbPaintStroke(
                model.modelTexturePaint ?? null,
                targetKey,
                stroke,
              );
              // 한도에 닿으면 기존 페인트를 유지한다(부분 적용 금지).
              return next ? { ...model, modelTexturePaint: next } : model;
            }),
          );
        },
        resolveTargetKey: (intersection) =>
          resolveStudioBg3dGlbPaintTargetKey(
            intersection as StudioBg3dGlbPaintEventLike,
            instanceIdRef.current ?? "",
          ),
      });
    }
    return sessionRef.current;
  };

  const effectiveTarget =
    paintability?.targets.find((target) => target.targetKey === activeTargetKey)
    ?? paintability?.targets[0]
    ?? null;

  // 내보내기용 원본 텍스처 — 캐시된 원본 루트(편집 클론이 아닌 소스)에서 읽는다.
  // 페인트 합성은 편집 클론 재질에만 걸리므로 소스 텍스처 이미지가 원본 그대로다.
  const baseImage = useMemo(() => {
    if (!input.cachedRoot || !effectiveTarget) return { source: null, size: null };
    const collection = collectStudioBg3dGlbTexturePaintTargets(
      input.cachedRoot as Object3D,
    );
    const target = collection.targets.find(
      (candidate) => candidate.targetKey === effectiveTarget.targetKey,
    );
    if (!target) return { source: null, size: null };
    const image = (target.originalMap as { image?: unknown }).image ?? null;
    return {
      source: image,
      size: { width: target.textureWidth, height: target.textureHeight },
    };
  }, [input.cachedRoot, effectiveTarget]);

  const onPaintChange = (id: string, paint: StudioBg3dModelTexturePaint | null) => {
    input.setCustomModels((previous) =>
      previous.map((model) => {
        if (model.id !== id) return model;
        return paint
          ? { ...model, modelTexturePaint: paint }
          : { ...model, modelTexturePaint: undefined };
      }),
    );
  };

  const handleModelTexturePaintPointer =
    paintActive && input.instance && paintability?.status === "paintable"
      ? (id: string, event: unknown, phase: StudioBg3dGlbPaintPointerPhase) => {
          if (id !== instanceIdRef.current) return;
          ensureSession(id).handlePointer(phase, event);
        }
      : undefined;

  return {
    instance: input.instance,
    paintability,
    paintActive,
    onPaintActiveChange: setPaintActive,
    brush,
    onBrushChange: setBrush,
    activeTargetKey: effectiveTarget?.targetKey ?? null,
    onActiveTargetChange: setActiveTargetKey,
    onPaintChange,
    baseImageSource: baseImage.source,
    baseImageSize: baseImage.size,
    handleModelTexturePaintPointer,
  };
}
