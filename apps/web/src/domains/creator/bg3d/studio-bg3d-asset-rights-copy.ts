/**
 * 3D 소재 권리 표시 문구 — 카드 요약, 상세 줄, 필터 칩이 같은 낱말을 쓰게 하는 한곳.
 *
 * 규칙
 * - 모르는 값은 언제나 "미확인"이라고 쓴다. "가능"·"허용"처럼 읽히는 낱말은 기록에 그렇게 적힌 경우에만 쓴다.
 * - 상업 사용에는 "불가"가 없다. 기록이 불리언이라 "금지라고 적었다"와 "허용을 적지 않았다"를 가를 수 없어서다.
 * - 새 문구는 해요체로 쓰고, 실패를 알리는 문구는 다음 행동을 함께 적는다(shared/language 가드가 시험한다).
 * - 이 모듈의 새 문구는 한국어 리터럴이다(skp-import 의 선례). 번역 키로 옮기는 일은 후속이다.
 *
 * 문구는 기록된 표기를 옮길 뿐 법률 자문이 아니다. 사용자가 입력한 값(라이선스 이름·제공처·작성자·표기 문구)은
 * 이 모듈이 문장에 끼워 넣지 않고 호출한 쪽이 별도 노드로 그린다.
 */

import type { StudioBg3dAssetOrigin, StudioBg3dAssetRightsView } from "./studio-bg3d-asset-rights-view";

export const STUDIO_BG3D_ASSET_RIGHTS_DISCLAIMER =
  "소재 기록에 적힌 표기를 보여 줄 뿐 법률 자문이나 권리 인증이 아니에요. 사용하기 전에 원본 라이선스를 직접 확인해 주세요.";

/** 이 화면의 권리 표시가 프로젝트 단위 권리 요약과 이어져 있지 않다는 안내(범용 3D 모델 모드의 근거 수집은 별개다). */
export const STUDIO_BG3D_ASSET_RIGHTS_PROJECT_SUMMARY_NOTICE =
  "여기 보이는 권리 표시는 프로젝트 권리 요약에는 아직 반영되지 않아요.";

/** 가져온 소재의 권리 기록을 읽지 못했을 때. 실패 안내라 다음 행동을 함께 적는다. */
export const STUDIO_BG3D_ASSET_RIGHTS_UNREADABLE_NOTICE =
  "저장된 권리 기록을 읽지 못해서 모두 미확인으로 보여요. 3D 모델 목록을 닫았다가 다시 열어 주세요.";

/** 라이브러리 기록과 저장된 권리 기록이 달라 더 제한적인 쪽을 보여 줄 때. */
export const STUDIO_BG3D_ASSET_RIGHTS_CONFLICT_NOTICE =
  "라이브러리 기록과 저장된 권리 기록이 서로 달라서 더 제한적인 쪽으로 보여요. 원본 라이선스를 확인해 주세요.";

export const STUDIO_BG3D_ASSET_RIGHTS_UNCONFIRMED = "미확인";

export type StudioBg3dAssetRightsFilterKey = "license" | "origin" | "commercial" | "aiGenerated" | "aiTraining";

export interface StudioBg3dAssetRightsFilterOption<V extends string = string> {
  readonly value: V;
  readonly label: string;
}

export interface StudioBg3dAssetRightsFilterGroup {
  readonly key: StudioBg3dAssetRightsFilterKey;
  readonly label: string;
  readonly options: readonly StudioBg3dAssetRightsFilterOption[];
}

/** 필터 칩 그룹. 순서가 화면 순서다. 모든 그룹(출처 제외)에 "미확인" 값이 있어 모르는 소재만 따로 볼 수 있다. */
export const STUDIO_BG3D_ASSET_RIGHTS_FILTER_GROUPS: readonly StudioBg3dAssetRightsFilterGroup[] = Object.freeze([
  {
    key: "license",
    label: "라이선스 종류",
    options: [
      { value: "owned", label: "직접 제작" },
      { value: "licensed", label: "구매·허가" },
      { value: "public-domain", label: "공개 이용" },
      { value: "unknown", label: STUDIO_BG3D_ASSET_RIGHTS_UNCONFIRMED },
    ],
  },
  {
    key: "origin",
    label: "출처 종류",
    options: [
      { value: "bundled", label: "기본 제공" },
      { value: "imported", label: "내가 가져옴" },
    ],
  },
  {
    key: "commercial",
    label: "상업 사용",
    options: [
      { value: "allowed", label: "가능" },
      { value: "unknown", label: STUDIO_BG3D_ASSET_RIGHTS_UNCONFIRMED },
    ],
  },
  {
    key: "aiGenerated",
    label: "AI 생성 표기",
    options: [
      { value: "yes", label: "AI 생성" },
      { value: "no", label: "AI 아님" },
      { value: "unknown", label: STUDIO_BG3D_ASSET_RIGHTS_UNCONFIRMED },
    ],
  },
  {
    key: "aiTraining",
    label: "AI 학습 표기",
    options: [
      { value: "allowed", label: "허용" },
      { value: "prohibited", label: "금지" },
      { value: "unknown", label: STUDIO_BG3D_ASSET_RIGHTS_UNCONFIRMED },
    ],
  },
]);

const LICENSE_SUMMARY: Readonly<Record<StudioBg3dAssetRightsView["state"]["license"], string>> = {
  owned: "직접 제작",
  licensed: "구매·허가",
  "public-domain": "공개 이용",
  unknown: "권리 미확인",
};
const COMMERCIAL_SUMMARY = { allowed: "상업 가능", unknown: "상업 미확인" } as const;
const COMMERCIAL_DETAIL = { allowed: "가능", unknown: STUDIO_BG3D_ASSET_RIGHTS_UNCONFIRMED } as const;
const AI_GENERATED_SUMMARY = { yes: "AI 생성", no: "AI 아님", unknown: "AI 미확인" } as const;
const AI_GENERATED_DETAIL = { yes: "AI로 생성됨", no: "AI 생성물 아님", unknown: STUDIO_BG3D_ASSET_RIGHTS_UNCONFIRMED } as const;
const AI_TRAINING_DETAIL = { allowed: "허용", prohibited: "금지", unknown: STUDIO_BG3D_ASSET_RIGHTS_UNCONFIRMED } as const;
const ORIGIN_LABEL: Readonly<Record<StudioBg3dAssetOrigin, string>> = { bundled: "기본 제공", imported: "내가 가져온 파일" };
const ATTRIBUTION_DETAIL = { required: "표기 필요", "not-required": "표기 불필요", unknown: STUDIO_BG3D_ASSET_RIGHTS_UNCONFIRMED } as const;

/**
 * 카드에 한 줄로 보이는 권리 요약. 라이선스 → 상업 사용 → 표기 의무 → AI 순서이며,
 * 권리를 모르면 상업 사용은 따로 적지 않고(이미 미확인) AI 표기만 덧붙인다.
 */
export function describeStudioBg3dAssetRightsSummary(view: StudioBg3dAssetRightsView): string {
  const known = view.state.license !== "unknown";
  const parts: string[] = [LICENSE_SUMMARY[view.state.license]];
  if (known) parts.push(COMMERCIAL_SUMMARY[view.state.commercial]);
  if (known && view.attribution === "required") parts.push("표기 필요");
  if (known && view.attribution === "unknown") parts.push("표기 미확인");
  parts.push(AI_GENERATED_SUMMARY[view.state.aiGenerated]);
  return parts.join(" · ");
}

export type StudioBg3dAssetRightsRowTone = "known" | "unconfirmed";

export interface StudioBg3dAssetRightsRow {
  readonly key: string;
  readonly label: string;
  /** 고정 문구. 사용자 입력 값은 여기에 넣지 않고 `userText` 로 따로 둔다. */
  readonly value: string;
  /** 사용자가 입력한 값(라이선스 이름·제공처·작성자·표기 문구). 호출한 쪽이 별도 노드로 그린다. */
  readonly userText: readonly string[];
  readonly tone: StudioBg3dAssetRightsRowTone;
}

function row(
  key: string,
  label: string,
  value: string,
  userText: readonly (string | null)[] = [],
): StudioBg3dAssetRightsRow {
  return {
    key,
    label,
    value,
    userText: userText.filter((text): text is string => Boolean(text)),
    tone: value === STUDIO_BG3D_ASSET_RIGHTS_UNCONFIRMED ? "unconfirmed" : "known",
  };
}

/** 펼친 카드의 상세 줄. 출처·라이선스·표기 의무·상업 사용을 먼저 두고, 정보가 없는 칸은 모두 "미확인"으로 적는다. */
export function describeStudioBg3dAssetRightsRows(view: StudioBg3dAssetRightsView): readonly StudioBg3dAssetRightsRow[] {
  const source = view.provider || view.author
    ? row("source", "출처", ORIGIN_LABEL[view.origin], [view.provider, view.author])
    : row("source", "출처", ORIGIN_LABEL[view.origin]);
  return [
    source,
    view.state.license === "unknown"
      ? row("license", "라이선스", STUDIO_BG3D_ASSET_RIGHTS_UNCONFIRMED)
      : row("license", "라이선스", LICENSE_SUMMARY[view.state.license], [view.licenseName]),
    view.attribution === "required"
      ? row("attribution", "표기 의무", ATTRIBUTION_DETAIL.required, [view.attributionText])
      : row("attribution", "표기 의무", ATTRIBUTION_DETAIL[view.attribution]),
    row("commercial", "상업 사용", COMMERCIAL_DETAIL[view.state.commercial]),
    row("ai-generated", "AI 생성 여부", AI_GENERATED_DETAIL[view.state.aiGenerated]),
    row("ai-training", "AI 학습 이용", AI_TRAINING_DETAIL[view.state.aiTraining]),
    row("acquired", "구매·내려받은 날", view.acquiredOn ? "기록됨" : STUDIO_BG3D_ASSET_RIGHTS_UNCONFIRMED, [view.acquiredOn]),
  ];
}

/**
 * 카드에 붙이는 근거 안내. 권리 기록을 읽지 못해 항목만 있는 가져온 소재, 또는 두 기록이 어긋나 더 제한적인 쪽을 보여 주는
 * 소재에만 있고 그 밖에는 null 이다.
 */
export function describeStudioBg3dAssetRightsBasisNotice(view: StudioBg3dAssetRightsView): string | null {
  if (view.basis === "entry-only" && view.origin === "imported") return STUDIO_BG3D_ASSET_RIGHTS_UNREADABLE_NOTICE;
  return view.conflict ? STUDIO_BG3D_ASSET_RIGHTS_CONFLICT_NOTICE : null;
}
