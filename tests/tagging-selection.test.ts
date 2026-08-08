import { describe, expect, it } from "vitest";
import type { AiJob } from "@/domain/types";
import { PREVIEW_BOOKMARKS } from "@/domain/seed";
import { selectTaggingCandidates } from "@/domain/tagging";

function queuedJob(bookmarkIds: string[]): AiJob {
  return {
    id: "job-queued",
    type: "tag-bookmarks",
    status: "queued",
    bookmarkIds,
    processed: 0,
    failed: 0,
    attempts: 0,
    createdAt: 1,
    updatedAt: 1,
    items: [],
  };
}

describe("manual AI tagging selection", () => {
  it("defaults safely to a bounded number supplied by the caller", () => {
    expect(selectTaggingCandidates(PREVIEW_BOOKMARKS, [], 5)).toEqual(
      PREVIEW_BOOKMARKS.slice(0, 5),
    );
  });

  it("keeps full tagging explicit and excludes URLs already reserved by a job", () => {
    const jobs = [
      queuedJob([PREVIEW_BOOKMARKS[0]!.id, PREVIEW_BOOKMARKS[1]!.id]),
    ];

    const selected = selectTaggingCandidates(
      PREVIEW_BOOKMARKS,
      jobs,
      "all",
    );

    expect(selected).toHaveLength(PREVIEW_BOOKMARKS.length - 2);
    expect(selected.map((bookmark) => bookmark.id)).not.toContain(
      PREVIEW_BOOKMARKS[0]!.id,
    );
  });

  it("can explicitly select only previously processed bookmarks", () => {
    const bookmarks = PREVIEW_BOOKMARKS.map((bookmark, index) => ({
      ...bookmark,
      aiTags: index < 2 ? ["旧 AI 标签"] : [],
    }));

    expect(
      selectTaggingCandidates(bookmarks, [], "all", "processed"),
    ).toEqual(bookmarks.slice(0, 2));
  });

  it("can select all bookmarks while still excluding active and failed job reservations", () => {
    const bookmarks = PREVIEW_BOOKMARKS.map((bookmark, index) => ({
      ...bookmark,
      aiTags: index < 2 ? ["旧 AI 标签"] : [],
    }));
    const jobs = [queuedJob([bookmarks[1]!.id])];

    const selected = selectTaggingCandidates(
      bookmarks,
      jobs,
      "all",
      "all",
    );

    expect(selected).toHaveLength(bookmarks.length - 1);
    expect(selected.map((bookmark) => bookmark.id)).not.toContain(
      bookmarks[1]!.id,
    );
    expect(selected.map((bookmark) => bookmark.id)).toContain(
      bookmarks[0]!.id,
    );
  });
});
