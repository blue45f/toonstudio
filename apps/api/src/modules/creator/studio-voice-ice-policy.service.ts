import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import { z } from "zod";

import { rateLimit } from "@toonstudio/contracts/rate-limit";
import {
  StudioVoiceIcePolicyResponseSchema,
  StudioVoiceIceUrlSchema,
  type StudioVoiceIcePolicyResponse,
} from "@toonstudio/contracts/studio-voice-ice-policy-contract";

import { CreatorService } from "./creator.service";

const STUDIO_VOICE_ICE_MAX_URLS_PER_KIND = 8;

/** STUN 미설정 시 기본값. 웹 클라이언트의 공유 ICE 구성과 같은 Cloudflare STUN이다. */
export const STUDIO_VOICE_DEFAULT_STUN_URL = "stun:stun.cloudflare.com:3478";

const OptionalEnvironmentStringSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim().length > 0 ? value : undefined,
  z.string().optional()
);

/**
 * 2026-10-11 결정으로 TURN 서버는 비용 발생 리스크 때문에 사용하지 않는다.
 * 그래서 이 정책은 TURN 자격을 발급하지 않고 STUN 전용 구성만 돌려준다.
 * 과거의 STUDIO_VOICE_TURN_* 환경변수는 더 이상 읽지 않으며, 배포 환경에
 * 남아 있어도 무시된다. 응답 계약(mode에 "turn" 포함)은 기존 클라이언트
 * 호환을 위해 모양을 유지한다.
 */
const StudioVoiceIceEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    STUDIO_VOICE_STUN_URLS: OptionalEnvironmentStringSchema,
  })
  .strict();

export interface StudioVoiceIceConfiguration {
  stunUrls: readonly string[];
  production: boolean;
}

export const STUDIO_VOICE_ICE_CONFIGURATION = Symbol(
  "STUDIO_VOICE_ICE_CONFIGURATION"
);

function parseStunUrls(value: string | undefined): readonly string[] {
  if (!value) return [];
  const urls = [...new Set(value.split(/[\s,]+/u).map((url) => url.trim()).filter(Boolean))];
  if (urls.length > STUDIO_VOICE_ICE_MAX_URLS_PER_KIND) {
    throw new Error(`Studio STUN 주소는 최대 ${STUDIO_VOICE_ICE_MAX_URLS_PER_KIND}개까지 설정할 수 있습니다.`);
  }
  for (const url of urls) {
    StudioVoiceIceUrlSchema.parse(url);
    if (!/^(?:stun|stuns):/i.test(url)) {
      throw new Error("STUDIO_VOICE_STUN_URLS에 stun: 계열이 아닌 주소가 포함되어 있습니다.");
    }
  }
  return Object.freeze(urls);
}

export function resolveStudioVoiceIceConfiguration(
  environment: NodeJS.ProcessEnv
): StudioVoiceIceConfiguration {
  const parsed = StudioVoiceIceEnvironmentSchema.parse({
    NODE_ENV: environment.NODE_ENV,
    STUDIO_VOICE_STUN_URLS: environment.STUDIO_VOICE_STUN_URLS,
  });
  const configuredStunUrls = parseStunUrls(parsed.STUDIO_VOICE_STUN_URLS);
  return Object.freeze({
    stunUrls:
      configuredStunUrls.length > 0
        ? configuredStunUrls
        : Object.freeze([STUDIO_VOICE_DEFAULT_STUN_URL]),
    production: parsed.NODE_ENV === "production",
  });
}

export function issueStudioVoiceIcePolicy(options: {
  configuration: StudioVoiceIceConfiguration;
  userId: string;
  workId: string;
  nowMs?: number;
}): StudioVoiceIcePolicyResponse {
  const { configuration } = options;
  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new Error("ICE 정책 발급 시각이 올바르지 않습니다.");
  }

  const issuedAtSeconds = Math.floor(nowMs / 1_000);
  const issuedAt = new Date(issuedAtSeconds * 1_000).toISOString();
  return StudioVoiceIcePolicyResponseSchema.parse({
    version: 1,
    mode: "stun",
    iceServers: [{ urls: [...configuration.stunUrls] }],
    issuedAt,
    expiresAt: null,
    ttlSeconds: 0,
  });
}

@Injectable()
export class StudioVoiceIcePolicyService {
  constructor(
    @Inject(CreatorService)
    private readonly creatorService: CreatorService,
    @Inject(STUDIO_VOICE_ICE_CONFIGURATION)
    private readonly configuration: StudioVoiceIceConfiguration
  ) {}

  async issueScreenShare(
    userId: string,
    workId: string
  ): Promise<StudioVoiceIcePolicyResponse> {
    if (
      !rateLimit(`studio-screen-ice:user:${userId}`, 60, 60 * 60_000) ||
      !rateLimit(`studio-screen-ice:work:${userId}:${workId}`, 12, 60_000)
    ) {
      throw new HttpException(
        "화면 공유 연결 설정 요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    const team = await this.creatorService.getWorkTeam(userId, workId);
    if (
      team.workId !== workId ||
      team.viewer.userId !== userId ||
      team.viewer.status !== "active" ||
      !team.viewer.capabilities.view
    ) {
      throw new ForbiddenException("이 작품의 화면 공유를 볼 권한이 없습니다.");
    }
    return issueStudioVoiceIcePolicy({
      configuration: this.configuration,
      userId,
      workId,
    });
  }
}

export const studioVoiceIceConfigurationProvider = {
  provide: STUDIO_VOICE_ICE_CONFIGURATION,
  useFactory: (): StudioVoiceIceConfiguration =>
    resolveStudioVoiceIceConfiguration(process.env),
};
