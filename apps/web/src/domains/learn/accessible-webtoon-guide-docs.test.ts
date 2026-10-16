/**
 * 기능 문서(`docs/features/character-chat-voice-accessibility-guide.md`)와 코드의 일치.
 *
 * 문서가 인용하는 숫자·문구·경로가 구현과 어긋나면 실패해, 코드를 바꾼 사람이 문서도 함께 고치게 한다.
 * 캐릭터 토크 쪽 값은 다른 도메인을 가져오지 않고 소스 글자를 읽어 대조한다(도메인 경계 유지).
 * 이 시험은 문서의 검증 결과 숫자(몇 개 통과 등)는 확인하지 않는다 — 그것은 실행 기록이다.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeNaturalSpeechText } from "@/shared/lib/natural-browser-speech";

import {
  GUIDE_CHECKLIST,
  GUIDE_DICTATION_MESSAGES,
  GUIDE_LIMITS,
  GUIDE_REFERENCES,
  GUIDE_SECTIONS,
  GUIDE_SHORTCUTS,
  type GuideStatus,
} from "./accessible-webtoon-guide";

const ROOT = process.cwd();
const WEB_SRC = join(ROOT, "apps/web/src");
const FEATURE_DOC = "docs/features/character-chat-voice-accessibility-guide.md";
const DIRECTORY_DOC = "docs/learn/webtoon-process-education-directory.md";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/** 소스 파일에서 `NAME = 숫자;` 형태의 상수 값을 읽는다. */
function numericConstant(source: string, name: string): number {
  const match = new RegExp(`${name}\\s*=\\s*([0-9.]+);`, "u").exec(source);
  if (!match?.[1]) throw new Error(`상수를 찾지 못했다: ${name}`);
  return Number(match[1]);
}

function stringConstant(source: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]+)"`, "u").exec(source);
  if (!match?.[1]) throw new Error(`문자열 상수를 찾지 못했다: ${name}`);
  return match[1];
}

/** 표의 한 줄을 셀로 나눈다. 앞뒤 빈 칸은 버린다. */
function cells(line: string): string[] {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

function tableLine(doc: string, firstCell: string): string {
  const line = doc.split("\n").find((candidate) => cells(candidate)[0] === firstCell);
  if (!line) throw new Error(`문서 표에 '${firstCell}' 행이 없다`);
  return line;
}

/** `apps/web/src` 아래 모든 파일의 상대 경로(슬래시 구분). */
function listWebSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      if (name === "node_modules") continue;
      const full = join(directory, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(relative(WEB_SRC, full).split("\\").join("/"));
    }
  };
  walk(WEB_SRC);
  return files;
}

/**
 * git이 추적 중인 파일인지. sparse checkout으로 디스크에 내려받지 않은 파일(예: `apps/web/public/…`)도
 * 추적 중이면 "있는 파일"로 본다. git을 쓸 수 없는 환경에서는 확인하지 못한 것으로 보고 false를 돌려준다.
 */
function isTrackedByGit(path: string): boolean {
  try {
    return execFileSync("git", ["ls-files", "--", path], { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
  } catch {
    return false;
  }
}

describe("기능 문서와 코드의 일치", () => {
  const doc = read(FEATURE_DOC);
  const voice = read("apps/web/src/domains/character-chat/character-chat-voice.ts");

  it("머리말에 상태·기준 커밋·작성일이 있고 상태 용어는 docs 규칙의 네 가지 안에 있다", () => {
    expect(doc).toMatch(/^- 상태: /mu);
    expect(doc).toMatch(/^- 기준 커밋: `[0-9a-f]{40}`/mu);
    expect(doc).toMatch(/^- 작성일: \d{4}-\d{2}-\d{2}$/mu);
    const allowed = new Set(["current", "migration", "target", "legacy exception"]);
    const header = doc.split("\n").find((line) => line.startsWith("- 상태: ")) ?? "";
    const bolded = [...header.matchAll(/\*\*([^*]+)\*\*/gu)].map((match) => match[1] ?? "");
    expect(bolded.length).toBeGreaterThan(0);
    for (const term of bolded) expect(allowed.has(term), `허용되지 않는 상태 용어: ${term}`).toBe(true);
    // 1절 표의 상태 열도 같은 용어만 쓴다.
    const overview = doc.slice(doc.indexOf("## 1. 한눈에 보기"), doc.indexOf("## 2. "));
    const statusColumn = overview
      .split("\n")
      .filter((line) => line.startsWith("| ") && !line.startsWith("| ---") && !line.startsWith("| 항목"))
      .map((line) => cells(line)[1] ?? "");
    expect(statusColumn.length).toBeGreaterThanOrEqual(5);
    for (const status of statusColumn) expect(allowed.has(status), `1절 표의 상태 열: ${status}`).toBe(true);
  });

  it("검증 결과 자리표시자가 남아 있지 않다", () => {
    // 실패해도 긴 문서 전체가 출력되지 않도록 불리언으로 비교한다.
    expect(doc.includes("VERIFICATION_PLACEHOLDER"), "5절의 검증 결과를 실제 실행 기록으로 채우세요").toBe(false);
    expect(doc).toContain("## 5. 검증");
  });

  it("낭독 선호 값의 범위 표가 구현 상수와 같다", () => {
    const fixed = (value: number): string => value.toFixed(2);
    const step = numericConstant(voice, "CHARACTER_CHAT_VOICE_STEP");
    const rate = [numericConstant(voice, "CHARACTER_CHAT_VOICE_RATE_MIN"), numericConstant(voice, "CHARACTER_CHAT_VOICE_RATE_MAX")] as const;
    const pitch = [numericConstant(voice, "CHARACTER_CHAT_VOICE_PITCH_MIN"), numericConstant(voice, "CHARACTER_CHAT_VOICE_PITCH_MAX")] as const;
    // 기본값은 배율 1이다.
    expect(voice).toMatch(/voiceURI: null,\s*gender: "neutral",\s*rate: 1,\s*pitch: 1,/u);

    expect(doc).toContain(`| 말하는 속도 \`rate\` | ${fixed(rate[0])} | ${fixed(rate[1])} | ${fixed(step)} | 1.00 |`);
    expect(doc).toContain(`| 목소리 높낮이 \`pitch\` | ${fixed(pitch[0])} | ${fixed(pitch[1])} | ${fixed(step)} | 1.00 |`);
    expect(doc).toContain(`${numericConstant(voice, "CHARACTER_CHAT_VOICE_URI_MAX")}자(\`CHARACTER_CHAT_VOICE_URI_MAX\`)`);
    expect(doc).toContain(`${numericConstant(voice, "CHARACTER_CHAT_SPEECH_SEGMENT_CHARS")}자(\`CHARACTER_CHAT_SPEECH_SEGMENT_CHARS\`)`);
  });

  it("문서가 인용한 공용 분절 계획의 한계와 dialogue 스타일 기본값이 공용 소스와 같다", () => {
    const shared = read("apps/web/src/shared/lib/natural-browser-speech.ts");
    expect(shared).toContain("clamp(options.rate ?? 1, 0.65, 1.55)");
    expect(shared).toContain("clamp(options.pitch ?? 1, 0.7, 1.35)");
    expect(shared).toMatch(/dialogue: \{ rate: 0\.97, pitch: 1,/u);
    expect(doc).toContain("속도 0.65~1.55, 높낮이 0.7~1.35");
    expect(doc).toContain("속도 0.97, 높낮이 1.00");
  });

  it("공용 정리 단계는 이모지·마크다운·링크는 걸러내지만 괄호 속 행동 묘사는 걸러내지 않는다 — 문서의 서술 근거", () => {
    const spoken = normalizeNaturalSpeechText("**알겠어.** 😊 (한숨을 쉰다) https://example.com/a 가자.");
    expect(spoken).not.toMatch(/\*|😊|https?:/u);
    expect(spoken).toContain("링크");
    expect(spoken).toContain("(한숨을 쉰다)");
    expect(doc).toContain("괄호 속 행동 묘사는 걸러내지 않는다");
  });

  it("저장 위치의 키와 듣는 사람 설정의 기본 꺼짐이 구현과 같다", () => {
    const profile = read("apps/web/src/domains/character-chat/character-chat-profile.ts");
    const settings = read("apps/web/src/domains/character-chat/character-chat-voice-settings.ts");
    const profileKey = stringConstant(profile, "CHARACTER_CHAT_STORAGE_KEY");
    const settingsKey = stringConstant(settings, "CHARACTER_CHAT_VOICE_SETTINGS_KEY");
    expect(doc).toContain(`키 \`${profileKey}\``);
    expect(doc).toContain(`키 \`${settingsKey}\``);
    expect(settings).toContain("autoRead: false,");
    expect(settings).toContain("allowOnlineVoices: false,");
    // 문서의 표가 두 설정을 기본 "꺼짐"으로 적는다.
    expect(cells(tableLine(doc, "자동 낭독 `autoRead`"))[3]).toBe("꺼짐");
    expect(cells(tableLine(doc, "온라인 음성 허용 `allowOnlineVoices`"))[3]).toBe("꺼짐");
    // 저장소 스키마 버전을 바꾸지 않았다는 서술의 근거.
    expect(read("apps/web/src/domains/character-chat/character-chat-store.ts")).toMatch(/name: CHARACTER_CHAT_STORAGE_KEY,\s*version: 1,/u);
  });

  it("읽지 못할 때의 사유 표가 코드의 사유 목록과 안내 문구 그대로다", () => {
    const speech = read("apps/web/src/domains/character-chat/character-chat-speech.ts");
    const copy = read("apps/web/src/domains/character-chat/character-chat-speech-copy.ts");
    const union = /export type CharacterChatSpeechFailure =([^;]+);/u.exec(speech)?.[1] ?? "";
    const reasons = [...union.matchAll(/"([a-z-]+)"/gu)].map((match) => match[1] ?? "");
    expect(reasons.length).toBe(5);

    const section = doc.slice(doc.indexOf("### 2.8 "), doc.indexOf("## 3. "));
    const rows = section.split("\n").filter((line) => line.startsWith("| `"));
    const documented = rows.map((row) => (cells(row)[0] ?? "").replaceAll("`", ""));
    // 표의 순서는 읽는 사람 기준이라 코드의 선언 순서와 달라도 된다. 사유 집합이 같으면 된다.
    expect([...documented].sort()).toEqual([...reasons].sort());
    for (const row of rows) {
      const [reasonCell, message] = cells(row);
      const reason = (reasonCell ?? "").replaceAll("`", "");
      expect(message, `${reason}의 안내 문구가 비었다`).toBeTruthy();
      expect(copy.includes(message ?? ""), `안내 문구가 character-chat-speech-copy.ts와 다르다: ${message}`).toBe(true);
      expect(copy, `${reason}를 처리하는 case가 없다`).toContain(`case "${reason}":`);
    }
  });

  it("답변 생성 규칙 인용이 프롬프트 소스의 문장과 같다", () => {
    const prompt = read("apps/web/src/domains/character-chat/character-chat-prompt.ts");
    const rule = stringConstant(prompt, "CHARACTER_CHAT_READ_ALOUD_RULE");
    expect(doc).toContain(`> ${rule}`);
    // 옵션은 선택이고 켜졌을 때만 규칙을 더한다.
    expect(prompt).toContain("if (options.readAloud === true)");
  });

  it("안내의 구간 표가 데이터의 구간·상태·제목·링크와 같고 순서도 같다", () => {
    const statusWord: Readonly<Record<GuideStatus, string>> = {
      available: "지금 쓸 수 있음",
      partial: "일부",
      planned: "준비 중",
    };
    const section = doc.slice(doc.indexOf("### 3.2 "), doc.indexOf("### 3.3 "));
    const rows = section.split("\n").filter((line) => line.startsWith("| `"));
    expect(rows.map((row) => cells(row)[0]?.replaceAll("`", ""))).toEqual(GUIDE_SECTIONS.map((entry) => entry.id));
    for (const entry of GUIDE_SECTIONS) {
      const [, title, status, , links] = cells(tableLine(doc, `\`${entry.id}\``));
      expect(title).toBe(entry.title.ko);
      expect(status, `${entry.id} 구간의 상태`).toBe(statusWord[entry.status]);
      for (const link of entry.links) expect(links, `${entry.id} 구간 링크`).toContain(`\`${link.href}\``);
    }
  });

  it("안내의 보조 블록 개수가 데이터의 개수와 같다", () => {
    expect(doc).toContain(`| 단축키 표 | ${GUIDE_SHORTCUTS.length}행 |`);
    expect(doc).toContain(`| 받아쓰기 안내 표 | ${GUIDE_DICTATION_MESSAGES.length}행 |`);
    expect(doc).toContain(`| 게시 전 점검표 | ${GUIDE_CHECKLIST.length}개 |`);
    expect(doc).toContain(`| 알아 둘 한계 | ${GUIDE_LIMITS.length}개 |`);
    expect(doc).toContain(`| 참고 자료 | ${GUIDE_REFERENCES.length}개 |`);
    const withManual = GUIDE_SHORTCUTS.filter((shortcut) => shortcut.manualAction !== undefined).length;
    const others = GUIDE_SHORTCUTS.length - withManual;
    expect(doc).toContain(`${withManual}행은 \`STUDIO_MANUAL.md\` 부록 표와 같은 키이고, 대사 편집 적용·취소 ${others}행은`);
  });

  it("받아쓰기 상태 서술이 가이드 데이터의 상태와 어긋나지 않는다", () => {
    const dictation = GUIDE_SECTIONS.find((entry) => entry.id === "dictation");
    const notMounted = "앱 소스의 어떤 화면도 이 컴포넌트를 가져오지 않는다";
    const mentionsNotMounted = doc.includes(notMounted);
    if (dictation?.status === "planned") expect(mentionsNotMounted, "가이드가 준비 중이면 3.4절에 장착되지 않았다고 적어야 한다").toBe(true);
    else expect(mentionsNotMounted, "받아쓰기가 연결됐다면 3.4절과 1절 표를 갱신하세요").toBe(false);
  });

  it("문서 안의 파일 경로가 실제로 있다", () => {
    const webFiles = listWebSourceFiles();
    const tokens = [...doc.matchAll(/`([^`\s]+\.(?:tsx?|md|json|mjs))`/gu)].map((match) => match[1] ?? "");
    expect(tokens.length).toBeGreaterThan(10);
    const missing = tokens.filter((token) => {
      if (token.includes("*") || token.includes("…")) return false;
      if (existsSync(join(ROOT, token)) || existsSync(join(WEB_SRC, token))) return false;
      if (webFiles.some((file) => file === token || file.endsWith(`/${token}`))) return false;
      return !isTrackedByGit(token);
    });
    expect(missing, `문서에 적힌 파일이 저장소에 없다: ${missing.join(", ")}`).toEqual([]);
  });

  it("상대 링크가 가리키는 문서가 있고 학습 안내 문서와 서로 가리킨다", () => {
    const links = [...doc.matchAll(/\]\((\.\.?\/[^)\s]+)\)/gu)].map((match) => match[1] ?? "");
    expect(links).toContain("../learn/webtoon-process-education-directory.md");
    for (const link of links) {
      const target = resolve(dirname(join(ROOT, FEATURE_DOC)), link);
      expect(existsSync(target), `없는 문서: ${link}`).toBe(true);
    }
    const directory = read(DIRECTORY_DOC);
    expect(directory).toContain("| `/learn/accessibility` |");
    expect(directory).toContain("](../features/character-chat-voice-accessibility-guide.md)");
  });
});
