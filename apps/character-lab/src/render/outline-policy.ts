/**
 * 툰 hull 외곽선 정책(순수). 엔진 `applyMaterialsForMode`가 파츠 메시마다 `renderOutline`을 켤지 이 표로 정한다.
 *
 * - 절차 소스·제작 패키지: 모든 파츠 메시에 hull을 켠다(기존 거동 유지).
 * - 키트 소스: 눈·입 안 계열 역할과 **머리**(`KIT_OUTLINE_EXEMPT_ROLES`)에는 켜지 않는다(리드 결정 A-5·A-9, 2026-10-08).
 *   근거 1(A-5, 리드가 키트 뷰어로 확인): 반지름 약 12 mm 눈 메시에 4 mm hull(`TOON_OUTLINE_WIDTH`)이 붙으면 눈이 검은 고리로 덮여 공막·홍채가 보이지 않는다.
 *   입 안(치아·혀)·속눈썹·눈썹도 같은 이유로 제외한다.
 *   근거 2(A-9, KT-04가 실제 엔진으로 확인): Babylon 외곽선 렌더러는 메시를 그린 뒤 부풀린 껍질의 깊이를 다시 써서, 머리 표면보다 4 mm 앞의 깊이가
 *   이후에 그려지는 눈·눈썹·속눈썹을 깊이 테스트에서 떨어뜨린다(머리 hull 폭을 0.5 mm로 줄여도 눈썹이 가려진다). 그래서 머리 hull도 켜지 않는다.
 *   알려진 한계: 키트 머리의 실루엣 선이 없다(몸·헤어·의상·신발·액세서리·속옷은 hull 유지). 엣지·후처리 방식의 머리 윤곽은 후속 과제다.
 *   에셋 쪽에서 눈 메시를 키우거나 외곽선용 우회 지오메트리를 넣지 않는다(계약 4.8: `_Outline` 셸 금지).
 *
 * `edge`(EdgesRenderer) 외곽선은 이 정책의 대상이 아니다 — 부드러운 눈 구면에는 각도 임계(cos 0.95)를 넘는 모서리가 거의 없어 고리가 생기지 않는다.
 */
import type { PartRole } from "../contracts";

export type OutlineRigKind = "procedural" | "package" | "kit";

/** 키트 소스에서 hull 외곽선을 켜지 않는 역할 */
export const KIT_OUTLINE_EXEMPT_ROLES: ReadonlySet<PartRole> = new Set<PartRole>(["head", "eyeball", "iris", "pupil", "eye-highlight", "lash", "brow", "teeth", "tongue"]);

/** 이 리그 종류의 이 역할 메시에 hull 외곽선을 켜도 되는지. 키트의 머리·눈·입 안 계열 역할만 false다. */
export function hullOutlineAllowed(kind: OutlineRigKind, role: PartRole): boolean {
  return kind !== "kit" || !KIT_OUTLINE_EXEMPT_ROLES.has(role);
}
