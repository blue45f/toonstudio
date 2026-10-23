/**
 * 편집 화면의 요소 식별자 — 오류 이동과 편집 뒤 초점 이동이 같은 규칙으로 요소를 찾는다.
 * 식별자는 화면 인스턴스별 접두사(prefix)에 장면·선택지·컷 식별자를 붙여 만든다.
 */
export const nodeTitleDomId = (prefix: string): string => `${prefix}-node-title`;
export const nodeHeadingDomId = (prefix: string): string => `${prefix}-node-heading`;
export const choiceLabelDomId = (prefix: string, choiceId: string): string => `${prefix}-choice-label-${choiceId}`;
export const choiceTargetDomId = (prefix: string, choiceId: string): string => `${prefix}-choice-target-${choiceId}`;
export const cutCaptionDomId = (prefix: string, cutId: string): string => `${prefix}-cut-caption-${cutId}`;
export const addChoiceDomId = (prefix: string): string => `${prefix}-add-choice`;
export const addCutDomId = (prefix: string): string => `${prefix}-add-cut`;

/** 오류 항목을 눌러 이동하려는 위치. 같은 항목을 다시 눌러도 다시 이동하도록 nonce 를 올린다. */
export interface BranchingJumpRequest {
  readonly nodeId: string;
  readonly choiceId?: string;
  readonly cutId?: string;
  readonly nonce: number;
}
