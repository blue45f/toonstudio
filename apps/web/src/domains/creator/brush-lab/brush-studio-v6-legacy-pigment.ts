function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }

export function requiresLegacyMixboxStrokeMigration(program: unknown): boolean {
  if (!record(program)) return false;
  if (program.version === 1) return record(program.slots) && program.slots.pigment === "pigment-mixbox";
  return program.version === 2
    && record(program.runtime) && Array.isArray(program.runtime.bindings)
    && program.runtime.bindings.some((binding: unknown) => record(binding) && binding.providerId === "mixbox-js-v2");
}

export class BrushStudioV6LegacyPigmentMigrationRequiredError extends Error {
  constructor() {
    super("이전 Mixbox 획은 색 확인 후 자체 혼색 사본으로 전환해야 표시·내보내기할 수 있습니다. 원본은 유지됩니다.");
    this.name = "BrushStudioV6LegacyPigmentMigrationRequiredError";
  }
}

export function hasVisibleLegacyMixboxStrokes(elements: readonly unknown[], groups: readonly unknown[]): boolean {
  return elements.some((element) => record(element) && element.type === "draw" && (element.kind ?? "freehand") === "freehand" && element.mode !== "eraser" && !element.hidden
    && !groups.some((group) => record(group) && group.id === element.groupId && group.hidden)
    && record(element.brushEnginePrograms) && requiresLegacyMixboxStrokeMigration(element.brushEnginePrograms.material));
}
