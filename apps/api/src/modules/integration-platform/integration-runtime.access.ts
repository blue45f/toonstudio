import { Logger } from "@nestjs/common";
import { z } from "zod";

import {
  INTEGRATION_RUNTIME_PROVIDER_IDS,
  type IntegrationRuntimeConnectorStatus,
  type IntegrationRuntimeProviderId,
} from "./integration-runtime.contract";
import type { IntegrationRuntimeActionDto } from "./integration-runtime.dto";

/**
 * 운영자 인증 정보(API 토큰·웹훅 URL)를 쓰는 외부 연동의 실행 권한.
 *
 * 프로젝트 편집 권한만 확인하면, 로그인한 누구나 자기 프로젝트를 만든 뒤 임의의 데이터 소스·팀·프로젝트 키로
 * 운영자가 설정한 토큰을 실행할 수 있다(혼동된 대리인, CWE-441/862). 그래서 운영자 인증 정보를 쓰는 커넥터는
 *
 * 1. 관리자(admin/operator 역할)이거나
 * 2. 운영자가 INTEGRATION_RUNTIME_OPERATOR_GRANTS 허용 목록으로 (프로젝트, 공급자, 대상)을 연결해 둔 경우
 *
 * 에만 실행할 수 있다. 허용 목록이 없거나 깨져 있으면 관리자 전용으로 닫는다(fail-closed).
 */
export const INTEGRATION_RUNTIME_ACCESS_POLICY = Symbol("INTEGRATION_RUNTIME_ACCESS_POLICY");
export const INTEGRATION_RUNTIME_OPERATOR_GRANTS_ENV = "INTEGRATION_RUNTIME_OPERATOR_GRANTS";

const MAXIMUM_GRANTS_BYTES = 65_536;
const UUID_LIKE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/iu;

type EnvLike = Record<string, string | undefined>;

const OperatorGrantSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  providerId: z.enum(INTEGRATION_RUNTIME_PROVIDER_IDS),
  targets: z.array(z.string().trim().min(1).max(240)).max(200).default([]),
}).strict();
const OperatorGrantListSchema = z.array(OperatorGrantSchema).max(500);

export interface IntegrationRuntimeOperatorGrant {
  readonly projectId: string;
  readonly providerId: IntegrationRuntimeProviderId;
  /** 허용한 데이터 소스·팀·프로젝트 키·리스트·파일·사용자 ID. 대상 지정이 없는 커넥터는 비워 둔다. */
  readonly targets: readonly string[];
}

export interface IntegrationRuntimeParsedGrants {
  readonly grants: readonly IntegrationRuntimeOperatorGrant[];
  /** 설정을 읽지 못한 사유(한글). 값 자체는 담지 않는다. 정상이거나 미설정이면 null. */
  readonly issue: string | null;
}

function rejected(issue: string): IntegrationRuntimeParsedGrants {
  return { grants: [], issue };
}

/** 허용 목록 환경 변수를 읽는다. 어떤 문제든 항목을 모두 버려(fail-closed) 관리자 전용으로 남긴다. */
export function parseIntegrationRuntimeOperatorGrants(
  raw: string | undefined,
): IntegrationRuntimeParsedGrants {
  if (raw === undefined || raw.trim() === "") return { grants: [], issue: null };
  if (Buffer.byteLength(raw, "utf8") > MAXIMUM_GRANTS_BYTES) {
    return rejected("값이 64KB 를 넘습니다.");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return rejected("JSON 형식이 아닙니다.");
  }
  const result = OperatorGrantListSchema.safeParse(value);
  if (!result.success) {
    const path = result.error.issues[0]?.path.map(String).join(".") ?? "";
    return rejected(
      `항목 형식이 올바르지 않습니다${path ? ` (${path})` : ""}. 배열의 각 항목은 projectId, providerId, targets 만 가질 수 있습니다.`,
    );
  }

  const merged = new Map<string, { projectId: string; providerId: IntegrationRuntimeProviderId; targets: string[] }>();
  for (const grant of result.data) {
    const key = `${grant.projectId}\u0000${grant.providerId}`;
    const existing = merged.get(key) ?? {
      projectId: grant.projectId,
      providerId: grant.providerId,
      targets: [],
    };
    for (const target of grant.targets) {
      if (!existing.targets.includes(target)) existing.targets.push(target);
    }
    merged.set(key, existing);
  }
  return { grants: [...merged.values()], issue: null };
}

export type IntegrationRuntimeOperatorDenialCode =
  | "operator_connector_admin_only"
  | "operator_connector_project_not_allowed"
  | "operator_connector_object_update_admin_only"
  | "operator_connector_target_not_allowed";

export type IntegrationRuntimeOperatorAccessDecision =
  | {
    readonly allowed: true;
    readonly basis: "not-required" | "administrator" | "operator-grant";
  }
  | {
    readonly allowed: false;
    readonly code: IntegrationRuntimeOperatorDenialCode;
    /** 사용자에게 그대로 보여 줄 수 있는 구체적인 한국어 사유. 요청에 담긴 값은 되풀이하지 않는다. */
    readonly message: string;
  };

export interface IntegrationRuntimeAccessRequest {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly request: IntegrationRuntimeActionDto;
  readonly connector: Pick<IntegrationRuntimeConnectorStatus, "providerId" | "name" | "executionMode">;
}

export type IntegrationRuntimeAdministratorCheck = (userId: string) => Promise<boolean>;

interface OperatorTargetSelection {
  readonly label: string | null;
  readonly values: readonly string[];
  /** ID 로 이미 있는 항목을 직접 고치는 요청인지. 컨테이너 허용 목록으로는 대상 항목을 검증할 수 없다. */
  readonly updatesExistingObject: boolean;
}

const NO_TARGET: OperatorTargetSelection = {
  label: null,
  values: [],
  updatesExistingObject: false,
};

// 새 공급자를 추가하면 이 switch 가 컴파일 단계에서 누락을 알려 준다(마지막 default 를 두지 않는다).
function selectOperatorTargets(request: IntegrationRuntimeActionDto): OperatorTargetSelection {
  switch (request.providerId) {
    case "notion":
      return {
        label: "데이터 소스",
        values: [request.input.dataSourceId],
        updatesExistingObject: Boolean(request.input.pageId),
      };
    case "linear":
      return {
        label: "팀",
        values: [request.input.teamId],
        updatesExistingObject: Boolean(request.input.issueId),
      };
    case "jira":
      return {
        label: "프로젝트 키",
        values: [request.input.projectKey],
        updatesExistingObject: Boolean(request.input.issueKey),
      };
    case "trello":
      return {
        label: "리스트",
        values: [request.input.listId],
        updatesExistingObject: Boolean(request.input.cardId),
      };
    case "figma":
      return { label: "파일", values: [request.input.fileKey], updatesExistingObject: false };
    case "zoom":
      return { label: "사용자", values: [request.input.userId], updatesExistingObject: false };
    case "slack":
    case "microsoft-teams":
    case "naver-datalab":
    case "wikidata":
    case "google-books":
      return NO_TARGET;
  }
}

// Notion·Linear 의 UUID 는 하이픈 유무와 대소문자가 달라도 같은 객체를 가리킨다. 그 외 ID(Figma 파일 키,
// Zoom 사용자 ID 등)는 대소문자를 구분하므로 정확히 같아야 한다.
function normalizeTarget(providerId: IntegrationRuntimeProviderId, value: string): string {
  if ((providerId === "notion" || providerId === "linear") && UUID_LIKE.test(value)) {
    return value.replaceAll("-", "").toLowerCase();
  }
  return value;
}

function deny(
  code: IntegrationRuntimeOperatorDenialCode,
  message: string,
): IntegrationRuntimeOperatorAccessDecision {
  return { allowed: false, code, message };
}

export class IntegrationRuntimeAccessPolicy {
  private readonly grantIndex: ReadonlyMap<
    string,
    ReadonlyMap<IntegrationRuntimeProviderId, ReadonlySet<string>>
  >;

  constructor(
    grants: readonly IntegrationRuntimeOperatorGrant[],
    private readonly isAdministrator: IntegrationRuntimeAdministratorCheck,
    readonly configurationIssue: string | null = null,
  ) {
    const index = new Map<string, Map<IntegrationRuntimeProviderId, Set<string>>>();
    for (const grant of grants) {
      const providers = index.get(grant.projectId)
        ?? new Map<IntegrationRuntimeProviderId, Set<string>>();
      const targets = providers.get(grant.providerId) ?? new Set<string>();
      for (const target of grant.targets) targets.add(normalizeTarget(grant.providerId, target));
      providers.set(grant.providerId, targets);
      index.set(grant.projectId, providers);
    }
    this.grantIndex = index;
  }

  static fromEnvironment(
    env: EnvLike,
    isAdministrator: IntegrationRuntimeAdministratorCheck,
  ): IntegrationRuntimeAccessPolicy {
    const parsed = parseIntegrationRuntimeOperatorGrants(
      env[INTEGRATION_RUNTIME_OPERATOR_GRANTS_ENV],
    );
    return new IntegrationRuntimeAccessPolicy(parsed.grants, isAdministrator, parsed.issue);
  }

  get projectCount(): number {
    return this.grantIndex.size;
  }

  async authorize(input: IntegrationRuntimeAccessRequest): Promise<IntegrationRuntimeOperatorAccessDecision> {
    const { connector, request } = input;
    if (connector.executionMode === "public-protocol") {
      return { allowed: true, basis: "not-required" };
    }
    if (await this.administrator(input.actorUserId)) {
      return { allowed: true, basis: "administrator" };
    }

    const name = connector.name;
    if (this.grantIndex.size === 0) {
      return deny(
        "operator_connector_admin_only",
        `${name} 연동은 운영자 계정의 인증 정보로 실행돼요. 관리자만 사용할 수 있고, 일반 프로젝트는 운영자가 허용 목록에 연결한 뒤에 사용할 수 있어요.`,
      );
    }
    const allowedTargets = this.grantIndex.get(input.projectId)?.get(connector.providerId);
    if (!allowedTargets) {
      return deny(
        "operator_connector_project_not_allowed",
        `이 프로젝트는 ${name} 연동 허용 목록에 연결되어 있지 않아요. 운영자에게 프로젝트 연결을 요청해 주세요.`,
      );
    }

    const selection = selectOperatorTargets(request);
    if (selection.updatesExistingObject) {
      return deny(
        "operator_connector_object_update_admin_only",
        `${name}의 기존 항목을 ID로 수정하는 요청은 관리자만 실행할 수 있어요. 허용 목록으로 연결된 프로젝트에서는 새 항목 만들기만 쓸 수 있어요.`,
      );
    }
    for (const value of selection.values) {
      if (!allowedTargets.has(normalizeTarget(connector.providerId, value))) {
        return deny(
          "operator_connector_target_not_allowed",
          `${name} 연동은 운영자가 이 프로젝트에 허용한 ${selection.label ?? "대상"}만 사용할 수 있어요. 허용 목록에 없는 ${selection.label ?? "대상"}에는 실행할 수 없어요.`,
        );
      }
    }
    return { allowed: true, basis: "operator-grant" };
  }

  // 관리자 조회가 실패하면 관리자가 아닌 것으로 본다(fail-closed). 예외는 호출자에게 퍼뜨리지 않는다.
  private async administrator(userId: string): Promise<boolean> {
    try {
      return (await this.isAdministrator(userId)) === true;
    } catch {
      return false;
    }
  }
}

/** 환경 변수에서 정책을 만들고, 설정이 깨져 있으면 눈에 띄는 오류 로그를 남긴다(값은 남기지 않는다). */
export function createIntegrationRuntimeAccessPolicy(
  env: EnvLike,
  isAdministrator: IntegrationRuntimeAdministratorCheck,
  logger: Pick<Logger, "error"> = new Logger("IntegrationRuntimeAccess"),
): IntegrationRuntimeAccessPolicy {
  const policy = IntegrationRuntimeAccessPolicy.fromEnvironment(env, isAdministrator);
  if (policy.configurationIssue) {
    logger.error(
      `${INTEGRATION_RUNTIME_OPERATOR_GRANTS_ENV} 를 적용하지 못해 허용 목록을 비웁니다(운영자 인증 정보 커넥터는 관리자 전용으로 동작): ${policy.configurationIssue}`,
    );
  }
  return policy;
}
