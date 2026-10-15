/** 비밀값 누출 검사의 순수 파일 스캔. commands.mjs 가 800줄 상한을 넘지 않도록 분리했다. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** 로그·산출물에 비밀값이 남았는지 검사한다(값은 출력하지 않고 키 이름·건수만 보고). */
export function scanForSecrets({ secrets, targets }) {
  const findings = [];
  const visit = (path) => {
    let info;
    try {
      info = statSync(path);
    } catch {
      return;
    }
    if (info.isDirectory()) {
      for (const entry of readdirSync(path)) {
        if (entry === "node_modules" || entry === ".git") continue;
        visit(join(path, entry));
      }
      return;
    }
    if (!info.isFile() || info.size > 256 * 1024 * 1024) return;
    const content = readFileSync(path);
    for (const secret of secrets) {
      if (!secret.value || secret.value.length < 6) continue;
      let count = 0;
      let index = content.indexOf(secret.value);
      while (index !== -1) {
        count += 1;
        index = content.indexOf(secret.value, index + secret.value.length);
      }
      if (count > 0) findings.push({ path, key: secret.key, count });
    }
  };
  for (const target of targets) visit(target);
  return findings;
}
