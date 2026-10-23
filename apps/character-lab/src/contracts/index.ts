/**
 * contracts barrel. 다른 디렉터리는 `../contracts` 또는 개별 파일(`../contracts/slots`)로 import한다.
 * 변경은 core(char-core)만 한다(0단계 동결). 2026-10-23 CORE-1: 레시피 v3 계약(화풍·색 채널·커스터마이즈·내 룩·키트 v2)을 더했다.
 * `kit-skeleton.ts`·`kit-provenance.ts`의 공개 상수는 기존 경로대로 `character-kit.ts`가 다시 내보낸다.
 */
export * from "./apply-plan";
export * from "./art-style";
export * from "./backend";
export * from "./bones";
export * from "./capture";
export * from "./catalog";
export * from "./character-kit";
export * from "./character-kit-v2";
export * from "./character-look";
export * from "./character-look-recipe";
export * from "./color-channels";
export * from "./customization";
export * from "./engine";
export * from "./errors";
export * from "./events";
export * from "./expression";
export * from "./mesh-data";
export * from "./morph-names";
export * from "./outfit-port";
export * from "./package-manifest";
export * from "./paint";
export * from "./params";
export * from "./passes";
export * from "./physics";
export * from "./physics-chain";
export * from "./pose";
export * from "./preset-vocabulary";
export * from "./recipe";
export * from "./shading";
export * from "./slots";
export * from "./state";
export * from "./vision";
