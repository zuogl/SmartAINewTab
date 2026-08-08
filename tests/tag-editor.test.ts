import { createElement, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TagEditor } from "@/app/TagEditor";

function TagEditorHarness() {
  const [aiTags, setAiTags] = useState(["SEO", "域名分析"]);
  const [manualTags, setManualTags] = useState(["常用"]);
  return createElement(TagEditor, {
    aiTags,
    manualTags,
    onAiTagsChange: setAiTags,
    onManualTagsChange: setManualTags,
  });
}

describe("bookmark tag editor", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows AI and manual tags together and edits both sources", () => {
    render(createElement(TagEditorHarness));

    expect(screen.getByText("SEO")).toBeInTheDocument();
    expect(screen.getByText("常用")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("新增 AI 标签"), {
      target: { value: "分析工具" },
    });
    fireEvent.keyDown(screen.getByLabelText("新增 AI 标签"), {
      key: "Enter",
    });
    expect(screen.getByText("分析工具")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("编辑 AI 标签 SEO"));
    const editInput = screen.getByLabelText("编辑 AI 标签 SEO");
    fireEvent.change(editInput, { target: { value: "SEO 工具" } });
    fireEvent.keyDown(editInput, { key: "Enter" });
    expect(screen.getByText("SEO 工具")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("新增 手动标签"), {
      target: { value: "工作流" },
    });
    fireEvent.click(screen.getByLabelText("添加 手动标签"));
    expect(screen.getByText("工作流")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("删除 手动标签 常用"));
    expect(screen.queryByText("常用")).not.toBeInTheDocument();
  });
});
