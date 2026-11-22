import { Box, Paintbrush, SlidersHorizontal, Sparkles, Users, type LucideIcon } from "lucide-react";

import { BENCHMARK_3D_STUDIO_DATASET } from "./benchmark-3d-studio-data";
import { BENCHMARK_AI_ASSIST_DATASET } from "./benchmark-ai-assist-data";
import { BENCHMARK_BRUSHES_DATASET } from "./benchmark-brushes-data";
import { BENCHMARK_COLLAB_OFFICE_DATASET } from "./benchmark-collab-office-data";
import { BENCHMARK_FILTERS_DATASET } from "./benchmark-filters-data";
import type { BenchmarkCategoryId, BenchmarkDataset } from "./benchmark-types";

export const ALL_BENCHMARK_DATASETS: readonly BenchmarkDataset[] = [
  BENCHMARK_BRUSHES_DATASET,
  BENCHMARK_FILTERS_DATASET,
  BENCHMARK_COLLAB_OFFICE_DATASET,
  BENCHMARK_3D_STUDIO_DATASET,
  BENCHMARK_AI_ASSIST_DATASET,
];

export const BENCHMARK_CATEGORY_ICONS: Readonly<Record<BenchmarkCategoryId, LucideIcon>> = {
  brushes: Paintbrush,
  filters: SlidersHorizontal,
  "collab-office": Users,
  "3d-studio": Box,
  "ai-assist": Sparkles,
};
