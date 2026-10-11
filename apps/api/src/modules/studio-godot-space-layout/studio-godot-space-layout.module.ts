import { Module } from "@nestjs/common";

import { CreatorModule } from "../creator/creator.module";
import { StudioGodotSpaceBackgroundController } from "./studio-godot-space-background.controller";
import { StudioGodotSpaceBackgroundService } from "./studio-godot-space-background.service";
import { StudioGodotSpaceLayoutController } from "./studio-godot-space-layout.controller";
import { StudioGodotSpaceLayoutService } from "./studio-godot-space-layout.service";

@Module({
  imports: [CreatorModule],
  controllers: [
    StudioGodotSpaceLayoutController,
    StudioGodotSpaceBackgroundController,
  ],
  providers: [StudioGodotSpaceLayoutService, StudioGodotSpaceBackgroundService],
})
export class StudioGodotSpaceLayoutModule {}
