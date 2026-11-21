/**
 * IR 24장 대본과 화면의 일치를 확인하고, 검수된 Helio 음원만 설치한다.
 * 합성 API를 호출하거나 과금하지 않는다. 실제 합성/청취 증빙은 수령 매니페스트로 받는다.
 * 실행: node --import tsx scripts/prepare-ir-present-narration.mts --check-script
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";

import { IR_PRESENT_CONTENT_REVISION } from "../apps/web/src/domains/marketing/ir-present-narration";
import { IR_NARRATION_ASSETS } from "../apps/web/src/domains/marketing/ir-present-narration-assets.generated";
import { SCENE_META } from "../apps/web/src/domains/marketing/ir-present-scene-data";
import { SCENE_NODES_A } from "../apps/web/src/domains/marketing/ir-present-scenes-a";
import { SCENE_NODES_B } from "../apps/web/src/domains/marketing/ir-present-scenes-b";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = resolve(ROOT, "tools/media/ir-present/narration.ko.json");
const PUBLIC_DIR = resolve(ROOT, "apps/web/public/brand/ir-present/audio");
const RUNTIME_PATH = resolve(ROOT, "apps/web/src/domains/marketing/ir-present-narration-assets.generated.ts");
const SHA = z.string().regex(/^[a-f0-9]{64}$/u);
const VOICE = z.object({ provider: z.literal("Meta AI"), name: z.literal("Helio"), voiceId: z.literal("avocado_v2:MAI_03"), locale: z.literal("ko-KR") });
const SCREEN = z.object({ scene: z.number().int().min(1).max(24), title: z.string().min(1), markupSha256: SHA });
const SOURCE_FILE = z.object({ path: z.string().min(1), sha256: SHA });
const SPEC = z.object({
  version: z.literal(1), revision: z.string().min(1), locale: z.literal("ko-KR"), voice: VOICE,
  voiceBasis: z.string().min(1), status: z.literal("script-ready"),
  screenSources: z.array(SCREEN).length(24).optional(), sourceFiles: z.array(SOURCE_FILE).length(7).optional(), sourceSha256: SHA.optional(),
  scenes: z.array(z.object({ scene: z.number().int().min(1).max(24), audio: z.string(), text: z.string().min(30) })).length(24),
});
const RECEIPT = z.object({
  version: z.literal(1), contentRevision: z.string().min(1), sourceSha256: SHA, scriptSha256: SHA, voice: VOICE,
  rights: z.object({ commercialDistribution: z.literal(true), record: z.string().min(1), basis: z.string().min(1) }),
  cost: z.object({ additionalCharge: z.literal(0), currency: z.literal("KRW"), record: z.string().min(1) }),
  clips: z.array(z.object({
    scene: z.number().int().min(1).max(24), audio: z.string(), inputFile: z.string().min(1), fileSha256: SHA, textSha256: SHA,
    generationRecord: z.string().min(1),
    review: z.object({ matchesScript: z.literal(true), reviewedBy: z.string().min(1), reviewedAt: z.iso.datetime({ offset: true }) }),
  })).length(24),
});
export type NarrationSpec = z.infer<typeof SPEC>;
export type NarrationReceipt = z.infer<typeof RECEIPT>;
export const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

export function currentScreenSources(): z.infer<typeof SCREEN>[] {
  const nodes = [...SCENE_NODES_A, ...SCENE_NODES_B];
  if (nodes.length !== 24 || SCENE_META.length !== 24) throw new Error("IR 화면과 목차는 정확히 24장이어야 합니다.");
  return nodes.map((node, index) => ({ scene: index + 1, title: SCENE_META[index].title, markupSha256: sha256(renderToStaticMarkup(node)) }));
}

/** 기본 SSR에 나타나지 않는 파이프라인 탭과 데이터 변경도 포함한다. */
export function currentSourceFiles(): z.infer<typeof SOURCE_FILE>[] {
  return [
    "ir-present-scene-data.ts", "ir-present-scenes-a.tsx", "ir-present-scenes-b.tsx",
    "ir-present-pipeline-widget.tsx", "ir-pitch-data.ts", "product-tour-content.ts", "product-tour-asset.generated.ts",
  ].map((name) => {
    const path = `apps/web/src/domains/marketing/${name}`;
    return { path, sha256: sha256(readFileSync(resolve(ROOT, path))) };
  });
}

export function parseSpec(value: unknown): NarrationSpec {
  return SPEC.parse(value);
}

export function validateSpec(spec: NarrationSpec, sources = currentScreenSources(), sourceFiles = currentSourceFiles()): void {
  if (spec.revision !== IR_PRESENT_CONTENT_REVISION) throw new Error("대본 revision과 웹 발표 revision이 다릅니다.");
  for (const [index, scene] of spec.scenes.entries()) {
    if (scene.scene !== index + 1 || scene.audio !== SCENE_META[index].audio) throw new Error(`대본 ${index + 1}장의 순서 또는 음원 이름이 다릅니다.`);
  }
  const digest = sha256(JSON.stringify({ sources, sourceFiles }));
  if (spec.sourceSha256 !== digest || JSON.stringify(spec.screenSources) !== JSON.stringify(sources)
    || JSON.stringify(spec.sourceFiles) !== JSON.stringify(sourceFiles)) {
    throw new Error("화면 문안이 대본 검토 시점과 다릅니다. 대본을 검토한 뒤 --refresh-source를 실행하세요.");
  }
}

export function scriptDigest(spec: NarrationSpec): string {
  return sha256(JSON.stringify({ revision: spec.revision, voice: spec.voice, scenes: spec.scenes }));
}

export function validateReceipt(spec: NarrationSpec, value: unknown): NarrationReceipt {
  validateSpec(spec);
  const receipt = RECEIPT.parse(value);
  if (receipt.contentRevision !== spec.revision || receipt.sourceSha256 !== spec.sourceSha256 || receipt.scriptSha256 !== scriptDigest(spec)) {
    throw new Error("음원 수령 증빙의 화면·대본 해시가 현재 검토본과 다릅니다.");
  }
  for (const [index, clip] of receipt.clips.entries()) {
    const scene = spec.scenes[index];
    if (clip.scene !== scene.scene || clip.audio !== scene.audio || clip.textSha256 !== sha256(scene.text)) {
      throw new Error(`음원 ${index + 1}장의 순서 또는 대본 해시가 다릅니다.`);
    }
    if (basename(clip.inputFile) !== clip.inputFile || !/\.(wav|mp3|m4a)$/iu.test(clip.inputFile)) {
      throw new Error(`음원 ${index + 1}장의 inputFile은 입력 폴더 안의 WAV·MP3·M4A 파일명이어야 합니다.`);
    }
  }
  return receipt;
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${command} 실행 실패: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}

export function verifyInputAudio(inputDir: string, clip: NarrationReceipt["clips"][number]): string {
  const path = resolve(inputDir, clip.inputFile);
  if (!existsSync(path) || sha256(readFileSync(path)) !== clip.fileSha256) throw new Error(`${clip.audio}: 입력 음원이 없거나 파일 해시가 다릅니다.`);
  return path;
}

function probeAudio(path: string): number {
  const result = z.object({ format: z.object({ duration: z.string() }), streams: z.array(z.object({ codec_type: z.string() })) }).parse(JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", path])));
  const duration = Number(result.format.duration);
  if (result.streams.filter((stream) => stream.codec_type === "audio").length !== 1 || !Number.isFinite(duration) || duration < 3 || duration > 180) {
    throw new Error(`${basename(path)}: 음성 1개와 3~180초 길이 조건을 확인하세요.`);
  }
  run("ffmpeg", ["-nostdin", "-v", "error", "-i", path, "-f", "null", "-"]);
  return duration;
}

function runtimeSource(manifest: typeof IR_NARRATION_ASSETS): string {
  return `/** scripts/prepare-ir-present-narration.mts가 검증한 음원을 설치할 때 갱신한다. */\nexport const IR_NARRATION_ASSETS: {\n  status: "unverified" | "verified";\n  contentRevision: string | null;\n  sourceSha256: string | null;\n  scriptSha256: string | null;\n  clips: { audio: string; sha256: string; duration: number }[];\n} = ${JSON.stringify(manifest, null, 2)};\n`;
}

export function assembleAudio(spec: NarrationSpec, receiptValue: unknown, inputDir: string, dryRun: boolean): void {
  const receipt = validateReceipt(spec, receiptValue);
  const inputs = receipt.clips.map((clip) => verifyInputAudio(inputDir, clip));
  inputs.forEach(probeAudio);
  if (dryRun) { console.log(`검수 증빙과 입력 음원 ${inputs.length}개를 확인했습니다. 파일은 변경하지 않았습니다.`); return; }
  const stage = mkdtempSync(resolve(tmpdir(), "toonstudio-ir-narration-"));
  try {
    const clips = receipt.clips.map((clip, index) => {
      const output = resolve(stage, clip.audio);
      run("ffmpeg", ["-nostdin", "-v", "error", "-y", "-i", inputs[index], "-map_metadata", "-1", "-vn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=6", "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", output]);
      return { audio: clip.audio, sha256: sha256(readFileSync(output)), duration: probeAudio(output) };
    });
    const manifest: typeof IR_NARRATION_ASSETS = { status: "verified", contentRevision: spec.revision, sourceSha256: receipt.sourceSha256, scriptSha256: receipt.scriptSha256, clips };
    mkdirSync(PUBLIC_DIR, { recursive: true });
    for (const clip of clips) copyFileSync(resolve(stage, clip.audio), resolve(PUBLIC_DIR, clip.audio));
    // 원본 수령 증빙은 입력 경로에 보존하고, 공개 자산에는 개인 정보·공급자 URL 대신 해시만 기록한다.
    writeFileSync(resolve(PUBLIC_DIR, "narration-manifest.json"), `${JSON.stringify({ ...manifest, voice: receipt.voice, receiptSha256: sha256(JSON.stringify(receipt)) }, null, 2)}\n`);
    writeFileSync(RUNTIME_PATH, runtimeSource(manifest));
    console.log(`검수된 Helio 음원 ${clips.length}개를 설치했습니다. 변경 파일과 플레이어를 검증한 후 커밋하세요.`);
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

function exportScripts(spec: NarrationSpec, output: string): void {
  validateSpec(spec);
  mkdirSync(output, { recursive: true });
  for (const scene of spec.scenes) writeFileSync(resolve(output, scene.audio.replace(/\.mp3$/u, ".txt")), `${scene.text}\n`);
  const template = {
    version: 1, contentRevision: spec.revision, sourceSha256: spec.sourceSha256, scriptSha256: scriptDigest(spec), voice: spec.voice,
    rights: { commercialDistribution: false, record: "", basis: "" },
    cost: { additionalCharge: null, currency: "KRW", record: "" },
    clips: spec.scenes.map((scene) => ({ scene: scene.scene, audio: scene.audio, inputFile: scene.audio, fileSha256: "", textSha256: sha256(scene.text), generationRecord: "", review: { matchesScript: false, reviewedBy: "", reviewedAt: "" } })),
  };
  writeFileSync(resolve(output, "receipt.template.json"), `${JSON.stringify(template, null, 2)}\n`);
  console.log(`합성용 대본 24개와 미검증 수령 증빙 템플릿을 내보냈습니다: ${output}`);
}

function checkInstalled(spec: NarrationSpec): void {
  validateSpec(spec);
  if (IR_NARRATION_ASSETS.status !== "verified" || IR_NARRATION_ASSETS.contentRevision !== spec.revision || IR_NARRATION_ASSETS.sourceSha256 !== spec.sourceSha256 || IR_NARRATION_ASSETS.scriptSha256 !== scriptDigest(spec) || IR_NARRATION_ASSETS.clips.length !== 24) {
    throw new Error("현재 대본에 맞는 검수 완료 음원이 아직 설치되지 않았습니다. 대본 준비와 음원 완료를 구분하세요.");
  }
  for (const [index, clip] of IR_NARRATION_ASSETS.clips.entries()) {
    if (clip.audio !== spec.scenes[index].audio) throw new Error("설치 음원 순서가 다릅니다.");
    const path = resolve(PUBLIC_DIR, clip.audio);
    if (sha256(readFileSync(path)) !== clip.sha256 || Math.abs(probeAudio(path) - clip.duration) > 0.05) throw new Error(`${clip.audio}: 설치 음원 해시 또는 길이가 다릅니다.`);
  }
  console.log("현재 화면·대본·설치 음원 24개가 일치합니다.");
}

export function main(args: string[]): void {
  const spec = parseSpec(JSON.parse(readFileSync(SPEC_PATH, "utf8")));
  if (args.length === 1 && args[0] === "--refresh-source") {
    const sources = currentScreenSources();
    const sourceFiles = currentSourceFiles();
    spec.screenSources = sources;
    spec.sourceFiles = sourceFiles;
    spec.sourceSha256 = sha256(JSON.stringify({ sources, sourceFiles }));
    writeFileSync(SPEC_PATH, `${JSON.stringify(spec, null, 2)}\n`);
    if (IR_NARRATION_ASSETS.status === "verified" && (IR_NARRATION_ASSETS.sourceSha256 !== spec.sourceSha256 || IR_NARRATION_ASSETS.scriptSha256 !== scriptDigest(spec))) {
      writeFileSync(RUNTIME_PATH, runtimeSource({ status: "unverified", contentRevision: null, sourceSha256: null, scriptSha256: null, clips: [] }));
    }
    console.log("검토한 화면의 해시를 대본에 기록했습니다. 기존 합성 증빙은 새 해시와 일치해야 합니다.");
  } else if (args.length === 1 && args[0] === "--check-script") {
    validateSpec(spec);
    console.log(JSON.stringify({ scriptReady: true, audioVerified: IR_NARRATION_ASSETS.status === "verified", scenes: spec.scenes.length, sourceSha256: spec.sourceSha256, scriptSha256: scriptDigest(spec) }, null, 2));
  } else if (args.length === 1 && args[0] === "--check") {
    checkInstalled(spec);
  } else if (args.length === 2 && args[0] === "--export") {
    exportScripts(spec, resolve(args[1]));
  } else if ((args.length === 4 || (args.length === 5 && args[4] === "--dry-run")) && args[0] === "--receipt" && args[2] === "--input-dir") {
    assembleAudio(spec, JSON.parse(readFileSync(resolve(args[1]), "utf8")), resolve(args[3]), args[4] === "--dry-run");
  } else throw new Error("사용법: --check-script | --refresh-source | --export <폴더> | --check | --receipt <JSON> --input-dir <폴더> [--dry-run]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
