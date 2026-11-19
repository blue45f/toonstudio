import { Body, Controller, Get, Inject, MessageEvent, Param, Post, Query, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import type {
  SecurityPermissionId,
  SecurityRoleId,
  SecurityScopeType,
} from "@toonstudio/contracts/studio-security-rbac";

import { StudioEcosystemEventsService } from "./studio-ecosystem-events.service";
import {
  StudioEcosystemService,
  type EcosystemCafePostAttachmentInput,
} from "./studio-ecosystem.service";

@Controller("api/studio-ecosystem")
export class StudioEcosystemController {
  constructor(
    @Inject(StudioEcosystemService)
    private readonly service: StudioEcosystemService,
    @Inject(StudioEcosystemEventsService)
    private readonly events: StudioEcosystemEventsService,
  ) {}

  @Sse("events/stream")
  streamEvents(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const unsubscribe = this.events.subscribe((event) => {
        subscriber.next({ data: event });
      });
      return () => {
        unsubscribe();
      };
    });
  }

  @Get("events/recent")
  listRecentEvents() {
    return { items: this.events.listRecent(20) };
  }

  @Get("rbac/roles")
  listRoles() {
    return this.service.listRoles();
  }

  @Post("rbac/evaluate")
  evaluatePermission(
    @Body()
    body: {
      userId: string;
      permission: SecurityPermissionId;
      clientIp?: string;
    },
  ) {
    return this.service.evaluatePermission(body);
  }

  @Post("rbac/assign")
  assignRole(
    @Body()
    body: {
      actorUserId: string;
      targetUserId: string;
      displayName: string;
      roleId: SecurityRoleId;
      scopeType: SecurityScopeType;
      scopeId: string;
    },
  ) {
    return this.service.assignRole(body);
  }

  @Get("rbac/audit-logs")
  listAuditLogs() {
    return this.service.listAuditLogs();
  }

  @Get("plaza/parties")
  listPlazaParties() {
    return this.service.listPlazaParties();
  }

  @Post("plaza/parties")
  createPlazaParty(
    @Body()
    body: {
      title: string;
      studioName: string;
      genre: string;
      roleCode: string;
      budgetPerCutKrw: number;
      urgent?: boolean;
    },
  ) {
    return this.service.createPlazaParty(body);
  }

  @Post("plaza/parties/:partyId/slots/:slotId/assign")
  assignPlazaSlot(
    @Param("partyId") partyId: string,
    @Param("slotId") slotId: string,
    @Body() body: { avatarId: string },
  ) {
    return this.service.assignPlazaSlot(partyId, slotId, body.avatarId);
  }

  @Get("cafes/posts")
  listCafePosts(@Query("scope") scope?: SecurityScopeType) {
    return this.service.listCafePosts(scope);
  }

  @Post("cafes/:cafeId/posts")
  createCafePost(
    @Param("cafeId") cafeId: string,
    @Body()
    body: {
      scope: SecurityScopeType;
      channel: string;
      authorName: string;
      title: string;
      body: string;
      attachments?: EcosystemCafePostAttachmentInput[];
    },
  ) {
    return this.service.createCafePost({ ...body, cafeId });
  }

  @Post("modeler/compile")
  compileModelerCut(
    @Body()
    body: {
      artStyle: string;
      cameraShot: string;
      lighting: string;
      backgroundPrompt: string;
      preserveLineartPass?: boolean;
    },
  ) {
    return this.service.compileModelerCut(body);
  }

  @Post("ip/evaluate")
  evaluateIpReadiness(
    @Body()
    body: {
      workTitle: string;
      publishedEpisodes: number;
      hasCleanRightsBom: boolean;
    },
  ) {
    return this.service.evaluateIpReadiness(body);
  }

  @Post("support/triage")
  triageSupport(@Body() body: { message: string }) {
    return this.service.triageSupportMessage(body.message ?? "");
  }
}
