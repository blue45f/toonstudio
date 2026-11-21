import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ROOT, currentScreenSources, currentSourceFiles, parseSpec, scriptDigest, sha256, validateReceipt, validateSpec, verifyInputAudio,
} from "./prepare-ir-present-narration.mts";

const spec = parseSpec(JSON.parse(readFileSync(resolve(ROOT, "tools/media/ir-present/narration.ko.json"), "utf8")));
const makeReceipt = () => ({
  version: 1, contentRevision: spec.revision, sourceSha256: spec.sourceSha256, scriptSha256: scriptDigest(spec), voice: spec.voice,
  rights: { commercialDistribution: true, record: "테스트용 권리 증빙", basis: "검증기 테스트 입력이며 배포하지 않음" },
  cost: { additionalCharge: 0, currency: "KRW", record: "테스트용 무료 범위 증빙" },
  clips: spec.scenes.map((scene) => ({
    scene: scene.scene, audio: scene.audio, inputFile: scene.audio, fileSha256: "a".repeat(64), textSha256: sha256(scene.text),
    generationRecord: "테스트용 합성 영수증", review: { matchesScript: true, reviewedBy: "테스트 검수자", reviewedAt: "2026-11-21T22:00:00+09:00" },
  })),
});

describe("IR 내레이션 대본과 수령 증빙", () => {
  it("현재 웹 발표 24장의 순서와 화면 해시를 대본에 연결한다", () => {
    expect(currentScreenSources()).toHaveLength(24);
    expect(() => validateSpec(spec)).not.toThrow();
    expect(spec.status).toBe("script-ready");
    expect(spec.scenes[17].text).toContain("9분 18초");
    expect(spec.scenes[17].text).toContain("5분 54초");
    expect(spec.scenes[17].text).toContain("6분 48초");
    expect(spec.scenes[20].text).toContain("확정 가격이 아닙니다");
  });

  it("화면이 바뀌면 검토한 대본을 그대로 재사용할 수 없다", () => {
    const changed = currentScreenSources();
    changed[4] = { ...changed[4], markupSha256: "b".repeat(64) };
    expect(() => validateSpec(spec, changed)).toThrow("화면 문안");
  });

  it("기본 화면에 보이지 않는 파이프라인 탭의 소스 변경도 감지한다", () => {
    const sources = currentScreenSources();
    const sourceFiles = currentSourceFiles().map((file) => file.path.endsWith("ir-present-pipeline-widget.tsx")
      ? { ...file, sha256: sha256("숨은 드로잉 탭 문안 변경") } : file);
    expect(sources).toEqual(spec.screenSources);
    expect(() => validateSpec(spec, sources, sourceFiles)).toThrow("화면 문안");
  });

  it("장면이 빠지거나 순서가 바뀐 대본을 거부한다", () => {
    expect(() => parseSpec({ ...spec, scenes: spec.scenes.slice(1) })).toThrow();
    const changed = { ...spec, scenes: [...spec.scenes].reverse() };
    expect(() => validateSpec(changed)).toThrow("순서");
  });

  it("현재 대본과 24개 검수 증빙이 모두 일치할 때만 수령을 허용한다", () => {
    expect(validateReceipt(spec, makeReceipt()).clips).toHaveLength(24);
  });

  it("이전 화면·대본 해시, 다른 음성, 추가 과금, 미확인 권리를 거부한다", () => {
    const receipt = makeReceipt();
    expect(() => validateReceipt(spec, { ...receipt, sourceSha256: "b".repeat(64) })).toThrow("해시");
    expect(() => validateReceipt(spec, { ...receipt, scriptSha256: "b".repeat(64) })).toThrow("해시");
    expect(() => validateReceipt(spec, { ...receipt, voice: { ...receipt.voice, name: "다른 음성" } })).toThrow();
    expect(() => validateReceipt(spec, { ...receipt, cost: { ...receipt.cost, additionalCharge: 1 } })).toThrow();
    expect(() => validateReceipt(spec, { ...receipt, rights: { ...receipt.rights, commercialDistribution: false } })).toThrow();
  });

  it("청취 미확인, 다른 텍스트, 누락된 장면, 입력 폴더 이탈을 거부한다", () => {
    const receipt = makeReceipt();
    const replaceFirst = (first: unknown) => ({ ...receipt, clips: [first, ...receipt.clips.slice(1)] });
    expect(() => validateReceipt(spec, replaceFirst({ ...receipt.clips[0], review: { ...receipt.clips[0].review, matchesScript: false } }))).toThrow();
    expect(() => validateReceipt(spec, replaceFirst({ ...receipt.clips[0], textSha256: "b".repeat(64) }))).toThrow("대본 해시");
    expect(() => validateReceipt(spec, { ...receipt, clips: receipt.clips.slice(1) })).toThrow();
    expect(() => validateReceipt(spec, replaceFirst({ ...receipt.clips[0], inputFile: "../n01.mp3" }))).toThrow("파일명");
  });

  it("실제 음원 바이트가 수령 증빙과 다르거나 파일이 없으면 중단한다", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "ir-narration-input-test-"));
    try {
      const receipt = validateReceipt(spec, makeReceipt());
      const clip = { ...receipt.clips[0], fileSha256: sha256("테스트용 바이트") };
      expect(() => verifyInputAudio(dir, clip)).toThrow("입력 음원");
      writeFileSync(resolve(dir, clip.inputFile), "테스트용 바이트");
      expect(verifyInputAudio(dir, clip)).toBe(resolve(dir, clip.inputFile));
      writeFileSync(resolve(dir, clip.inputFile), "다른 바이트");
      expect(() => verifyInputAudio(dir, clip)).toThrow("파일 해시");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
