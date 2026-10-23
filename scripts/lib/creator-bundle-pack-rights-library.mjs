/**
 * creator-bundle-pack-rights-library.mjs
 *
 * 원장이 기록한 로컬 라이선스 문서(해시)를 라이브러리 트리의 실물과 다시 대조한다 (읽기 전용).
 * 서빙 판정과 원장 검증은 파일을 읽지 않는다 — 이 모듈은 검증 CLI(--library-root)와 테스트만 쓴다.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateRawSync } from "node:zlib";

import { isRecord, relativePathProblem } from "./creator-bundle-pack-rights-form.mjs";

/**
 * zip 안의 멤버 하나를 꺼낸다 (저장·deflate만 지원, 없으면 null). 라이선스 문서가 `Blend Textures.zip`
 * 같은 압축 파일 안에만 있는 팩의 증빙을 외부 도구 없이 다시 대조하려고 둔 최소 구현이다.
 */
export function readZipMember(buffer, memberName) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (name === memberName) {
      const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      return null;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/**
 * 원장이 기록한 로컬 라이선스 문서(해시)가 라이브러리 트리의 실물과 일치하는지 다시 대조한다.
 * 반환: { checked, mismatches } — mismatches가 비면 79개 문서와 zip 안 사본이 모두 기록과 같다.
 * 검증을 거치지 않은(깨진) 원장이 들어와도 던지지 않는다: 모양이 틀린 항목과 라이브러리 밖을 가리키는 경로(`..`·절대
 * 경로·역슬래시)는 파일을 읽지 않고 불일치(malformed·unsafe-path)로 보고한다.
 */
export function verifyLocalLicenseEvidence({ ledger, libraryRoot, readFile = readFileSync }) {
  const mismatches = [];
  let checked = 0;
  const sha256Of = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const report = (path, expected, actual, reason) => mismatches.push({ path, expected, actual, reason });
  for (const text of Array.isArray(ledger?.licenseTexts) ? ledger.licenseTexts : []) {
    if (!isRecord(text)) {
      checked += 1;
      report("(licenseTexts 항목)", null, null, "malformed");
      continue;
    }
    for (const file of Array.isArray(text.files) ? text.files : []) {
      checked += 1;
      if (!isRecord(file) || relativePathProblem(file.libraryPath) !== null) {
        report(String(file?.libraryPath), text.sha256, null, isRecord(file) ? "unsafe-path" : "malformed");
        continue;
      }
      let actual;
      try {
        actual = sha256Of(readFile(resolve(libraryRoot, file.libraryPath)));
      } catch {
        report(file.libraryPath, text.sha256, null, "missing");
        continue;
      }
      if (actual !== text.sha256) report(file.libraryPath, text.sha256, actual, "hash-mismatch");
    }
    for (const file of Array.isArray(text.archivedFiles) ? text.archivedFiles : []) {
      checked += 1;
      if (!isRecord(file) || relativePathProblem(file.libraryPath) !== null || relativePathProblem(file.member) !== null) {
        report(`${String(file?.libraryPath)}::${String(file?.member)}`, text.sha256, null, isRecord(file) ? "unsafe-path" : "malformed");
        continue;
      }
      const label = `${file.libraryPath}::${file.member}`;
      let member;
      try {
        member = readZipMember(readFile(resolve(libraryRoot, file.libraryPath)), file.member);
      } catch {
        member = null;
      }
      if (!member) {
        report(label, text.sha256, null, "missing");
        continue;
      }
      const actual = sha256Of(member);
      if (actual !== text.sha256) report(label, text.sha256, actual, "hash-mismatch");
    }
  }
  return { checked, mismatches };
}
