/**
 * ClipMaskGroup — 알파 정밀 클리핑 마스크용 자가 캐시 Konva 그룹.
 *
 * Konva Group은 기본적으로 합성(compositing)을 격리하지 않는다 —
 * globalCompositeOperation은 레이어 전체 캔버스를 대상으로 합성되므로,
 * "source-in" 같은 모드를 쓰면 같은 그룹의 형제가 아니라 레이어 전체와 섞여 버린다.
 *
 * 트릭: 그룹을 cache()하면 자식들을 먼저 오프스크린 캔버스로 렌더해
 * 합성이 그 캔버스 안으로 격리된다. 그 결과 "source-in" content 노드는
 * 오직 같은 그룹 안 형제(마스크)의 알파로만 잘린다(알파 정밀 클리핑).
 *
 * 그래서 이 컴포넌트가 하는 일은 자식을 <Group ref>로 감싸 캐시하는 것뿐이다.
 *
 * children 규약: [마스크 노드, content 노드]. content 노드는
 * globalCompositeOperation="source-in"이어야 형제 마스크의 알파로 잘린다.
 *
 * cacheKey: 내용/지오메트리가 바뀌면 달라지는 키. 바뀔 때마다 그룹을 다시 캐시한다
 * (마운트 시에도 1회 실행되므로 첫 캐시도 이 effect가 담당한다).
 *
 * UrlImage의 캐시 패턴(clearCache → cache → getLayer()?.batchDraw())을 그대로 따른다.
 * 순수 래퍼 — Konva/react-konva 외 의존 없음.
 */
import { useLayoutEffect, useRef } from "react";
import { Group } from "react-konva/lib/ReactKonvaCore";

import { beginStudioRasterCacheDiagnostics, type StudioRasterCacheDiagnosticReason } from "./render/studio-raster-cache-diagnostics";
import {
  refreshStudioRasterPresentationCaches,
  registerStudioRasterCapturePreparation,
  registerStudioRasterPresentationCache,
} from "./render/studio-raster-presentation-cache";

import type Konva from "konva";
import type { ReactNode } from "react";

export function ClipMaskGroup({
  cacheKey,
  composite,
  layerMaskOwnerId,
  children,
}: {
  cacheKey: string;
  /**
   * How the finished (cached, mask-applied) sandwich composites against what is below it.
   *
   * Inside the group, clipping is always the children's own `source-in` contract; this prop is for
   * the OUTSIDE — a masked layer that itself carries a blend mode, or a masked layer that must in
   * turn clip to the layer below (nested clipBelow + own mask). Because the group is cached, the
   * mode applies exactly once to the flattened bitmap, never per child.
   */
  composite?: Konva.NodeConfig["globalCompositeOperation"];
  /** 개별 레이어 내보내기가 자기 마스크까지 캡처할 수 있는 경계. */
  layerMaskOwnerId?: string;
  children: ReactNode;
}): React.ReactElement {
  const ref = useRef<Konva.Group>(null);

  // cacheKey가 바뀔 때(그리고 마운트 시)마다 그룹을 다시 캐시해 합성을 격리한다.
  // 마스크/콘텐츠가 비동기로 로드되는 이미지면 첫 캐시가 빈 비트맵을 잡으므로,
  // 잠시 동안 몇 번 더 재캐시해 늦게 도착한 이미지까지 마스크에 반영한다.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let cancelled = false;
    // undefined는 기존 Konva.pixelRatio/DPR 기본값이며 출력 뒤에도 이 상태로 복원한다.
    let cachePixelRatio: number | undefined;
    const recache = (reason: StudioRasterCacheDiagnosticReason = "raster") => {
      if (cancelled) return false;
      const diagnostics = beginStudioRasterCacheDiagnostics("clip", reason);
      let failed = false;
      node.clearCache();
      // 자식 이미지가 아직 로드 전이면 그룹 크기가 0 — 이때 cache()는 Konva 경고를 낸다.
      // 크기가 생긴 뒤(지연 재캐시)에만 캐시하고, 그 전엔 마스크 없이 그대로 렌더한다.
      const rect = node.getClientRect({ skipTransform: true });
      if (rect.width > 0 && rect.height > 0) {
        try {
          node.cache({ pixelRatio: cachePixelRatio });
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
  }, [cacheKey]);

  return (
    <Group ref={ref} studioLayerMaskOwnerId={layerMaskOwnerId} {...(composite ? { globalCompositeOperation: composite } : {})}>
      {children}
    </Group>
  );
}
