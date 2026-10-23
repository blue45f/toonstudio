import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STUDIO_BG3D_ROOM_OPENING_STYLE_LABELS } from "./studio-bg3d-room-openings";
import { STUDIO_BG3D_ROOM_CEILING_LABELS, STUDIO_BG3D_ROOM_CROWN_LABELS } from "./studio-bg3d-room-trims";

// 방 만들기 문·창 모양·천장·몰딩 문구 사전의 계약: ko/en 키가 짝을 이루고(en 에 한글 없음, 자리표시 같음), 화면이 쓰는 키는
// 모두 등록돼 있으며 등록한 키는 모두 화면이 쓴다. 화면의 한국어 폴백은 사전의 ko 값과 같다(어긋나면 언어마다 다른 문구가 된다).

const HANGUL = /[가-힣]/u;
const read = (file: string) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
const DICTIONARY = read("studio-bg3d-room-builder-i18n.ts");
const CONSUMERS = ["StudioBg3dRoomBuilderDetailControls.tsx"].map(read).join("\n");

function blocks(): Record<"ko" | "en", Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const match of DICTIONARY.matchAll(/registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/gu)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/gu)) entries[entry[1]!] = entry[2]!;
    result[match[1]!] = entries;
  }
  return { ko: result.ko ?? {}, en: result.en ?? {} };
}

const placeholders = (text: string) => [...text.matchAll(/\{([A-Za-z0-9_]+)\}/gu)].map((match) => match[1]).sort();

describe("방 만들기 문구 사전", () => {
  const { ko, en } = blocks();

  it("ko/en 키가 짝을 이루고 en 에는 한글이 없으며 자리표시가 같다", () => {
    expect(Object.keys(ko).length).toBeGreaterThan(40);
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
    for (const key of Object.keys(ko)) {
      expect(key.startsWith("studio.bg3dRoomBuilder."), key).toBe(true);
      expect(HANGUL.test(en[key] ?? ""), `en 한글: ${key}`).toBe(false);
      expect(placeholders(en[key] ?? ""), `자리표시: ${key}`).toEqual(placeholders(ko[key] ?? ""));
    }
  });

  it("화면이 쓰는 키는 모두 등록돼 있고 등록한 키는 모두 화면이 쓴다", () => {
    const referenced = new Set([...CONSUMERS.matchAll(/"(studio\.bg3dRoomBuilder\.[A-Za-z0-9.]+)"/gu)].map((match) => match[1]!));
    expect([...referenced].filter((key) => !(key in ko)), "등록되지 않은 키").toEqual([]);
    expect(Object.keys(ko).filter((key) => !referenced.has(key)), "쓰이지 않는 키").toEqual([]);
  });

  it("화면의 한국어 폴백은 사전의 ko 값과 같다", () => {
    let compared = 0;
    for (const match of CONSUMERS.matchAll(/t\(\s*"(studio\.bg3dRoomBuilder\.[A-Za-z0-9.]+)",\s*(?:\{[^}]*\},\s*)?"([^"]*)"/gu)) {
      expect(match[2], match[1]).toBe(ko[match[1]!]);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(25);
    // 모양·천장·크라운 이름표는 카탈로그 상수를 폴백으로 쓴다 — 사전 ko 값과 같아야 한다.
    const styleKey: Record<string, string> = {
      hole: "hole", "hinged-door": "hingedDoor", "sliding-door": "slidingDoor", "glass-door": "glassDoor",
      "window-sliding": "windowSliding", "window-casement": "windowCasement", "roller-blind": "rollerBlind", shutter: "shutter",
    };
    for (const [style, label] of Object.entries(STUDIO_BG3D_ROOM_OPENING_STYLE_LABELS)) {
      expect(ko[`studio.bg3dRoomBuilder.style.${styleKey[style]}`], style).toBe(label);
    }
    for (const [style, label] of Object.entries(STUDIO_BG3D_ROOM_CEILING_LABELS)) {
      expect(ko[`studio.bg3dRoomBuilder.ceilingStyle.${style}`], style).toBe(label);
    }
    for (const [style, label] of Object.entries(STUDIO_BG3D_ROOM_CROWN_LABELS)) {
      expect(ko[`studio.bg3dRoomBuilder.crownStyle.${style}`], style).toBe(label);
    }
  });
});
