import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";

import { bookClearanceItems, createIdleBookThighClearance } from "./studio-vrm-book-thigh-clearance";
import { acquireStudioVrmPropAsset, type StudioVrmPropAssetLease } from "./studio-vrm-prop-asset-runtime";
import { propDefById, type PropInstance } from "./studio-vrm-props";

import type { VrmPropRigMetrics } from "./studio-vrm-prop-rig";
import type { VRM } from "@pixiv/three-vrm";

type ClearancePass = NonNullable<ReturnType<typeof createIdleBookThighClearance>>;

/** 본체 프레임(-3) 이후, 소품 추종(-2) 이전에 팔과 손목을 같은 위치로 옮긴다. */
export function useStudioVrmIdleBookClearance(
  vrm: VRM, items: readonly PropInstance[], metrics: VrmPropRigMetrics, locked: readonly string[],
  poseId: string | undefined, rigRevision: number | undefined, capturePaused: boolean,
) {
  const invalidate = useThree(state => state.invalidate);
  const active = useRef<ClearancePass[]>([]);
  useLayoutEffect(() => {
    const books = bookClearanceItems(items, metrics, poseId);
    const geometry = propDefById("book")?.geometrySource;
    if (!books.length || geometry?.kind !== "gltf") return;
    let disposed = false;
    let lease: StudioVrmPropAssetLease | null = null;
    void acquireStudioVrmPropAsset("book", geometry).then(loaded => {
      if (disposed) { loaded.release(); return; }
      lease = loaded;
      active.current = books.flatMap(book => {
        const pass = createIdleBookThighClearance(vrm, book, metrics, loaded.object, locked);
        return pass ? [pass] : [];
      });
      invalidate();
    }, () => {
      // 소품을 불러오지 못한 경우 본체가 로딩 상태를 표시하며 팔의 원본 자세를 유지한다.
      if (!disposed) invalidate();
    });
    return () => {
      disposed = true;
      active.current.forEach(pass => pass.release());
      active.current = [];
      lease?.release();
      invalidate();
    };
  }, [invalidate, items, locked, metrics, poseId, rigRevision, vrm]);
  useFrame(() => {
    if (!capturePaused) active.current.forEach(pass => pass.run());
  }, -2.25);
}
