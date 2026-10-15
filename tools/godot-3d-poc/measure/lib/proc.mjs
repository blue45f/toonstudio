import { readFileSync, readdirSync } from "node:fs";

/** Linux /proc 으로 프로세스 트리의 RSS(MiB)를 종류별로 합산한다(브라우저·렌더러·GPU·기타). */
export function processTreeRss(rootPid) {
  const table = new Map();
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/u.test(entry)) continue;
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
      const close = stat.lastIndexOf(")");
      const fields = stat.slice(close + 2).split(" ");
      const ppid = Number(fields[1]);
      const status = readFileSync(`/proc/${entry}/status`, "utf8");
      const rssKb = Number(/VmRSS:\s+(\d+)/u.exec(status)?.[1] ?? 0);
      const cmdline = readFileSync(`/proc/${entry}/cmdline`, "utf8");
      const type = /--type=([a-z-]+)/u.exec(cmdline)?.[1] ?? (/chrom|headless_shell/iu.test(cmdline) ? "browser" : "other");
      table.set(Number(entry), { ppid, rssKb, type });
    } catch {
      // 프로세스가 사라진 경우는 건너뛴다.
    }
  }
  const members = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, info] of table) {
      if (!members.has(pid) && members.has(info.ppid)) {
        members.add(pid);
        changed = true;
      }
    }
  }
  const byType = {};
  let totalKb = 0;
  for (const pid of members) {
    const info = table.get(pid);
    if (!info) continue;
    if (info.type === "other") continue;
    byType[info.type] = (byType[info.type] ?? 0) + info.rssKb;
    totalKb += info.rssKb;
  }
  const mib = (kb) => Math.round((kb / 1024) * 10) / 10;
  return { totalMiB: mib(totalKb), byTypeMiB: Object.fromEntries(Object.entries(byType).map(([key, value]) => [key, mib(value)])) };
}

export function loadAverage() {
  return readFileSync("/proc/loadavg", "utf8").trim().split(" ").slice(0, 3).map(Number);
}
