import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";

import { createStudioVrmGripSettlement } from "./studio-vrm-grip-settlement";
import { idleGripClearanceItems, createIdleGripBodyClearance } from "./studio-vrm-idle-grip-body-clearance";
import { acquireStudioVrmPropAsset, type StudioVrmPropAssetLease } from "./studio-vrm-prop-asset-runtime";
import { propDefById, type PropInstance } from "./studio-vrm-props";

import type { VrmPropRigMetrics } from "./studio-vrm-prop-rig";
import type { VRM } from "@pixiv/three-vrm";

const FRAME_BUDGET_MS = 8;

type ClearancePass = NonNullable<ReturnType<typeof createIdleGripBodyClearance>>;

/** 본체 프레임(-3) 이후, 소품 추종(-2) 이전에 팔과 손목을 같은 위치로 옮긴다. */
export function useStudioVrmIdleGripClearance(
  vrm: VRM, items: readonly PropInstance[], metrics: VrmPropRigMetrics, locked: readonly string[],
  poseId: string | undefined, rigRevision: number | undefined, capturePaused: boolean,
) {
  const invalidate = useThree(state => state.invalidate);
  const active = useRef<ClearancePass[]>([]);
  const status = useRef<{ ticket: ReturnType<typeof createStudioVrmGripSettlement>; loads: number; arms: boolean; fingers: boolean; deadline: number } | null>(null);
  useLayoutEffect(() => {
    const eligible = idleGripClearanceItems(items, metrics, poseId);
    if (!eligible.length) return;
    const leases: StudioVrmPropAssetLease[] = [];
    let disposed = false;
    const generation = { ticket: createStudioVrmGripSettlement(vrm, invalidate), loads: 0, arms: false, fingers: false, deadline: 0 };
    status.current = generation;
    for (const id of new Set(eligible.map(item => item.propId))) {
      const geometry = propDefById(id)?.geometrySource;
      if (geometry?.kind !== "gltf") continue;
      generation.loads++;
      void acquireStudioVrmPropAsset(id, geometry).then(loaded => {
        if (disposed) { loaded.release(); return; }
        generation.loads--;
        leases.push(loaded);
        for (const item of eligible.filter(candidate => candidate.propId === id)) {
          const pass = createIdleGripBodyClearance(vrm, item, metrics, loaded.object, locked);
          if (pass) active.current.push(pass);
        }
        invalidate();
      }, () => {
        // 다른 손의 소품은 정상 적용하고, 로드 실패한 손은 원본 자세를 유지한다.
        if (!disposed) { generation.loads--; invalidate(); }
      });
    }
    return () => {
      disposed = true;
      generation.ticket.dispose();
      status.current = null;
      active.current.forEach(pass => pass.release());
      active.current = [];
      leases.forEach(lease => lease.release());
      invalidate();
    };
  }, [invalidate, items, locked, metrics, poseId, rigRevision, vrm]);
  function advanceArms() {
    const generation = status.current;
    if (capturePaused || !generation) return;
    const start = performance.now();
    generation.deadline = start + FRAME_BUDGET_MS;
    const deadline = generation.fingers ? generation.deadline : start + FRAME_BUDGET_MS / 2;
    let needsFrame = false;
    for (const pass of active.current) {
      if (!pass.runUntil(deadline)) needsFrame = true;
    }
    generation.arms = !needsFrame;
    if (needsFrame) generation.ticket.ready(false);
  }
  useFrame(advanceArms, -2.25);
  // 손가락과 소품 추종까지 같은 프레임에서 끝나야 캡처 대기를 해제한다.
  return {
    advanceArms,
    deadline: () => status.current?.deadline,
    hasWork: (fingersDone: boolean) => Boolean(status.current && (!status.current.arms || !fingersDone)),
    finishFrame(fingersDone: boolean, painted: boolean) {
      const generation = status.current;
      if (!generation) return;
      generation.fingers = fingersDone;
      if (painted) generation.ticket.ready(!generation.loads && generation.arms && fingersDone);
    },
  };
}
