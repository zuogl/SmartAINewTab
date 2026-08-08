import { describe, expect, it } from "vitest";
import {
  BOOKMARK_GROUP_DWELL_MS,
  resolveBookmarkDropIntent,
} from "@/domain/bookmarkDrop";

const rect = { left: 0, top: 0, width: 120, height: 120 };

describe("bookmark drop intent", () => {
  it("uses the target sides for immediate before/after sorting", () => {
    expect(
      resolveBookmarkDropIntent(rect, { x: 18, y: 40 }, {
        canCreateGroup: true,
        centerHoverMs: 2_000,
      }),
    ).toBe("before");
    expect(
      resolveBookmarkDropIntent(rect, { x: 104, y: 40 }, {
        canCreateGroup: true,
        centerHoverMs: 2_000,
      }),
    ).toBe("after");
  });

  it("requires a deliberate center dwell before creating a group", () => {
    const center = { x: 60, y: 39 };
    expect(
      resolveBookmarkDropIntent(rect, center, {
        canCreateGroup: true,
        centerHoverMs: BOOKMARK_GROUP_DWELL_MS - 1,
      }),
    ).toBe("after");
    expect(
      resolveBookmarkDropIntent(rect, center, {
        canCreateGroup: true,
        centerHoverMs: BOOKMARK_GROUP_DWELL_MS,
      }),
    ).toBe("group");
  });

  it("never creates nested groups for bookmarks already inside a group", () => {
    expect(
      resolveBookmarkDropIntent(rect, { x: 60, y: 39 }, {
        canCreateGroup: false,
        centerHoverMs: 5_000,
      }),
    ).toBe("after");
  });
});
