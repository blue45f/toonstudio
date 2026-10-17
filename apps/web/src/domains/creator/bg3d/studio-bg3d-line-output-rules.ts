/**
 * 선 출력 설정의 순수 판정(내부선 억제 해석, 깊이 캡처 요구 여부).
 *
 * 이 모듈은 아무것도 import 하지 않는 잎(leaf)이어야 한다. 선화 렌더러(`studio-bg3d-lt-line-response`)·생산 패스
 * 준비 판정·배치 패스 목록이 이 판정을 쓴다. 판정을 장면 문서 타입 모듈(`studio-bg3d-scene-document-types`)에
 * 두고 그 모듈을 여러 청크가 런타임 import 하면 번들러가 타입 모듈을 장면 문서 청크에서 떼어 렌더러 청크에 묶고,
 * Studio 라우트가 장면 문서를 정적으로 쓰는 순간 렌더러 전체(약 27KiB)를 라우트 정적 그래프로 끌고 온다.
 * 장면 문서 타입 모듈은 이 모듈을 import 하지 않는다(그러면 이 모듈이 라우트와 렌더러 사이에 끼는 공유 청크가 된다).
 */

/** 내부선 억제와 깊이 캡처 판정이 읽는 선 설정의 부분 모양(구조적으로 `StudioBg3dLineOutputSettings` 의 부분집합). */
export interface StudioBg3dLineRuleFields {
  readonly depthEnabled?: boolean;
  readonly interiorSuppressionEnabled?: boolean;
  readonly interiorSuppressionStrength?: number;
}

/**
 * 내부선 억제를 켰을 때 강도 필드가 없으면 쓰는 기본 강도. 장면 문서 정규화의 같은 이름 상수와 같은 값이어야 하며
 * (`studio-bg3d-scene-document-line-output.test.ts` 가 지킨다) 이 모듈은 그 상수를 import 하지 않는다.
 */
export const STUDIO_BG3D_INTERIOR_SUPPRESSION_DEFAULT_STRENGTH = 0.6;

/**
 * 내부선 억제의 해석. 필드가 없으면 꺼짐이다. 강도가 0 이면 켜져 있어도 효과가 없으므로 `active` 는 거짓이다.
 * 렌더러·깊이 캡처 요청·UI 가 같은 판정을 쓰도록 이 함수만 거친다.
 */
export function resolveStudioBg3dInteriorSuppression(
  line: Pick<StudioBg3dLineRuleFields, "interiorSuppressionEnabled" | "interiorSuppressionStrength">
): { readonly active: boolean; readonly strength: number } {
  const strength = line.interiorSuppressionStrength ?? STUDIO_BG3D_INTERIOR_SUPPRESSION_DEFAULT_STRENGTH;
  return { active: line.interiorSuppressionEnabled === true && strength > 0, strength };
}

/**
 * 선 설정이 깊이 캡처를 요구하는지. 깊이선 검출과 내부선 억제(깊이 윤곽을 윤곽 근거로 쓴다)가 그렇다.
 * 가려진 선 제거는 깊이를 스스로 요구하지 않고, 이미 캡처된 깊이가 있을 때만 효과를 낸다.
 */
export function studioBg3dLineNeedsDepth(line: StudioBg3dLineRuleFields): boolean {
  return line.depthEnabled === true || resolveStudioBg3dInteriorSuppression(line).active;
}
