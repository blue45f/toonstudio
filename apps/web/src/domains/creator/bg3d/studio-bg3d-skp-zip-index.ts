/**
 * 2021 이후(VFF) .skp 안에 든 ZIP 의 중앙 디렉터리에서 model.dat 의 압축 해제 크기를 읽는다.
 *
 * 왜 필요한가: OpenSKP README 는 대형 파일이 힙을 크게 쓴다고 밝힌다("113MB 파일이 Node 힙 8–16GB"; 원인은 작은
 * 형상 객체마다 붙는 V8 객체 오버헤드). 그 메모리는 압축 파일 크기가 아니라 **압축을 푼 model.dat 의 레코드 수**에
 * 비례한다. 압축률이 높은 파일은 원본 크기 상한을 통과하고도 파서 안에서 힙을 넘길 수 있으므로, 파서를 부르기 전에
 * 중앙 디렉터리(파일 끝 몇 KB)만 읽어 선언된 압축 해제 크기를 확인한다.
 *
 * 구조는 openskp 1.3.0 소스(src/vff.ts)를 그대로 따른다: ZIP 은 파일 앞쪽의 첫 "PK 03 04" 에서 시작하고,
 * openskp 는 그 지점부터 끝까지를 ZIP 으로 넘긴다. 따라서 중앙 디렉터리 오프셋도 그 지점 기준이다.
 *
 * 판독 규칙: 확실히 읽은 값만 돌려준다. ZIP64 표식(0xFFFFFFFF), 잘린 디렉터리, 중앙 디렉터리가 없는 파일, model.dat 가
 * 없는 파일은 모두 null 이며, 그 판단(파싱 실패)은 파서에 맡긴다. 크기를 모른다는 이유로 거절하지 않는다.
 */

const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04] as const;
/** openskp 의 findZipOffset 은 제한이 없지만, 실제 헤더는 1KB 안팎이라 앞 4KB 만 본다. */
const ZIP_LOCAL_SEARCH_LIMIT = 4_096;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const END_OF_CENTRAL_DIRECTORY_MIN_BYTES = 22;
/** 끝 기록 뒤에 올 수 있는 주석(최대 65535바이트)까지 포함한 탐색 범위. */
const END_OF_CENTRAL_DIRECTORY_SEARCH_BYTES = 0xffff + END_OF_CENTRAL_DIRECTORY_MIN_BYTES;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const CENTRAL_ENTRY_MIN_BYTES = 46;
const ZIP64_MARKER = 0xffff_ffff;
const MODEL_DATA_ENTRY = "model.dat";

function indexOfLocalHeader(bytes: Uint8Array): number {
  const end = Math.min(bytes.byteLength, ZIP_LOCAL_SEARCH_LIMIT) - ZIP_LOCAL_HEADER.length;
  for (let index = 0; index <= end; index += 1) {
    if (ZIP_LOCAL_HEADER.every((value, offset) => bytes[index + offset] === value)) return index;
  }
  return -1;
}

/** 파일 끝에서 거슬러 올라가며 "끝 기록" 위치를 찾는다. 없으면 -1. */
function findEndOfCentralDirectory(zip: Uint8Array, view: DataView): number {
  const first = zip.byteLength - END_OF_CENTRAL_DIRECTORY_MIN_BYTES;
  const last = Math.max(0, zip.byteLength - END_OF_CENTRAL_DIRECTORY_SEARCH_BYTES);
  for (let offset = first; offset >= last; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset;
  }
  return -1;
}

function isModelDataEntry(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === MODEL_DATA_ENTRY || lower.endsWith(`/${MODEL_DATA_ENTRY}`);
}

/**
 * ZIP 중앙 디렉터리가 선언한 model.dat 의 압축 해제 크기(바이트). 읽을 수 없거나 확실하지 않으면 null.
 * 읽는 양은 파일 끝 최대 64KiB 와 중앙 디렉터리뿐이라 파일이 커도 비용이 거의 없다.
 */
export function readStudioBg3dSkpModelDataSize(bytes: Uint8Array): number | null {
  const zipStart = indexOfLocalHeader(bytes);
  if (zipStart < 0) return null;
  const zip = bytes.subarray(zipStart);
  if (zip.byteLength < END_OF_CENTRAL_DIRECTORY_MIN_BYTES) return null;
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = findEndOfCentralDirectory(zip, view);
  if (end < 0) return null;

  const entryCount = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (directorySize === ZIP64_MARKER || directoryOffset === ZIP64_MARKER) return null;
  const directoryEnd = directoryOffset + directorySize;
  if (directoryEnd > zip.byteLength) return null;

  const decoder = new TextDecoder("utf-8");
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + CENTRAL_ENTRY_MIN_BYTES > directoryEnd) return null;
    if (view.getUint32(offset, true) !== CENTRAL_ENTRY_SIGNATURE) return null;
    const nameStart = offset + CENTRAL_ENTRY_MIN_BYTES;
    const nameLength = view.getUint16(offset + 28, true);
    const next = nameStart + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (next > directoryEnd) return null;
    if (isModelDataEntry(decoder.decode(zip.subarray(nameStart, nameStart + nameLength)))) {
      const uncompressedSize = view.getUint32(offset + 24, true);
      return uncompressedSize === ZIP64_MARKER ? null : uncompressedSize;
    }
    offset = next;
  }
  return null;
}
