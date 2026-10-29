/**
 * @file bounded-zip-path.ts
 * @description `bounded-zip.ts`가 ZIP 중앙 디렉터리에서 읽은 항목 경로를 검증한다. 파일 크기 상한 때문에 분리했고 동작은 그대로다.
 *
 * 경로 정책은 둘이다.
 * - `portable`(기본): 어느 운영체제에 풀어도 안전한 경로만 받는다(NFKC 정규형, Windows 금지 문자·예약 이름·끝 점·공백, 방향 제어 문자
 *   거부, 중복은 대소문자 무시). 항목을 파일로 풀 수 있는 호출자는 이 정책을 쓴다.
 * - `memory`: 항목을 메모리에서 이름으로만 찾고 파일로 풀지 않는 호출자용이다. 올바르지 않은 UTF-8·유니코드, 제어 문자(0x00~0x1f,
 *   0x7f), 절대 경로, 빈·`.`·`..` 구간, 길이 초과는 여전히 거부하고 이식성 검사만 건너뛴다. 중복은 정확히 같은 경로만 본다.
 */

/** 경로 검사의 엄격함. 기본값은 `portable`이고, `memory`는 항목을 파일 시스템에 쓰지 않을 때만 쓴다. */
export type FormatZipPathPolicy = "portable" | "memory";

export interface ValidatedZipPath {
  path: string;
  comparisonKey: string;
  directory: boolean;
}

/** 경로가 안전 검사를 통과하지 못했다. 호출자(`bounded-zip.ts`)가 `PATH_INVALID` 오류로 감싼다. */
export class ZipPathRejection extends Error {
  readonly path?: string;

  constructor(message: string, path?: string) {
    super(message);
    this.name = "ZipPathRejection";
    if (path !== undefined) this.path = path;
  }
}

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const UNSAFE_PATH_CHARACTER = /[<>:"|?*\\]/u;
const UNSAFE_BIDI_CHARACTER = /[‪-‮⁦-⁩]/u;

const textDecoder = new TextDecoder("utf-8", { fatal: true });
const textEncoder = new TextEncoder();

export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function validateZipPath(bytes: Uint8Array, maxPathBytes: number, policy: FormatZipPathPolicy): ValidatedZipPath {
  if (bytes.byteLength === 0 || bytes.byteLength > maxPathBytes) {
    throw new ZipPathRejection("ZIP 경로 길이가 허용 범위를 벗어났습니다.");
  }
  let decoded: string;
  try {
    decoded = textDecoder.decode(bytes);
  } catch {
    throw new ZipPathRejection("ZIP 경로가 올바른 UTF-8이 아닙니다.");
  }
  if (hasUnpairedSurrogate(decoded) || !equalBytes(textEncoder.encode(decoded), bytes)) {
    throw new ZipPathRejection("ZIP 경로의 Unicode 인코딩이 정규적이지 않습니다.");
  }
  if (policy === "portable") {
    const normalized = decoded.normalize("NFKC");
    if (normalized !== decoded) {
      throw new ZipPathRejection("ZIP 경로는 NFKC 정규형이어야 합니다.", decoded);
    }
  }

  const directory = decoded.endsWith("/");
  const pathWithoutDirectorySlash = directory ? decoded.slice(0, -1) : decoded;
  if (
    pathWithoutDirectorySlash.length === 0 ||
    decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    (policy === "portable" &&
      (/^[A-Za-z]:/u.test(decoded) || UNSAFE_PATH_CHARACTER.test(decoded) || UNSAFE_BIDI_CHARACTER.test(decoded))) ||
    [...decoded].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || code === 127;
    })
  ) {
    throw new ZipPathRejection("ZIP 경로에 절대 경로 또는 안전하지 않은 문자가 있습니다.", decoded);
  }

  for (const segment of pathWithoutDirectorySlash.split("/")) {
    if (
      segment.length === 0 ||
      segment === "." ||
      segment === ".." ||
      (policy === "portable" &&
        (segment.trim() !== segment || /[. ]$/u.test(segment) || WINDOWS_RESERVED_NAME.test(segment)))
    ) {
      throw new ZipPathRejection("ZIP 경로에 안전하지 않은 구간이 있습니다.", decoded);
    }
  }

  return { path: decoded, comparisonKey: policy === "portable" ? decoded.toLowerCase() : decoded, directory };
}
