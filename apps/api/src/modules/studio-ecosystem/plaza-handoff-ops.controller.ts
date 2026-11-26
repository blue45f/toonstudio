import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";

import {
  PlazaHandoffOpsService,
  type ManuscriptColorProfile,
  type StarterKitColorChip,
} from "./plaza-handoff-ops.service";

@Controller("api/studio-ecosystem")
export class PlazaHandoffOpsController {
  constructor(
    @Inject(PlazaHandoffOpsService)
    private readonly ops: PlazaHandoffOpsService,
  ) {}

  @Get("plaza/trust-badges")
  listTrustBadges() {
    return this.ops.listTrustBadges();
  }

  @Post("plaza/trust-badges/record")
  recordVerifiedHandoff(
    @Body()
    body: {
      avatarId: string;
      nickname?: string;
      deliveredOnTime: boolean;
      passedFirstLock: boolean;
      responseMinutes?: number;
    },
  ) {
    return this.ops.recordVerifiedHandoff(body);
  }

  @Get("plaza/parties/:partyId/starter-kit")
  getStarterKit(@Param("partyId") partyId: string) {
    return this.ops.getStarterKit(partyId);
  }

  @Post("plaza/parties/:partyId/starter-kit")
  saveStarterKit(
    @Param("partyId") partyId: string,
    @Body()
    body: {
      workTitle: string;
      canvasWidthPx: number;
      dpi: number;
      colorProfile: ManuscriptColorProfile;
      brushSpecKo: string;
      perspectiveGuideKo: string;
      colorChips: StarterKitColorChip[];
    },
  ) {
    return this.ops.saveStarterKit(partyId, body);
  }

  @Post("plaza/preflight-check")
  inspectManuscriptPreflight(
    @Body()
    body: {
      partyId?: string;
      fileName: string;
      headerBase64?: string;
      reportedWidthPx?: number;
      reportedHeightPx?: number;
      reportedDpi?: number;
      reportedColorProfile?: ManuscriptColorProfile;
      changedLayerNames?: string[];
      unresolvedMandatoryPinCount?: number;
    },
  ) {
    return this.ops.inspectManuscriptPreflight(body);
  }

  @Get("academy/classrooms")
  listAcademyClassrooms() {
    return this.ops.listAcademyClassrooms();
  }

  @Post("academy/classrooms")
  createAcademyClassroom(
    @Body()
    body: {
      institutionName: string;
      courseTitle: string;
      instructorName: string;
      cohortSize?: number;
      targetWidthPx?: number;
      targetDpi?: number;
    },
  ) {
    return this.ops.createAcademyClassroom(body);
  }

  @Post("academy/classrooms/:classroomId/submissions")
  submitClassroomCut(
    @Param("classroomId") classroomId: string,
    @Body()
    body: {
      studentName: string;
      episodeCutLabel: string;
      unresolvedPinCount?: number;
      passedSpecPreflight?: boolean;
    },
  ) {
    return this.ops.submitClassroomCut(classroomId, body);
  }
}
