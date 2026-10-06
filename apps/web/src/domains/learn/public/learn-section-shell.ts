/**
 * 학습 섹션 셸의 도메인 간 공개 경계.
 *
 * /learn 아래에 살지만 LearnPage 밖 라우트로 렌더링되는 화면(제작 레시피 등)을
 * 라우트 레이어가 학습 셸로 감쌀 때 learn 내부 파일을 직접 import하지 않고
 * 이 모듈만 참조한다(아키텍처 경계 검증의 public 경계 규칙).
 * 노출 범위는 셸 컴포넌트 하나로 유지한다 — 내비 목적지·현재 위치 판정은 셸이 소유한다.
 */

export { LearnSectionShell } from "../LearnSectionShell";
