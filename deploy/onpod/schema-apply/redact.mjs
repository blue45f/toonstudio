// stdin -> stdout filter: masks connection secrets (exact env values, URLs with credentials, IPv4 literals).
// Never prints the secrets it masks. Short values are matched only on identifier boundaries.
import { createInterface } from "node:readline";
const names = ["PGHOST", "PGHOSTADDR", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSERVICE"];
const values = [];
for (const name of names) {
  const value = process.env[name];
  if (!value) continue;
  values.push(value);
  try { const enc = encodeURIComponent(value); if (enc !== value) values.push(enc); } catch { /* 잘못된 서로게이트에서만 던진다: 원문 값만 가린다 */ }
}
const uniq = [...new Set(values)].filter((v) => v.length > 0).sort((a, b) => b.length - a.length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = uniq.map((v) => new RegExp(`(?<![A-Za-z0-9_])${escape(v)}(?![A-Za-z0-9_])`, "g"));
const urlPattern = /\b(postgres(?:ql)?:\/\/)[^\s/@]*@?[^\s"']*/gi;
const ipv4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  let out = line.replace(urlPattern, "$1[REDACTED]");
  for (const p of patterns) out = out.replace(p, "[REDACTED]");
  out = out.replace(ipv4, "[IP]");
  process.stdout.write(out + "\n");
});
