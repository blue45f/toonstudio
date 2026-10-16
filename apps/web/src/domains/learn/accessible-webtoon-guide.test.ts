/**
 * "접근성 있는 웹툰 만들기" 안내 데이터 계약 — 구조·이중언어 쌍·근거 대조.
 *
 * 이 안내는 "근거 없는 수치·주장 금지"가 규칙이라, 시험이 (1) 단축키를 Studio 매뉴얼 부록 표와,
 * (2) 받아쓰기 안내문을 실제 소스 문구와, (3) 본문에 나온 모든 수치를 근거가 있는 목록과 대조한다.
 * 그리고 (4) 받아쓰기 버튼이 어떤 화면에 장착되면 가이드의 "준비 중" 표시를 고치라고 실패한다.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCESSIBLE_WEBTOON_GUIDE_VERIFIED_AT,
  GUIDE_CHECKLIST,
  GUIDE_DICTATION_MESSAGES,
  GUIDE_LIMITS,
  GUIDE_REFERENCES,
  GUIDE_SECTIONS,
  GUIDE_SHORTCUTS,
  GUIDE_STATUS_LABELS,
  type GuideText,
} from "./accessible-webtoon-guide";

const HANGUL = /[ㄱ-ㅎㅏ-ㅣ가-힣]/u;
const WEB_SRC = join(process.cwd(), "apps/web/src");

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

/** 문장 문구(키 표기 제외) 전부 — 모든 구조에서 모은다. */
function sentenceTexts(): GuideText[] {
  const texts: GuideText[] = [...Object.values(GUIDE_STATUS_LABELS)];
  for (const section of GUIDE_SECTIONS) {
    texts.push(section.title, section.summary);
    for (const point of section.points) texts.push(point.title, point.body);
    for (const link of section.links) texts.push(link.label);
  }
  for (const shortcut of GUIDE_SHORTCUTS) texts.push(shortcut.action);
  for (const message of GUIDE_DICTATION_MESSAGES) texts.push(message.meaning, message.action);
  for (const item of GUIDE_CHECKLIST) {
    texts.push(item.label);
    if (item.link) texts.push(item.link.label);
  }
  for (const limit of GUIDE_LIMITS) texts.push(limit.title, limit.body);
  for (const reference of GUIDE_REFERENCES) texts.push(reference.label, reference.note);
  return texts;
}

function allIds(): string[] {
  return [
    ...GUIDE_SECTIONS.flatMap((section) => [section.id, ...section.points.map((point) => `${section.id}.${point.id}`)]),
    ...GUIDE_SHORTCUTS.map((shortcut) => shortcut.id),
    ...GUIDE_DICTATION_MESSAGES.map((message) => message.id),
    ...GUIDE_CHECKLIST.map((item) => item.id),
    ...GUIDE_LIMITS.map((limit) => limit.id),
    ...GUIDE_REFERENCES.map((reference) => reference.id),
  ];
}

describe("안내 구조", () => {
  it("모든 식별자가 고유하고 다섯 구간이 정해진 순서로 있다", () => {
    const ids = allIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(GUIDE_SECTIONS.map((section) => section.id)).toEqual(["keyboard", "dictation", "display", "readers", "listen"]);
    for (const section of GUIDE_SECTIONS) {
      expect(section.points.length).toBeGreaterThanOrEqual(3);
      expect(section.links.length).toBeGreaterThan(0);
    }
    expect(GUIDE_CHECKLIST.length).toBeGreaterThanOrEqual(5);
    expect(GUIDE_LIMITS.length).toBeGreaterThanOrEqual(5);
  });

  it("모든 문구가 ko/en 쌍이고 영어 쪽에는 한글이 없다", () => {
    for (const entry of sentenceTexts()) {
      expect(entry.ko.trim().length, entry.en).toBeGreaterThan(0);
      expect(entry.en.trim().length, entry.ko).toBeGreaterThan(0);
      // 고유명사(예: WCAG 2.2)는 두 언어가 같은 표기여도 된다. 그 밖의 문구는 한국어 쪽에 한글이 있어야 한다.
      if (entry.ko !== entry.en) expect(HANGUL.test(entry.ko), `한국어 쪽에 한글이 없다: ${entry.ko}`).toBe(true);
      expect(HANGUL.test(entry.en), `영어 쪽에 한글이 섞였다: ${entry.en}`).toBe(false);
    }
    for (const shortcut of GUIDE_SHORTCUTS) {
      for (const combo of shortcut.combos) {
        expect(HANGUL.test(combo.en), `키 표기 영어 쪽에 한글이 섞였다: ${combo.en}`).toBe(false);
      }
    }
  });

  it("문구는 해요체로 통일되어 있고 합니다체로 끝나는 문장이 없다", () => {
    const formal = /(?:합니다|입니다|됩니다|습니다)[.)]?$/u;
    for (const entry of sentenceTexts()) {
      for (const sentence of entry.ko.split(/(?<=[.?!])\s+/u)) {
        expect(formal.test(sentence.trim()), `합니다체 문장: ${sentence}`).toBe(false);
      }
    }
  });

  it("내부 링크는 사이트 안 경로이고 외부 링크는 표준·공식 문서의 https 주소다", () => {
    const internal = [
      ...GUIDE_SECTIONS.flatMap((section) => section.links.map((link) => link.href)),
      ...GUIDE_CHECKLIST.flatMap((item) => (item.link ? [item.link.href] : [])),
    ];
    for (const href of internal) {
      expect(href.startsWith("/") && !href.startsWith("//"), href).toBe(true);
      expect(/\s/u.test(href), href).toBe(false);
    }
    const allowedHosts = new Set(["www.w3.org", "developer.mozilla.org"]);
    for (const reference of GUIDE_REFERENCES) {
      const url = new URL(reference.href);
      expect(url.protocol).toBe("https:");
      expect(allowedHosts.has(url.hostname), reference.href).toBe(true);
    }
  });
});

describe("상태 표시의 정직함", () => {
  it("받아쓰기는 준비 중이고 나머지는 환경에 따라 달라지는 일부 기능으로 표시한다", () => {
    const statusById = Object.fromEntries(GUIDE_SECTIONS.map((section) => [section.id, section.status]));
    expect(statusById).toEqual({
      keyboard: "partial",
      dictation: "planned",
      display: "partial",
      readers: "partial",
      listen: "partial",
    });
    const dictation = GUIDE_SECTIONS.find((section) => section.id === "dictation");
    expect(dictation?.summary.ko).toContain("연결되지 않았");
    expect(dictation?.summary.en).toContain("not wired");
    expect(dictation?.summary.ko).toContain(ACCESSIBLE_WEBTOON_GUIDE_VERIFIED_AT);
  });

  it("받아쓰기 버튼이 어떤 화면에도 장착되지 않은 현재 사실과 어긋나지 않는다 — 장착되면 가이드 상태를 고쳐야 한다", () => {
    const componentFile = join(WEB_SRC, "domains/creator/lettering/StudioDictationMicButton.tsx");
    // 주석·문서의 이름 언급이 아니라 실제 가져오기(정적 import, 동적 import)만 찾는다.
    const importsMicButton = /(?:from\s*|import\s*\(\s*)["'][^"']*StudioDictationMicButton["']/u;
    const importers: string[] = [];
    const walk = (directory: string): void => {
      for (const name of readdirSync(directory)) {
        if (name === "node_modules" || name === "__tests__") continue;
        const full = join(directory, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.[jt]sx?$/u.test(name) || /\.(?:test|spec)\.[jt]sx?$/u.test(name) || full === componentFile) continue;
        if (importsMicButton.test(readFileSync(full, "utf8"))) importers.push(relative(WEB_SRC, full));
      }
    };
    walk(WEB_SRC);
    expect(
      importers,
      "받아쓰기 버튼이 화면에 장착됐다 — accessible-webtoon-guide.ts의 dictation 구간 상태(planned)와 문구, docs/features/character-chat-voice-accessibility-guide.md를 갱신하세요.",
    ).toEqual([]);
  });
});

describe("사실 근거 대조", () => {
  it("단축키 표는 Studio 매뉴얼 부록 표와 같은 키를 쓴다", () => {
    const manual = read("STUDIO_MANUAL.md");
    const appendix = manual.slice(manual.indexOf("## 부록: 기본 단축키"));
    expect(appendix.length).toBeGreaterThan(0);

    const normalize = (value: string): string => value.trim().replace(/\s*\+\s*/gu, "+");
    const rows = new Map<string, Set<string>>();
    for (const line of appendix.split("\n")) {
      const cells = line.split("|").map((cell) => cell.trim());
      if (cells.length < 4 || cells[1] === "단축키" || /^-+$/u.test(cells[1] ?? "")) continue;
      const keys = (cells[1] ?? "").split(" / ").map(normalize);
      rows.set(cells[2] ?? "", new Set(keys));
    }

    const withManual = GUIDE_SHORTCUTS.filter((shortcut) => shortcut.manualAction !== undefined);
    expect(withManual.length).toBeGreaterThanOrEqual(10);
    for (const shortcut of withManual) {
      const manualKeys = rows.get(shortcut.manualAction ?? "");
      expect(manualKeys, `매뉴얼 부록에 '${shortcut.manualAction}' 줄이 없다`).toBeDefined();
      const guideKeys = new Set(shortcut.combos.map((combo) => normalize(combo.ko)));
      for (const manualKey of manualKeys ?? []) {
        expect(guideKeys.has(manualKey), `${shortcut.manualAction}: 매뉴얼의 '${manualKey}'가 안내에 없다`).toBe(true);
      }
    }
  });

  it("기능 찾기와 단축키 도움말, 대사 편집 키는 구현 소스에 실제로 있다", () => {
    const search = read("apps/web/src/domains/creator/StudioCommandSearchHost.tsx");
    expect(search).toContain("⌘K / Ctrl+K / F1");
    const dispatcher = read("apps/web/src/domains/creator/studio-page-shortcut-dispatcher.ts");
    expect(dispatcher).toContain('e.key === "?"');
    const overlay = read("apps/web/src/domains/creator/lettering/StudioTextEditOverlay.tsx");
    expect(overlay).toContain('aria-keyshortcuts="Control+Enter Meta+Enter Escape"');
    const dialog = read("apps/web/src/domains/creator/StudioCommandSearchDialog.tsx");
    for (const keyName of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) expect(dialog).toContain(`"${keyName}"`);
  });

  it("받아쓰기 안내문은 실제 소스가 보여 주는 한국어 문장 그대로다", () => {
    const source = read("apps/web/src/domains/creator/lettering/studio-speech-dictation.ts");
    expect(GUIDE_DICTATION_MESSAGES.length).toBeGreaterThanOrEqual(5);
    for (const row of GUIDE_DICTATION_MESSAGES) {
      expect(source.includes(row.message), `소스에 없는 안내문: ${row.message}`).toBe(true);
    }
    // 기본 인식 언어와 "서버·외부 서비스 없이 브라우저 내장 음성인식만 쓴다"는 설계 주석도 근거다.
    expect(source).toContain('options.lang ?? "ko-KR"');
    expect(source).toContain("서버·외부 서비스 없이 브라우저 내장 음성인식만 쓴다");
  });

  it("설정 화면 이름과 항목은 실제 문구와 같다", () => {
    const settingsCenter = read("apps/web/src/domains/creator/studio-app-settings-center-i18n.ts");
    for (const label of ["애플리케이션 설정", "작업 환경 빠른 맞춤", "집중·접근성", "터치 우선", "마우스·키보드", "OS 움직임 감소"]) {
      expect(settingsCenter.includes(label), `설정 센터에 없는 문구: ${label}`).toBe(true);
    }
    expect(settingsCenter).toContain("큰 조작 영역과 멀티터치 탐색을 우선해 실수 입력을 줄입니다.");
    const settingsKo = read("apps/web/public/i18n/studio/settings/ko.json");
    expect(settingsKo).toContain('"studio.settings.other.motionReduceLabel": "동작 줄이기"');
    expect(settingsKo).toContain('"studio.settings.tabs.shortcuts": "단축키"');
    expect(settingsKo).toContain('"studio.settings.tabs.other": "기타"');
    const themes = read("apps/web/src/shared/lib/theme-presets.ts");
    expect(themes).toContain('id: "contrast", ko: "고대비"');
    const settingsPage = read("apps/web/src/domains/account/SettingsPage.tsx");
    expect(settingsPage).toContain("디자인 테마");
    expect(settingsPage).toContain('"차분하게"');
  });

  it("작품 대체 텍스트 칸과 독자 화면 규칙, 내보내기 사전 점검 규칙은 구현과 같다", () => {
    const controls = read("apps/web/src/domains/creator/StudioPublicationRightsControls.tsx");
    expect(controls).toContain("maxLength={1_000}");
    expect(controls).toContain("작품 대체 텍스트");
    expect(controls).toContain("이미지를 볼 수 없는 독자도 핵심 장면을 이해할 수 있게 설명합니다.");
    const contract = read("packages/contracts/src/creator-community-publication-contract.ts");
    expect(contract).toContain("${metadata.altText}${pageLabel}");
    expect(contract).toContain('"ALT_TEXT_REQUIRED"');
    const preflight = read("apps/web/src/domains/creator/studio-export-preflight.ts");
    // 대상별 요구: 웹툰 플랫폼·전자책은 읽기 순서, SNS·전자책은 대체 텍스트.
    const profileBlock = (id: string): string => {
      const start = preflight.indexOf(`id: "${id}"`);
      return preflight.slice(start, preflight.indexOf("}),", start));
    };
    expect(profileBlock("webtoon-platform")).toContain("requireReadingOrder: true");
    expect(profileBlock("webtoon-platform")).toContain("requireAltText: false");
    expect(profileBlock("social")).toContain("requireAltText: true");
    expect(profileBlock("ebook")).toContain("requireReadingOrder: true");
    expect(profileBlock("ebook")).toContain("requireAltText: true");
    const panel = read("apps/web/src/domains/creator/studio-shell/StudioExportPanel.tsx");
    expect(panel).toContain("대체 텍스트 범위");
    expect(panel).toContain("읽기 순서 완료");
    expect(panel).toContain("가장 작은 글자");
  });

  it("터치 대상 44px 기준과 캔버스 포인터 중심의 한계는 접근성 안내 페이지와 같다", () => {
    const statement = read("apps/web/src/domains/legal/AccessibilityPage.tsx");
    expect(statement).toContain("최소 44 CSS px을 기준으로");
    const lab = read("apps/web/src/domains/legal/AccessibilityLab.tsx");
    expect(lab).toContain("포인터 중심 기능이 남아 있으며 키보드 대체 경로를 확대하고 있습니다");
    const buttons = read("apps/web/src/shared/components/ui/button-utils.ts");
    expect(buttons).toContain("pointer-coarse:h-11");
  });

  it("캐릭터 토크 낭독 범위(속도·높낮이)와 기본 꺼짐 설정은 구현 상수와 같다", () => {
    const voice = read("apps/web/src/domains/character-chat/character-chat-voice.ts");
    expect(voice).toContain("CHARACTER_CHAT_VOICE_RATE_MIN = 0.8;");
    expect(voice).toContain("CHARACTER_CHAT_VOICE_RATE_MAX = 1.25;");
    expect(voice).toContain("CHARACTER_CHAT_VOICE_PITCH_MIN = 0.85;");
    expect(voice).toContain("CHARACTER_CHAT_VOICE_PITCH_MAX = 1.15;");
    const settings = read("apps/web/src/domains/character-chat/character-chat-voice-settings.ts");
    expect(settings).toContain("autoRead: false,");
    expect(settings).toContain("allowOnlineVoices: false,");
  });
});

describe("본문에 나온 수치는 모두 근거가 있다", () => {
  /** 숫자 토큰별 근거. 목록에 없는 수치가 본문에 생기면 시험이 실패해 근거를 요구한다. */
  const GROUNDED_NUMBERS: Readonly<Record<string, string>> = {
    "1,000": "작품 대체 텍스트 최대 길이 — StudioPublicationRightsControls maxLength",
    "44": "모바일 주요 터치 대상 기준 — AccessibilityPage, button-utils pointer-coarse",
    "2026": "확인일 — ACCESSIBLE_WEBTOON_GUIDE_VERIFIED_AT",
    "10": "확인일(월)",
    "16": "확인일(일)",
    "0.80": "낭독 속도 하한 — character-chat-voice",
    "1.25": "낭독 속도 상한 — character-chat-voice",
    "0.85": "낭독 높낮이 하한 — character-chat-voice",
    "1.15": "낭독 높낮이 상한 — character-chat-voice",
    "2.2": "참고 표준 이름 WCAG 2.2",
  };

  it("수치 표기는 위 목록 안에 있다", () => {
    const found = new Set<string>();
    for (const entry of sentenceTexts()) {
      // 2D·3D 같은 표기의 숫자는 수치 주장이 아니므로 제외하고, 단어 안의 숫자(F1)도 제외한다.
      for (const match of entry.ko.matchAll(/(?<![A-Za-z\d])\d[\d,.]*\d(?!D)|(?<![A-Za-z\d])\d(?![\dD])/gu)) {
        found.add(match[0]);
      }
    }
    const ungrounded = [...found].filter((token) => GROUNDED_NUMBERS[token] === undefined);
    expect(ungrounded, `근거가 없는 수치: ${ungrounded.join(", ")}`).toEqual([]);
  });
});
