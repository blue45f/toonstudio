import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { createStudioSculptGestureToken, type StudioSculptGestureController, type StudioSculptGestureInput, type StudioSculptGestureToken } from "./studio-hybrid-dcc-sculpt-gesture";
import {
  appendStudioSculptStrokeSample,
  cancelStudioSculptStrokeSession,
  readStudioSculptStrokePreview,
  sealStudioSculptStrokeSession,
  type StudioSculptGeometryPreview,
  type StudioSculptStrokeReceipt,
  type StudioSculptStrokeSession,
} from "./studio-hybrid-dcc-sculpt-stroke-session";
import { createStudioHybridDccSculptStrokeSession } from "./studio-hybrid-dcc-sculpt-stroke-workspace";
import { useStudioHybridDccWorkspaceLease } from "./useStudioHybridDccWorkspaceLease";

import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import type { StudioMeshVec3 } from "../studio-editable-half-edge-mesh";
import type { StudioSculptBrushKind } from "./studio-hybrid-sculpt-kernel";

interface SculptOperation {
  readonly token: StudioSculptGestureToken;
  readonly session: StudioSculptStrokeSession;
  readonly controller: AbortController;
  readonly isCurrent: () => boolean;
  readonly onAbort: () => void;
  phase: "drawing" | "committing";
  frame: number | null;
}

export interface StudioHybridDccSculptStrokeHost {
  readonly workspace: StudioHybridDccWorkspace;
  readonly workspaceDocumentId?: string;
  readonly enabled: boolean;
  /** 현재 stroke가 소유하는 drawing/committing 잠금은 포함하지 않는다. */
  readonly externalBusy: boolean;
  readonly scopeRef?: RefObject<HTMLElement | null>;
  readonly commit: (
    receipt: StudioSculptStrokeReceipt,
    isCurrent: () => boolean,
    onPublished: () => void,
  ) => Promise<boolean>;
}

function parseSculptRadius(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 입력 sample은 모두 계산하고 표시 발행만 frame 단위로 합친다. 문서는 정상 종료 때 한 번 확정한다. */
export function useStudioHybridDccSculptStroke(host: StudioHybridDccSculptStrokeHost) {
  const bt = useBilingual("StudioHybridDccSculptTools");
  const [kind, setKind] = useState<StudioSculptBrushKind>("inflate");
  const [carve, setCarve] = useState(false);
  const [radiusText, setRadiusTextValue] = useState("0.45");
  const radiusState = useRef({ value: 0.45, valid: true });
  const [phase, setPhase] = useState<"idle" | "drawing" | "committing">("idle");
  const [preview, setPreview] = useState<StudioSculptGeometryPreview | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const active = useRef<SculptOperation | null>(null);
  const live = useRef(false);
  const latestHost = useRef(host);
  latestHost.current = host;
  const latestLocalize = useRef(bt);
  latestLocalize.current = bt;
  const captureLease = useStudioHybridDccWorkspaceLease(host.workspace, host.workspaceDocumentId, host.enabled);
  const brushScope = `${kind}:${carve}`;

  const clearOperation = (operation: SculptOperation, message = "", failure = "") => {
    if (active.current !== operation) return;
    active.current = null;
    operation.controller.signal.removeEventListener("abort", operation.onAbort);
    if (operation.frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(operation.frame);
    operation.frame = null;
    cancelStudioSculptStrokeSession(operation.session);
    operation.controller.abort();
    if (!live.current) return;
    setPreview(null); setPhase("idle"); setNotice(message); setError(failure);
  };
  const cancelledMessage = () => latestLocalize.current(
    "조형을 취소했습니다. 원본과 편집 이력은 그대로입니다.",
    "Sculpting cancelled. The source and edit history are unchanged.",
  );

  const setRadiusText = (text: string) => {
    if (!live.current) return;
    const parsed = parseSculptRadius(text);
    const previous = radiusState.current;
    const next = { value: parsed ?? previous.value, valid: parsed !== null };
    radiusState.current = next;
    // 같은 render 안의 A→B→A도 기존 gesture를 살리지 않도록 즉시 취소한다.
    if (next.value !== previous.value || next.valid !== previous.valid) {
      const operation = active.current;
      if (operation) clearOperation(operation, cancelledMessage());
    }
    setRadiusTextValue(text);
  };

  useLayoutEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      const operation = active.current;
      if (operation) clearOperation(operation);
    };
  }, []);

  // 작업대 lease의 계정·문서 ABA와 별도로 도구 변경도 진행 중 입력을 폐기한다.
  useLayoutEffect(() => {
    const operation = active.current;
    if (operation) clearOperation(operation, cancelledMessage());
  }, [brushScope, host.enabled]);

  useLayoutEffect(() => {
    const operation = active.current;
    if (host.externalBusy && operation?.phase === "drawing") clearOperation(operation, cancelledMessage());
  }, [host.externalBusy]);

  const append = (operation: SculptOperation, point: StudioMeshVec3) => {
    if (active.current !== operation || operation.phase !== "drawing") return;
    if (!operation.isCurrent()) { clearOperation(operation, cancelledMessage()); return; }
    try {
      const result = appendStudioSculptStrokeSample(operation.session, point);
      if (!result.ok) { clearOperation(operation, "", result.detail); return; }
      const publish = () => {
        operation.frame = null;
        if (active.current !== operation || !live.current) return;
        if (!operation.isCurrent()) { clearOperation(operation, cancelledMessage()); return; }
        setPreview(readStudioSculptStrokePreview(operation.session));
      };
      if (operation.frame === null) {
        if (typeof requestAnimationFrame === "function") operation.frame = requestAnimationFrame(publish);
        else publish();
      }
    } catch (cause) {
      clearOperation(operation, "", cause instanceof Error ? cause.message : bt("조형 입력을 처리하지 못했습니다.", "Could not process the sculpt input."));
    }
  };

  const begin = ({ assetId, pointerId, localPoint }: StudioSculptGestureInput) => {
    if (!live.current || !host.enabled || latestHost.current.externalBusy || active.current
      || host.workspace.activeAssetId !== assetId || !Number.isSafeInteger(pointerId) || pointerId < 0) return null;
    const radius = radiusState.current;
    if (!radius.valid) return null;
    const controller = new AbortController();
    const lease = captureLease(controller);
    if (!lease()) return null;
    const token = createStudioSculptGestureToken();
    try {
      const session = createStudioHybridDccSculptStrokeSession(host.workspace, {
        kind, radius: radius.value, strength: carve ? -0.2 : 0.2,
        ...(kind === "grab" || kind === "snakeHook" ? { direction: { x: 0, y: 0.15, z: 0 } } : {}),
      });
      const onAbort = () => {
        const operation = active.current;
        if (operation?.token === token) clearOperation(operation, cancelledMessage());
      };
      const operation: SculptOperation = {
        token, session, controller, onAbort, frame: null, phase: "drawing",
        isCurrent: () => active.current?.token === token && lease(),
      };
      active.current = operation;
      controller.signal.addEventListener("abort", onAbort, { once: true });
      setPhase("drawing"); setError(""); setNotice("");
      append(operation, localPoint);
      return active.current === operation ? token : null;
    } catch (cause) {
      controller.abort();
      setError(cause instanceof Error ? cause.message : bt("조형을 시작하지 못했습니다.", "Could not start sculpting."));
      return null;
    }
  };

  const end = async (token: StudioSculptGestureToken) => {
    const operation = active.current;
    if (!operation || operation.token !== token || operation.phase !== "drawing") return;
    if (!operation.isCurrent()) { clearOperation(operation, cancelledMessage()); return; }
    operation.phase = "committing";
    setPhase("committing");
    if (operation.frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(operation.frame);
    operation.frame = null;
    try {
      const receipt = sealStudioSculptStrokeSession(operation.session);
      if (!receipt) {
        clearOperation(operation, bt("메시 변화가 없어 편집 이력을 추가하지 않았습니다.", "The mesh did not change, so no edit history was added."));
        return;
      }
      // 자신의 setWs가 lease를 교체하기 전에 호스트가 동기적으로 발행 완료를 알려준다.
      const published = await latestHost.current.commit(receipt, operation.isCurrent, () => {
        clearOperation(operation, bt("조형을 적용했습니다. 되돌리기 한 번으로 복원할 수 있습니다.", "Sculpting applied. One undo step restores it."));
      });
      if (active.current === operation) clearOperation(operation, published ? "" : cancelledMessage());
    } catch (cause) {
      if (active.current === operation) clearOperation(operation, "", cause instanceof Error ? cause.message : bt("조형을 적용하지 못했습니다.", "Could not apply sculpting."));
    }
  };

  const cancel = (token: StudioSculptGestureToken) => {
    const operation = active.current;
    if (operation?.token === token) clearOperation(operation, cancelledMessage());
  };
  const methods = useRef({ begin, append, end, cancel });
  methods.current = { begin, append, end, cancel };
  useLayoutEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      const operation = active.current, scope = latestHost.current.scopeRef?.current;
      if (!operation || operation.phase !== "committing" || !scope || event.key !== "Escape"
        || event.isComposing || event.defaultPrevented || !(event.target instanceof Element) || !scope.contains(event.target)) return;
      if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      const inner = event.target.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"], [data-studio-escape-scope="true"]');
      if (inner && !inner.contains(scope)) return;
      event.preventDefault(); event.stopPropagation(); methods.current.cancel(operation.token);
    };
    const onBlur = () => {
      const operation = active.current;
      if (operation?.phase === "committing") methods.current.cancel(operation.token);
    };
    window.addEventListener("keydown", onEscape, true);
    window.addEventListener("blur", onBlur);
    return () => { window.removeEventListener("keydown", onEscape, true); window.removeEventListener("blur", onBlur); };
  }, []);
  const controller = useMemo<StudioSculptGestureController>(() => ({
    begin: (input) => methods.current.begin(input),
    isCurrent: (token) => active.current?.token === token && active.current.isCurrent(),
    sample: (token, point) => {
      const operation = active.current;
      if (operation?.token === token) methods.current.append(operation, point);
    },
    end: (token) => { void methods.current.end(token); },
    cancel: (token) => methods.current.cancel(token),
  }), []);

  return {
    kind, setKind, carve, setCarve, phase, preview, notice, error, controller,
    radius: radiusState.current.value, radiusText, setRadiusText,
    radiusError: parseSculptRadius(radiusText) === null
      ? bt("반경은 0보다 큰 유한한 숫자로 입력하세요.", "Enter a finite radius greater than zero.") : "",
    engaged: phase !== "idle",
    cancel: () => { const operation = active.current; if (operation) cancel(operation.token); },
  };
}

export type StudioHybridDccSculptStrokeModel = ReturnType<typeof useStudioHybridDccSculptStroke>;
