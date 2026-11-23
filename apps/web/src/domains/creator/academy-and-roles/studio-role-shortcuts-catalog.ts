/**
 * 직군 조합 빠른 프리셋 5종 & 이주 작가 단축키 프리셋 4종(CSP · Procreate · Photoshop · 입문).
 */

import type { RoleDomainCategory, StudioCreatorRoleId } from "./studio-role-catalog";

export type ShortcutMigrationPresetId = "csp" | "procreate" | "photoshop" | "beginner";

export interface RoleComboQuickPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly roles: readonly StudioCreatorRoleId[];
}

export const ROLE_COMBO_QUICK_PRESETS: readonly RoleComboQuickPreset[] = Object.freeze([
  {
    id: "solo-creator",
    labelKo: "1인 솔로 올인원",
    descriptionKo: "콘티·선화·밑색·명암·식자까지 직접 챙기고 나머지는 AI가 보완",
    roles: ["storyboard", "lineart", "flatting", "shading", "lettering"],
  },
  {
    id: "story-conti-duo",
    labelKo: "글 · 콘티 · 연출 작가",
    descriptionKo: "대본·컷 분할·가대사 식자에 집중하고 3D·선화·채색은 팀/AI 인계",
    roles: ["story", "storyboard", "lettering"],
  },
  {
    id: "art-line-color",
    labelKo: "선화 · 채색 · 후보정 작화",
    descriptionKo: "펜터치부터 밑색·명암·FX까지 2D 작화 완성도를 책임지는 조합",
    roles: ["lineart", "flatting", "shading", "vfx"],
  },
  {
    id: "spatial-3d-vrm",
    labelKo: "3D 배경 · VRM · 후보정",
    descriptionKo: "3D 무대·LT 추출·VRM 42소켓 포즈·대기광 조명을 통합 운영",
    roles: ["stage3d", "character3d", "vfx"],
  },
  {
    id: "pd-global-shorts",
    labelKo: "PD · 번역 · 숏폼 출고",
    descriptionKo: "검수 게이트·글로벌 다국어 식자·Remotion 숏폼 예고편까지 원스톱",
    roles: ["localization", "video", "producer"],
  },
]);

export interface ShortcutBindingItem {
  readonly actionKo: string;
  readonly keys: string;
  readonly categories: readonly RoleDomainCategory[];
}

export interface ShortcutMigrationPreset {
  readonly id: ShortcutMigrationPresetId;
  readonly labelKo: string;
  readonly originAppLabelKo: string;
  readonly muscleMemoryTipKo: string;
  readonly conflictNoteKo: string;
  readonly bindings: readonly ShortcutBindingItem[];
}

export const MIGRATION_SHORTCUT_PRESETS: Readonly<
  Record<ShortcutMigrationPresetId, ShortcutMigrationPreset>
> = Object.freeze({
  csp: {
    id: "csp",
    labelKo: "CSP 이주 프리셋",
    originAppLabelKo: "Clip Studio Paint 익숙한 작가",
    muscleMemoryTipKo: "P(펜)·E(지우개)·G(채우기)·K(레이어 이동)·Space(손바닥) 근육 기억을 그대로 유지합니다.",
    conflictNoteKo: "브라우저 기본 단축키(Ctrl/Cmd+W 탭 닫기)는 자동 선택(W) 단일 키로 안전 분리했습니다.",
    bindings: [
      { actionKo: "G펜 / 메인 브러시", keys: "P", categories: ["art-2d", "planning"] },
      { actionKo: "지우개 / 벡터 교차 지우개", keys: "E / Shift+E", categories: ["art-2d"] },
      { actionKo: "참조 레이어 채우기", keys: "G", categories: ["art-2d"] },
      { actionKo: "올가미 / 자동 선택", keys: "M / W", categories: ["art-2d", "planning"] },
      { actionKo: "임시 스포이드(누르는 동안)", keys: "Alt", categories: ["art-2d", "finishing"] },
      { actionKo: "말풍선 · 식자 도구", keys: "T", categories: ["finishing", "planning"] },
      { actionKo: "3D 카메라 / VRM 포즈", keys: "3 / V", categories: ["spatial-3d"] },
      { actionKo: "컷 바통 터치 게이트 검사", keys: "Ctrl/Cmd+Shift+Enter", categories: ["publish-ops", "finishing"] },
    ],
  },
  procreate: {
    id: "procreate",
    labelKo: "Procreate 제스처 프리셋",
    originAppLabelKo: "아이패드·태블릿 제스처 익숙한 작가",
    muscleMemoryTipKo: "두 손가락 탭(실행 취소)·세 손가락 탭(다시 실행)·길게 누르기(스포이드)를 기본 활성화합니다.",
    conflictNoteKo: "키보드 단축키는 한 손 왼손 입력(B/E/S/L) 중심으로 최소화해 태블릿 전환 피로를 줄입니다.",
    bindings: [
      { actionKo: "브러시 / 지우개 전환", keys: "B / E", categories: ["art-2d", "planning"] },
      { actionKo: "실행 취소 / 다시 실행", keys: "2-Finger Tap / 3-Finger Tap", categories: ["art-2d", "planning", "finishing"] },
      { actionKo: "컬러드롭 참조 채우기", keys: "G (또는 스와치 드래그)", categories: ["art-2d"] },
      { actionKo: "빠른 메뉴 래디얼 휠", keys: "QuickMenu / Q", categories: ["art-2d", "spatial-3d"] },
      { actionKo: "레이어 패널 열기", keys: "L", categories: ["art-2d", "finishing", "spatial-3d"] },
      { actionKo: "말풍선 · 번역 슬롯", keys: "T", categories: ["finishing"] },
      { actionKo: "원클릭 컷 검수 제출", keys: "Shift+Enter", categories: ["publish-ops"] },
    ],
  },
  photoshop: {
    id: "photoshop",
    labelKo: "Photoshop 채색·후보정 프리셋",
    originAppLabelKo: "포토샵 기반 일러스트·후보정 작가",
    muscleMemoryTipKo: "B(브러시)·L(올가미)·W(자동선택)·I(스포이드)·Ctrl/Cmd+J(레이어 복제)·[ / ](크기)를 유지합니다.",
    conflictNoteKo: "레이어 패널 단축키와 올가미(L)가 겹치지 않도록 레이어 토글은 F7로 배정했습니다.",
    bindings: [
      { actionKo: "브러시 / 브러시 크기 조절", keys: "B / [ , ]", categories: ["art-2d", "finishing"] },
      { actionKo: "올가미 / 자동 선택", keys: "L / W", categories: ["art-2d", "planning"] },
      { actionKo: "스포이드 / 채우기", keys: "I / G", categories: ["art-2d"] },
      { actionKo: "클리핑 마스크 토글", keys: "Ctrl/Cmd+Alt+G", categories: ["art-2d", "finishing"] },
      { actionKo: "레이어 패널 / 복제", keys: "F7 / Ctrl/Cmd+J", categories: ["art-2d", "finishing", "spatial-3d"] },
      { actionKo: "텍스트 · 식자", keys: "T", categories: ["finishing"] },
      { actionKo: "3D 스테이지 / Remotion 내보내기", keys: "3 / Ctrl/Cmd+Shift+E", categories: ["spatial-3d", "publish-ops"] },
    ],
  },
  beginner: {
    id: "beginner",
    labelKo: "입문 가이드 프리셋",
    originAppLabelKo: "웹툰 툴을 처음 시작하는 작가",
    muscleMemoryTipKo: "꼭 필요한 핵심 6키(1:펜 · 2:지우개 · 3:채우기 · 4:말풍선 · Z:되돌리기 · Space:이동)만 기억하세요.",
    conflictNoteKo: "복잡한 조합키를 숨기고 캔버스 상단 도구 칩에 숫자 1~6 번호표를 함께 표시합니다.",
    bindings: [
      { actionKo: "펜으로 그리기", keys: "1", categories: ["art-2d", "planning"] },
      { actionKo: "지우개", keys: "2", categories: ["art-2d", "planning"] },
      { actionKo: "색 채우기", keys: "3", categories: ["art-2d"] },
      { actionKo: "말풍선 · 대사 쓰기", keys: "4", categories: ["finishing", "planning"] },
      { actionKo: "3D 배경 · 포즈 열기", keys: "5", categories: ["spatial-3d"] },
      { actionKo: "실행 취소 / 캔버스 이동", keys: "Ctrl/Cmd+Z / Space", categories: ["art-2d", "finishing", "publish-ops"] },
    ],
  },
});
