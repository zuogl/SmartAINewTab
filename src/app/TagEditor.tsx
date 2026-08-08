import {
  PencilSimple,
  Plus,
  Sparkle,
  Tag,
  X,
} from "@phosphor-icons/react";
import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/i18n";

interface TagEditorProps {
  aiTags: string[];
  manualTags: string[];
  onAiTagsChange(tags: string[]): void;
  onManualTagsChange(tags: string[]): void;
}

interface TagRowProps {
  kind: "ai" | "manual";
  label: string;
  description: string;
  tags: string[];
  onChange(tags: string[]): void;
}

export function TagEditor({
  aiTags,
  manualTags,
  onAiTagsChange,
  onManualTagsChange,
}: TagEditorProps) {
  const { t } = useI18n();
  return (
    <section className="tag-editor" aria-labelledby="bookmark-tags-title">
      <div className="tag-editor-heading">
        <div>
          <strong id="bookmark-tags-title">{t("标签")}</strong>
          <span>{t("AI 与手动标签共同参与书签搜索和分类判断")}</span>
        </div>
      </div>
      <TagRow
        kind="ai"
        label={t("AI 标签")}
        description={t("由 AI 生成，也可以手动调整")}
        tags={aiTags}
        onChange={onAiTagsChange}
      />
      <TagRow
        kind="manual"
        label={t("手动标签")}
        description={t("你自己补充的标签")}
        tags={manualTags}
        onChange={onManualTagsChange}
      />
    </section>
  );
}

function TagRow({
  kind,
  label,
  description,
  tags,
  onChange,
}: TagRowProps) {
  const { t } = useI18n();
  const [newTag, setNewTag] = useState("");
  const [editingIndex, setEditingIndex] = useState<number>();
  const [editingValue, setEditingValue] = useState("");
  const editingInput = useRef<HTMLInputElement>(null);
  const isAi = kind === "ai";

  useEffect(() => {
    editingInput.current?.focus();
    editingInput.current?.select();
  }, [editingIndex]);

  function addTags() {
    const additions = newTag
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!additions.length) return;
    onChange(uniqueTags([...tags, ...additions]));
    setNewTag("");
  }

  function startEditing(index: number) {
    setEditingIndex(index);
    setEditingValue(tags[index] ?? "");
  }

  function commitEditing() {
    if (editingIndex === undefined) return;
    const value = editingValue.trim();
    if (!value) {
      onChange(tags.filter((_, index) => index !== editingIndex));
    } else {
      onChange(
        uniqueTags(
          tags.map((tag, index) => (index === editingIndex ? value : tag)),
        ),
      );
    }
    setEditingIndex(undefined);
    setEditingValue("");
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEditing();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditingIndex(undefined);
      setEditingValue("");
    }
  }

  return (
    <div className={`tag-editor-row tag-editor-row-${kind}`}>
      <div className="tag-editor-row-heading">
        <span className="tag-editor-row-title">
          {isAi ? <Sparkle size={15} weight="fill" /> : <Tag size={15} />}
          <strong>{label}</strong>
        </span>
        <small>{description}</small>
      </div>
      <div className="tag-chip-field">
        <div className="tag-chip-list" aria-label={t("{label}列表", { label })}>
          {tags.map((tag, index) =>
            editingIndex === index ? (
              <input
                key={`${kind}-${tag}-${index}`}
                ref={editingInput}
                className="tag-chip-edit-input"
                aria-label={t("编辑 {label} {tag}", { label, tag })}
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                onBlur={commitEditing}
                onKeyDown={handleEditKeyDown}
              />
            ) : (
              <span
                className={`tag-chip tag-chip-${kind}`}
                key={`${kind}-${tag}-${index}`}
              >
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => startEditing(index)}
                  aria-label={t("编辑 {label} {tag}", { label, tag })}
                  title={t("编辑标签")}
                >
                  <PencilSimple size={12} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange(tags.filter((_, itemIndex) => itemIndex !== index))
                  }
                  aria-label={t("删除 {label} {tag}", { label, tag })}
                  title={t("删除标签")}
                >
                  <X size={12} />
                </button>
              </span>
            ),
          )}
        </div>
        <div className="tag-add-control">
          <input
            value={newTag}
            aria-label={t("新增 {label}", { label })}
            onChange={(event) => setNewTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTags();
              }
            }}
            placeholder={t("添加{label}", { label })}
          />
          <button
            type="button"
            onClick={addTags}
            disabled={!newTag.trim()}
            aria-label={t("添加 {label}", { label })}
          >
            <Plus size={14} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const normalized = tag.trim().toLocaleLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
