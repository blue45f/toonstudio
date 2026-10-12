import { Module } from "@nestjs/common";

import { StudioProjectLibraryController } from "./studio-project-library.controller";
import { StudioProjectLibraryService } from "./studio-project-library.service";

@Module({
  controllers: [StudioProjectLibraryController],
  providers: [StudioProjectLibraryService],
})
export class StudioProjectLibraryModule {}
