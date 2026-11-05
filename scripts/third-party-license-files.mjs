import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** 래퍼 LICENSE뿐 아니라 내장 라이브러리의 상류 고지도 수집한다. */
export function findRootLicenseFiles(packagePath) {
  let names;
  try {
    names = readdirSync(packagePath);
  } catch {
    return [];
  }
  return names
    .filter((name) => /^(?:(?:licen[sc]e|copying|notice)(?:[._-].*)?|third[._-]party[._-](?:notices?|licen[sc]es?)(?:[._-].*)?)$/iu.test(name))
    .map((name) => join(packagePath, name))
    .filter((path) => {
      try {
        const stat = statSync(path);
        return stat.isFile() && stat.size <= 2_000_000;
      } catch {
        return false;
      }
    })
    .sort();
}
