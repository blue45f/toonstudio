/**
 * Studio 3D 데생 인형 — 자동 접지 상태 훅.
 *
 * 토글(기본 ON)·마지막 판정을 상태로 들고, 포즈 커밋 지점에서 호출할
 * 안정적인 groundPose 함수를 제공한다. 실제 판정·보정은 순수 모듈
 * studio-mannequin-foot-grounding이 맡고, 이 훅은 React 상태 연결만 한다.
 * groundPose는 useCallback으로 고정돼 씬 생성 effect의 의존성에 넣어도
 * 씬을 다시 만들지 않는다.
 */

import { useCallback, useRef, useState } from "react";

import {
  groundStudioMannequinPose,
  type StudioMannequinFootGroundingResult,
} from "./studio-mannequin-foot-grounding";
import {
  buildStudioMannequinSpec,
  type StudioMannequinBodyParams,
} from "./studio-mannequin-model";
import type { StudioMannequinPose } from "./studio-mannequin-poses";

export interface StudioMannequinFootGroundingControl {
  readonly enabled: boolean;
  readonly onToggle: (enabled: boolean) => void;
  readonly lastResult: StudioMannequinFootGroundingResult | null;
  readonly groundPose: (
    pose: StudioMannequinPose,
    params: StudioMannequinBodyParams,
  ) => StudioMannequinFootGroundingResult;
}

export function useStudioMannequinFootGrounding(): StudioMannequinFootGroundingControl {
  const [enabled, setEnabled] = useState(true);
  const [lastResult, setLastResult] = useState<StudioMannequinFootGroundingResult | null>(null);
  const enabledRef = useRef(true);
  enabledRef.current = enabled;

  const groundPose = useCallback(
    (pose: StudioMannequinPose, params: StudioMannequinBodyParams) => {
      const result = groundStudioMannequinPose(pose, buildStudioMannequinSpec(params), {
        enabled: enabledRef.current,
      });
      setLastResult(result);
      return result;
    },
    [],
  );

  const onToggle = useCallback((next: boolean) => setEnabled(next), []);

  return { enabled, onToggle, lastResult, groundPose };
}
