import {
  Controller,
  Get,
  Header,
  Inject,
  Logger,
} from "@nestjs/common";

import {
  HealthCapabilitiesResponseSchema,
  HealthLiveResponseSchema,
  HealthNotReadyResponseSchema,
  HealthReadyResponseSchema,
  type HealthCapabilitiesResponseDto,
  type HealthLiveResponseDto,
  type HealthReadyResponseDto,
} from "./health.dto";
import { HealthService } from "./health.service";
import { createReadinessFailureReporter } from "./health-readiness-diagnostic";
import { capabilityUnavailableException } from "../../platform/http/service-availability";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly reportReadiness = createReadinessFailureReporter((message) => this.logger.warn(message));

  constructor(
    @Inject(HealthService)
    private readonly health: HealthService,
  ) {}

  @Get("live")
  @Header("Cache-Control", "no-store, max-age=0")
  @Header("Pragma", "no-cache")
  live(): HealthLiveResponseDto {
    // Liveness intentionally has no database, schema, socket, or external-provider dependency.
    return HealthLiveResponseSchema.parse({ status: "ok" });
  }


  /**
   * 의도한 공개 노출: 이 응답은 인증 없이 읽을 수 있고, edgeOriginAuth("enforced" | "disabled")는 누구에게나 원본이 Cloudflare
   * 게이트웨이 밖의 직접 요청을 받아 주는지("disabled")를 알려 준다. 담는 정보는 집행 여부 한 단어뿐이며(비밀 값·길이·형식 오류
   * 사유는 없음), 원본 주소는 이미 공개 구성이고 원본에 직접 요청 하나만 보내도 같은 사실을 알 수 있어 공격자에게 새 능력을 주지
   * 않는다. 배포 직후 설정 누락을 요청 한 번으로 확인하게 해 주는 이득이 커서 수용한다.
   * 근거와 대안: docs/operations/production-environment.md "에지 출처 인증".
   */
  @Get("capabilities")
  @Header("Cache-Control", "no-store, max-age=0")
  @Header("Pragma", "no-cache")
  async capabilities(): Promise<HealthCapabilitiesResponseDto> {
    return HealthCapabilitiesResponseSchema.parse(
      await this.health.checkCapabilities(),
    );
  }

  @Get("ready")
  @Header("Cache-Control", "no-store, max-age=0")
  @Header("Pragma", "no-cache")
  async ready(): Promise<HealthReadyResponseDto> {
    const readiness = await this.health.checkReadiness();
    this.reportReadiness(readiness, process.env.DATABASE_URL);
    if (!readiness.ready) {
      const exception = capabilityUnavailableException("service.readiness", {
        code: "SERVICE_NOT_READY",
        status: "not_ready",
        legacyError: "service_not_ready",
      });
      HealthNotReadyResponseSchema.parse(exception.getResponse());
      throw exception;
    }
    return HealthReadyResponseSchema.parse({ status: "ready" });
  }
}
