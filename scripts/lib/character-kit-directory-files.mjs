import { createHash } from "node:crypto";

import {
  KIT_BASE_IDS, KIT_DEFAULT_ID, KIT_MANIFEST_FILENAME, KIT_PORTRAIT_VERSION, KIT_SWEPT_HAIR_VERSION, KIT_V2_SCHEMA_ID,
  kitManifestFilename, kitManifestSchema, kitManifestV2Schema,
} from "../../apps/character-lab/src/contracts/index.ts";

function declaredFiles(manifest) {
  const files = [];
  for (const baseId of KIT_BASE_IDS) {
    const base = manifest.bases[baseId];
    if (base !== undefined) files.push(base.file);
    if (base?.headRegionMask !== undefined) files.push(base.headRegionMask.file);
  }
  for (const part of manifest.parts) for (const baseId of KIT_BASE_IDS) {
    const variant = part.variants[baseId];
    if (variant !== undefined) files.push(variant.file);
    for (const layered of Object.values(part.layerVariants?.[baseId] ?? {})) {
      if (layered !== undefined) files.push(layered.file);
    }
  }
  return files;
}

/** 같은 폴더에 출하한 등록 판만 허용하며, 다른 판의 파일도 무결성 검사를 통과해야 한다. */
function readCompanionManifest(source, report, version) {
  const filename = kitManifestFilename(KIT_DEFAULT_ID, version);
  const bytes = source.read(filename);
  if (bytes === null) return null;
  try {
    const raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    const schema = raw?.schema === KIT_V2_SCHEMA_ID ? kitManifestV2Schema : kitManifestSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new Error(parsed.error.issues.slice(0, 5).map((issue) => issue.message).join("; "));
    if (parsed.data.kitId !== KIT_DEFAULT_ID || parsed.data.kitVersion !== version) {
      throw new Error("등록된 키트 ID·판 번호와 다릅니다.");
    }
    return { filename, manifest: parsed.data };
  } catch (error) {
    report.error("V2", filename, `동반 키트 명세를 해석하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export function checkKitDirectoryFiles(source, manifest, report) {
  const referenced = new Set(declaredFiles(manifest).map((file) => file.path));
  const known = new Set([KIT_MANIFEST_FILENAME, manifest.provenance.noticeFile]);
  for (const version of [KIT_PORTRAIT_VERSION, KIT_SWEPT_HAIR_VERSION]) {
    const companion = readCompanionManifest(source, report, version);
    if (companion === null) continue;
    const portraitManifest = kitManifestFilename(KIT_DEFAULT_ID, KIT_PORTRAIT_VERSION);
    if (version === KIT_SWEPT_HAIR_VERSION && !known.has(portraitManifest)) {
      report.error("V2", portraitManifest, "기존 2판 레시피를 다시 열 수 있도록 이전 판 명세를 함께 출하해야 합니다.");
    }
    known.add(companion.filename);
    known.add(companion.manifest.provenance.noticeFile);
    if (source.read(companion.manifest.provenance.noticeFile) === null) {
      report.error("V2", companion.manifest.provenance.noticeFile, `${companion.filename}의 출처 안내 파일이 없습니다.`);
    }
    for (const file of declaredFiles(companion.manifest)) {
      referenced.add(file.path);
      const bytes = source.read(file.path);
      if (bytes === null) {
        report.error("V2", file.path, `${companion.filename}에 선언한 파일이 없습니다(kit-file-fetch-failed).`);
        continue;
      }
      if (bytes.length !== file.bytes) report.error("V2", file.path, `${companion.filename}의 파일 크기와 다릅니다(kit-bytes-mismatch).`);
      if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
        report.error("V2", file.path, `${companion.filename}의 SHA-256과 다릅니다(kit-sha-mismatch).`);
      }
    }
  }
  const lower = new Map();
  for (const relative of source.list()) {
    if (!referenced.has(relative) && !known.has(relative)) {
      report.error("V2", relative, "kit.json이 모르는 파일입니다(등록된 판의 명세·출처 안내·선언 파일만 둘 수 있습니다).");
    }
    const key = relative.toLowerCase();
    if (lower.has(key)) report.error("V2", relative, `대소문자만 다른 중복 경로입니다(${lower.get(key)}).`);
    lower.set(key, relative);
  }
}
