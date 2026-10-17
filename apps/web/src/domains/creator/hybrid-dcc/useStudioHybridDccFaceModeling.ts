/**
 * 면 모델링 화면 상태: 도구·거리 문자열·그리기 점을 들고, 같은 입력에서 범위·검증·미리보기를 파생한다.
 *
 * 미리보기는 상태가 아니라 파생 값이다. 문서와 되돌리기 기록은 확정(apply) 전에는 전혀 바뀌지 않고,
 * 뷰포트에는 결과 메시를 얹은 복사본 작업공간만 넘긴다. 입력·선택·오브젝트가 바뀌면 미리보기는 저절로
 * 사라진다(상태를 되돌리는 효과를 두지 않고 렌더 중 비교로 닫는다). Esc는 미리보기가 있는 동안에만
 * 창 단위 캡처 단계에서 가로채 대화상자를 닫지 않고 미리보기만 취소한다.
 *
 * 미리보기 계산은 면 수에 비례해 느려지므로 비용(면 수 + 선택 면 수 x 3)에 따라 계산 시점을 늦춘다. 작은
 * 메시는 입력마다 바로 계산하고, 비용이 크면 타이핑·화살표 입력은 멈춘 뒤에 계산하며(Enter는 바로 계산),
 * 더 크면 핸들을 끄는 동안 미리보기를 멈추고 놓을 때 한 번만 계산한다. 계산이 밀려 있는 동안에는 보이는
 * 결과와 입력이 다르므로 적용하지 않는다.
 */

import { useEffect, useEffectEvent, useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  createStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import {
  describeStudioFaceModelingApplyError,
  describeStudioFaceModelingCheck,
  describeStudioFaceModelingFailure,
  describeStudioFaceModelingParseError,
  describeStudioFaceModelingPreview,
  studioFaceModelingRunLabel,
} from "./studio-hybrid-dcc-face-modeling-messages";
import {
  STUDIO_FACE_MODELING_LIMITS,
  studioFaceModelingExtent,
} from "./studio-hybrid-dcc-face-modeling-mesh";
import {
  checkStudioFaceModelingDistance,
  formatStudioFaceModelingDistance,
  parseStudioFaceModelingDistance,
  stepStudioFaceModelingDistance,
  studioFaceModelingPreviewCost,
  studioFaceModelingStepSize,
  studioFaceModelingRangeView,
  type StudioFaceModelingStepScale,
} from "./studio-hybrid-dcc-face-modeling-session";
import {
  commitStudioHybridDccFaceModeling,
  previewStudioHybridDccFaceModeling,
  StudioFaceModelingCommitError,
  studioHybridDccFaceDrawingGuide,
  studioHybridDccFaceModelingRange,
  type StudioFaceModelingRequest,
  type StudioFaceModelingTool,
  type StudioHybridDccWorkspaceEdit,
} from "./studio-hybrid-dcc-face-modeling-workspace";

import type { StudioPlanarPoint } from "./studio-hybrid-dcc-face-modeling-geometry";
import type { StudioOffsetDirection } from "./studio-hybrid-dcc-face-modeling-kernel";
import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";

/** 패널이 문서에 올려 주는 편집 실행기. 없으면 읽기 전용 화면이라 도구가 꺼진다. */
export interface StudioHybridDccFaceModelingHost {
  readonly onRunWorkspaceEdit?: (label: string, edit: StudioHybridDccWorkspaceEdit) => void;
}

const EMPTY_SELECTION: StudioHybridDccComponentSelection = createStudioHybridDccComponentSelection();

export function useStudioHybridDccFaceModeling(
  props: StudioHybridDccViewportProps,
  run: StudioHybridDccFaceModelingHost["onRunWorkspaceEdit"],
) {
  const bt = useBilingual("StudioHybridDccFaceModeling");
  const { workspace, editingDisabled = false } = props;
  const selection = props.componentSelection ?? EMPTY_SELECTION;
  const sculpting = Boolean(props.onSculptStroke);

  const [open, setOpenState] = useState(false);
  const [tool, setToolState] = useState<StudioFaceModelingTool>("push-pull");
  const [direction, setDirectionState] = useState<StudioOffsetDirection>("inward");
  const [text, setTextState] = useState("");
  const [drawPoints, setDrawPoints] = useState<readonly StudioPlanarPoint[]>([]);
  const [dragging, setDragging] = useState(false);
  /** 큰 메시에서 핸들을 끄는 동안 미리보기를 멈춰 둘 값(끌기 시작 시점의 입력). */
  const [frozenText, setFrozenText] = useState<string | null>(null);
  /** 비용이 큰 메시에서 입력이 멈춘 뒤에야 미리보기에 반영하는 값. 비용이 작으면 쓰지 않는다. */
  const [settledText, setSettledText] = useState("");
  /** 확정을 요청한 시점의 대상. 대상이 이 값에서 바뀌었는지로 확정이 끝났는지(성공)를 알아본다. */
  const [applyRequest, setApplyRequest] = useState<{ readonly assetId: string; readonly meshHash: string } | null>(null);
  const applyRequested = applyRequest !== null;
  const [notice, setNotice] = useState("");

  const assetId = workspace.activeAssetId;
  const record = assetId ? workspace.session.state.geometry.records[assetId] : undefined;
  const contextKey = [
    assetId ?? "",
    record?.meshHash ?? "",
    selection.mode,
    selection.elementIds.join(","),
    run ? "run" : "no-run",
    sculpting ? "sculpt" : "model",
  ].join("|");
  const engaged = tool === "draw" ? drawPoints.length > 0 : text.trim() !== "";

  const resetInputs = () => {
    setTextState("");
    setDrawPoints([]);
    setDragging(false);
    setFrozenText(null);
    setSettledText("");
    setApplyRequest(null);
  };

  // 대상(오브젝트·메시·선택)이 바뀌면 열려 있던 미리보기와 입력을 닫는다. 확정을 요청한 오브젝트의 메시가
  // 바뀌었다면 확정이 끝난 것이라 적용했다고 알리고, 그 밖의 변경이면 미리보기를 취소했다고 알린다.
  const [seenContext, setSeenContext] = useState(contextKey);
  if (seenContext !== contextKey) {
    setSeenContext(contextKey);
    if (engaged) {
      resetInputs();
      const applied = applyRequest !== null && applyRequest.assetId === assetId && applyRequest.meshHash !== record?.meshHash;
      setNotice(applied
        ? bt(
          "적용했어요. 되돌리기 한 번으로 원래대로 돌아가요.",
          "Applied. One undo step restores the original.",
        )
        : bt(
          "선택이나 오브젝트가 바뀌어 미리보기를 취소했어요. 원본은 그대로예요.",
          "The selection or object changed, so the preview was cancelled. The model is unchanged.",
        ));
    }
  }

  const committing = applyRequested && engaged && editingDisabled;
  // 확정 요청이 끝났는데(패널 실행 큐 종료) 대상이 그대로면 적용에 실패한 것이다. 미리보기는 남겨 다시 시도할
  // 수 있게 하고, 이유는 패널의 작업 기록에 있다고 알린다. 대상이 바뀐 성공 경로는 위 블록이 먼저 닫는다.
  const [wasCommitting, setWasCommitting] = useState(false);
  if (seenContext === contextKey && wasCommitting !== committing) {
    setWasCommitting(committing);
    if (wasCommitting && engaged) {
      setApplyRequest(null);
      setNotice(describeStudioFaceModelingApplyError(bt, undefined));
    }
  }
  const unavailable: string | null = !run
    ? bt(
      "이 화면은 읽기 전용이라 면 모델링을 적용할 수 없습니다.",
      "This view is read-only, so face modeling cannot be applied.",
    )
    : sculpting
      ? bt(
        "조형 모드에서는 면 모델링을 쓸 수 없습니다. 모델 모드로 돌아가 사용하세요.",
        "Face modeling is unavailable in sculpt mode. Go back to model mode to use it.",
      )
      : editingDisabled && !engaged
        ? bt("다른 편집이 끝난 뒤에 사용하세요.", "Use this after the other edit has finished.")
        : null;

  const active = open && unavailable === null;
  const distanceTool = tool === "draw" ? null : tool;

  const extent = useMemo(() => (record ? studioFaceModelingExtent(record.mesh) : 1), [record]);
  const rangeResult = useMemo(
    () => (active && distanceTool ? studioHybridDccFaceModelingRange(workspace, selection, distanceTool, direction) : null),
    [active, distanceTool, workspace, selection, direction],
  );
  const rangeView = useMemo(
    () => (rangeResult?.ok ? studioFaceModelingRangeView(rangeResult.value, extent) : null),
    [rangeResult, extent],
  );
  const guideResult = useMemo(
    () => (active && tool === "draw" ? studioHybridDccFaceDrawingGuide(workspace, selection) : null),
    [active, tool, workspace, selection],
  );

  const faceCount = record ? record.mesh.faces.length : 0;
  const selectionCount = selection.mode === "face" ? selection.elementIds.length : 0;
  const previewCost = studioFaceModelingPreviewCost(faceCount, selectionCount);
  const debounced = previewCost > STUDIO_FACE_MODELING_LIMITS.debouncedPreviewCost;
  // 입력이 멈추면 대기 중이던 값을 미리보기에 반영한다. 입력이 이어지면 이전 대기를 지우고 다시 센다.
  useEffect(() => {
    if (!debounced || settledText === text) return;
    const timer = setTimeout(() => setSettledText(text), STUDIO_FACE_MODELING_LIMITS.previewDebounceMs);
    return () => clearTimeout(timer);
  }, [debounced, text, settledText]);
  const pending = debounced && frozenText === null && settledText !== text;
  const previewText = frozenText ?? (debounced ? settledText : text);
  const parsed = useMemo(() => parseStudioFaceModelingDistance(text), [text]);
  const previewParsed = useMemo(() => parseStudioFaceModelingDistance(previewText), [previewText]);
  const check = distanceTool && rangeView && parsed.kind === "value"
    ? checkStudioFaceModelingDistance(distanceTool, parsed.value, rangeView.allowed)
    : null;
  const request = useMemo((): StudioFaceModelingRequest | null => {
    if (tool === "draw") return drawPoints.length >= 3 ? { tool, points: drawPoints } : null;
    if (!rangeView || previewParsed.kind !== "value") return null;
    const previewCheck = checkStudioFaceModelingDistance(tool, previewParsed.value, rangeView.allowed);
    if (!previewCheck.ok) return null;
    return tool === "offset"
      ? { tool, distance: previewCheck.distance, direction }
      : { tool, distance: previewCheck.distance };
  }, [tool, drawPoints, rangeView, previewParsed, direction]);
  const preview = useMemo(
    () => (active && engaged && request ? previewStudioHybridDccFaceModeling(workspace, selection, request) : null),
    [active, engaged, request, workspace, selection],
  );

  const stepSize = studioFaceModelingStepSize(extent);

  // 화면에 올릴 메시지: 경고(alert)는 사용자가 고쳐야 하는 오류, 힌트는 오류가 아닌 안내다.
  let error: string | null = null;
  let hint: string | null = null;
  if (active && engaged) {
    if (tool === "draw") {
      if (drawPoints.length < 3) {
        hint = bt("점을 3개 이상 찍어야 도형이 닫힙니다.", "Place at least three points to close the shape.");
      } else if (preview && !preview.ok) {
        error = describeStudioFaceModelingFailure(bt, preview, tool);
      }
    } else if (parsed.kind === "invalid") {
      error = describeStudioFaceModelingParseError(bt);
    } else if (check && !check.ok) {
      if (check.reason === "zero") hint = describeStudioFaceModelingCheck(bt, check);
      else error = describeStudioFaceModelingCheck(bt, check);
    } else if (preview && !preview.ok) {
      error = describeStudioFaceModelingFailure(bt, preview, tool);
    }
  }
  const unusable = active
    ? (rangeResult && !rangeResult.ok ? rangeResult : guideResult && !guideResult.ok ? guideResult : null)
    : null;
  const unusableMessage = unusable ? describeStudioFaceModelingFailure(bt, unusable, tool) : null;
  const previewSummary = preview?.ok ? describeStudioFaceModelingPreview(bt, preview.value.plan) : null;
  // 면 그리기가 거부되면 문제가 된 점(그린 순서의 색인)을 패드에서 따로 표시한다.
  const problemPoints = tool === "draw" && preview && !preview.ok ? (preview.elementIds ?? []) : [];
  // 큰 메시를 끄는 동안(미리보기가 끌기 시작 값에 멈춰 있는 동안)에는 보이는 결과와 입력이 달라 적용하지 않는다.
  // 패널이 다른 작업 중이면(확정 중 포함) 패널이 요청을 조용히 버리므로 적용 단추부터 막는다.
  const canApply = Boolean(run && preview?.ok && !editingDisabled && frozenText === null && !pending);
  if (!error && !hint && active && engaged && editingDisabled && !committing) {
    hint = bt("다른 편집이 끝나면 적용할 수 있어요.", "You can apply once the other edit has finished.");
  }
  if (!error && !hint && active && engaged && pending) {
    hint = bt(
      "입력을 멈추면 미리보기를 계산해요. Enter를 누르면 바로 계산해요.",
      "The preview is calculated once you stop typing. Press Enter to calculate it right away.",
    );
  }

  const cancel = () => {
    if (!engaged || committing) return;
    resetInputs();
    setNotice(bt(
      "미리보기를 취소했어요. 원본과 되돌리기 기록은 바뀌지 않았어요.",
      "Preview cancelled. The model and undo history are unchanged.",
    ));
  };
  const cancelFromKey = useEffectEvent(cancel);
  useEffect(() => {
    if (!engaged || committing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      // 대화상자의 Esc 닫기보다 먼저(창 캡처 단계) 받아서, 미리보기만 취소하고 화면은 유지한다.
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelFromKey();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [engaged, committing]);

  /** 입력을 바꿀 수 있는 상태인지. 확정이 진행 중이면 바뀐 입력이 이미 떠난 요청과 어긋나므로 잠근다. */
  const edited = (): boolean => {
    if (committing) return false;
    setApplyRequest(null);
    setNotice("");
    return true;
  };
  // 뷰포트에 넘길 속성: 미리보기가 있으면 결과를 얹은 복사본 작업공간과 선택을 쓰고 편집은 잠근다.
  const viewportProps: StudioHybridDccViewportProps = preview?.ok
    ? {
      ...props,
      workspace: preview.value.workspace,
      componentSelection: preview.value.selection,
      editingDisabled: true,
    }
    : props;

  return {
    open,
    setOpen: (next: boolean) => {
      if (!next) resetInputs();
      setNotice("");
      setOpenState(next);
    },
    tool,
    setTool: (next: StudioFaceModelingTool) => {
      resetInputs();
      setNotice("");
      setToolState(next);
    },
    direction,
    setDirection: (next: StudioOffsetDirection) => {
      if (!edited()) return;
      setDirectionState(next);
    },
    /** 도구 자체를 쓸 수 없는 이유(읽기 전용·조형 모드·다른 편집 중). 모든 조작이 꺼진다. */
    unavailable,
    /** 지금 선택·설정으로는 쓸 수 없는 이유(면 미선택, 바깥쪽 오프셋 불가 등). 도구·방향 선택은 열려 있다. */
    unusable: unusableMessage,
    selectionCount,
    engaged,
    committing,
    dragging,
    notice,
    /** 거리 도구 */
    text,
    setText: (next: string) => {
      if (!edited()) return;
      setTextState(next);
    },
    range: rangeView,
    stepSize,
    value: parsed.kind === "value" ? parsed.value : null,
    step: (sign: 1 | -1, scale: StudioFaceModelingStepScale) => {
      if (!rangeView || !edited()) return;
      setTextState(formatStudioFaceModelingDistance(stepStudioFaceModelingDistance(
        parsed.kind === "value" ? parsed.value : null,
        sign,
        scale,
        stepSize,
        rangeView.allowed,
      )));
    },
    setHandleValue: (value: number) => {
      if (!edited()) return;
      const formatted = formatStudioFaceModelingDistance(value);
      setTextState(formatted);
      // 핸들은 끄는 동안 바로 보여 주는 조작이라 입력 대기를 거치지 않는다.
      setSettledText(formatted);
    },
    beginDrag: () => {
      if (committing) return;
      setDragging(true);
      // 비용이 큰 메시는 끄는 동안 다시 계산하지 않고, 놓을 때 한 번만 계산한다.
      setFrozenText(previewCost > STUDIO_FACE_MODELING_LIMITS.livePreviewCost ? text : null);
    },
    endDrag: () => {
      setDragging(false);
      setFrozenText(null);
    },
    /** 입력이 멈추기를 기다리는 중인지, 그리고 기다리지 않고 지금 입력으로 미리보기를 계산한다. */
    pending,
    flushPreview: () => setSettledText(text),
    /** 면 그리기 */
    guide: guideResult?.ok ? guideResult.value : null,
    drawPoints,
    addDrawPoint: (point: StudioPlanarPoint) => {
      if (committing) return;
      if (drawPoints.length >= STUDIO_FACE_MODELING_LIMITS.maxDrawPoints) {
        setNotice(bt(
          "점은 최대 64개까지 찍을 수 있어요. 마지막 점을 지우거나 적용해 보세요.",
          "At most 64 points can be placed. Remove the last point or apply the shape.",
        ));
        return;
      }
      if (!edited()) return;
      setDrawPoints([...drawPoints, point]);
    },
    removeLastDrawPoint: () => {
      if (!edited()) return;
      setDrawPoints(drawPoints.slice(0, -1));
    },
    error,
    hint,
    problemPoints,
    previewSummary,
    canApply,
    apply: () => {
      if (!canApply || !run || !request || !assetId || !record) return;
      const requested = request;
      setApplyRequest({ assetId, meshHash: record.meshHash });
      setNotice(bt(
        "적용하는 중이에요. 끝나면 되돌리기 한 번으로 원래대로 돌릴 수 있어요.",
        "Applying. When it finishes, one undo step restores the original.",
      ));
      run(studioFaceModelingRunLabel(requested.tool), (current, currentSelection) => {
        try {
          return commitStudioHybridDccFaceModeling(current, currentSelection, requested);
        } catch (error) {
          // 패널은 예외를 작업 기록에만 남기고 busy 를 같은 묶음에서 닫아 화면이 실패를 알 수 없다. 여기서 직접 알린다.
          setApplyRequest(null);
          setNotice(error instanceof StudioFaceModelingCommitError
            ? describeStudioFaceModelingFailure(bt, error.failure, requested.tool)
            : describeStudioFaceModelingApplyError(bt, error));
          throw error;
        }
      });
    },
    cancel,
    viewportProps,
  };
}

export type StudioHybridDccFaceModelingModel = ReturnType<typeof useStudioHybridDccFaceModeling>;
