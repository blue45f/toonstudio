import { Module } from "@nestjs/common";

import { CreatorModule } from "../creator/creator.module";
import { StudioGodotSpaceLayoutController } from "./studio-godot-space-layout.controller";
import { StudioGodotSpaceLayoutService } from "./studio-godot-space-layout.service";

@Module({
  imports: [CreatorModule],
  controllers: [StudioGodotSpaceLayoutController],
  providers: [StudioGodotSpaceLayoutService],
})
export class StudioGodotSpaceLayoutModule {}
