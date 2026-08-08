import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n";

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose(): void;
  wide?: boolean;
  variant?: "settings";
}

export function Modal({ title, children, onClose, wide, variant }: ModalProps) {
  const { t } = useI18n();
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal-card${wide ? " modal-card-wide" : ""}${
          variant === "settings" ? " modal-card-settings" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={`modal-header${variant === "settings" ? " modal-header-settings" : ""}`}>
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("关闭")}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
