/**
 * 웹툰 제작 공정별 도구 정리 데이터 — 외부 도구 + 툰스튜디오 내장 기능 전수 카탈로그.
 *
 * `/learn/process` 가이드의 "공정별로 쓰이는 도구들" 섹션 전용 데이터다.
 * 수록 원칙:
 * - 외부 도구는 업계에서 해당 공정에 쓰이는 도구이며, 특정 제작사가 어떤 도구를
 *   쓰는지는 작품마다 다르다 — 페이지 문구도 그 전제를 밝히는 가이드 서술로 유지한다.
 * - 과금 형태(pricing)는 공식 출처로 확인된 경우에만 적는다. 확인이 안 되면 비운다.
 * - 내장 기능(kind: "builtin")은 코드 실측으로 존재가 확인된 것만 적고, 독립
 *   화면이 있는 기능만 href를 단다. 에디터 안 패널 기능은 역할에 그 사실을 밝힌다.
 * 근거: hidden_files/competitor-analysis-2026-10-06/ cat1~cat6·synthesis,
 * ai-assist-benchmark-2026-09-30, 벤치마크 문서군, 2026-10-06 웹 확인, 2026-10-06 코드 실측.
 */

import { TOOLCHAIN_STAGES_FRONT } from "./webtoon-process-toolchain-stages-front";
import { TOOLCHAIN_STAGES_ART } from "./webtoon-process-toolchain-stages-art";
import { TOOLCHAIN_STAGES_LAUNCH } from "./webtoon-process-toolchain-stages-launch";

export type ProcessToolKind = "external" | "builtin";

/** 무료 / 부분 무료(프리미엄) / 유료 / 구독 — 확인된 경우에만 표기한다. */
export type ProcessToolPricing = "free" | "freemium" | "paid" | "subscription";

export interface ProcessToolchainTool {
  /** 도구 고유명은 번역하지 않지만, 내장 기능은 UI 표시명이라 한/영이 다를 수 있다. */
  readonly name: { readonly ko: string; readonly en: string };
  readonly role: { readonly ko: string; readonly en: string };
  readonly kind: ProcessToolKind;
  readonly pricing?: ProcessToolPricing;
  /** 내장 기능 전용. 실재가 확인된 내부 라우트만 적는다. */
  readonly href?: string;
}

export interface ProcessToolchainStage {
  readonly id: string;
  readonly title: { readonly ko: string; readonly en: string };
  readonly summary: { readonly ko: string; readonly en: string };
  readonly tools: readonly ProcessToolchainTool[];
}

export const WEBTOON_PROCESS_TOOLCHAIN: readonly ProcessToolchainStage[] = [
  ...TOOLCHAIN_STAGES_FRONT,
  ...TOOLCHAIN_STAGES_ART,
  ...TOOLCHAIN_STAGES_LAUNCH,
];
