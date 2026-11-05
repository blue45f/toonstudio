import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

// 파일 이름 변경으로 알려진 권리 제한 가중치가 배포 검사를 빠져나가지 않게 한다.
export const REVIEWED_MODEL_FINDINGS = Object.freeze([
  {
    model: "Tag2Pix",
    sha256: "ae01698835b99a009533ebbcf840d416a32bee0c0f4c9be060c21ab2084491cc",
    byteLength: 79_269_994,
    status: "noncommercial-and-redistribution-restricted",
    disposition: "block",
    source: "https://github.com/blandocs/Tag2Pix#license",
  },
  {
    model: "AnimeGANv2 Paprika",
    sha256: "7cb5bf08d7778a8f4e25f1e654fdc24d56dc9b6cbb9c1db42e4f9d0425e7fe62",
    byteLength: 8_702_673,
    status: "upstream-noncommercial-conflicts-with-port-license",
    disposition: "block",
    source: "https://github.com/TachibanaYoshino/AnimeGANv2#license",
  },
  {
    model: "AnimeGAN Face Paint v2",
    sha256: "54ce55c73dc974c24fa55cf1204577a6181c7e86d312a3a07f798bbbd99d4ee2",
    byteLength: 8_702_673,
    status: "mit-repository-checkpoint-training-provenance-review",
    disposition: "review",
    source: "https://github.com/bryandlee/animegan2-pytorch#additional-model-weights",
  },
]);

async function digestFile(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

/** 알려진 원본 바이트의 해시만 검사한다. 압축·변환된 모델이나 전체 배포 권리의 판정은 아니다. */
export async function inspectRestrictedModels(directory, findings = REVIEWED_MODEL_FINDINGS) {
  const root = resolve(directory);
  if (findings.some((finding) => !Number.isSafeInteger(finding.byteLength) || finding.byteLength <= 0)) {
    throw new Error("모델 검사 목록에는 양의 정수 byteLength가 필요합니다.");
  }
  const byDigest = new Map(findings.map((finding) => [finding.sha256, finding]));
  if (byDigest.size !== findings.length) throw new Error("모델 검사 목록의 SHA-256은 중복될 수 없습니다.");
  const rootStat = await lstat(root);
  if (rootStat.isSymbolicLink()) throw new Error("검사 루트의 심볼릭 링크는 배포 검사 전에 해소하세요.");
  if (!rootStat.isDirectory()) throw new Error("모델 배포 검사 대상은 디렉터리여야 합니다.");
  const knownSizes = new Set(findings.map((finding) => finding.byteLength));
  const matches = [];
  let inspected = 0;
  let filesVisited = 0;
  let onnxFiles = 0;
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const child = resolve(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`심볼릭 링크는 배포 검사 전에 해소하세요: ${relative(root, child)}`);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) {
        filesVisited += 1;
        const isOnnx = entry.name.toLowerCase().endsWith(".onnx");
        if (isOnnx) onnxFiles += 1;
        // 확장자를 바꾼 원본도 검사하되 큰 배포 전체를 불필요하게 해싱하지 않는다.
        if (!isOnnx && !knownSizes.has((await stat(child)).size)) continue;
        inspected += 1;
        const digest = await digestFile(child);
        const finding = byDigest.get(digest);
        if (finding) matches.push({ path: relative(root, child), ...finding });
      }
    }
  }
  await visit(root);
  const reviewMatches = matches.filter((match) => match.disposition === "review");
  const blockingMatches = matches.filter((match) => match.disposition !== "review");
  return { scope: "selected-known-model-byte-hashes", filesVisited, onnxFiles, inspected, matches, blockingMatches, reviewMatches };
}

export async function main(args = process.argv.slice(2)) {
  const json = args.includes("--json");
  const paths = args.filter((arg) => arg !== "--json");
  if (paths.length > 1 || paths.some((arg) => arg.startsWith("-"))) {
    throw new Error("사용법: node scripts/check-restricted-model-distribution.mjs [배포 디렉터리] [--json]");
  }
  const result = await inspectRestrictedModels(resolve(repositoryRoot, paths[0] ?? "dist"));
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`ONNX ${result.onnxFiles}개 포함, 후보 파일 ${result.inspected}개 해시 검사 — 배포 차단 ${result.blockingMatches.length}개, 출처 검토 ${result.reviewMatches.length}개\n`);
    for (const match of result.matches) process.stdout.write(`${match.model}: ${match.path} — ${match.status}\n`);
    process.stdout.write("범위: 알려진 원본 바이트만 검사하며 압축·변환된 모델 또는 전체 상용 배포 권리를 보증하지 않습니다.\n");
  }
  return result.blockingMatches.length > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.stderr.write(`모델 배포 검사 실패: ${error.message}. 경로와 파일 접근 권한을 확인하세요.\n`);
    process.exitCode = 2;
  }
}
