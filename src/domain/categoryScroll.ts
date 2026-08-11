export type CategoryScrollDirection = "previous" | "next";

export interface CategoryBoundaryIntentState {
  direction: CategoryScrollDirection;
  phase: "waiting" | "confirming";
  lastEventAt: number;
  accumulatedDelta: number;
}

export interface CategoryBoundaryIntentResult {
  state: CategoryBoundaryIntentState;
  confirmed: boolean;
}

export const CATEGORY_BOUNDARY_QUIET_MS = 160;
export const CATEGORY_BOUNDARY_CONFIRM_DELTA = 120;
const CATEGORY_BOUNDARY_RESET_MS = 1_200;

export interface VerticalBounds {
  top: number;
  bottom: number;
}

export function categoryBoundaryDirection(
  section: VerticalBounds,
  viewport: VerticalBounds,
  deltaY: number,
  threshold = 2,
): CategoryScrollDirection | undefined {
  if (deltaY > 0 && section.bottom <= viewport.bottom + threshold) {
    return "next";
  }
  if (deltaY < 0 && section.top >= viewport.top - threshold) {
    return "previous";
  }
  return undefined;
}

export function adjacentCategoryId(
  categoryIds: string[],
  activeCategoryId: string,
  direction: CategoryScrollDirection,
): string | undefined {
  const activeIndex = categoryIds.indexOf(activeCategoryId);
  if (activeIndex < 0) return undefined;
  const targetIndex = activeIndex + (direction === "next" ? 1 : -1);
  return categoryIds[targetIndex];
}

export function advanceCategoryBoundaryIntent(
  current: CategoryBoundaryIntentState | undefined,
  direction: CategoryScrollDirection,
  deltaY: number,
  now: number,
  quietMs = CATEGORY_BOUNDARY_QUIET_MS,
  confirmDelta = CATEGORY_BOUNDARY_CONFIRM_DELTA,
): CategoryBoundaryIntentResult {
  const magnitude = Math.abs(deltaY);
  const startsNewIntent =
    !current ||
    current.direction !== direction ||
    now - current.lastEventAt > CATEGORY_BOUNDARY_RESET_MS;
  if (startsNewIntent) {
    return {
      state: {
        direction,
        phase: "waiting",
        lastEventAt: now,
        accumulatedDelta: 0,
      },
      confirmed: false,
    };
  }

  const elapsed = now - current.lastEventAt;
  if (current.phase === "waiting" && elapsed < quietMs) {
    return {
      state: { ...current, lastEventAt: now },
      confirmed: false,
    };
  }

  const accumulatedDelta = current.accumulatedDelta + magnitude;
  const state: CategoryBoundaryIntentState = {
    direction,
    phase: "confirming",
    lastEventAt: now,
    accumulatedDelta,
  };
  return {
    state,
    confirmed: accumulatedDelta >= confirmDelta,
  };
}
