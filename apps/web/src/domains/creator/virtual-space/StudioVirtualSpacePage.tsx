/**
 * 가상스튜디오 공간 페이지 진입 모듈.
 *
 * 클래식(구 웹) 공간 클라이언트는 DESIGN.md §15 최종 판단으로 제거됐고,
 * 페이지 본체는 `StudioVirtualSpacePageRoot`(Godot 무대 셸)가 소유한다.
 * 기존 import 경로를 유지하기 위한 재수출만 남긴다.
 */
export { StudioVirtualSpacePage } from "./StudioVirtualSpacePageRoot";
// eslint-disable-next-line react-refresh/only-export-components -- 페이지 셸은 StudioVirtualSpacePageRoot로 분리했고 기존 import 경로를 유지하는 재수출이다
export { default } from "./StudioVirtualSpacePageRoot";
