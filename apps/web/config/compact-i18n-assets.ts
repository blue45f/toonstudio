import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Stats } from "node:fs";

const I18N_SCOPES = ["app", "admin", "studio"] as const;

async function isExistingDirectory(directory: string): Promise<boolean> {
  let status: Stats;
  try {
    status = await lstat(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
  if (!status.isDirectory()) {
    throw new Error("번역 빌드 영역은 심볼릭 링크가 아닌 디렉터리여야 합니다: " + directory);
  }
  return true;
}

/** 문자열·이스케이프·키 순서·숫자 표기를 그대로 두고 JSON 구문 밖 공백만 제거합니다. */
export function compactI18nJsonWhitespace(source: string): string {
  JSON.parse(source);
  let result = "";
  let inString = false;
  let escaped = false;
  for (const character of source) {
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
      result += character;
    } else if (character !== " " && character !== "\t" && character !== "\r" && character !== "\n") {
      result += character;
    }
  }
  return result;
}

/** 정본 public 파일은 읽거나 쓰지 않고 세 번역 영역의 빌드 복사본만 처리합니다. */
export async function compactI18nAssets(outDir: string): Promise<{
  files: number;
  beforeBytes: number;
  afterBytes: number;
}> {
  const summary = { files: 0, beforeBytes: 0, afterBytes: 0 };
  const localeRoot = path.join(outDir, "i18n");
  if (!await isExistingDirectory(outDir) || !await isExistingDirectory(localeRoot)) return summary;
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error("번역 빌드 복사본에서 심볼릭 링크를 처리할 수 없습니다: " + filename);
      }
      if (entry.isDirectory()) {
        await visit(filename);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        const bytes = await readFile(filename);
        const source = bytes.toString("utf8");
        if (!Buffer.from(source, "utf8").equals(bytes)) {
          throw new Error("번역 빌드 JSON은 유효한 UTF-8이어야 합니다: " + filename);
        }
        let compact: string;
        try {
          compact = compactI18nJsonWhitespace(source);
        } catch (error) {
          throw new Error("번역 빌드 JSON 구문이 잘못되었습니다: " + filename, { cause: error });
        }
        summary.files += 1;
        summary.beforeBytes += Buffer.byteLength(source, "utf8");
        summary.afterBytes += Buffer.byteLength(compact, "utf8");
        if (compact !== source) await writeFile(filename, compact);
      }
    }
  }

  for (const scope of I18N_SCOPES) {
    const directory = path.join(localeRoot, scope);
    if (await isExistingDirectory(directory)) await visit(directory);
  }
  return summary;
}
