export type CategoryScrollDirection = "previous" | "next";

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
