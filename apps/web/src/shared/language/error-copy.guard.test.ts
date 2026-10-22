import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { violatesErrorPattern } from "./error-pattern";

/**
 * 가드: 앱·스튜디오·관리자 한국어 사전 전수에서 "실패 계열인데 다음 행동이 없는"
 * 에러 문구가 다시 생기지 않게 막는다. (영문 사전은 한국어 정본을 미러링한다.)
 * 판정 패턴은 error-pattern.ts가 단일 출처다.
 */
const NAMESPACES = ["app", "studio", "admin"] as const;

/** 실패 계열로 잡히지만 에러 문구가 아니라서 제외하는 키 (사유 필수) */
const ALLOWLIST: Readonly<Record<string, string>> = {
  // 트래픽 공유 차트의 범례 라벨(성공/실패 건수) — 사용자에게 보이는 에러 문구가 아니다.
  "admin.traffic.shareFailed": "차트 범례 라벨",
  // 연재 운영 화면의 버튼 이름 — 예약된 게시를 "실패로 기록"하는 동작 이름이다. 오류가 난 상황이 아니다.
  "productionHub.operations.recordFailure": "동작 라벨(버튼)",
  // 자동화 규칙 트리거 선택지의 이름 — 연재 사전 검사가 실패했을 때 규칙이 돈다는 조건의 이름이다.
  "productionHub.operations.releaseCheckFailed": "선택지 라벨(자동화 트리거)",
  // 사용자가 방금 누른 "실패 기록" 동작의 완료 알림 — 오류가 아니라 기록이 끝났다는 확인이다.
  "productionHub.operations.releaseFailedRecorded": "완료 알림(동작 결과 확인)",
  // 사용자 글꼴 저장소 상태 배지의 라벨 — 같은 상황의 안내 문구(storageIntegrityImportBlocked)가 다음 행동을 안내한다.
  "studio.customFonts.storageIntegrityBadge": "상태 배지 라벨",
};

function readNamespace(namespace: string): Record<string, unknown> {
  const url = new URL(`../../../public/i18n/${namespace}/ko.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Record<string, unknown>;
}

describe("에러 문구 가드 (원인+다음 행동 문형)", () => {
  it("실패 계열 문구 전수에 다음 행동 안내가 있다", () => {
    const violations: string[] = [];
    for (const namespace of NAMESPACES) {
      const dictionary = readNamespace(namespace);
      for (const [key, value] of Object.entries(dictionary)) {
        if (typeof value !== "string") continue;
        if (key in ALLOWLIST) continue;
        if (violatesErrorPattern(value)) violations.push(`${namespace}:${key} = ${value}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
