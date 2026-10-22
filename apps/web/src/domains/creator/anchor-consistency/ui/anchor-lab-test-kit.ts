/**
 * 앵커 연구실 화면 시험 도구 — 한국어 사전 조회, 브라우저 의존 가짜(객체 URL·디코더·ZIP), 공통 준비 흐름. 운영 코드가 가져오지 않는다.
 *
 * 화면 문구는 사전(public/i18n/app/anchorLab/ko.json)에서 읽어 와 시험이 문구를 중복해서 들고 있지 않게 한다. 디코더는 가짜 PNG
 * 헤더 바이트의 한 바이트로 합성 그림(anchor-synthetic-raster)을 골라 돌려준다.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, vi } from "vitest";

import { AnchorCaptureError } from "../anchor-capture-session";
import { ANCHOR_ANGLE_IDS } from "../anchor-capture-spec";
import type { AnchorCandidateDeps } from "../anchor-candidate-session";
import { buildAnchorExportZip } from "../anchor-export";
import { extractAnchorFeatures } from "../anchor-image-features";
import type { AnchorRaster } from "../anchor-raster";
import { fakePngBytes, fakePngFile } from "../anchor-test-kit";
import type { AnchorExportDeps } from "./use-anchor-export";

const KO = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "apps/web/public/i18n/app/anchorLab/ko.json"), "utf8"),
) as Record<string, string>;

/** `anchorLab.` 접두어를 뺀 키로 한국어 문구를 읽고 {자리표시}를 채운다. */
export function tk(key: string, values: Readonly<Record<string, string | number>> = {}): string {
  const template = KO[`anchorLab.${key}`];
  if (template === undefined) throw new Error(`사전에 없는 키: anchorLab.${key}`);
  return template.replace(/\{(\w+)\}/gu, (_, name: string) => String(values[name] ?? `{${name}}`));
}

/** jsdom 에는 객체 URL 이 없다. 호출 순서대로 가짜 URL 을 주고 해제 호출을 센다. */
export function stubObjectUrls(): { readonly revoked: string[]; restore: () => void } {
  const revoked: string[] = [];
  let counter = 0;
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: () => `blob:anchor-test-${(counter += 1)}` });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: (url: string) => { revoked.push(url); } });
  return {
    revoked,
    restore: () => {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: original.create });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: original.revoke });
    },
  };
}

/** 가짜 PNG 의 첫 채움 바이트(seed 마다 다르다). 가짜 디코더가 래스터를 고르는 열쇠다. */
function seedKey(seed: number): number {
  return fakePngBytes(1, 1, seed)[33] ?? -1;
}

export interface FakeDecoder {
  readonly deps: AnchorCandidateDeps;
  readonly register: (seed: number, raster: AnchorRaster) => void;
  readonly decodeCalls: () => number;
  /** 이 seed 의 이미지는 풀기가 끝나지 않는다(취소·시간 상한 시험용). */
  readonly hang: (seed: number) => void;
  /** hang 을 풀어 다음부터는 정상으로 푼다. */
  readonly release: (seed: number) => void;
}

export function createFakeDecoder(): FakeDecoder {
  const rasters = new Map<number, AnchorRaster>();
  const hung = new Set<number>();
  let calls = 0;
  return {
    hang: (seed) => { hung.add(seedKey(seed)); },
    release: (seed) => { hung.delete(seedKey(seed)); },
    register: (seed, raster) => {
      const key = seedKey(seed);
      if (rasters.has(key)) throw new Error(`seed ${seed} 의 열쇠가 겹쳐요`);
      rasters.set(key, raster);
    },
    decodeCalls: () => calls,
    deps: {
      decode: async (input) => {
        calls += 1;
        if (hung.has(input.bytes[33] ?? -1)) return new Promise<AnchorRaster>(() => undefined);
        const raster = rasters.get(input.bytes[33] ?? -1);
        if (!raster) throw new AnchorCaptureError("decode-failed");
        return raster;
      },
      extract: async (raster, options) => {
        if (options.signal.aborted) throw new AnchorCaptureError("cancelled");
        return extractAnchorFeatures(raster);
      },
    },
  };
}

export interface FakeExport {
  readonly deps: AnchorExportDeps;
  readonly buildZip: ReturnType<typeof vi.fn<AnchorExportDeps["buildZip"]>>;
  readonly download: ReturnType<typeof vi.fn<AnchorExportDeps["download"]>>;
}

/** 실제 ZIP 작성기를 쓰되(작업자 없이, DOM 이 있는 환경용 direct-bounded) 내려받기만 가짜로 바꾼다. */
export function createFakeExport(): FakeExport {
  const buildZip = vi.fn<AnchorExportDeps["buildZip"]>((input, options) =>
    buildAnchorExportZip(input, { ...options, crc32ExecutionMode: "direct-bounded" }),
  );
  const download = vi.fn<AnchorExportDeps["download"]>();
  return { deps: { buildZip, download }, buildZip, download };
}

/** 내보낸 파일 이름 규칙(<앵커id>.<각도>.<해시8>.png)이라 각도를 짐작하지 않고 정확히 읽힌다. */
export function anchorFiles(anchorId = "hero-01", baseSeed = 1): File[] {
  return ANCHOR_ANGLE_IDS.map((angleId, index) =>
    fakePngFile(`${anchorId}.${angleId}.${(index + 10).toString(16).padStart(8, "0")}.png`, 768, 1152, baseSeed + index),
  );
}

export async function fillIdentity(anchorId = "hero-01", characterId = "char-7"): Promise<void> {
  fireEvent.change(screen.getByLabelText(tk("identity.anchorId.label")), { target: { value: anchorId } });
  fireEvent.change(screen.getByLabelText(tk("identity.characterId.label")), { target: { value: characterId } });
}

export function confirmRights(): void {
  fireEvent.click(screen.getByRole("checkbox", { name: tk("rights.confirm") }));
}

/** 식별자·권리 확인·여섯 각도 이미지를 한꺼번에 준비하고 읽기가 끝나기를 기다린다. */
export async function prepareFullSet(): Promise<void> {
  await fillIdentity();
  confirmRights();
  fireEvent.change(screen.getByLabelText(tk("set.dropAll.inputLabel")), { target: { files: anchorFiles() } });
  await waitFor(() => { expect(screen.getAllByText(tk("slot.status.done"))).toHaveLength(6); });
}
