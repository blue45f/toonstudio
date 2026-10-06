/**
 * 빌드 모드 지도 직접 배치 세션 훅 (페이지 소유).
 *
 * 패널이 세션을 시작하면 브리지에 항목 id를 실어 캔버스 배치 컨트롤러를 깨우고,
 * 캔버스에서 돌아오는 이벤트를 처리한다:
 * - confirm: 배치 요청을 기존 목록에 붙여 같은 파서(parseStudioPlacedFixtureRequests)
 *   로 재검증한 결과를 저장한다 — 자동 배치와 같은 저장 경로·상한·중복 규칙이다.
 * - rejected: 불가 이유를 안내 문구로 남긴다(세션은 유지된다).
 * - verdict: 조준 중인 지점의 판정을 상태 문구로 보여 준다.
 * - cancelled: 세션을 닫는다(브리지 채널도 함께 닫힌다).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  studioBuildPlacementRejectionText,
  type StudioBuildPlacementEvent,
  type StudioBuildPlacementPanelBinding,
} from "../studio-virtual-space-build-placement";
import type { StudioBuildPlacementRequest } from "../studio-virtual-space-build-mode";
import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import {
  parseStudioPlacedFixtureRequests,
  STUDIO_PLACED_FIXTURE_LIMIT,
} from "../studio-virtual-space-placed-fixtures";

type PlacementText = { readonly ko: string; readonly en: string };

const PLACEABLE_STATUS: PlacementText = Object.freeze({
  ko: "놓을 수 있는 지점이에요. 클릭하거나 Enter로 배치하세요.",
  en: "You can place it here. Click or press Enter to place.",
});

export interface UseSpaceBuildPlacementResult {
  /** 패널에 내려줄 바인딩. */
  readonly panel: StudioBuildPlacementPanelBinding;
  /** 캔버스 onBuildPlacementEvent에 그대로 연결한다. */
  readonly handleCanvasEvent: (event: StudioBuildPlacementEvent) => void;
}

export function useSpaceBuildPlacement(input: {
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly requests: readonly StudioBuildPlacementRequest[];
  readonly onRequestsChange: (requests: readonly StudioBuildPlacementRequest[]) => void;
}): UseSpaceBuildPlacementResult {
  const { bridge } = input;
  const [sessionEntryId, setSessionEntryId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<PlacementText | null>(null);
  const [noticeText, setNoticeText] = useState<PlacementText | null>(null);
  const requestsRef = useRef(input.requests);
  requestsRef.current = input.requests;
  const onRequestsChangeRef = useRef(input.onRequestsChange);
  onRequestsChangeRef.current = input.onRequestsChange;

  const endSession = useCallback(() => {
    setSessionEntryId(null);
    setStatusText(null);
  }, []);

  // 세션 상태를 브리지 채널과 맞춘다. 언마운트·종료 시 채널을 반드시 닫는다.
  useEffect(() => {
    if (sessionEntryId) bridge.beginBuildPlacement(sessionEntryId);
    else bridge.endBuildPlacement();
    return () => bridge.endBuildPlacement();
  }, [bridge, sessionEntryId]);

  const handleCanvasEvent = useCallback((event: StudioBuildPlacementEvent) => {
    switch (event.type) {
      case "confirm": {
        const current = requestsRef.current;
        const next = parseStudioPlacedFixtureRequests([...current, event.request]);
        // 파서를 통과해 목록이 실제로 늘었을 때만 확정으로 본다(중복·상한은 걸러진다).
        const kept = next.length === current.length + 1;
        if (kept) {
          setNoticeText(null);
          onRequestsChangeRef.current(next);
        } else {
          // 파서가 버렸다면 상한이 찼거나 같은 지점과 겹친 것이다.
          setNoticeText(studioBuildPlacementRejectionText(
            current.length >= STUDIO_PLACED_FIXTURE_LIMIT ? "limit" : "occupied",
          ));
        }
        break;
      }
      case "rejected":
        setNoticeText(studioBuildPlacementRejectionText(event.reason));
        break;
      case "verdict":
        setStatusText(event.verdict.ok
          ? PLACEABLE_STATUS
          : studioBuildPlacementRejectionText(event.verdict.reason ?? "invalid"));
        break;
      case "cancelled":
        endSession();
        break;
    }
  }, [endSession]);

  const panel = useMemo<StudioBuildPlacementPanelBinding>(() => Object.freeze({
    sessionEntryId,
    statusText,
    noticeText,
    onStart: (entryId: string) => {
      setNoticeText(null);
      setStatusText(null);
      setSessionEntryId(entryId);
    },
    onCancel: () => {
      setNoticeText(null);
      endSession();
    },
  }), [endSession, noticeText, sessionEntryId, statusText]);

  return useMemo(() => Object.freeze({ panel, handleCanvasEvent }), [handleCanvasEvent, panel]);
}
