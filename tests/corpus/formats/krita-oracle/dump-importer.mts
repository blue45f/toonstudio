// 코퍼스의 .kra/.krz를 importKra로 읽어 JSON으로 덤프한다. 정답(*.truth.json)과의 대조는 compare_importer.py가 한다.
// 사용법: pnpm exec tsx tests/corpus/formats/krita-oracle/dump-importer.mts <코퍼스 디렉터리> <덤프 디렉터리>
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

import { applyKraTransparencyMasks, importKra, KraError } from "../../../../packages/studio-format-gateway/src/kra-document";

const corpus = process.argv[2]!;
const outDir = process.argv[3]!;
mkdirSync(outDir, { recursive: true });
const sha = (b: Uint8Array | null) => (b === null ? null : createHash("sha256").update(b).digest("hex"));
let failures = 0;
for (const name of readdirSync(corpus).sort()) {
  if (!/\.kr[az]$/u.test(name)) continue;
  const stem = basename(name).replace(/\.kr[az]$/u, "");
  const bytes = readFileSync(join(corpus, name));
  let record: unknown;
  try {
    const r = await importKra(new Uint8Array(bytes));
    record = {
      file: name,
      error: null,
      mimetype: r.mimetype,
      document: r.document,
      image: r.image,
      layers: r.layers.map((l) => ({
        index: l.index, parentIndex: l.parentIndex, depth: l.depth, kind: l.kind, nodeType: l.nodeType, name: l.name, uuid: l.uuid,
        filename: l.filename, visible: l.visible, effectiveVisible: l.effectiveVisible, locked: l.locked, collapsed: l.collapsed,
        passThrough: l.passThrough, opacity: l.opacity, opacityRaw: l.opacityRaw, compositeOp: l.compositeOp, compositeOpKnown: l.compositeOpKnown,
        colorLabel: l.colorLabel, inTimeline: l.inTimeline, offsetX: l.offsetX, offsetY: l.offsetY, colorSpace: l.colorSpace,
        masks: l.masks.map((m) => ({
          nodeType: m.nodeType, name: m.name, uuid: m.uuid, visible: m.visible, locked: m.locked, filename: m.filename,
          offsetX: m.offsetX, offsetY: m.offsetY, extent: m.extent, defaultValue: m.defaultValue, tileCount: m.tileCount,
          valuesB64: m.values === null ? null : Buffer.from(m.values).toString("base64"),
        })),
        extent: l.extent, defaultPixel: l.defaultPixel, tileCount: l.tileCount,
        pixelsB64: l.pixels === null ? null : Buffer.from(l.pixels).toString("base64"),
        // 마스크가 있는 레이어만: 보이는 투명도 마스크를 적용한 결과(status: applied | no-pixels | mask-unreadable)
        masked: l.masks.length === 0 ? null : (() => {
          const applied = applyKraTransparencyMasks(l);
          return applied.status === "applied"
            ? { status: applied.status, extent: applied.extent, appliedMasks: applied.appliedMasks, pixelsB64: Buffer.from(applied.pixels).toString("base64") }
            : applied;
        })(),
      })),
      mergedImagePngSha256: sha(r.mergedImagePng), previewPngSha256: sha(r.previewPng), iccSha256: sha(r.iccProfile),
      warnings: r.warnings, unsupported: r.unsupported, source: r.source,
    };
  } catch (error) {
    failures += 1;
    record = { file: name, error: error instanceof KraError ? { code: error.code, message: error.message } : { code: "non-kra-error", message: String(error) } };
  }
  writeFileSync(join(outDir, `${stem}.json`), JSON.stringify(record));
}
console.log(`dumped; failures=${failures}`);
