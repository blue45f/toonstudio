import { readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { findAtlasEntry } from "./engineering-atlas-content";
import { ENGINEERING_GLOSSARY } from "./engineering-glossary-content";
import { SEMINAR_PREP_CHECKLIST, SEMINAR_PREP_QUESTIONS } from "./engineering-seminar-prep-content";
import {
  HANGUL, cardText, dependencyNames, flat, mapText, onnxModelFiles, patchedDependencyCount, readIfPresent, readText, repo, repoExists, sentenceCount,
  sentencesOf,
} from "./engineering-seminar-test-kit";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";

import { NEXTGEN_LAB_DEFAULTS } from "@/shared/lib/nextgen-lab-settings";
import { NEXTGEN_CAPABILITY_IDS } from "@/shared/lib/nextgen-web-capabilities";

/**
 * 준비실 예상 질문(`SEMINAR_PREP_QUESTIONS`)의 콘텐츠 계약 검사. 레슨은 engineering-seminar-lessons.test.ts 가 맡는다.
 * 답변에 쓴 수치와 파일은 원본(코드·설정·문서)과 대조하고, 대조표의 `needles` 가 실제 답변에 들어 있는지도 확인한다.
 */

const questions = SEMINAR_PREP_QUESTIONS;
const glossaryIds = new Set<string>(ENGINEERING_GLOSSARY.map((term) => term.id));

/** 새로 더한 질문 12개가 다루는 주제(도감 카드 id 로 표시). 하나라도 빠지면 주제가 사라진 것이다. */
const NEW_TOPIC_ATLAS_IDS = [
  "supabase-single-writer-authority", // 무료 인프라 한도·위험
  "oss-pnpm-patches-no-unsafe-eval", // 오픈소스 고쳐 쓰는 비용
  "virtual-studio-architecture-overview", // 경쟁·참고 제품과의 차이
  "resource-engine-one-contract", // 외부 API 장애
  "webrtc-ice-turn-paths", // 직접 연결이 막힌 네트워크
  "onnx-runtime-web-inference", // 기기 안 AI 크기·정확도
  "compression-streams-zip-bomb-guard", // 큰 파일·ZIP 폭탄
  "dnd-implementation-choice", // 직접 만든 끌어 놓기
  "agent-harness-verify-gates", // AI 에이전트 개발 품질
  "proximity-video-capacity-chain", // 가상 스튜디오 정원
  "capability-detection-registry-27", // 차세대 웹 미지원 브라우저
  "payment-idempotency-webhook-reconcile", // 결제·크레딧 이중 청구
  "version-skew-chunk-reload-recovery", // 프런트·백엔드 버전이 어긋날 때
] as const;
/** 운영 상태를 저장소로 확인하지 못하는 주제는 답변이 "미확인/확인하지 못" 을 직접 말해야 한다. */
const MUST_ADMIT_UNCONFIRMED = [
  "static-first-edge-gateway", "supabase-single-writer-authority", "oss-license-notice-pipeline", "resource-engine-one-contract",
  "webrtc-ice-turn-paths", "onnx-runtime-web-inference", "agent-harness-verify-gates", "payment-idempotency-webhook-reconcile",
  "capability-detection-registry-27", "virtual-studio-architecture-overview", "version-skew-chunk-reload-recovery",
] as const;
/** 경쟁 지도 행이 늘어나도 질문은 영역별 대표만 든다. */
const KNOWN_PRODUCTS = [
  "Clip Studio Paint", "Krita", "Procreate", "Photoshop", "MediBang", "ibisPaint", "Gather", "WorkAdventure", "Kumospace", "Figma", "Miro", "tldraw",
  "Blender", "SketchUp", "Spline", "VRoid", "MetaHuman", "Storyboard Pro", "Boords", "Canva", "WEBTOON CANVAS", "ComfyUI", "Godot", "Unity",
] as const;
const DND_LIBRARIES = /dnd-kit|react-dnd|react-beautiful-dnd|sortablejs|interactjs|@use-gesture|react-aria/iu;

interface PrepFact {
  readonly atlasId: string;
  /** 답변(한국어)에 이 문구가 실제로 있어야 한다. 문구가 바뀌면 대조표도 함께 고치게 만든다. */
  readonly needles: readonly string[];
  readonly check: () => void;
}

const PREP_FACTS: readonly PrepFact[] = [
  {
    atlasId: "server-down-fallback-deadline", needles: ["4초", "/offline-drawing", "408"],
    check: () => {
      const navigation = readText("apps", "web", "src", "app", "service-worker", "studio-service-worker-navigation.ts");
      expect(navigation).toContain("STUDIO_NAVIGATION_TIMEOUT_MS = 4_000;");
      expect(navigation).toContain("response.status === 408 || response.status >= 500");
      expect(readText("apps", "web", "src", "app", "service-worker", "studio-local-drawing-rescue.ts")).toContain('LOCAL_DRAWING_URL = "/offline-drawing"');
    },
  },
  {
    atlasId: "hokusai-wasm-natural-media", needles: ["MIT OR Apache-2.0", "0.3.0", "승격 게이트"],
    check: () => {
      expect(flat("THIRD_PARTY_NOTICES.md")).toMatch(/hokusai-tile-mem` \| 0\.3\.0 \| MIT OR Apache-2\.0/u);
      expect(readText("packages", "studio-hokusai-wasm", "Cargo.toml")).toContain('hokusai-core = "=0.3.0"');
      expect(cardText("hokusai-wasm-natural-media")).toContain("승격 게이트 미통과");
    },
  },
  {
    atlasId: "ai-proposal-not-commit", needles: ["이동평균", "402·429"],
    check: () => {
      expect(readText("apps", "web", "src", "domains", "creator", "ai", "studio-stroke-proposal-bridge.ts")).toContain('model: "moving-average-v1"');
      expect(readText("apps", "web", "src", "shared", "ai", "user-ai-transport.ts")).toContain("response.status === 402 || response.status === 429");
    },
  },
  {
    atlasId: "static-first-edge-gateway", needles: ["15분", "약 1분", "Neon은 legacy로 보존"],
    check: () => {
      const deploy = flat("DEPLOY.md");
      expect(deploy).toContain("15분 동안 없으면 spin down");
      expect(deploy).toContain("cold start는 약 1분 걸릴 수 있습니다");
      expect(mapText("free-tier")).toContain("옛 Neon은 보존합니다");
    },
  },
  {
    atlasId: "renderer-role-ledger", needles: ["perfect-freehand", "p5.brush", "Hokusai", "libmypaint"],
    check: () => {
      const ledger = flat("packages", "studio-engine-registry", "src", "renderer-roles.ts");
      expect(ledger).toMatch(/id: "perfect-freehand", displayName: "[^"]+", role: "primary"/u);
      expect(ledger).toMatch(/id: "p5-brush", displayName: "[^"]+", role: "provider"/u);
      expect(ledger).toMatch(/id: "hokusai-wasm", displayName: "[^"]+", role: "primary"/u);
      expect(ledger).toMatch(/id: "libmypaint-wasm", displayName: "[^"]+", role: "reference"/u);
    },
  },
  {
    atlasId: "toon-shading-outline", needles: ["컬러·톤·질감선·주선"],
    check: () => {
      expect(readText("apps", "web", "src", "domains", "creator", "bg3d", "studio-bg3d-lt-layer-plan.ts")).toContain('["color", "tone", "texture-line", "main-line"]');
    },
  },
  {
    atlasId: "yjs-crdt-document", needles: ["변경 로그와 체크포인트", "불변식"],
    check: () => {
      const text = cardText("yjs-crdt-document");
      expect(text).toContain("변경 로그와 체크포인트");
      expect(text).toContain("불변식");
    },
  },
  {
    atlasId: "oss-license-notice-pipeline", needles: ["CC BY-NC 4.0", "Remotion", "wasm-vips", "THIRD_PARTY_NOTICES.md", "MIT OR Apache-2.0"],
    check: () => {
      const notices = flat("THIRD_PARTY_NOTICES.md");
      expect(notices).toMatch(/`mixbox` \| 2\.0\.0 \| CC BY-NC 4\.0/u);
      expect(notices).toContain("Remotion License");
      const card = cardText("oss-license-notice-pipeline");
      expect(card).toContain("wasm-vips");
      expect(card).toContain("LGPL");
    },
  },
  {
    atlasId: "pointer-input-contract", needles: ["reuseSteps"],
    check: () => {
      const steps = (PUBLISHED_ENGINEERING_CHAPTERS.find((chapter) => chapter.id === "brush-engine")?.reuseSteps ?? []).map((step) => step.ko).join(" ");
      for (const phrase of ["별도 인터페이스", "긴 획과 고밀도 포인터", "결과 패리티"]) expect(steps, phrase).toContain(phrase);
    },
  },
  {
    atlasId: "supabase-single-writer-authority", needles: ["2026-09-26", "Supabase", "Neon"],
    check: () => {
      // 1차 근거는 기술 지도의 무료 서비스 표(코드 안), 문서는 내려받은 환경(부분 체크아웃이 아닐 때)에서만 보조로 대조한다.
      const freeTier = mapText("free-tier");
      expect(freeTier).toContain("2026-09-26 사용자 승인으로 Supabase에서 빈 상태로 새로 시작했고");
      expect(freeTier).toContain("옛 Neon은 보존합니다");
      expect(repoExists("docs", "operations", "federated-free-database-data-plane.md")).toBe(true);
      const doc = readIfPresent("docs", "operations", "federated-free-database-data-plane.md");
      if (doc !== null) expect(doc.replace(/\s+/gu, " ")).toContain("기존 Neon 원본 보존");
    },
  },
  {
    atlasId: "oss-pnpm-patches-no-unsafe-eval", needles: ["포크 2개", "29.0.4", "toon-fabric", "unsafe-eval", "braces", "깊이 100"],
    check: () => {
      // 패치 개수는 하드코딩하지 않고 pnpm-workspace.yaml 의 patchedDependencies 에서 센다. 패치 파일 수와도 맞아야 한다.
      const count = patchedDependencyCount();
      expect(readdirSync(repo("patches")).filter((name) => name.endsWith(".patch"))).toHaveLength(count);
      const item = questions.find((candidate) => candidate.atlasId === "oss-pnpm-patches-no-unsafe-eval");
      expect(item?.answer.ko).toContain(`pnpm 패치 ${count}개`);
      expect(item?.answer.en).toContain(`${["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][count]} pnpm patches`);
      const cargo = readText("crates", "vendor", "wgpu-toon", "Cargo.toml");
      expect(cargo).toMatch(/name = "wgpu"\s+version = "29\.0\.4"/u);
      expect(cargo).toContain("toon-fabric = []");
      expect(flat("pnpm-workspace.yaml")).toContain("'braces@>=3.0.0 <3.0.4': 'file:patches/braces'");
      expect(readText("patches", "braces", "lib", "constants.js")).toContain("MAX_DEPTH: 100,");
      // 카드의 패치 개수 표기는 카드 담당이 갱신하므로 숫자는 묻지 않고 '3개는 new Function' 구조만 본다.
      expect(cardText("oss-pnpm-patches-no-unsafe-eval")).toMatch(/패치 \d+개 중 3개는 new Function/u);
    },
  },
  {
    atlasId: "virtual-studio-architecture-overview", needles: ["Clip Studio Paint", "Gather", "Blender", "Storyboard Pro", "ADR 0008", ".clip", "clean-room"],
    check: () => {
      // 1차 근거는 경쟁·참고 제품 지도(코드 안), 문서는 내려받은 환경(부분 체크아웃이 아닐 때)에서만 보조로 대조한다.
      const competitors = mapText("competitors");
      for (const phrase of ["Clip Studio Paint", ".clip", "Storyboard Pro", "Gather", "Blender", "clean-room", "ADR 0008"]) expect(competitors, phrase).toContain(phrase);
      expect(repoExists("docs", "studio-commercial-clean-room-radar-2026-07-28.md")).toBe(true);
      expect(repoExists("docs", "adr", "0008-license-isolation-policy.md")).toBe(true);
      const radar = readIfPresent("docs", "studio-commercial-clean-room-radar-2026-07-28.md");
      if (radar !== null) expect(radar).toContain("디컴파일");
      const adr = readIfPresent("docs", "adr", "0008-license-isolation-policy.md");
      if (adr !== null) expect(adr).toContain("Krita GPL 코어는 reference-only다.");
    },
  },
  {
    atlasId: "resource-engine-one-contract", needles: ["6초", "2MiB", "1~120초", "30초"],
    check: () => {
      const engine = readText("apps", "api", "src", "modules", "creator-resources", "resource-engine.ts");
      expect(engine).toContain("AbortSignal.timeout(6000)");
      expect(engine).toContain("MAX_BODY = 2 * 1024 * 1024;");
      expect(engine).toContain('redirect: "error"');
      const retry = flat("packages", "contracts", "src", "creator-resource-workflow.ts");
      expect(retry).toContain("if (!value?.trim()) return 30;");
      expect(retry).toContain("Math.min(120, Math.max(1, Math.ceil(seconds)))");
    },
  },
  {
    atlasId: "webrtc-ice-turn-paths", needles: ["4시간", "900초", "STUN"],
    check: () => {
      expect(readText("deploy", "cloudflare-realtime", "src", "turn.ts")).toContain("REALTIME_TURN_TTL_SECONDS = 4 * 60 * 60;");
      expect(readText("apps", "api", "src", "modules", "creator", "studio-voice-ice-policy.service.ts")).toContain("STUDIO_VOICE_TURN_DEFAULT_TTL_SECONDS = 900;");
      expect(cardText("webrtc-ice-turn-paths")).toContain("STUN 전용");
    },
  },
  {
    atlasId: "onnx-runtime-web-inference", needles: ["119,438,571", "79MB", "123MB", "SHA-256", "512×512", "2026-10-03"],
    check: () => {
      const files = onnxModelFiles();
      expect(files).toHaveLength(6);
      expect(files.reduce((sum, file) => sum + file.bytes, 0)).toBe(119_438_571);
      expect(Math.max(...files.map((file) => file.bytes))).toBe(79_269_994);
      expect(readText("apps", "web", "src", "domains", "creator", "studio-onnx-tag2pix.ts")).toContain("STUDIO_TAG2PIX_INPUT_SIZE = 512");
      expect(cardText("transformers-js-translation")).toContain("123");
      expect(readText("onnx-poc", "README.md")).toContain("2,632ms");
    },
  },
  {
    atlasId: "compression-streams-zip-bomb-guard", needles: ["100배", "256MB", "12MiB", "16,777,216", "8,388,608", "DECOMPRESSION_UNAVAILABLE"],
    check: () => {
      const zip = readText("apps", "web", "src", "domains", "creator", "studio-zip-reader.ts");
      expect(zip).toContain("maxCompressionRatio: 100,");
      expect(zip).toContain("maxEntryUncompressedBytes: 256_000_000,");
      expect(zip).toContain('"DECOMPRESSION_UNAVAILABLE"');
      const upload = readText("apps", "web", "src", "domains", "creator", "studio-upload-image-safety.ts");
      expect(upload).toContain("STUDIO_UPLOAD_MAX_SOURCE_FILE_BYTES = 12 * 1024 * 1024;");
      expect(upload).toContain("STUDIO_UPLOAD_DESKTOP_MAX_DECODED_PIXELS = 16_777_216;");
      expect(upload).toContain("STUDIO_UPLOAD_MOBILE_MAX_DECODED_PIXELS = 8_388_608;");
    },
  },
  {
    atlasId: "dnd-implementation-choice", needles: ["package.json", "Alt+방향키", "Konva", "ADR"],
    check: () => {
      expect(dependencyNames().filter((name) => DND_LIBRARIES.test(name))).toEqual([]);
      expect(readText("apps", "web", "src", "domains", "creator", "production-hub", "board", "board-shortcuts.ts")).toContain("ALT_ARROWS");
      expect(cardText("dnd-implementation-choice")).toContain("결정 문서(ADR)가 아닙니다");
    },
  },
  {
    atlasId: "agent-harness-verify-gates", needles: ["AGENTS.md", "40자리", "23개", "harness:verify"],
    check: () => {
      expect(readText("AGENTS.md")).toContain("승인한 40자리 main SHA 하나만");
      expect(readdirSync(repo(".opencode", "command")).filter((name) => name.startsWith("loop"))).toHaveLength(23);
      expect(readText("package.json")).toContain('"harness:verify"');
    },
  },
  {
    atlasId: "proximity-video-capacity-chain", needles: ["24명", "8명", "3명", "64"],
    check: () => {
      expect(readText("apps", "web", "src", "domains", "creator", "virtual-space", "studio-virtual-space-model.ts")).toContain("STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS = 24;");
      expect(readText("apps", "web", "src", "domains", "creator", "live", "studio-live-p2p-overlay-transport.ts")).toContain("STUDIO_LIVE_P2P_MAX_PEERS = 8;");
      expect(readText("apps", "web", "src", "domains", "creator", "live", "huddle", "studio-p2p-huddle-protocol.ts")).toContain("HUDDLE_MAX_REMOTE_PEERS = 3;");
      expect(readText("deploy", "cloudflare-realtime", "src", "room-core.ts")).toContain("maxConnectionsPerRoom: 64,");
    },
  },
  {
    atlasId: "capability-detection-registry-27", needles: ["27종", "세 가지", "WebTransport", "Speculation Rules"],
    check: () => {
      expect(NEXTGEN_CAPABILITY_IDS).toHaveLength(27);
      expect(Object.keys(NEXTGEN_LAB_DEFAULTS)).toEqual(["readerWakeLock", "studioPrerender", "viewTransitions"]);
      expect(cardText("capability-detection-registry-27")).toContain("화면 꺼짐 방지·스튜디오 미리 준비·화면 전환·스포이트");
    },
  },
  {
    atlasId: "version-skew-chunk-reload-recovery", needles: ["pnpm 11", "Node 24.16", "--frozen-lockfile", "@toonstudio/contracts", "프로토콜 버전(8)", "세션당 한 번", "헬스 응답은 커밋 SHA를 말하지 않", "미확인"],
    check: () => {
      const pkg = JSON.parse(readText("package.json")) as { readonly packageManager: string; readonly engines: { readonly node: string } };
      expect(pkg.packageManager).toMatch(/^pnpm@11\./u);
      expect(pkg.engines.node).toBe(">=24.16.0");
      expect(readText(".github", "workflows", "admin-hardening-regression.yml")).toContain("pnpm install --frozen-lockfile");
      expect(readText("apps", "web", "src", "shared", "lib", "strict-raster-image-inspector.ts")).toContain("@toonstudio/contracts");
      expect(readText("apps", "api", "src", "modules", "catalog", "catalog.controller.ts")).toContain("@toonstudio/contracts");
      const protocol = readText("apps", "api", "src", "modules", "creator", "studio-live.protocol.ts");
      expect(protocol).toContain("STUDIO_CRDT_PROTOCOL_VERSION = 8 as const;");
      expect(protocol).toContain("z.literal(STUDIO_CRDT_PROTOCOL_VERSION)");
      expect(readText("apps", "web", "src", "app", "errors", "chunk-reload-guard.ts")).toContain("세션당 1회");
      const skew = cardText("version-skew-chunk-reload-recovery");
      expect(skew).toContain("세션당 한 번만 자동 새로고침");
      expect(skew).toContain("정책과 리뷰에 의존");
      expect(cardText("build-fingerprint-map")).toContain("번들과 API 헬스 응답에는 커밋 SHA가 없음");
    },
  },
  {
    atlasId: "payment-idempotency-webhook-reconcile", needles: ["미확인", "판매가 꺼져", "예약"],
    check: () => {
      expect(readText("packages", "core", "src", "membership-wallet.ts")).toContain("creditPurchasesEnabled: false,");
      const card = cardText("payment-idempotency-webhook-reconcile");
      expect(card).toContain("마켓 승인");
      expect(card).toContain("재조회");
    },
  },
];

describe("준비실 예상 질문 계약", () => {
  it("질문은 18~24개이고 질문·답변이 겹치지 않으며 한영 문구가 모두 있다", () => {
    expect(questions.length).toBeGreaterThanOrEqual(18);
    expect(questions.length).toBeLessThanOrEqual(24);
    expect(new Set(questions.map((item) => item.question.ko)).size).toBe(questions.length);
    expect(new Set(questions.map((item) => item.question.en)).size).toBe(questions.length);
    expect(new Set(questions.map((item) => item.answer.ko)).size).toBe(questions.length);
    const problems: string[] = [];
    questions.forEach((item, index) => {
      const at = (message: string): number => problems.push(`Q${index + 1}: ${message}`);
      for (const field of ["question", "answer"] as const) {
        if (!item[field].ko.trim() || !item[field].en.trim()) at(`${field} 한국어 또는 영어가 비어 있음`);
        if (HANGUL.test(item[field].en)) at(`${field} 영어에 한글`);
      }
      if (item.answer.ko.length < 80 || item.answer.ko.length > 700) at(`한국어 답변 ${item.answer.ko.length}자`);
      if (item.answer.en.length < 120 || item.answer.en.length > 1300) at(`영어 답변 ${item.answer.en.length}자`);
      const ko = sentenceCount(item.answer.ko);
      const en = sentenceCount(item.answer.en);
      if (ko < 2 || ko > 3) at(`한국어 답변 ${ko}문장`);
      if (en < 2 || en > 3) at(`영어 답변 ${en}문장`);
    });
    expect(problems).toEqual([]);
  });

  it("모든 질문에 실제 도감 카드가 연결되고, 용어집 id 는 실제 용어다", () => {
    const problems: string[] = [];
    questions.forEach((item, index) => {
      if (!item.atlasId || !findAtlasEntry(item.atlasId)) problems.push(`Q${index + 1}: 없는 도감 카드 ${item.atlasId}`);
      if (item.glossaryId && !glossaryIds.has(item.glossaryId)) problems.push(`Q${index + 1}: 없는 용어 ${item.glossaryId}`);
    });
    expect(problems).toEqual([]);
  });

  it("새 질문 13개의 주제가 모두 남아 있다", () => {
    const covered = new Set(questions.map((item) => item.atlasId));
    expect(NEW_TOPIC_ATLAS_IDS.filter((id) => !covered.has(id))).toEqual([]);
    expect(questions.length).toBeGreaterThanOrEqual(10 + NEW_TOPIC_ATLAS_IDS.length);
  });

  it("확인하지 못한 운영 상태는 답변이 직접 미확인이라고 말한다", () => {
    const unconfirmed = /미확인|확인하지 못|확인하지 않|조사하지 않|확인할 수 없/u;
    const missing = MUST_ADMIT_UNCONFIRMED.filter((id) => {
      const item = questions.find((candidate) => candidate.atlasId === id);
      return !item || !unconfirmed.test(item.answer.ko);
    });
    expect(missing).toEqual([]);
  });

  it("우열·유일·대체/동등 주장이 없고, Neon 은 Supabase/legacy 와 함께 과거 사실로만 나온다", () => {
    const bannedKo = /최고|최강|최상|유일|압도|독보|완벽|세계 최|업계 최|1위|동등하다|동등합니다|대체했|대체한다|대체합니다/u;
    const bannedEn = /\b(?:best|greatest|unrivaled|unmatched|world-class|state-of-the-art|dominant|superior|outperforms?|market leader|industry-leading)\b/iu;
    const problems: string[] = [];
    const all = [...questions.flatMap((item) => [item.question, item.answer]), ...SEMINAR_PREP_CHECKLIST];
    all.forEach((text, index) => {
      if (bannedKo.test(text.ko)) problems.push(`#${index}: 금지 표현(ko) ${text.ko.match(bannedKo)?.[0]}`);
      if (bannedEn.test(text.en)) problems.push(`#${index}: 금지 표현(en) ${text.en.match(bannedEn)?.[0]}`);
      for (const sentence of [...sentencesOf(text.ko), ...sentencesOf(text.en)]) {
        if (/\bNeon\b/u.test(sentence) && !/Supabase|legacy|보존|preserved/iu.test(sentence)) problems.push(`#${index}: Neon 이 Supabase/legacy 없이 나옴 "${sentence}"`);
      }
    });
    expect(problems).toEqual([]);
  });

  it("라이선스 답변은 사실만 말하고 판단은 소유자의 결정·별도 확인으로 남긴다", () => {
    const item = questions.find((candidate) => candidate.atlasId === "oss-license-notice-pipeline");
    expect(item?.answer.ko).toMatch(/소유자/u);
    expect(item?.answer.ko).toMatch(/별도 확인/u);
    expect(item?.answer.ko).toMatch(/법률 판단은 하지 않습니다/u);
    expect(item?.answer.en).toMatch(/no legal judgment/u);
  });

  it("경쟁·참고 제품 질문은 영역별 대표만 들고(제품 4개 이하) 우열·가격·점유율을 조사하지 않았다고 말한다", () => {
    const item = questions.find((candidate) => candidate.atlasId === "virtual-studio-architecture-overview");
    const named = KNOWN_PRODUCTS.filter((product) => item?.answer.ko.includes(product));
    expect(named.length).toBeGreaterThanOrEqual(1);
    expect(named.length).toBeLessThanOrEqual(4);
    expect(item?.answer.ko).toMatch(/가격·점유율·우열은 확인하지 않았습니다/u);
    // 우리 제품 차별점 질문도 경쟁 제품의 가격·점유율·기능 우열을 조사하지 않았다고 밝힌다.
    const differentiation = questions.find((candidate) => candidate.atlasId === "renderer-role-ledger");
    expect(differentiation?.answer.ko).toContain("조사하지 않았습니다");
  });

  it("답변의 수치·파일은 원본과 같고, 대조표의 문구가 실제 답변에 들어 있다", () => {
    const problems: string[] = [];
    for (const fact of PREP_FACTS) {
      const item = questions.find((candidate) => candidate.atlasId === fact.atlasId);
      if (!item) {
        problems.push(`${fact.atlasId}: 이 도감 카드에 연결된 질문이 없음`);
        continue;
      }
      for (const needle of fact.needles) if (!item.answer.ko.includes(needle)) problems.push(`${fact.atlasId}: 답변에 "${needle}" 없음`);
    }
    expect(problems).toEqual([]);
    for (const fact of PREP_FACTS) fact.check();
  }, 60_000);

  it("체크리스트는 5개 이상이고 질문 수를 센 문구를 쓰며 영어에 한글이 없다", () => {
    expect(SEMINAR_PREP_CHECKLIST.length).toBeGreaterThanOrEqual(5);
    const countItem = SEMINAR_PREP_CHECKLIST.find((item) => item.ko.includes("예상 질문"));
    expect(countItem?.ko).toContain(`${questions.length}개`);
    expect(countItem?.en).toContain(`${questions.length} anticipated questions`);
    for (const item of SEMINAR_PREP_CHECKLIST) {
      expect(item.ko.trim()).not.toBe("");
      expect(item.en.trim()).not.toBe("");
      expect(HANGUL.test(item.en)).toBe(false);
    }
  });
});
