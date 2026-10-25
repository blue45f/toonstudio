/**
 * Studio 외부 3D 생성 인테이크 어댑터 — 캐릭터랩 PoC 경유.
 *
 * 외부에서 만든 3D를 ToonStudio 캐릭터 키트(apps/character-lab/docs/
 * authored-kit-spec.md)로 들여오는 관문이다. 이 모듈은 네트워크·결제·
 * 파일 쓰기를 일절 하지 않는다. 하는 일은 세 가지뿐이다:
 *
 * 1. 생성 요청 검증 — 무료 범위만 허용한다. 유료 티어·결제 수단은
 *    입력 자체에 없고, 요청이 만들어지면 소유자 확인을 거쳐야 한다.
 * 2. Tripo CLI 명령 구성 — 토큰 값은 절대 다루지 않는다. Tripo 작업은
 *    API 키(Bearer) 경로가 아니라 Secure Vault의 custom.tripo 커넥터가
 *    주입하는 CLI 경로(tripo.py, tcli_ 계열 CLI 토큰)를 우선으로 한다.
 *    CLI 토큰을 api.tripo3d.ai Bearer로 쓰면 401이 나는 것으로 알려져
 *    있어, 이 어댑터는 API 직접 호출 경로를 만들지 않는다.
 * 3. 결과 검증 — 키트 계약의 라이선스 허용 목록(CC0-1.0·original)에
 *    없는 외부 생성물은 자동 입고하지 않고 소유자 결정을 위해 보류한다.
 *    Tripo 무료 사용자 출력은 그 목록에 없으므로, 상업 이용 계획·약관
 *    스냅샷 확인 없이는 admitted가 될 수 없다.
 *
 * 실제 생성 실행은 이 모듈이 하지 않는다. 소유자가 명시적으로 지시할
 * 때만 커넥터 문서의 tripo.py CLI로 한 건씩 실행하고, 그 결과의
 * intakeId·표시 URL·GLB URL을 이 모듈의 검증 함수에 넘긴다.
 * Meshy는 이 인테이크에서 제외한다(지원 제공자 아님).
 */

export type StudioExternal3dKind = "character" | "garment" | "prop";

/** 지원하는 외부 생성 제공자. Tripo CLI 경로만 있다. */
export type StudioExternal3dProvider = "tripo-cli";

export const STUDIO_EXTERNAL_3D_PROVIDER: StudioExternal3dProvider = "tripo-cli";

/** Tripo CLI 기본 모델 — 커넥터 문서의 최저 티어 기본값. */
export const STUDIO_EXTERNAL_3D_TRIPO_DEFAULT_MODEL = "Turbo-v1.0-20250506" as const;

export const STUDIO_EXTERNAL_3D_PROMPT_MAX_LENGTH = 1024;

export interface StudioExternal3dIntakeRequest {
  readonly kind: StudioExternal3dKind;
  readonly prompt: string;
  /** 텍스처 생성 여부. 기본 false(가장 낮은 비용). */
  readonly texture?: boolean;
  /** PBR 재질 생성 여부. 기본 false. */
  readonly pbr?: boolean;
}

export interface StudioExternal3dCredentialPresence {
  /** CLI 토큰(tcli_ 계열) 존재 여부 — 값 자체는 절대 넘기지 않는다. */
  readonly cliTokenPresent: boolean;
  /** API 키 존재 여부(폴백 판정용 — CLI 경로가 우선이다). */
  readonly apiKeyPresent: boolean;
}

export type StudioExternal3dCredentialSource = "cli-token" | "api-key" | "missing";

/**
 * 자격증명 출처를 값 없이 판정한다. CLI 토큰이 있으면 API 키와 무관하게
 * CLI 경로를 쓴다. 자격증명이 없어도 이 함수는 실패하지 않고 "missing"을
 * 돌려준다 — 호출자는 라이브 호출을 시도하지 않고 소유자 확인 항목으로 남긴다.
 */
export function resolveStudioExternal3dCredentialSource(
  presence: StudioExternal3dCredentialPresence,
): StudioExternal3dCredentialSource {
  if (presence.cliTokenPresent) return "cli-token";
  if (presence.apiKeyPresent) return "api-key";
  return "missing";
}

function isKind(value: unknown): value is StudioExternal3dKind {
  return value === "character" || value === "garment" || value === "prop";
}

/** 요청 검증. 통과하면 정규화된 요청, 아니면 사유 목록. */
export function validateStudioExternal3dIntakeRequest(
  input: unknown,
): { readonly ok: true; readonly request: StudioExternal3dIntakeRequest } | {
  readonly ok: false;
  readonly reasonsKo: readonly string[];
} {
  const source = (typeof input === "object" && input !== null ? input : {}) as Partial<
    Record<string, unknown>
  >;
  const reasonsKo: string[] = [];
  if (!isKind(source.kind)) reasonsKo.push("생성 종류가 character·garment·prop 중 하나가 아닙니다.");
  const prompt = typeof source.prompt === "string" ? source.prompt.trim() : "";
  if (prompt.length < 1) reasonsKo.push("프롬프트가 비어 있습니다.");
  if (prompt.length > STUDIO_EXTERNAL_3D_PROMPT_MAX_LENGTH) {
    reasonsKo.push(`프롬프트가 ${STUDIO_EXTERNAL_3D_PROMPT_MAX_LENGTH}자를 넘습니다.`);
  }
  if (reasonsKo.length > 0) return { ok: false, reasonsKo: Object.freeze(reasonsKo) };
  return {
    ok: true,
    request: Object.freeze({
      kind: source.kind as StudioExternal3dKind,
      prompt,
      texture: source.texture === true,
      pbr: source.pbr === true,
    }),
  };
}

/**
 * tripo.py CLI 인자(자격증명 없음)를 만든다. 실행은 소유자가 커넥터
 * 문서의 CLI로 직접 하며, 이 함수는 인자 구성만 담당한다.
 */
export function buildStudioExternal3dTripoCliArgs(
  request: StudioExternal3dIntakeRequest,
): readonly string[] {
  return Object.freeze([
    "create-text",
    "--prompt",
    request.prompt,
    "--model-version",
    STUDIO_EXTERNAL_3D_TRIPO_DEFAULT_MODEL,
    request.texture ? "--texture" : "--no-texture",
    request.pbr ? "--pbr" : "--no-pbr",
  ]);
}

export type StudioExternal3dPlanStatus = "ready" | "needs-owner-confirmation" | "blocked";

export interface StudioExternal3dPlan {
  readonly status: StudioExternal3dPlanStatus;
  readonly provider: StudioExternal3dProvider;
  readonly credentialSource: StudioExternal3dCredentialSource;
  /** 라이브 호출 허용 여부. 이 모듈은 호출하지 않으며, 소유자 실행의 전제 조건이다. */
  readonly liveCallAllowed: boolean;
  readonly cliArgs: readonly string[] | null;
  readonly blockersKo: readonly string[];
}

/**
 * 인테이크 계획을 세운다. 라이브 호출은 소유자 확인 + 자격증명이 모두
 * 있을 때만 허용 상태가 되며, 그 경우에도 실행 주체는 소유자의 CLI다.
 * 자격증명이 없으면 라이브 호출을 시도하지 않는다.
 */
export function planStudioExternal3dIntake(
  input: unknown,
  presence: StudioExternal3dCredentialPresence,
  options: { readonly ownerConfirmed?: boolean } = {},
): StudioExternal3dPlan {
  const validated = validateStudioExternal3dIntakeRequest(input);
  const credentialSource = resolveStudioExternal3dCredentialSource(presence);
  if (!validated.ok) {
    return Object.freeze({
      status: "blocked",
      provider: STUDIO_EXTERNAL_3D_PROVIDER,
      credentialSource,
      liveCallAllowed: false,
      cliArgs: null,
      blockersKo: validated.reasonsKo,
    });
  }
  if (credentialSource === "missing") {
    return Object.freeze({
      status: "blocked",
      provider: STUDIO_EXTERNAL_3D_PROVIDER,
      credentialSource,
      liveCallAllowed: false,
      cliArgs: null,
      blockersKo: Object.freeze([
        "Tripo 자격증명이 없습니다. 라이브 호출을 시도하지 않고 소유자 확인 항목으로 남깁니다.",
      ]),
    });
  }
  if (options.ownerConfirmed !== true) {
    return Object.freeze({
      status: "needs-owner-confirmation",
      provider: STUDIO_EXTERNAL_3D_PROVIDER,
      credentialSource,
      liveCallAllowed: false,
      cliArgs: null,
      blockersKo: Object.freeze([
        "외부 생성은 크레딧을 소모하므로 소유자 확인 없이는 실행하지 않습니다.",
      ]),
    });
  }
  return Object.freeze({
    status: "ready",
    provider: STUDIO_EXTERNAL_3D_PROVIDER,
    credentialSource,
    liveCallAllowed: true,
    cliArgs: buildStudioExternal3dTripoCliArgs(validated.request),
    blockersKo: Object.freeze([]),
  });
}

// ── 결과 검증(키트 계약 게이트) ──────────────────────────────────────────────

/** 키트 계약이 허용하는 라이선스. 외부 생성물도 이 목록에 있어야 입고된다. */
export type StudioExternal3dLicense = "CC0-1.0" | "original";

/** 키트 삼각형 예산(의상 파트 기준 — 키트 검증기 V11과 같은 방향). */
export const STUDIO_EXTERNAL_3D_TRIANGLE_BUDGET: Readonly<
  Record<StudioExternal3dKind, number>
> = Object.freeze({
  character: 90000,
  garment: 25000,
  prop: 25000,
});

export type StudioExternal3dAdmission = "admitted" | "held" | "rejected";

export interface StudioExternal3dIntakeResult {
  readonly kind: StudioExternal3dKind;
  /** 결과 라이선스 표기. Tripo 무료 출력은 "tripo-free-user-output"으로 표기한다. */
  readonly license: string;
  readonly triangleCount: number;
  readonly fileName: string;
}

export interface StudioExternal3dAdmissionDecision {
  readonly admission: StudioExternal3dAdmission;
  readonly reasonsKo: readonly string[];
}

/**
 * 외부 생성 결과를 키트 게이트로 판정한다. 라이선스가 허용 목록에 없고
 * Tripo 무료 출력이면 "held" — 소유자가 상업 이용 계획과 약관 스냅샷을
 * 확인하기 전에는 입고하지 않는다. original로 바꿔 적는 일은 없다.
 */
export function validateStudioExternal3dIntakeResult(
  result: StudioExternal3dIntakeResult,
): StudioExternal3dAdmissionDecision {
  const reasonsKo: string[] = [];
  if (!result.fileName.endsWith(".glb")) {
    reasonsKo.push("결과 파일이 GLB가 아닙니다.");
  }
  const budget = STUDIO_EXTERNAL_3D_TRIANGLE_BUDGET[result.kind];
  if (
    typeof result.triangleCount !== "number"
    || !Number.isFinite(result.triangleCount)
    || result.triangleCount < 0
    || result.triangleCount > budget
  ) {
    reasonsKo.push(`삼각형 수가 ${result.kind} 예산(${budget})을 넘습니다.`);
  }
  const license = result.license;
  if (license === "CC0-1.0" || license === "original") {
    return reasonsKo.length > 0
      ? { admission: "rejected", reasonsKo: Object.freeze(reasonsKo) }
      : { admission: "admitted", reasonsKo: Object.freeze([]) };
  }
  if (license === "tripo-free-user-output") {
    reasonsKo.push(
      "Tripo 무료 사용자 출력은 키트 허용 라이선스(CC0-1.0·original)에 없습니다. "
      + "소유자가 상업 이용 계획과 약관 스냅샷을 확인하기 전에는 입고하지 않습니다.",
    );
    return { admission: "held", reasonsKo: Object.freeze(reasonsKo) };
  }
  reasonsKo.push("알 수 없는 라이선스 표기입니다.");
  return { admission: "rejected", reasonsKo: Object.freeze(reasonsKo) };
}

// ── 스텁 제공자(테스트·문서용, 네트워크 없음) ────────────────────────────────

export interface StudioExternal3dStubIntake {
  readonly intakeId: string;
  readonly plan: StudioExternal3dPlan;
}

export interface StudioExternal3dStubProvider {
  plan(
    input: unknown,
    presence: StudioExternal3dCredentialPresence,
    options?: { readonly ownerConfirmed?: boolean },
  ): StudioExternal3dPlan;
  submit(plan: StudioExternal3dPlan): StudioExternal3dStubIntake | null;
  complete(
    intake: StudioExternal3dStubIntake,
    result: StudioExternal3dIntakeResult,
  ): StudioExternal3dAdmissionDecision;
}

/**
 * 네트워크·크레딧 없이 인테이크 흐름만 재현하는 스텁. ready 상태의
 * 계획만 접수하고, 결과는 위 키트 게이트로 판정한다.
 */
export function createStubStudioExternal3dProvider(): StudioExternal3dStubProvider {
  let counter = 0;
  return {
    plan(input, presence, options) {
      return planStudioExternal3dIntake(input, presence, options);
    },
    submit(plan) {
      if (plan.status !== "ready" || plan.cliArgs === null) return null;
      counter += 1;
      return Object.freeze({ intakeId: `stub-intake-${counter}`, plan });
    },
    complete(intake, result) {
      void intake;
      return validateStudioExternal3dIntakeResult(result);
    },
  };
}
