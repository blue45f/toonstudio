import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ARCHITECTURE_DELIVERY_SECTIONS } from "../../../../../../apps/web/src/domains/legal/technology/engineering-architecture-guide-delivery";

/**
 * 아키텍처 해설 10번 구간(front-back-alignment)이 말하는 "웹과 API 가 같은 약속을 쓴다"를 두 앱의 소스에서 직접 대조한다.
 * 한 앱의 시험이 다른 앱 소스를 읽으면 경계 래칫(crossAppTestOutsideIntegration)이 막으므로, API 소스를 읽는 단언은 여기에 둔다.
 * 웹 쪽만 보는 수치 단언은 apps/web/src/domains/legal/technology/engineering-architecture-guide-delivery.test.ts 에 있다.
 */

const source = (relativePath: string): string => readFileSync(join(process.cwd(), relativePath), "utf8");
const protocolVersionOf = (text: string): string | undefined => /STUDIO_CRDT_PROTOCOL_VERSION = (\d+) as const/u.exec(text)?.[1];

const API_PROTOCOL = "apps/api/src/modules/creator/studio-live.protocol.ts";
const WEB_PROTOCOL = "apps/web/src/domains/creator/live/studio-crdt-protocol.ts";

describe("아키텍처 해설 10번 구간 · 웹과 API 가 같은 약속을 쓰는지 소스로 대조", () => {
  it("실시간 CRDT 프로토콜 버전은 웹·API 가 같은 값이고, 구간이 말하는 값과 같으며, 서버가 z.literal 로 강제한다", () => {
    const api = protocolVersionOf(source(API_PROTOCOL));
    const web = protocolVersionOf(source(WEB_PROTOCOL));
    expect(api).toBeDefined();
    expect(web).toBe(api);

    const alignment = ARCHITECTURE_DELIVERY_SECTIONS.find((section) => section.id === "front-back-alignment");
    expect(alignment?.facts?.map((fact) => fact.value)).toContain(api);
    expect(alignment?.facts?.find((fact) => fact.value === api)?.source).toBe(API_PROTOCOL);

    expect(source(API_PROTOCOL)).toContain("z.literal(STUDIO_CRDT_PROTOCOL_VERSION)");
  });

  it("CSRF 헤더 이름은 웹·API 가 contracts 의 한 파일에서 가져온다", () => {
    expect(source("apps/web/src/shared/lib/csrf.ts")).toContain("@toonstudio/contracts/security/csrf");
    expect(source("apps/api/src/csrf-middleware.ts")).toContain("@toonstudio/contracts/security/csrf");
    expect(source("packages/contracts/src/security/csrf.ts")).toContain('TOONSPECTRUM_CSRF_HEADER = "x-toonstudio-csrf"');
  });
});
