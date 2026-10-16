import {
  GoneException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  hashVersionShareToken,
  ManuscriptVersionShareRepository,
  type CreateManuscriptSnapshotInput,
  type CreateManuscriptVersionShareInput,
  type ManuscriptSnapshotRecord,
  type ManuscriptVersionShareRecord,
  type VersionShareResolution,
} from "./manuscript-version-share.repository";
import {
  VersionSharePasswordGuard,
  type VersionSharePasswordAttempt,
} from "./version-share-password-guard";

/**
 * 비밀번호 시도 때문에 거절된 429 의 공통 부모. 재시도 시점은 본문의 retryAfterSeconds 로도, 컨트롤러가 붙이는
 * Retry-After 헤더로도 알린다. 잠금과 일시 차단은 응답 코드와 안내 문구가 다르다(아래 두 하위 클래스).
 */
export abstract class VersionSharePasswordThrottledException extends HttpException {
  protected constructor(
    readonly retryAfterSeconds: number,
    code: string,
    message: string,
  ) {
    super({ code, message, retryAfterSeconds }, 429);
  }
}

/** 오답이 한도(15분에 10회)에 닿아 창이 끝날 때까지 이 링크의 비밀번호 확인을 막는다. 기다리면 풀린다. */
export class VersionSharePasswordLockedException extends VersionSharePasswordThrottledException {
  constructor(retryAfterSeconds: number) {
    super(
      retryAfterSeconds,
      "version_share_password_locked",
      "비밀번호를 여러 번 틀려 잠시 잠겼어요. 잠시 후 다시 시도해 주세요.",
    );
  }
}

/**
 * 같은 링크의 다른 비밀번호 확인이 아직 처리 중이라 이번 요청은 검증하지 않고 돌려보낸다(선점한 시도가 한도를 채움).
 * 비밀번호를 틀린 것이 아니고 잠긴 것도 아니라서 이 요청은 시도로 세지 않으며, 1초 안팎이면 다시 시도할 수 있다.
 */
export class VersionSharePasswordBusyException extends VersionSharePasswordThrottledException {
  constructor(retryAfterSeconds: number) {
    super(
      retryAfterSeconds,
      "version_share_password_busy",
      "같은 링크로 다른 비밀번호 확인이 진행 중이에요. 잠시 뒤에 다시 시도해 주세요.",
    );
  }
}

/**
 * CT-1 서비스: 저장소의 해석 결과를 HTTP 의미로 변환한다.
 * 링크 상태(없음·회수·만료·비밀번호)는 클라이언트 페이지가 상태별로 안내할 수 있게
 * 안정적인 code를 함께 내려준다.
 */
@Injectable()
export class ManuscriptVersionShareService {
  /** 링크별 비밀번호 오답을 세어 무차별 대입을 막는다. 프로세스 로컬 상태다. */
  private readonly passwordGuard = new VersionSharePasswordGuard();

  constructor(
    @Inject(ManuscriptVersionShareRepository)
    private readonly repository: ManuscriptVersionShareRepository,
  ) {}

  listSnapshots(
    actorUserId: string,
    artifactId: string,
  ): Promise<readonly ManuscriptSnapshotRecord[]> {
    return this.repository.listSnapshots(actorUserId, artifactId);
  }

  createSnapshot(
    actorUserId: string,
    artifactId: string,
    input: CreateManuscriptSnapshotInput,
  ): Promise<ManuscriptSnapshotRecord> {
    return this.repository.createSnapshot(actorUserId, artifactId, input);
  }

  updateSnapshotMemo(
    actorUserId: string,
    artifactId: string,
    snapshotId: string,
    memo: string,
  ): Promise<ManuscriptSnapshotRecord> {
    return this.repository.updateSnapshotMemo(actorUserId, artifactId, snapshotId, memo);
  }

  listShares(
    actorUserId: string,
    artifactId: string,
  ): Promise<readonly ManuscriptVersionShareRecord[]> {
    return this.repository.listShares(actorUserId, artifactId);
  }

  createShare(
    actorUserId: string,
    artifactId: string,
    input: CreateManuscriptVersionShareInput,
  ): Promise<ManuscriptVersionShareRecord> {
    return this.repository.createShare(actorUserId, artifactId, input);
  }

  revokeShare(
    actorUserId: string,
    artifactId: string,
    linkId: string,
  ): Promise<ManuscriptVersionShareRecord> {
    return this.repository.revokeShare(actorUserId, artifactId, linkId);
  }

  async resolveShare(
    token: string,
    password?: string,
  ): Promise<Extract<VersionShareResolution, { kind: "ok" }>> {
    const linkKey = hashVersionShareToken(token);
    // 비밀번호 검증(DB 연결 + scrypt)은 비싸고 추측 가능한 비밀이므로, 한도에 닿은 링크는 저장소 조회 전에
    // 거절한다. 검증은 await 를 거치므로 한도 확인과 증가를 await 앞에서 한 번에(시도 선점) 해야 동시에
    // 몰린 요청이 모두 확인을 통과해 한도를 우회하지 못한다. 비밀번호가 없는 요청은 저장소가 scrypt 없이
    // 곧바로 password_required 로 답하므로 시도로 세지 않는다.
    let attempt: VersionSharePasswordAttempt | null = null;
    if (password) {
      const admission = this.passwordGuard.admit(linkKey);
      if (!admission.admitted) {
        throw admission.reason === "busy"
          ? new VersionSharePasswordBusyException(admission.retryAfterSeconds)
          : new VersionSharePasswordLockedException(admission.retryAfterSeconds);
      }
      attempt = admission.attempt;
    }
    let resolution: VersionShareResolution;
    try {
      resolution = await this.repository.resolveShare(token, password);
      // 오답일 때만 오답으로 확정한다. 링크 없음·회수·만료·성공은 오답이 아니라 아래 finally 에서 되돌려져 정상 사용자가
      // 불이익을 받지 않는다.
      if (resolution.kind === "password_invalid") attempt?.fail();
    } finally {
      // 어떤 경로로 끝나든(저장소 오류, 예기치 못한 반환값으로 인한 예외 포함) 선점은 반드시 정산한다. 이미 fail 로 확정됐으면
      // 아무 일도 하지 않는다. 정산하지 못한 선점은 그 링크의 한도를 영구히 줄여 결국 정상 요청까지 막는다.
      attempt?.release();
    }
    switch (resolution.kind) {
      case "ok":
        this.passwordGuard.reset(linkKey);
        return resolution;
      case "missing":
        throw new NotFoundException({
          code: "version_share_not_found",
          message: "공유 링크를 찾을 수 없어요.",
        });
      case "revoked":
        throw new GoneException({
          code: "version_share_revoked",
          message: "회수된 공유 링크예요. 공유한 사람에게 새 링크를 요청해 주세요.",
        });
      case "expired":
        throw new GoneException({
          code: "version_share_expired",
          message: "만료된 공유 링크예요. 공유한 사람에게 새 링크를 요청해 주세요.",
        });
      case "password_required":
        throw new HttpException(
          {
            code: "version_share_password_required",
            message: "이 링크는 비밀번호가 필요해요.",
          },
          401,
        );
      case "password_invalid":
        throw new HttpException(
          {
            code: "version_share_password_invalid",
            message: "비밀번호가 맞지 않아요.",
          },
          401,
        );
    }
  }
}
