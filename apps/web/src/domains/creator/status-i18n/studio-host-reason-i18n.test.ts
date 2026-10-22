import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "../../../shared/language/status-i18n";

/**
 * StudioCuttoonEditorHost 잔여 문구 i18n 이관 계약 (A4 이관 3라운드 — 호스트).
 *
 * 배경: 배치 2(rem-item4-a4-batch2)가 남긴 호스트 잔여 11건(사유 라벨 6군·
 * 채우기 안내 본문 3건·동사 중첩 삼항 템플릿 2건)과 생산자 채널 throw
 * 10건(호스트 9·ProductionOperationsControlWorkspace 1 — AI T0 탐지기
 * producer 모드 실측)을 이관한다. 표시 정본은 형제 등록 모듈
 * studio-host-reason-i18n.ts의 전용 네임스페이스다:
 * studio.hostReason.* (사유 라벨 32키 — 인벤토리 6군을 군 단위로 전량
 * 이관해 형제 문구의 하드코딩 잔존을 없앴다), studio.hostFillGuide.* (3키),
 * studio.hostLivingInk.* (7키 — 동사·범위 키 분리 + {action}/{scope} 보간),
 * studio.hostError.* (throw 10키 — aiErrorText 선례의 생산 시점 해석
 * hostErrorText로 생산, catch 소비처 무변경).
 * studio.hostStatus.*(배치 2)는 키 개수 고정 계약 때문에 확장하지 않았다.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf-8");
}

function readProdOps(): string {
  return readFileSync(
    new URL("../production-hub/ProductionOperationsControlWorkspace.tsx", import.meta.url),
    "utf-8",
  );
}

/** 등록 모듈(registerI18nLocaleEntries)의 locale 블록을 파싱한다. */
function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  const pattern = /registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
      entries[entry[1] ?? ""] = entry[2] ?? "";
    }
    blocks[match[1] ?? ""] = entries;
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1] ?? "").sort();
}

const DICTS = parseRegisterModule(readSource("status-i18n/studio-host-reason-i18n.ts"));
const ALL_KEYS = Object.keys(DICTS.ko).sort();
const count = (prefix: string) => ALL_KEYS.filter((key) => key.startsWith(prefix)).length;

const CONSUMER_SOURCES: Record<string, string> = {
  host: readSource("StudioCuttoonEditorHost.tsx"),
  prodOps: readProdOps(),
};

const KEY_GROUP = "studio\\.host(?:Reason|FillGuide|LivingInk|Error)\\.[A-Za-z0-9]+";
/** 2인자 호출 t("키", "폴백") — 중첩 삼항 안의 동사·범위 키 호출도 독립 부분 문자열로 잡힌다. */
const SIMPLE_CALL_PATTERN = new RegExp(
  `(?:\\bt|hostErrorText)\\("(${KEY_GROUP})",\\s*"((?:[^"\\\\]|\\\\.)*)"\\)`,
  "g",
);
/** 보간 호출 t("키", {…}, "폴백") — 파라미터 객체 안에 중첩 t()가 있어도 바깥 호출을 잡는다. */
const PARAM_CALL_PATTERN = new RegExp(
  `(?:\\bt|hostErrorText)\\("(${KEY_GROUP})",\\s*\\{[^}]*\\},\\s*"((?:[^"\\\\]|\\\\.)*)"\\)`,
  "gs",
);

function collectCalls(): Array<{ key: string; fallback: string; file: string }> {
  const calls: Array<{ key: string; fallback: string; file: string }> = [];
  for (const [file, source] of Object.entries(CONSUMER_SOURCES)) {
    for (const pattern of [SIMPLE_CALL_PATTERN, PARAM_CALL_PATTERN]) {
      for (const match of source.matchAll(pattern)) {
        calls.push({ key: match[1] ?? "", fallback: match[2] ?? "", file });
      }
    }
  }
  return calls;
}

describe("studio.hostReason/hostFillGuide/hostLivingInk/hostError 사전 (3라운드 등록 모듈)", () => {
  it("ko/en 키 집합이 일치하고 네임스페이스별 키 수가 고정값과 같다 (32·3·7·10 = 52)", () => {
    expect(Object.keys(DICTS.en).sort()).toEqual(ALL_KEYS);
    expect(ALL_KEYS).toHaveLength(52);
    expect(count("studio.hostReason.")).toBe(32);
    expect(count("studio.hostFillGuide.")).toBe(3);
    expect(count("studio.hostLivingInk.")).toBe(7);
    expect(count("studio.hostError.")).toBe(10);
  });

  it("en 값에 한글이 없고 ko/en 값이 비어 있지 않으며 플레이스홀더가 일치한다", () => {
    for (const key of ALL_KEYS) {
      expect(DICTS.en[key], key).not.toMatch(HANGUL);
      expect((DICTS.ko[key] ?? "").length, key).toBeGreaterThan(0);
      expect((DICTS.en[key] ?? "").length, key).toBeGreaterThan(0);
      expect(placeholders(DICTS.en[key] ?? ""), key).toEqual(placeholders(DICTS.ko[key] ?? ""));
    }
  });

  it("Living Ink 동사 분리 키의 ko 조립 결과가 이관 전 템플릿과 글자 단위로 같다", () => {
    const fix = DICTS.ko["studio.hostLivingInk.actionFix"];
    const clear = DICTS.ko["studio.hostLivingInk.actionClear"];
    const locked = DICTS.ko["studio.hostLivingInk.lockedSaveFailed"] ?? "";
    const failed = DICTS.ko["studio.hostLivingInk.actionFailed"] ?? "";
    const announce = DICTS.ko["studio.hostLivingInk.announce"] ?? "";
    expect(locked.replace("{action}", fix ?? "")).toBe("문서가 잠겨 Living Ink 정착를 저장하지 못했습니다.");
    expect(locked.replace("{action}", clear ?? "")).toBe("문서가 잠겨 Living Ink 지우기를 저장하지 못했습니다.");
    expect(failed.replace("{action}", fix ?? "")).toBe("수채 번짐 정착를 완료하지 못했습니다.");
    expect(failed.replace("{action}", clear ?? "")).toBe("수채 번짐 지우기를 완료하지 못했습니다.");
    expect(
      announce
        .replace("{scope}", DICTS.ko["studio.hostLivingInk.scopeAll"] ?? "")
        .replace("{action}", fix ?? ""),
    ).toBe("수채 번짐 · 전체 정착");
  });
});

describe("소비 계약 (호스트 + ProductionOperationsControlWorkspace)", () => {
  it("등록된 전 키가 소비처에서 참조되고 미등록 참조가 없다", () => {
    const used = new Set(collectCalls().map((call) => call.key));
    expect([...used].sort()).toEqual(ALL_KEYS);
    for (const [file, source] of Object.entries(CONSUMER_SOURCES)) {
      const referenced = new Set(
        [...source.matchAll(/"(studio\.host(?:Reason|FillGuide|LivingInk|Error)\.[A-Za-z0-9]+)"/g)].map(
          (match) => match[1] ?? "",
        ),
      );
      for (const key of referenced) {
        expect(ALL_KEYS.includes(key), `${file} dangling reference: ${key}`).toBe(true);
      }
    }
  });

  it("호출부 한국어 폴백이 ko 사전값과 글자 단위로 일치한다 (한국어 표시 회귀 0)", () => {
    const calls = collectCalls();
    expect(calls.length).toBeGreaterThanOrEqual(52);
    for (const call of calls) {
      expect(DICTS.ko[call.key], `${call.file} :: ${call.key}`).toBe(call.fallback);
    }
  });

  it("두 소비 파일 모두 등록 모듈을 import한다 (사전 등록 보장)", () => {
    expect(CONSUMER_SOURCES.host).toContain('import { hostErrorText } from "./status-i18n/studio-host-reason-i18n";');
    expect(CONSUMER_SOURCES.prodOps).toContain('import { hostErrorText } from "../status-i18n/studio-host-reason-i18n";');
  });

  it("탐지기 위반이 없다 (기본 모드·생산자 채널 모드 모두 0건)", () => {
    for (const [file, source] of Object.entries(CONSUMER_SOURCES)) {
      expect(scanHardcodedStatusStrings(source), file).toEqual([]);
      expect(scanHardcodedStatusStrings(source, { includeProducerChannels: true }), file).toEqual([]);
    }
  });
});
