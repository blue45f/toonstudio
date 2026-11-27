import { isSafeUrl } from "./schema";

import type { BoardState, CoordinationItem, CoordinationStatus } from "./types";

export function createCoordinationItem(id: string, title: string): CoordinationItem {
  return {
    id, title, project: "", status: "미확인", priority: 2, blocking: false, sourceTaskId: "", operationId: "",
    file: "", version: "", approvedVersion: "", digest: "", repo: "", branch: "", pr: "", commit: "", merge: "",
    ci: "", ciCommit: "", deployment: "", deployCommit: "", smoke: "", migration: "", platform: "", mentor: "",
    owner: "", next: "", evidenceAt: "", checkedAt: "", latestVerified: false, action: "", refs: [],
    attachments: [], basisRefs: [], candidate: false,
  };
}
const norm = (s: string) => s.trim().toLowerCase().normalize("NFC");
const known = (s: string) => !!s.trim() && !["미확인", "확인 필요", "unknown"].includes(norm(s));
const fullSha = (s: string) => /^[a-f\d]{40}$/i.test(s);
const fileHash = (s: string) => /^[a-f\d]{64}$/i.test(s);
const observed = (s: string) => Number.isFinite(Date.parse(s)) && Date.parse(s) <= Date.now();
const passed = (s: string) => ["통과", "성공", "passed", "success"].includes(norm(s));
const basename = (s: string) => norm(s).split(/[\\/]/).pop();
const repoId = (s: string) => norm(s).replace(/^https?:\/\/(?:www\.)?github\.com\//, "").replace(/\/$/, "").replace(/\.git$/, "");
function prId(row: CoordinationItem) {
  const short = /^#?([1-9]\d*)$/.exec(row.pr);
  if (short) return short[1];
  const url = /^https?:\/\/(?:www\.)?github\.com\/([^/]+\/[^/]+)\/pull\/([1-9]\d*)\/?$/i.exec(row.pr);
  return url && repoId(url[1]) === repoId(row.repo) ? url[2] : "";
}
function evidenceGaps(row: CoordinationItem) {
  const missing: string[] = [];
  if (![...row.refs, ...row.attachments].some(link => isSafeUrl(link.url))) missing.push("실측 근거 링크 또는 첨부 증빙");
  if (!row.latestVerified) missing.push("최신 증빙 직접 대조");
  if (!observed(row.evidenceAt)) missing.push("증빙 확인 시점");
  return missing;
}
export function coordinationMissing(row: CoordinationItem): string[] {
  const missing = evidenceGaps(row);
  const names = { repo: "저장소", branch: "브랜치", pr: "PR", commit: "대상 커밋", merge: "병합 여부", ci: "CI 결과",
    ciCommit: "CI 검증 커밋", deployment: "배포 여부", deployCommit: "배포 커밋", smoke: "배포 후 스모크", migration: "마이그레이션 여부",
    platform: "플랫폼 제출 상태", mentor: "멘토 반영 여부", file: "파일명", version: "후보 버전", approvedVersion: "승인 기준 버전",
    digest: "파일 SHA-256", owner: "확인 담당자", checkedAt: "최종 확인 시점" };
  for (const key of row.required ?? []) {
    if (!known(row[key]) || (["commit","ciCommit","deployCommit"].includes(key) && row[key] !== "해당 없음" && !fullSha(row[key]))) missing.push(names[key]);
  }
  if (known(row.pr) && row.pr !== "해당 없음" && !known(row.merge)) missing.push("PR 병합 여부");
  if (row.deployment === "배포 완료") {
    if (!fullSha(row.commit)) missing.push("대상 커밋 전체 SHA");
    if (!fullSha(row.ciCommit)) missing.push("CI 커밋 전체 SHA");
    if (!fullSha(row.deployCommit)) missing.push("배포 커밋 전체 SHA");
    if (!known(row.ci)) missing.push("CI 결과");
    if (!known(row.smoke)) missing.push("배포 후 스모크");
  }
  if (row.candidate && known(row.file)) {
    if (!known(row.approvedVersion)) missing.push("승인 기준 버전");
    if (!known(row.version)) missing.push("후보 파일 버전");
  }
  if (row.status === "최종 확인") {
    if (!known(row.owner)) missing.push("최종 확인 담당자");
    if (!observed(row.checkedAt) || Date.parse(row.checkedAt) < Date.parse(row.evidenceAt)) missing.push("증빙 대조 후 최종 확인 시점");
  }
  return [...new Set(missing)];
}

function versionKey(version: string) {
  const numbered = /^([rv]?)(\d+(?:\.\d+)*)$/i.exec(version);
  if (numbered) return { family: numbered[1].toLowerCase() === "r" ? "r" : "v", parts: numbered[2].split(".").map(Number) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(version)) {
    const date = Date.parse(version);
    if (Number.isFinite(date) && new Date(date).toISOString().startsWith(version)) return { family: "date", parts: [date] };
  }
  return null;
}
function olderVersion(candidate: string, approved: string): boolean {
  const a = versionKey(candidate), b = versionKey(approved);
  if (!a || !b || a.family !== b.family) return false;
  for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i++) {
    const delta = (a.parts[i] ?? 0) - (b.parts[i] ?? 0);
    if (delta !== 0) return delta < 0;
  }
  return false;
}
function candidateWarnings(row: CoordinationItem, rows: readonly CoordinationItem[]) {
  const warnings: string[] = [];
  if (!row.candidate) return warnings;
  for (const other of rows) {
    if (!other.candidate || other.id === row.id) continue;
    if (fileHash(row.digest) && norm(row.digest) === norm(other.digest)) warnings.push(`동일 파일 해시의 중복 제출 후보 · ${other.title}`);
    else if (known(row.file) && basename(row.file) === basename(other.file)) warnings.push(`동일 파일명 제출 후보 · ${other.title}`);
    if (!known(row.repo) || repoId(row.repo) !== repoId(other.repo)) continue;
    if (fullSha(row.commit) && fullSha(other.commit)) {
      if (norm(row.commit) === norm(other.commit)) warnings.push(`동일 변경의 중복 제출 후보 · ${other.title}`);
    } else if (prId(row) && prId(row) === prId(other)) warnings.push(`동일 PR의 중복 제출 후보 · ${other.title}`);
  }
  return warnings;
}
function variantWarnings(row: CoordinationItem) {
  const names = new Map<string, Set<string>>();
  const hashes = new Map<string, number>();
  for (const item of row.comparisons ?? []) {
    const hash = norm(item.sha), name = basename(item.file);
    if (!fileHash(hash)) continue;
    hashes.set(hash, (hashes.get(hash) ?? 0) + 1);
    if (!name) continue;
    const group = names.get(name) ?? new Set<string>();
    group.add(hash); names.set(name, group);
  }
  const warnings: string[] = [];
  for (const [name, group] of names) if (group.size > 1) warnings.push(`같은 이름의 서로 다른 후보 · ${name} · 해시 ${group.size}종`);
  for (const [hash, count] of hashes) if (count > 1) warnings.push(`같은 내용의 후보 사본 · ${hash.slice(0, 12)} · ${count}개`);
  return warnings;
}
function changeWarnings(row: CoordinationItem, rows: readonly CoordinationItem[]) {
  const warnings = candidateWarnings(row, rows);
  if (known(row.version) && known(row.approvedVersion) && norm(row.version) !== norm(row.approvedVersion)) {
    warnings.push(`${olderVersion(row.version, row.approvedVersion) ? "구버전 후보" : "승인 버전 불일치"} · ${row.version} / ${row.approvedVersion}`);
  }
  if (row.merge === "미병합") warnings.push("미병합 변경");
  if (row.ci === "실패") warnings.push("CI 실패 기록");
  if (fullSha(row.commit) && fullSha(row.ciCommit) && norm(row.commit) !== norm(row.ciCommit)) warnings.push("제출 대상 커밋과 CI 검증 커밋 불일치");
  if (row.deployment === "배포 완료") {
    if (![row.commit, row.ciCommit, row.deployCommit].every(fullSha) || !passed(row.ci) || !passed(row.smoke)) warnings.push("미검증 배포 · 전체 SHA와 CI 및 스모크 통과 근거 필요");
    if (fullSha(row.deployCommit) && fullSha(row.commit) && norm(row.deployCommit) !== norm(row.commit)) warnings.push("제출 대상 커밋과 배포 커밋 불일치");
  }
  return warnings;
}
export function coordinationWarnings(row: CoordinationItem, rows: readonly CoordinationItem[] = []): string[] {
  return [...new Set([...changeWarnings(row, rows), ...variantWarnings(row)])];
}
export function coordinationStatus(row: CoordinationItem, rows: readonly CoordinationItem[] = []): CoordinationStatus {
  if (evidenceGaps(row).length) return "미확인";
  if (row.action) return "승인 대기";
  if (row.status === "검증 완료" || row.status === "최종 확인") {
    if (coordinationMissing(row).length) return "미확인";
    if (changeWarnings(row, rows).length) return "검토 필요";
    if (variantWarnings(row).length && !row.comparisons?.some(item => fileHash(row.digest) && norm(item.sha) === norm(row.digest))) return "검토 필요";
  }
  return row.status;
}

const material = ["project","sourceTaskId","operationId","title","file","version","approvedVersion","digest","repo","branch","pr","commit","merge","ci","ciCommit","deployment","deployCommit","smoke","migration","platform","mentor","owner","refs","attachments","basisRefs","candidate","comparisons","action","required","related","sourceNote"] as const;
export function coordinationBasisChanged(row: CoordinationItem, old: CoordinationItem, next: BoardState, previous: BoardState): boolean {
  if (material.some(key => JSON.stringify(row[key]) !== JSON.stringify(old[key]))) return true;
  if (!row.sourceTaskId) return false;
  const task = next.tasks.find(t => t.id === row.sourceTaskId);
  const former = previous.tasks.find(t => t.id === row.sourceTaskId);
  if (!task || !former) return task !== former;
  if (JSON.stringify({...task, updatedAt: ""}) !== JSON.stringify({...former, updatedAt: ""})) return true;
  return JSON.stringify(next.documents.find(doc => doc.id === task.docId)) !== JSON.stringify(previous.documents.find(doc => doc.id === former.docId));
}
