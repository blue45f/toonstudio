/**
 * BlendIsolationGroup — 블렌드 모드를 요소 단위로 적용하기 위한 자가 캐시 Konva 그룹.
 *
 * Konva Group에 `globalCompositeOperation`을 걸면 그룹이 하나로 합성되지 않는다 —
 * 그룹은 컨텍스트에 합성 모드를 세팅한 뒤 자식을 차례로 그리므로, 자식 **하나하나가**
 * 레이어 캔버스에 개별 합성된다. 자유곡선 한 획은 수십 개의 스탬프로 그려지기 때문에
 * 같은 물리가 스탬프 수만큼 반복 적용되고, 그 결과 대부분의 블렌드 모드가 반복 합성의
 * 고정점으로 붕괴한다(실측: 곱하기 → 검정, 제외 → 정확히 127, 색상 번 → 검정).
 * darken/lighten만 정확했던 이유도 같다 — 그 둘만 반복 적용에 대해 멱등이기 때문이다.
 *
 * 트릭은 [[ClipMaskGroup]]과 같다: 그룹을 cache()하면 자식이 먼저 오프스크린 캔버스로
 * 렌더된다. 캐시된 노드는 `_drawCachedSceneCanvas`로 **비트맵 한 장**으로 그려지므로
 * 합성 모드가 획 전체에 정확히 한 번 적용된다.
 *
 * ClipMaskGroup과 배치가 다르다는 점이 중요하다. 거기서는 합성이 *자식*(source-in
 * content)에 붙고 캐시는 그 합성을 그룹 안으로 **가두는** 역할이다. 여기서는 반대로
 * 합성이 *캐시된 그룹 자신*에 붙어 평탄화된 결과가 아래 레이어와 섞인다. 합성을 자식에
 * 두면 격리만 되고 정작 아래 레이어와는 섞이지 않으므로 블렌드가 사라진다.
 *
 * cacheKey: 요소의 렌더 결과가 바뀌면 달라지는 키. 바뀔 때마다 다시 캐시한다
 * (마운트 시에도 1회 실행되므로 첫 캐시도 이 effect가 담당한다).
 */
import { useLayoutEffect, useRef } from "react";
import { Group } from "react-konva/lib/ReactKonvaCore";
import { studioFrameClipCacheBounds, type StudioFrameClip } from "@toonstudio/studio-project-model/frame-clip";
import { studioKonvaPanelClip } from "./canvas/studio-konva-panel-clip";

import { beginStudioRasterCacheDiagnostics, type StudioRasterCacheDiagnosticReason } from "./render/studio-raster-cache-diagnostics";
import {
  refreshStudioRasterPresentationCaches,
  registerStudioRasterCapturePreparation,
  registerStudioRasterPresentationCache,
} from "./render/studio-raster-presentation-cache";

import type Konva from "konva";
import type { ReactNode } from "react";

export function BlendIsolationGroup({
  cacheKey,
  composite,
  clip,
  children,
}: {
  cacheKey: string;
  composite: NonNullable<Konva.NodeConfig["globalCompositeOperation"]>;
  clip?: StudioFrameClip;
  children: ReactNode;
}): React.ReactElement {
  const ref = useRef<Konva.Group>(null);
  const clipKey = JSON.stringify(clip);
  const clipRef = useRef(clip);
  useLayoutEffect(() => { clipRef.current = clip; }, [clip]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let cancelled = false; const currentClip = clipRef.current;
    // undefined는 기존 Konva.pixelRatio/DPR 기본값이며 출력 뒤에도 이 상태로 복원한다.
    let cachePixelRatio: number | undefined;
    const recache = (reason: StudioRasterCacheDiagnosticReason = "raster") => {
      if (cancelled) return false;
      const diagnostics = beginStudioRasterCacheDiagnostics("blend", reason);
      let failed = false;
      node.clearCache();
      // 자식 이미지가 아직 로드 전이면 그룹 크기가 0 — 이때 cache()는 Konva 경고를 낸다.
      // 크기가 생긴 뒤(지연 재캐시)에만 캐시한다. 캐시 실패 시에는 캐시 없이 그리는데,
      // 그러면 블렌드가 스탬프마다 적용되는 예전 동작으로 돌아간다 — 획이 사라지는 것보다는
      // 낫지만 정확하지 않으므로, 아래 지연 재시도가 늦게 도착한 이미지까지 따라잡는다.
      const rect = node.getClientRect({ skipTransform: true });
      if (rect.width > 0 && rect.height > 0) {
        try {
          if (currentClip) node.cache({ ...studioFrameClipCacheBounds(rect, currentClip), pixelRatio: cachePixelRatio });
          else node.cache({ pixelRatio: cachePixelRatio });
        } catch {
          failed = true;
          node.clearCache();
        }
      }
      node.getLayer()?.batchDraw();
      const isCached = node.isCached();
      diagnostics.finish(rect, isCached, failed);
      return isCached;
    };
    // owner callback 자체는 조상 refresh를 재귀 호출하지 않는다. 로컬 변경만 바깥으로 전파한다.
    const refreshLocal = (reason: StudioRasterCacheDiagnosticReason) => {
      const cached = recache(reason);
      const ancestorsRefreshed = refreshStudioRasterPresentationCaches(node);
      return cached && ancestorsRefreshed;
    };
    const unregister = registerStudioRasterPresentationCache(node, recache);
    const unregisterCapture = registerStudioRasterCapturePreparation(node, (requestedDensity) => {
      if (!node.isCached()) {
        const rect = node.getClientRect({ skipTransform: true });
        // 0 rect로 보고돼 원래 bitmap이 없던 경로는 유지한다. 양수 rect의 cache 실패는 숨기지 않는다.
        if (rect.width === 0 || rect.height === 0) return () => undefined;
        throw new Error("합성 그룹의 화면 캐시가 준비되지 않아 출력하지 않았어요.");
      }
      const previous = cachePixelRatio;
      const target = Math.max(1, requestedDensity);
      if (target === previous) return () => undefined;
      const restore = () => {
        cachePixelRatio = previous;
        // 실패한 부모가 먼저 복원됐더라도, 자식 복원 뒤 조상 bitmap을 다시 갱신한다.
        if (!recache("raster") || !refreshStudioRasterPresentationCaches(node)) {
          throw new Error("합성 그룹의 화면 캐시를 복원하지 못했어요.");
        }
      };
      cachePixelRatio = target;
      try {
        if (!recache("raster")) throw new Error("요청한 출력 배율의 합성 캐시를 만들지 못해 출력하지 않았어요.");
      } catch (error) {
        try { restore(); }
        catch (cacheRestoreError) {
          throw Object.assign(new Error("출력 준비와 화면 캐시 복원에 실패해 출력하지 않았어요."), {
            cause: error, cacheRestoreError,
          });
        }
        throw error;
      }
      // registry가 중첩 owner를 children→parent 순서로 준비·복원한다.
      return restore;
    });
    refreshLocal("initial");
    const timers = [120, 350, 700, 1200].map((ms) => globalThis.setTimeout(() => refreshLocal("timer"), ms));
    return () => {
      cancelled = true;
      unregisterCapture();
      unregister();
      timers.forEach((t) => globalThis.clearTimeout(t));
    };
  }, [cacheKey, clipKey]);

  return (
    <Group
      ref={ref}
      globalCompositeOperation={composite}
      {...studioKonvaPanelClip(clip)}
    >
      {children}
    </Group>
  );
}
