import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { StudioEcosystemEventsService } from "./studio-ecosystem-events.service";
import { StudioEcosystemService } from "./studio-ecosystem.service";

describe("StudioEcosystemService", () => {
  it("RBAC 권한 평가, 역할 위임 제한 및 보안 감사 로그를 처리한다", () => {
    const service = new StudioEcosystemService();

    expect(service.evaluatePermission({ userId: "u-line", permission: "manuscript:export_raw" }).allowed).toBe(false);
    expect(service.evaluatePermission({ userId: "u-owner", permission: "rbac:manage_roles" }).allowed).toBe(true);

    const assigned = service.assignRole({
      actorUserId: "u-owner",
      targetUserId: "u-new-color",
      displayName: "채색 어시",
      roleId: "color_assistant",
      scopeType: "team",
      scopeId: "team-alpha",
    });
    expect(assigned.assignment.roleId).toBe("color_assistant");
    expect(service.listAuditLogs().items).toHaveLength(1);

    expect(() =>
      service.assignRole({
        actorUserId: "u-line",
        targetUserId: "u-guest",
        displayName: "권한상승시도",
        roleId: "studio_owner",
        scopeType: "studio",
        scopeId: "studio-chronicle",
      }),
    ).toThrow(ForbiddenException);
  });

  it("MMORPG 구인 광장 파티 생성·슬롯 배치와 카페 이미지 첨부를 검증한다", () => {
    const service = new StudioEcosystemService();
    const createdParty = service.createPlazaParty({
      title: "로판 원꾸·장신구 긴급 파티",
      studioName: "스튜디오 루미에르",
      genre: "romance-fantasy",
      roleCode: "001.019",
      budgetPerCutKrw: 20000,
      urgent: true,
    });
    expect(createdParty.slots[0]?.roleCode).toBe("001.019");

    const res = service.assignPlazaSlot("party-gate-01", "s-line", "av-1");
    expect(res.assigned).toBe(true);
    expect(() => service.assignPlazaSlot("party-gate-01", "s-line", "av-2")).toThrow(BadRequestException);

    const post = service.createCafePost({
      cafeId: "cafe-studio-chronicle",
      scope: "studio",
      channel: "reference-moodboard",
      authorName: "작감",
      title: "3D 배경 레퍼런스 공유",
      body: "첨부 이미지 참고 부탁드립니다.",
      attachments: [
        {
          fileName: "ref.png",
          mimeType: "image/png",
          sizeBytes: 12000,
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          spoilerBlur: false,
        },
      ],
    });
    expect(post.attachments).toHaveLength(1);
    expect(service.listCafePosts("studio").items).toHaveLength(1);
  });

  it("웹툰 모델러 컴파일, IP 확장 준비도, AI 고객센터 트리아지를 반환한다", () => {
    const service = new StudioEcosystemService();
    const compiled = service.compileModelerCut({
      artStyle: "rofan-glow",
      cameraShot: "bust-shot",
      lighting: "sunlit-window",
      backgroundPrompt: "황궁 테라스",
    });
    expect(compiled.renderPasses).toEqual(["lineart", "flat-color", "cel-shade", "composite"]);

    expect(
      service.evaluateIpReadiness({
        workTitle: "게이트 브레이커",
        publishedEpisodes: 40,
        hasCleanRightsBom: true,
      }).status,
    ).toBe("ready");
    expect(service.triageSupportMessage("환불 문의합니다").suggestHumanEscalation).toBe(true);
  });

  it("파티 생성·슬롯 매칭·카페 작성·RBAC 변경 시 실시간 이벤트를 발행한다", () => {
    const events = new StudioEcosystemEventsService();
    const service = new StudioEcosystemService(events);
    const received: string[] = [];
    const unsubscribe = events.subscribe((evt) => received.push(evt.type));

    service.createPlazaParty({
      title: "실시간 이벤트 테스트 파티",
      studioName: "테스트 스튜디오",
      genre: "modern-fantasy",
      roleCode: "001.003",
      budgetPerCutKrw: 18000,
    });
    service.assignRole({
      actorUserId: "u-owner",
      targetUserId: "u-evt",
      displayName: "신규 어시",
      roleId: "fx_post_artist",
      scopeType: "work",
      scopeId: "w-1",
    });
    unsubscribe();

    expect(received).toEqual(["plaza.party_created", "rbac.role_assigned"]);
    expect(events.listRecent(10)).toHaveLength(2);
  });

  it("TOONSTUDIO_ECOSYSTEM_STATE_FILE이 설정되면 재기동 후에도 상태를 복원한다", () => {
    const dir = mkdtempSync(join(tmpdir(), "toonstudio-eco-"));
    const snapshotPath = join(dir, "state.json");
    const prevEnv = process.env.TOONSTUDIO_ECOSYSTEM_STATE_FILE;
    process.env.TOONSTUDIO_ECOSYSTEM_STATE_FILE = snapshotPath;
    try {
      const first = new StudioEcosystemService();
      first.createPlazaParty({
        title: "영속화 테스트 파티",
        studioName: "테스트 스튜디오",
        genre: "modern-fantasy",
        roleCode: "001.003",
        budgetPerCutKrw: 19000,
      });
      const restored = new StudioEcosystemService();
      expect(restored.listPlazaParties().parties.some((p) => p.title === "영속화 테스트 파티")).toBe(true);
    } finally {
      if (prevEnv === undefined) delete process.env.TOONSTUDIO_ECOSYSTEM_STATE_FILE;
      else process.env.TOONSTUDIO_ECOSYSTEM_STATE_FILE = prevEnv;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
