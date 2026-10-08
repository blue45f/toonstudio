import { FIXTURE_GRAPH, FIXTURE_LAYERS } from "./engineering-diagram.fixtures";
import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/** 도감 페이지·검증 테스트용 예시 카드. 실제 콘텐츠가 아니라 계약을 보여준다. */

export const FIXTURE_ATLAS_OPFS: EngineeringAtlasEntry = {
  id: "fixture-opfs",
  category: "local-first",
  name: "OPFS",
  title: { ko: "브라우저 안의 비공개 파일 시스템", en: "A private file system inside the browser" },
  status: "live",
  tagline: { ko: "원본 레이어와 타일을 기기 안에 파일로 저장합니다.", en: "Stores source layers and tiles as files on the device." },
  background: [
    { ko: "OPFS는 사이트마다 따로 주어지는 비공개 저장 공간으로, 사용자에게 파일 선택 창을 띄우지 않고도 읽고 쓸 수 있습니다.", en: "OPFS is a private storage area per site that can be read and written without a file picker." },
    { ko: "대안인 IndexedDB는 큰 바이너리를 다루기 번거롭고, localStorage는 용량이 작습니다.", en: "IndexedDB is awkward for large binaries and localStorage is small." },
  ],
  keyPoints: [
    { ko: "파일처럼 읽고 씁니다", en: "Read and write like files" },
    { ko: "Worker에서 동기 접근이 가능합니다", en: "Synchronous access in Workers" },
  ],
  diagram: FIXTURE_GRAPH,
  usage: [
    {
      feature: { ko: "캔버스 편집기 · 자동 저장", en: "Canvas editor · autosave" },
      role: { ko: "새로고침해도 작업이 돌아오도록 레이어를 기록합니다.", en: "Writes layers so work returns after a reload." },
      paths: ["apps/web/src/domains/creator/studio-opfs-filesystem.ts"],
      route: "/studio",
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: { ko: "OPFS에 바이트 쓰기", en: "Write bytes to OPFS" },
      language: "ts",
      code: "const root = await navigator.storage.getDirectory();\nconst handle = await root.getFileHandle('layer-1.bin', { create: true });\nconst writable = await handle.createWritable();\nawait writable.write(new Uint8Array([1, 2, 3]));\nawait writable.close();",
      explain: { ko: "디렉터리 핸들을 얻고 파일을 만든 뒤 쓰기 스트림으로 기록합니다.", en: "Get a directory handle, create a file and write through a stream." },
      verify: "types",
    },
  ],
  links: [
    { title: "MDN · Origin private file system", url: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system", kind: "docs", note: { ko: "표준 API 개요", en: "Standard API overview" } },
    { title: "WHATWG File System", url: "https://fs.spec.whatwg.org/", kind: "spec" },
  ],
  chapterIds: ["storage"],
  talk: {
    pitch: { ko: "작품 원본은 서버가 아니라 사용자 기기의 파일로 먼저 저장합니다.", en: "Artwork sources are stored first as files on the user's device, not on a server." },
    analogy: { ko: "사이트 전용 개인 서랍입니다.", en: "A private drawer reserved for the site." },
    questions: [
      {
        question: { ko: "브라우저 저장소를 지우면요?", en: "What if the user clears browser storage?" },
        answer: { ko: "그래서 내보내기와 개인 클라우드 백업을 함께 안내합니다.", en: "That is why export and personal-cloud backup are offered together." },
      },
    ],
    pitfall: { ko: "영구 백업이 아니라는 점을 함께 말합니다.", en: "Say it is not a permanent backup." },
  },
  technologies: ["OPFS", "Dedicated Worker"],
  reviewedAt: "2026-10-07",
};

export const FIXTURE_ATLAS_BUDGET: EngineeringAtlasEntry = {
  id: "fixture-free-budget",
  category: "ai",
  name: "Quota ledger",
  title: { ko: "무료 한도 원장", en: "Free-tier quota ledger" },
  status: "configured",
  tagline: { ko: "무료 한도를 넘기 전에 멈추고 사람에게 묻습니다.", en: "Stops before the free limit and asks a person." },
  background: [
    { ko: "무료 토큰은 자동 과금으로 넘어가지 않도록 호출 전에 예산을 확인합니다. 한도를 넘기면 요청은 거절되고 사용자에게 보입니다.", en: "Free tokens must never roll into billing, so the budget is checked before each call. Over-limit requests are rejected visibly." },
    { ko: "원장은 사용한 만큼만 더하고, 실패한 호출은 되돌리거나 모호하면 기록만 남겨 이중 차감을 막습니다.", en: "The ledger only adds what was spent, and ambiguous failures are recorded rather than retried to avoid double charging." },
  ],
  keyPoints: [
    { ko: "호출 전 예산 확인", en: "Check the budget before calling" },
    { ko: "한도 초과는 보이는 실패", en: "Over-limit is a visible failure" },
  ],
  diagram: FIXTURE_LAYERS,
  usage: [
    {
      feature: { ko: "AI 보조", en: "AI assistance" },
      role: { ko: "요청을 무료 허용 목록과 예산에 맞춰 라우팅합니다.", en: "Routes requests by free allowlist and budget." },
      paths: ["apps/web/src/shared/ai/free-ai-policy.ts"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: { ko: "예산 가드", en: "Budget guard" },
      language: "ts",
      code: "export function canSpend(used: number, limit: number, cost: number): boolean {\n  return used + cost <= limit;\n}",
      explain: { ko: "한도를 넘기는 호출은 거절합니다.", en: "Reject calls that would exceed the limit." },
      source: "apps/web/src/shared/ai/free-ai-runtime-budget.ts",
      verify: "types",
    },
  ],
  links: [
    { title: "Cloudflare Workers pricing", url: "https://developers.cloudflare.com/workers/platform/pricing/", kind: "docs" },
    { title: "MDN · AbortController", url: "https://developer.mozilla.org/en-US/docs/Web/API/AbortController", kind: "docs" },
  ],
  chapterIds: ["free-ai-routing"],
  talk: {
    pitch: { ko: "무료 우선은 공짜가 아니라 비용 경계를 숨기지 않는다는 뜻입니다.", en: "Free-first means cost boundaries stay visible." },
    questions: [{ question: { ko: "한도가 끝나면?", en: "What happens at the limit?" }, answer: { ko: "품질을 몰래 낮추지 않고 승인을 요청합니다.", en: "Quality is not silently lowered; approval is requested." } }],
  },
  technologies: ["Quota ledger"],
  reviewedAt: "2026-10-07",
};
