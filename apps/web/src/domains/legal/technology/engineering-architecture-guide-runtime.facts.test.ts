import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ARCHITECTURE_RUNTIME_SECTIONS } from "./engineering-architecture-guide-runtime";

/**
 * 아키텍처 해설 실행 구조(구간 1~7)가 본문·`facts[]` 에 적은 수치를 코드·설정과 다시 대조한다.
 * 문서가 코드보다 먼저 낡는 것을 막으려는 시험이라, 코드의 상수가 바뀌면 이 시험이 먼저 실패해 해설을 고치게 한다.
 * (읽는 파일은 `deploy/`·`apps/`·`packages/`·`render.yaml`·`config/` 뿐이며 부분 체크아웃에서 빠지는 큰 폴더는 읽지 않는다.)
 */

const read = (path: string): string => readFileSync(path, "utf8");

/** `export const NAME = 값;` 의 값 한 줄(앞뒤 공백 제거). */
function constant(source: string, name: string): string {
  const match = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=\\s*([^;\\n]+);`, "u").exec(source);
  if (!match) throw new Error(`상수 ${name} 를 찾지 못했습니다`);
  return (match[1] as string).trim();
}

function section(id: string) {
  const found = ARCHITECTURE_RUNTIME_SECTIONS.find((item) => item.id === id);
  if (!found) throw new Error(`구간 ${id} 가 없습니다`);
  return found;
}

describe("화면을 여는 순간 (request-journey)", () => {
  it("Worker 가 먼저 받는 경로 패턴은 26개이고 API 4·대형 파일 6·미리보기 16 으로 나뉜다", () => {
    const wrangler = read("deploy/cloudflare-static/wrangler.jsonc");
    const block = /"run_worker_first":\s*\[([\s\S]*?)\]/u.exec(wrangler)?.[1] ?? "";
    const patterns = (block.match(/"[^"]+"/gu) ?? []).map((item) => item.slice(1, -1));
    expect(patterns).toHaveLength(26);
    const api = patterns.filter((pattern) => pattern.startsWith("/api") || pattern.startsWith("/socket.io"));
    const large = patterns.filter((pattern) => pattern.startsWith("/assets/") || pattern.startsWith("/brand/"));
    expect(api).toHaveLength(4);
    expect(large).toHaveLength(6);
    expect(patterns.length - api.length - large.length).toBe(16);
    expect(section("request-journey").facts?.find((fact) => fact.value === "26")?.source).toBe("deploy/cloudflare-static/wrangler.jsonc");
  });

  it("동적 요청 갈래는 7개이고 정적 파일 한도는 25 MiB 이다", () => {
    const index = read("deploy/cloudflare-static/src/index.ts");
    const union = /type DynamicRoute =([\s\S]*?);/u.exec(index)?.[1] ?? "";
    expect(union.match(/"[a-z-]+"/gu)).toHaveLength(7);
    expect(constant(read("deploy/cloudflare-static/src/large-static-assets.ts"), "CLOUDFLARE_STATIC_MAX_FILE_BYTES")).toBe("25 * 1024 * 1024");
  });

  it("Render 의 상태 확인 경로는 DB 를 깨우지 않는 live 이고 무료 플랜이다", () => {
    const render = read("render.yaml");
    expect(render).toContain("healthCheckPath: /api/health/live");
    expect(render).toMatch(/plan:\s*free/u);
  });
});

describe("브라우저 안의 작업실 (browser-studio)", () => {
  it("Worker 스크립트(*.worker.ts)는 앱 코드에 65개, 패키지에 0개이다", () => {
    const count = (root: string): number => (readdirSync(root, { recursive: true }) as string[]).filter((file) => file.endsWith(".worker.ts")).length;
    expect(count("apps/web/src")).toBe(65);
    expect(count("packages")).toBe(0);
  });

  it("서비스 워커 요청 분류는 10종류이고 필수 미리받기 예산은 2.25 MiB 이다", () => {
    const policy = read("apps/web/src/app/service-worker/studio-service-worker-policy.ts");
    const union = /export type StudioServiceWorkerRouteClass =([\s\S]*?)export type StudioServiceWorkerStrategy/u.exec(policy)?.[1] ?? "";
    expect(union.match(/\n\s*\|\s*"[a-z-]+"/gu)).toHaveLength(10);
    expect(read("apps/web/src/app/service-worker/studio-service-worker-precache-plan.ts")).toContain("criticalBytes: 9 * 256 * 1024");
  });

  it("기기 안 SQLite 스키마는 v6 까지이고 자동 저장은 편집이 1.5초 멈춘 뒤에 일어난다", () => {
    const versions = [...read("apps/web/src/domains/creator/studio-local-database.ts").matchAll(/toVersion:\s*(\d+),/gu)].map((match) => Number(match[1]));
    expect(Math.max(...versions)).toBe(6);
    expect(read("apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx")).toMatch(/\},\s*1500\);/u);
  });
});

describe("함께 그릴 때 (realtime-collab)", () => {
  it("입장권 60초·허들 원격 3명 (작업실 30명은 API 소스를 읽어야 해서 통합 시험에서 대조한다)", () => {
    expect(constant(read("packages/contracts/src/studio-live-auth-ticket.ts"), "STUDIO_LIVE_AUTH_TICKET_TTL_MS")).toBe("60_000");
    expect(constant(read("apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts"), "HUDDLE_MAX_REMOTE_PEERS")).toBe("3");
  });

  it("획 묶음 전송은 약 40ms 단위로 배치한다", () => {
    expect(constant(read("apps/web/src/domains/creator/live/studio-crdt-document-constants.ts"), "DEFAULT_BATCH_DELAY_MS")).toBe("40");
  });

  it("실시간 방은 연결 64개·이벤트 보존 15분으로 설정돼 있다", () => {
    const wrangler = read("deploy/cloudflare-realtime/wrangler.jsonc");
    expect(wrangler).toContain('"REALTIME_MAX_CONNECTIONS_PER_ROOM": "64"');
    expect(wrangler).toContain('"REALTIME_EVENT_RETENTION_MS": "900000"');
  });
});

describe("내 작품은 어디에 저장될까 (data-authority)", () => {
  it("무료 DB 후보 16곳·논리 샤드 21개·라우트 36개는 계획이고 자동 갈아타기는 꺼져 있다", () => {
    const policy = JSON.parse(read("config/free-database-federation.json")) as Record<string, unknown>;
    const size = (key: string): number => Object.keys(policy[key] as Record<string, unknown>).length;
    expect([size("providers"), size("shards"), size("routes")]).toEqual([16, 21, 36]);
    expect(policy.automaticAuthoritativeWriteFailover).toBe(false);
    expect(policy.synchronousCrossProviderWrites).toBe(false);
  });

  it("운영 DB 정본 문서는 Supabase PostgreSQL 이 현재 권위이고 Neon 은 legacy 보존이라고 적는다", () => {
    const topology = read("docs/operations/canonical-database-topology.md");
    expect(topology).toMatch(/Supabase PostgreSQL[^\n]*현재 권위/u);
    expect(topology).toMatch(/Neon[^\n]*legacy 보존/u);
  });
});

describe("가상 스튜디오와 3D (virtual-studio-3d)", () => {
  it("VRM 표준 뼈 이름 55개, 가져오기 기본 형식 9개, 월드 에셋 한도 32·128 MiB", () => {
    const bones = /STUDIO_HUMANOID_BONE_NAMES = Object\.freeze\(\[([\s\S]*?)\] as const\)/u.exec(read("apps/web/src/domains/creator/studio-humanoid-bones.ts"))?.[1] ?? "";
    expect(bones.match(/"[a-zA-Z]+"/gu)).toHaveLength(55);
    const importSource = read("apps/web/src/domains/creator/bg3d/studio-bg3d-model-import.ts");
    const formats = /export const STUDIO_BG3D_IMPORT_PRIMARY_FORMATS = \[([\s\S]*?)\] as const;/u.exec(importSource)?.[1] ?? "";
    expect(formats.match(/"[a-z0-9]+"/gu)).toHaveLength(9);
    const world = read("packages/studio-project-model/src/graph/world-publication.ts");
    expect(constant(world, "STUDIO_WORLD_ASSET_FILE_MAX_BYTES")).toBe("32 * 1024 * 1024");
    expect(constant(world, "STUDIO_WORLD_ASSET_TOTAL_MAX_BYTES")).toBe("128 * 1024 * 1024");
  });

  it("3D 폴더(bg3d·vrm·lift3d)는 Phaser 를 가져오지 않는다", () => {
    for (const folder of ["bg3d", "vrm", "lift3d"]) {
      const root = `apps/web/src/domains/creator/${folder}`;
      const files = (readdirSync(root, { recursive: true }) as string[]).filter((file) => /\.(ts|tsx)$/u.test(file) && !/\.test\./u.test(file));
      expect(files.length, folder).toBeGreaterThan(0);
      const offenders = files.filter((file) => /["']phaser["']/u.test(read(`${root}/${file}`)));
      expect(offenders, folder).toEqual([]);
    }
  });

  it("2D 공간 코드는 3D 모듈(three·bg3d·VRM)을 가져오지 않는다", () => {
    const root = "apps/web/src/domains/creator/virtual-space";
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((file) => /\.(ts|tsx)$/u.test(file) && !/\.test\./u.test(file));
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((file) => /from\s+["'](?:three|@react-three\/[a-z-]+|@pixiv\/three-vrm)["']|\/(?:bg3d|vrm|lift3d|scene3d)\//u.test(read(`${root}/${file}`)));
    expect(offenders).toEqual([]);
  });
});

describe("AI가 끼어드는 길 (ai-path)", () => {
  it("브라우저 하루 25회·예약 토큰 64,000 (서버 쪽 한도·공급자 수는 API 소스를 읽어야 해서 통합 시험에서 대조한다)", () => {
    const browser = read("apps/web/src/shared/ai/free-ai-runtime-budget.ts");
    expect(constant(browser, "MANAGED_FREE_DAILY_REQUEST_LIMIT")).toBe("25");
    expect(constant(browser, "MANAGED_FREE_DAILY_RESERVED_TOKEN_LIMIT")).toBe("64_000");
  });

  it("프리셋 11개는 공급자 10곳과 사용자 지정 1개(custom-cloud, 사용자 결제 BYOK)다", () => {
    const presets = /export const FREE_AI_PRESETS[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\n\]\)/u.exec(read("apps/web/src/shared/ai/free-ai-policy.ts"))?.[1] ?? "";
    const ids = [...presets.matchAll(/\n\s*id:\s*"([a-z-]+)"/gu)].map((match) => match[1]);
    expect(ids).toHaveLength(11);
    expect(ids.filter((id) => id !== "custom-cloud")).toHaveLength(10);
    expect(ids.filter((id) => id === "custom-cloud")).toHaveLength(1);
    // 비용이 사용자 계정에 청구될 수 있는 정책은 사용자 지정 1개뿐이고, 나머지 10곳은 무료 허용 목록을 거친다.
    expect(presets.match(/costPolicy:\s*"user-funded-byok"/gu)).toHaveLength(1);
    expect(/id:\s*"custom-cloud"[\s\S]*?costPolicy:\s*"user-funded-byok"/u.test(presets)).toBe(true);
  });

  it("유료 폴백 허락의 기본값은 꺼짐이다", () => {
    expect(read("apps/web/src/shared/ai/user-ai-types.ts")).toMatch(/allowPaidFallback:\s*false,/u);
  });
});

describe("실패해도 작업이 남는 이유 (resilience)", () => {
  it("스튜디오 열기 4초 데드라인·GPU 장치 손실 3회", () => {
    expect(constant(read("apps/web/src/app/service-worker/studio-service-worker-navigation.ts"), "STUDIO_NAVIGATION_TIMEOUT_MS")).toBe("4_000");
    expect(constant(read("apps/web/src/domains/creator/studio-device-loss-recovery.ts"), "STUDIO_DEVICE_LOSS_PERMANENT_THRESHOLD")).toBe("3");
  });
});

describe("구간 본문의 facts 와 이 시험의 대응", () => {
  it("모든 구간의 facts 는 근거 경로가 있고 값이 비어 있지 않다", () => {
    for (const item of ARCHITECTURE_RUNTIME_SECTIONS) {
      for (const fact of item.facts ?? []) {
        expect(fact.value.trim(), `${item.id}: ${fact.label.ko}`).not.toBe("");
        expect(fact.source.trim(), `${item.id}: ${fact.label.ko}`).not.toBe("");
      }
    }
  });
});
