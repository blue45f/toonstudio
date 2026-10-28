/** 런타임 전용 외곽선. 제작 지오메트리·GLB 내보내기와 구분한다. */
const pressureOutlines = new WeakSet<object>();
const pressureSources = new WeakMap<object, object>();
export function markPressureOutline(mesh: object, source?: object): void { pressureOutlines.add(mesh); if (source) pressureSources.set(mesh, source); }
export function isPressureOutline(mesh: object): boolean { return pressureOutlines.has(mesh); }
export function pressureOutlineSource(mesh: object): object | undefined { return pressureSources.get(mesh); }
