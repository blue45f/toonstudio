import { Module } from "@nestjs/common";

import { CreatorModule } from "../creator/creator.module";
import { StudioUnitySpaceBackgroundController } from "./studio-unity-space-background.controller";
import { StudioUnitySpaceBackgroundService } from "./studio-unity-space-background.service";
import { StudioUnitySpaceLayoutController } from "./studio-unity-space-layout.controller";
import { StudioUnitySpaceLayoutService } from "./studio-unity-space-layout.service";

@Module({
  imports: [CreatorModule],
  controllers: [
    StudioUnitySpaceLayoutController,
    StudioUnitySpaceBackgroundController,
  ],
  providers: [StudioUnitySpaceLayoutService, StudioUnitySpaceBackgroundService],
})
export class StudioUnitySpaceLayoutModule {}
