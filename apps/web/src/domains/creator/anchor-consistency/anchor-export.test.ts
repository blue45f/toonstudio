import { describe, expect, it } from "vitest";

import { readStudioZipArchive } from "../studio-zip-reader";

import { ANCHOR_ANGLE_IDS, type AnchorAngleId } from "./anchor-capture-spec";
import { createAnchorCaptureSet, type AnchorCaptureSet } from "./anchor-capture-set";
import type { AnchorCapturedFrame } from "./anchor-capture-session";
import {
  ANCHOR_EXPORT_NOTICE_KO,
  ANCHOR_EXPORT_PATHS,
  ANCHOR_EXPORT_SCHEMA,
  ANCHOR_REFERENCE_PACK_SCHEMA,
  anchorFrameDownload,
  buildAnchorExportZip,
  planAnchorExport,
  type AnchorExportInput,
  type AnchorShotFrame,
} from "./anchor-export";
import { ANCHOR_RIGHTS_STATEMENT_KO, createAnchorRights } from "./anchor-rights";
import { fakeCapturedFrame, fakeFullFrameSet, fakePngBytes } from "./anchor-test-kit";
import { anchorTextSha256 } from "./anchor-capture-set";

const RIGHTS = createAnchorRights({ confirmed: true, attestedAt: "2026-10-22T00:00:00Z", anchorId: "hero-01", sourceCharacterId: "char-7" });

function setOf(frames: readonly AnchorCapturedFrame[], anchorId = "hero-01"): AnchorCaptureSet {
  return createAnchorCaptureSet(
    { anchorId, sourceCharacterId: "char-7" },
    frames.map((frame) => ({
      angleId: frame.angleId,
      mimeType: frame.mimeType,
      width: frame.width,
      height: frame.height,
      byteLength: frame.byteLength,
      imageSha256: frame.imageSha256,
    })),
  );
}

function inputOf(angles: readonly AnchorAngleId[] = ANCHOR_ANGLE_IDS, shots: readonly AnchorShotFrame[] = []): AnchorExportInput {
  const frames = fakeFullFrameSet().filter((frame) => angles.includes(frame.angleId));
  return { set: setOf(frames), frames, rights: RIGHTS, origin: "file", shots };
}

function shotFrame(shotId: string, kind: "pose" | "composition", seed: number): AnchorShotFrame {
  const bytes = fakePngBytes(1024, 1024, seed, 80);
  return {
    capture: { shotId, kind, mimeType: "image/png", width: 1024, height: 1024, byteLength: bytes.byteLength, imageSha256: anchorTextSha256(`shot-${seed}`) },
    bytes,
  };
}

function textOf(plan: ReturnType<typeof planAnchorExport>, path: string): string {
  const file = plan.files.find((item) => item.path === path);
  if (!file || typeof file.data !== "string") throw new Error(`${path} 텍스트 파일이 없어요`);
  return file.data;
}

describe("planAnchorExport", () => {
  it("이미지와 안내 파일을 정해진 경로에 놓는다", () => {
    const plan = planAnchorExport(inputOf());
    const paths = plan.files.map((file) => file.path);
    expect(paths.filter((path) => path.startsWith(ANCHOR_EXPORT_PATHS.imagesDir))).toHaveLength(6);
    expect(paths.slice(-4)).toEqual([
      ANCHOR_EXPORT_PATHS.manifest,
      ANCHOR_EXPORT_PATHS.rights,
      ANCHOR_EXPORT_PATHS.referencePack,
      ANCHOR_EXPORT_PATHS.readme,
    ]);
    expect(new Set(paths).size).toBe(paths.length);
    expect(plan.fileName).toMatch(/^hero-01\.anchor-set\.[0-9a-f]{8}\.zip$/u);
  });

  it("같은 입력이면 같은 내용을 만든다(생성 시각이 들어가지 않는다)", () => {
    const first = planAnchorExport(inputOf());
    const second = planAnchorExport(inputOf());
    expect(second.fileName).toBe(first.fileName);
    for (const file of first.files) {
      const other = second.files.find((item) => item.path === file.path);
      expect(other?.data).toEqual(file.data);
    }
    const manifest = textOf(first, ANCHOR_EXPORT_PATHS.manifest);
    expect(manifest).not.toMatch(/\d{4}-\d{2}-\d{2}T/u);
    expect(textOf(first, ANCHOR_EXPORT_PATHS.referencePack)).not.toMatch(/\d{4}-\d{2}-\d{2}T/u);
  });

  it("세트 정보에 해시·각도·권리 문장·한계 안내를 남긴다", () => {
    const input = inputOf();
    const manifest = JSON.parse(textOf(planAnchorExport(input), ANCHOR_EXPORT_PATHS.manifest)) as {
      schema: string; setHash: string; anchorId: string; sourceCharacterId: string;
      entries: { angleId: string; file: string; origin: string }[];
      rights: { statement: string; biometricProcessing: string; virtualCharacterOnly: boolean };
      notice: string; completeness: { status: string };
    };
    expect(manifest.schema).toBe(ANCHOR_EXPORT_SCHEMA);
    expect(manifest.setHash).toBe(input.set.setHash);
    expect(manifest.anchorId).toBe("hero-01");
    expect(manifest.sourceCharacterId).toBe("char-7");
    expect(manifest.entries.map((entry) => entry.angleId)).toEqual([...ANCHOR_ANGLE_IDS]);
    expect(manifest.entries.every((entry) => entry.file.startsWith("images/") && entry.origin === "file")).toBe(true);
    expect(manifest.rights.statement).toBe(ANCHOR_RIGHTS_STATEMENT_KO);
    expect(manifest.rights).toMatchObject({ biometricProcessing: "none", virtualCharacterOnly: true });
    expect(manifest.notice).toBe(ANCHOR_EXPORT_NOTICE_KO);
    expect(manifest.completeness.status).toBe("complete");
  });

  it("한계 안내는 일관성 보장이나 동일인 판정을 말하지 않는다", () => {
    const plan = planAnchorExport(inputOf());
    const readme = textOf(plan, ANCHOR_EXPORT_PATHS.readme);
    expect(readme).toContain("보장은 없고");
    expect(readme).toContain("판정하는 값이 아니에요");
    expect(readme).toContain("얼굴 인식과 생체 정보 추출을 쓰지 않아요");
    expect(readme).not.toMatch(/동일인|일관성을 보장해요|같은 캐릭터임을 보장/u);
  });

  it("권리 확인 기록을 그대로 담는다", () => {
    const rights = JSON.parse(textOf(planAnchorExport(inputOf()), ANCHOR_EXPORT_PATHS.rights)) as typeof RIGHTS;
    expect(rights).toMatchObject({ confirmed: true, virtualCharacterOnly: true, biometricProcessing: "none", anchorId: "hero-01" });
  });

  it("참조 팩 문서에 앵커 여섯 장을 character 로 더하고 이진 데이터는 담지 않는다", () => {
    const plan = planAnchorExport(inputOf());
    const pack = JSON.parse(textOf(plan, ANCHOR_EXPORT_PATHS.referencePack)) as {
      schema: string;
      document: { version: number; references: { id: string; role: string; asset: { assetId: string; sha256: string } }[] };
      assets: { assetId: string; rights: { rightsConfirmed: boolean } }[];
    };
    expect(pack.schema).toBe(ANCHOR_REFERENCE_PACK_SCHEMA);
    expect(pack.document.version).toBe(1);
    expect(pack.document.references).toHaveLength(6);
    expect(pack.document.references.every((reference) => reference.role === "character")).toBe(true);
    expect(pack.assets.every((asset) => asset.rights.rightsConfirmed)).toBe(true);
    expect(JSON.stringify(pack)).not.toContain("base64");
    expect(plan.referencePack.skipped).toEqual([]);
  });

  it("샷 포즈·구도 이미지는 method 참조로 더하고 shots 경로에 놓는다", () => {
    const plan = planAnchorExport(inputOf(ANCHOR_ANGLE_IDS, [shotFrame("s1-pose", "pose", 11), shotFrame("s1-composition", "composition", 12)]));
    const shotPaths = plan.files.map((file) => file.path).filter((path) => path.startsWith("shots/"));
    expect(shotPaths).toHaveLength(2);
    expect(shotPaths[0]).toMatch(/^shots\/s1-pose\.pose\.[0-9a-f]{8}\.png$/u);
    expect(plan.referencePack.document.references.filter((reference) => reference.role === "method")).toHaveLength(2);
    expect(textOf(plan, ANCHOR_EXPORT_PATHS.readme)).toContain("샷 포즈·구도 이미지 2장");
  });

  it("일부 각도만 있으면 완전성 경고를 세트 정보에 남긴다", () => {
    const plan = planAnchorExport(inputOf(["front", "left"]));
    expect(plan.completeness.status).toBe("partial");
    const manifest = JSON.parse(textOf(plan, ANCHOR_EXPORT_PATHS.manifest)) as { completeness: { missing: string[]; issues: { code: string }[] } };
    expect(manifest.completeness.missing).toContain("back");
    expect(manifest.completeness.issues.map((issue) => issue.code)).toContain("missing-mirror-pair");
  });

  it("세트와 프레임이 어긋나면 만들지 않는다", () => {
    const input = inputOf();
    const stale = input.frames.map((frame) => (frame.angleId === "back" ? fakeCapturedFrame("back", { seed: 99 }) : frame));
    expect(() => planAnchorExport({ ...input, frames: stale })).toThrow(RangeError);
  });
});

describe("buildAnchorExportZip", () => {
  it("계획한 파일을 그대로 담은 ZIP 을 만들고 읽어서 확인할 수 있다", async () => {
    const input = inputOf(ANCHOR_ANGLE_IDS, [shotFrame("s2-pose", "pose", 21)]);
    const progress: number[] = [];
    const zip = await buildAnchorExportZip(input, {
      crc32ExecutionMode: "direct-headless",
      onProgress: (item) => { progress.push(item.completedFiles); },
    });
    expect(zip.blob.type).toBe("application/zip");
    expect(zip.fileName).toBe(zip.plan.fileName);
    expect(progress.at(-1)).toBe(zip.plan.files.length);
    const archive = await readStudioZipArchive(zip.blob);
    expect(archive.entries.map((entry) => entry.path)).toEqual(zip.plan.files.map((file) => file.path));
    const front = zip.plan.files.find((file) => file.path.includes(".front."));
    const frontBytes = await archive.readEntry(front?.path ?? "");
    expect(frontBytes).toEqual(front?.data);
    const manifestBytes = await archive.readEntry(ANCHOR_EXPORT_PATHS.manifest);
    expect(new TextDecoder().decode(manifestBytes)).toBe(textOf(zip.plan, ANCHOR_EXPORT_PATHS.manifest));
  });

  it("같은 입력의 ZIP 바이트는 같다", async () => {
    const options = { crc32ExecutionMode: "direct-headless" } as const;
    const first = await buildAnchorExportZip(inputOf(), options);
    const second = await buildAnchorExportZip(inputOf(), options);
    expect(new Uint8Array(await second.blob.arrayBuffer())).toEqual(new Uint8Array(await first.blob.arrayBuffer()));
  });

  it("취소하면 ZIP 을 만들지 않고 끝난다", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(buildAnchorExportZip(inputOf(), { signal: controller.signal, crc32ExecutionMode: "direct-headless" })).rejects.toBeDefined();
  });
});

describe("anchorFrameDownload", () => {
  it("원본 형식 그대로, 세트 파일 이름 규칙으로 준비한다", async () => {
    const frame = fakeCapturedFrame("left-34");
    const download = anchorFrameDownload("hero-01", frame);
    expect(download.fileName).toBe(`hero-01.left-34.${frame.imageSha256.slice(0, 8)}.png`);
    expect(download.blob.type).toBe("image/png");
    expect(new Uint8Array(await download.blob.arrayBuffer())).toEqual(frame.bytes);
  });
});
