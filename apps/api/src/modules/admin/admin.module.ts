import { Module } from "@nestjs/common";
import { dbPool } from "../../platform/database";
import { TrafficAnalyticsModule } from "../traffic-analytics/traffic-analytics.module";

import { AdminAnnouncementsService } from "./admin-announcements.service";
import { AdminCloudWorkboardController } from "./admin-cloud-workboard.controller";
import { ADMIN_CLOUD_WORKBOARD_POOL, AdminCloudWorkboardRepository } from "./admin-cloud-workboard.repository";
import { AdminCampaignsService } from "./admin-campaigns.service";
import { AdminMembersService } from "./admin-members.service";
import { AdminMetricsService } from "./admin-metrics.service";
import { AdminModerationService } from "./admin-moderation.service";
import { AdminMutationGuard } from "./admin-mutation.guard";
import { AdminRevenueService } from "./admin-revenue.service";
import { AdminTrafficController } from "./admin-traffic.controller";
import { AdminTrafficService } from "./admin-traffic.service";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [TrafficAnalyticsModule],
  controllers: [AdminController, AdminTrafficController, AdminCloudWorkboardController],
  providers: [
    { provide: ADMIN_CLOUD_WORKBOARD_POOL, useValue: dbPool },
    AdminCloudWorkboardRepository,
    AdminService,
    AdminAnnouncementsService,
    AdminCampaignsService,
    AdminMembersService,
    AdminMetricsService,
    AdminModerationService,
    AdminMutationGuard,
    AdminRevenueService,
    AdminTrafficService,
  ],
})
export class AdminModule {}
