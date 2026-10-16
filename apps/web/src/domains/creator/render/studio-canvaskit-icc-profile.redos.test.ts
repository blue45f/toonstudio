import { describe, expect, it } from "vitest";

import { parseIccProfile } from "./studio-canvaskit-icc-profile";

/**
 * ICC 프로파일 설명 문자열(mluc)을 읽는 길의 최악 입력 시간 회귀 테스트(CodeQL js/polynomial-redos).
 *
 * 프로파일은 가져온 이미지·PDF 에 실려 오는 바깥 파일이다. 설명 끝의 NUL 을 `/\0+$/` 로 떼면 앞쪽에 NUL 이 길게 이어진
 * 프로파일에서 시작점마다 그 열을 다시 읽어 입력 길이의 제곱 시간이 든다. 아래 입력(NUL 15만 개)은 수정 전 구현에서 7~9초가
 * 걸렸고(6만 개는 1.2초라 상한 1초에 얇게 못 미쳤다), 선형 시간이면 수 ms 안에 끝난다. 상한은 느린 CI 에서도 흔들리지 않게
 * 1초로 넉넉히 둔다.
 */
const LINEAR_TIME_BUDGET_MS = 1_000;

function ascii(target: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) target[offset + index] = text.charCodeAt(index);
}

/** 영어(US) 한 건짜리 multiLocalizedUnicodeType('mluc') 태그. 문자열은 UTF-16BE 로 싣는다. */
function mlucTag(text: string): Uint8Array {
  const data = new Uint8Array(28 + text.length * 2);
  const view = new DataView(data.buffer);
  ascii(data, 0, "mluc");
  view.setUint32(8, 1); // 레코드 수
  view.setUint32(12, 12); // 레코드 크기
  ascii(data, 16, "enUS");
  view.setUint32(20, text.length * 2); // 문자열 바이트 수
  view.setUint32(24, 28); // 태그 시작에서 문자열까지의 거리
  for (let index = 0; index < text.length; index += 1) view.setUint16(28 + index * 2, text.charCodeAt(index));
  return data;
}

/** 'desc' 태그 하나만 가진 최소 프로파일(변환 태그가 없어 kind 는 unsupported 로 읽힌다). */
function profileWithDescription(text: string): Uint8Array {
  const tag = mlucTag(text);
  const tagOffset = 128 + 4 + 12;
  const total = tagOffset + ((tag.byteLength + 3) & ~3);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, total);
  view.setUint32(8, 0x02400000);
  ascii(bytes, 12, "prtr");
  ascii(bytes, 16, "CMYK");
  ascii(bytes, 20, "Lab ");
  ascii(bytes, 36, "acsp");
  view.setUint32(128, 1);
  ascii(bytes, 132, "desc");
  view.setUint32(136, tagOffset);
  view.setUint32(140, tag.byteLength);
  bytes.set(tag, tagOffset);
  return bytes;
}

function descriptionOf(text: string): string {
  const result = parseIccProfile(profileWithDescription(text));
  if (!result.ok) throw new Error(`예상과 달리 파싱 실패: ${result.error}`);
  return result.profile.description;
}

describe("ICC 설명 문자열 끝 NUL 정리", () => {
  it("설명 앞에 NUL 이 길게 이어져도 제곱 시간이 되지 않는다", () => {
    const description = `${"\0".repeat(150_000)}a`;
    const startedAt = performance.now();
    const actual = descriptionOf(`${description}\0`);
    const elapsedMs = performance.now() - startedAt;
    expect(actual).toBe(description);
    expect(elapsedMs, "ICC 설명 정리 소요(ms)").toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });

  it.each([
    ["끝 NUL 하나(실제 파일의 흔한 모양)", "sRGB IEC61966\0", "sRGB IEC61966"],
    ["끝 NUL 여러 개", "Toon\0\0\0", "Toon"],
    ["안쪽 NUL 은 보존", "A\0B\0", "A\0B"],
    ["NUL 뿐이면 빈 문자열", "\0\0", ""],
    ["NUL 이 없으면 그대로", "ToonStudio", "ToonStudio"],
  ])("%s", (_label, written, expected) => {
    expect(descriptionOf(written)).toBe(expected);
  });
});
