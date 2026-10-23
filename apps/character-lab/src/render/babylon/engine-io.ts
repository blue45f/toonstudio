/**
 * 엔진 본체(`character-engine.ts`)와 거기서 떼어 낸 세션 모듈이 함께 쓰는 상태 없는 보조 함수: 제작 패키지·키트 바이트의 기본 로더(브라우저 `fetch`),
 * 실패 변환, 색 변환, 리그 모양. 테스트는 `fetchBytes`를 주입하므로 기본 로더는 주입이 없을 때만 쓰인다.
 */
import { failVisible, isLabFailure } from "../../contracts";
import { hexToSrgb01 } from "../../shared/color";

import { RigBindError } from "./mesh-binding";

import type { CharacterRig, RigPart } from "./character-rig";

/** 제작 패키지 GLB 기본 로더. HTTP 오류는 `package-fetch-failed`로 실패한다. */
export async function fetchBytesDefault(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw failVisible("package-fetch-failed", `제작 패키지 GLB를 받지 못했습니다(HTTP ${response.status}): ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** 키트 파일 기본 로더. 실패는 키트 로더가 `kit-file-fetch-failed`로 감싸므로 HTTP 상태만 원인(detail)으로 남긴다. */
export async function fetchKitBytesDefault(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** 소문자 hex → sRGB 0..1(형식이 틀리면 중간 회색) */
export function srgb(hex: string): readonly [number, number, number] {
  return hexToSrgb01(hex) ?? [0.5, 0.5, 0.5];
}

/** 베타 컨트롤러의 `releaseRig`는 `rig.parts`만 읽는다. 일부 파츠만 놓을 때 그 파츠만 가진 리그 모양을 만든다. */
export function rigWithParts(rig: CharacterRig, parts: readonly RigPart[]): CharacterRig {
  return { ...rig, parts };
}

/** 리그 바인딩 오류는 그 실패로, LabFailure는 그대로, 그 밖의 예외는 `code`·한글 사유의 LabFailure로 던진다. */
export function toFailure(error: unknown, code: string, reasonKo: string, now: number): never {
  if (error instanceof RigBindError) throw error.failure;
  if (isLabFailure(error)) throw error;
  throw failVisible(code, reasonKo, error, now);
}
