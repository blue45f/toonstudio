/**
 * 면 모델링 화면의 사용자 문구. 커널의 실패 코드·거리 검증 코드·미리보기 계획을 이중 언어 문장으로 바꾼다.
 *
 * 문구 원본은 이 파일의 고정 문장뿐이다. 거리 같은 숫자는 `{자리표시자}`로 끼워 넣을 뿐, 사용자가
 * 입력한 문자열을 번역 원본에 섞지 않는다. 커널 `detail`은 개발자용 영어 한 줄이라 화면에 쓰지 않는다.
 */

import { formatI18nTemplate } from "../../../shared/lib/i18n-bilingual-copy";

import { STUDIO_FACE_MODELING_LIMITS, type StudioFaceModelingFailure } from "./studio-hybrid-dcc-face-modeling-mesh";
import {
  formatStudioFaceModelingDistance,
  type StudioFaceModelingDistanceBounds,
  type StudioFaceModelingDistanceCheck,
} from "./studio-hybrid-dcc-face-modeling-session";

import type { StudioOffsetDirection } from "./studio-hybrid-dcc-face-modeling-kernel";
import type { StudioFaceModelingPlan, StudioFaceModelingTool } from "./studio-hybrid-dcc-face-modeling-workspace";

export type StudioFaceModelingBilingual = (ko: string, en: string) => string;

export function studioFaceModelingToolLabel(bt: StudioFaceModelingBilingual, tool: StudioFaceModelingTool): string {
  switch (tool) {
    case "push-pull":
      return bt("밀기/당기기", "Push/Pull");
    case "inset":
      return bt("안쪽 테두리", "Inset");
    case "offset":
      return bt("오프셋", "Offset");
    case "draw":
      return bt("면 그리기", "Draw face");
  }
}

/** 처리 대기 중 로그와 되돌리기 기록에 남기는 한국어 작업 이름(패널의 기존 작업 이름과 같은 방식). */
export function studioFaceModelingRunLabel(tool: StudioFaceModelingTool): string {
  switch (tool) {
    case "push-pull":
      return "면 밀기/당기기";
    case "inset":
      return "면 안쪽 테두리";
    case "offset":
      return "면 오프셋";
    case "draw":
      return "면 그리기";
  }
}

export function studioFaceModelingToolSummary(bt: StudioFaceModelingBilingual, tool: StudioFaceModelingTool): string {
  switch (tool) {
    case "push-pull":
      return bt(
        "선택한 면을 법선 방향으로 정확한 거리만큼 밀거나(+) 당깁니다(−).",
        "Moves the selected face along its normal by an exact distance: push (+) or pull (−).",
      );
    case "inset":
      return bt(
        "선택한 면 안쪽에 일정한 폭의 테두리 고리를 만들고 가운데 면을 남깁니다.",
        "Builds a ring of constant width inside the selected face and keeps the centre face.",
      );
    case "offset":
      return bt(
        "한 면의 둘레를 안쪽 또는 바깥쪽으로 옮겨 새 면 고리를 만듭니다.",
        "Moves the perimeter of one face inward or outward and builds a new face ring.",
      );
    case "draw":
      return bt(
        "한 면 안쪽에 점을 찍어 닫힌 볼록 도형을 그리면 면이 도형과 그 둘레 면으로 나뉩니다.",
        "Click points inside one face to draw a closed convex shape; the face is split into the shape and the faces around it.",
      );
  }
}

export function studioFaceModelingDirectionLabel(
  bt: StudioFaceModelingBilingual,
  direction: StudioOffsetDirection,
): string {
  return direction === "inward" ? bt("안쪽", "Inward") : bt("바깥쪽", "Outward");
}

/** 거리칸 아래의 안내: 부호 규칙과 허용 범위를 항상 보여 준다. */
export function describeStudioFaceModelingDistanceHint(
  bt: StudioFaceModelingBilingual,
  tool: Exclude<StudioFaceModelingTool, "draw">,
  allowed: StudioFaceModelingDistanceBounds | null,
): string {
  if (tool === "push-pull") {
    const base = bt(
      "양수는 바깥쪽(법선 방향)으로 밀고, 음수는 안쪽으로 당깁니다.",
      "Positive pushes outward along the normal; negative pulls inward.",
    );
    if (!allowed) return base;
    return `${base} ${formatI18nTemplate(bt("허용 범위 {min} ~ {max} m.", "Allowed range {min} to {max} m."), {
      min: formatStudioFaceModelingDistance(allowed.min),
      max: formatStudioFaceModelingDistance(allowed.max),
    })}`;
  }
  const base = bt(
    "0보다 큰 값만 입력할 수 있습니다. 음수는 쓸 수 없습니다.",
    "Enter a value greater than 0. Negative values are not allowed.",
  );
  if (!allowed) return base;
  return `${base} ${formatI18nTemplate(bt("허용 범위 0 ~ {max} m.", "Allowed range 0 to {max} m."), {
    max: formatStudioFaceModelingDistance(allowed.max),
  })}`;
}

export function describeStudioFaceModelingEntryHint(bt: StudioFaceModelingBilingual): string {
  return bt(
    "단위를 생략하면 m입니다. 예: 0.25 · 25cm · 250mm",
    "Without a unit the value is in metres. Examples: 0.25, 25cm, 250mm",
  );
}

export function describeStudioFaceModelingKeyHint(bt: StudioFaceModelingBilingual, step: number): string {
  return formatI18nTemplate(
    bt(
      "↑↓ 키는 {step} m씩 · Shift는 세밀하게 · PageUp/PageDown은 크게 · Enter로 적용 · Esc로 취소",
      "Arrow keys step by {step} m · Shift for fine steps · PageUp/PageDown for large steps · Enter applies · Esc cancels",
    ),
    { step: formatStudioFaceModelingDistance(step) },
  );
}

export function describeStudioFaceModelingParseError(bt: StudioFaceModelingBilingual): string {
  return bt(
    "거리를 읽을 수 없습니다. 숫자와 단위(m·cm·mm), 사칙연산, 괄호만 쓸 수 있습니다. 예: 0.25 · 25cm · 250mm",
    "Could not read the distance. Use a number with an optional unit (m, cm, mm), arithmetic and parentheses. Examples: 0.25, 25cm, 250mm",
  );
}

/** 입력 거리가 도구의 부호·범위 규칙을 어길 때의 이유(범위 검증 메시지). */
export function describeStudioFaceModelingCheck(
  bt: StudioFaceModelingBilingual,
  check: Exclude<StudioFaceModelingDistanceCheck, { readonly ok: true }>,
): string {
  switch (check.reason) {
    case "zero":
      return bt("거리가 0이라 바뀌는 것이 없습니다.", "A distance of 0 changes nothing.");
    case "negative-not-allowed":
      return bt(
        "이 도구는 음수 거리를 쓸 수 없습니다. 0보다 큰 값을 입력하세요.",
        "This tool does not accept negative distances. Enter a value greater than 0.",
      );
    case "above-max":
      return formatI18nTemplate(
        bt("허용 범위를 넘었습니다. 최대 {max} m까지 입력할 수 있습니다.", "Out of range. The maximum is {max} m."),
        { max: formatStudioFaceModelingDistance(check.limit) },
      );
    case "below-min":
      return formatI18nTemplate(
        bt(
          "너무 깊이 당겼습니다. 최대 {max} m까지 당길 수 있습니다.",
          "Pulled too deep. You can pull at most {max} m.",
        ),
        { max: formatStudioFaceModelingDistance(check.limit) },
      );
    case "no-room":
      return check.side === "push"
        ? bt(
          "이 선택은 이 방향으로 더 움직일 수 없습니다. 바로 앞에 다른 면이 있거나 면이 너무 작습니다.",
          "This selection cannot move any further this way: another face is directly in the way or the face is too small.",
        )
        : bt(
          "이 선택은 안쪽으로 더 당길 수 없습니다.",
          "This selection cannot be pulled any further inward.",
        );
  }
}

/** 원인 · (있으면) 허용 최대 거리 · 다음 행동 순서로 한 문장 묶음을 만든다. */
function causeWithLimit(
  bt: StudioFaceModelingBilingual,
  copy: { readonly ko: readonly [cause: string, action: string]; readonly en: readonly [cause: string, action: string] },
  maxDistance: number | undefined,
): string {
  if (maxDistance === undefined) return bt(`${copy.ko[0]} ${copy.ko[1]}`, `${copy.en[0]} ${copy.en[1]}`);
  return formatI18nTemplate(
    bt(
      `${copy.ko[0]} 이 조건에서는 최대 {max} m까지 가능합니다. ${copy.ko[1]}`,
      `${copy.en[0]} Here the maximum is {max} m. ${copy.en[1]}`,
    ),
    { max: formatStudioFaceModelingDistance(maxDistance) },
  );
}

/** 커널이 거부한 이유를 사용자 문장으로. 허용 최대 거리가 있으면 함께 알려 준다. */
export function describeStudioFaceModelingFailure(
  bt: StudioFaceModelingBilingual,
  failure: StudioFaceModelingFailure,
  tool: StudioFaceModelingTool,
): string {
  switch (failure.code) {
    case "budget-exceeded":
      return bt(
        "선택한 면이나 같은 평면 영역, 또는 찍은 점이 너무 많아 한 번에 처리할 수 없습니다. 선택을 줄여 다시 시도하세요.",
        "Too many faces, region faces or points to process in one step. Reduce the selection and try again.",
      );
    case "collapse":
      return causeWithLimit(
        bt,
        {
          ko: ["이 거리에서는 면이나 옆벽이 접혀 사라집니다.", "더 작은 거리를 입력하세요."],
          en: ["At this distance a face or side wall would collapse.", "Enter a smaller distance."],
        },
        failure.maxDistance,
      );
    case "degenerate-input":
      return tool === "draw"
        ? bt(
          "점이 서로 너무 가깝거나 일직선 위에 있어 면을 만들 수 없습니다. 점을 더 띄우세요.",
          "Points are too close together or lie on one line. Spread them out.",
        )
        : bt(
          "뾰족한 모서리 때문에 이 거리의 결과가 비정상적으로 길어집니다. 더 작은 거리를 쓰세요.",
          "A sharp corner would stretch the result too far. Use a smaller distance.",
        );
    case "empty-selection":
    case "selection-required":
      return bt(
        "면을 하나 이상 선택하세요. 3 키로 면 모드에 들어가 3D 화면에서 면을 고릅니다.",
        "Select at least one face. Press 3 for face mode and pick a face in the 3D view.",
      );
    case "invalid-mesh":
      return bt(
        "이 메시는 면 모델링이 요구하는 닫힌 입체 규칙을 지키지 않아 쓸 수 없습니다. 메시를 확인하거나 다른 오브젝트를 선택하세요.",
        "This mesh does not meet the closed-solid rules face modeling needs. Check the mesh or select another object.",
      );
    case "invalid-parameter":
      return formatI18nTemplate(
        bt(
          "값이 도구가 받을 수 있는 범위(0.0001 ~ {max} m) 밖입니다.",
          "The value is outside what the tool accepts (0.0001 to {max} m).",
        ),
        { max: formatStudioFaceModelingDistance(STUDIO_FACE_MODELING_LIMITS.maxDistance) },
      );
    case "no-active-asset":
      return bt("먼저 편집할 오브젝트를 선택하세요.", "Select an object to edit first.");
    case "no-coplanar-region":
      return bt(
        "바깥쪽 오프셋은 같은 평면의 이웃 면이 있어야 합니다. 이 면은 이웃과 평면이 달라 바깥으로 넓힐 수 없습니다.",
        "Outward offset needs coplanar neighbouring faces to grow into. This face has none.",
      );
    case "non-convex":
      return tool === "draw"
        ? bt(
          "그린 도형이 오목합니다. 볼록 도형만 그릴 수 있습니다. 점을 지우거나 옮기세요.",
          "The drawn shape is concave. Only convex shapes are allowed. Remove or move a point.",
        )
        : bt(
          "이 면은 오목하여 지원하지 않습니다. 볼록한 면을 선택하세요.",
          "This face is concave and not supported. Select a convex face.",
        );
    case "not-found":
      return bt(
        "선택한 면을 현재 메시에서 찾을 수 없습니다. 면을 다시 선택하세요.",
        "The selected face is not in the current mesh. Select it again.",
      );
    case "out-of-face":
      return bt(
        "모든 점은 면 안쪽에 있어야 합니다. 가장자리에 닿거나 면 밖에 있는 점이 있습니다.",
        "Every point must lie inside the face. A point touches the border or lies outside.",
      );
    case "out-of-region":
      return causeWithLimit(
        bt,
        {
          ko: ["이 거리만큼 바깥으로 넓히면 같은 평면 영역을 벗어납니다.", "더 작은 거리를 입력하세요."],
          en: ["Growing outward by this distance would leave the coplanar region.", "Enter a smaller distance."],
        },
        failure.maxDistance,
      );
    case "selection-stale":
      return bt(
        "선택이 현재 메시와 맞지 않습니다. 면을 다시 선택하세요.",
        "The selection no longer matches the current mesh. Select the face again.",
      );
    case "self-intersection":
      return bt(
        "그린 선이 서로 교차하거나 닿습니다. 도형이 자기 자신과 겹치지 않게 점을 지우거나 순서를 바꾸세요.",
        "The outline crosses or touches itself. Remove a point or change the order so it does not overlap.",
      );
    case "single-face-required":
      return bt(
        "이 도구는 면 하나에만 쓸 수 있습니다. 면을 하나만 선택하세요.",
        "This tool works on exactly one face. Select a single face.",
      );
    case "unrenderable-result":
      return bt(
        "결과가 3D 화면에서 그릴 수 있는 볼록 평면 면으로 나뉘지 않아 적용하지 않았습니다. 거리를 바꿔 다시 입력하세요.",
        "The result cannot be split into convex planar faces the viewport can draw, so it was not applied. Enter a different distance.",
      );
    case "unsupported-face":
      return bt(
        "이 면은 지원하지 않습니다. 평면이 아니거나 모서리가 너무 짧거나 꼭짓점이 너무 많습니다. 다른 면을 선택하세요.",
        "This face is not supported: it is not planar, has a very short edge or too many corners. Select another face.",
      );
    case "unsupported-region":
      return tool === "push-pull"
        ? bt(
          "선택한 면들은 한 방향으로 함께 밀고 당길 수 없어요. 서로 다른 방향을 보는 면이 섞였거나, 꼭짓점 하나로만 맞닿았거나, 가장자리가 한 점에서 겹쳐 있어요. 이어진 면만, 같은 방향을 보는 면만 골라 다시 시도해 보세요.",
          "These faces cannot be pushed or pulled together along one direction: they face very different ways, touch at a single corner, or their outline pinches at a point. Select connected faces that face the same way and try again.",
        )
        : bt(
          "주변 같은 평면 영역의 모양이 복잡해(구멍이 있거나 볼록하지 않음) 이 연산을 지원하지 않습니다. 다른 면을 선택하세요.",
          "The surrounding coplanar region is too complex (holes or a non-convex outline) for this operation. Select another face.",
        );
    case "would-collide":
      return causeWithLimit(
        bt,
        {
          ko: ["이 거리에서는 다른 면과 겹치거나 뚫고 지나갑니다.", "더 작은 거리를 입력하세요."],
          en: ["At this distance the result would overlap or pass through another face.", "Enter a smaller distance."],
        },
        failure.maxDistance,
      );
  }
}

/** 미리보기가 성공했을 때의 한 줄 요약. 확정 전이며 문서는 바뀌지 않았다는 점을 함께 말한다. */
export function describeStudioFaceModelingPreview(
  bt: StudioFaceModelingBilingual,
  plan: StudioFaceModelingPlan,
): string {
  const counts = formatI18nTemplate(
    bt("면 {before}개 → {after}개", "Faces {before} → {after}"),
    { before: plan.faceCountBefore, after: plan.faceCountAfter },
  );
  const method = plan.method === "extrude"
    ? bt(" · 방식: 새 옆면 만들기", " · Method: new side faces")
    : plan.method === "stretch"
      ? bt(" · 방식: 기존 옆면 늘이기", " · Method: stretch existing walls")
      : "";
  return `${counts}${method}`;
}
