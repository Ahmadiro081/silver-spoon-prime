import { useEffect, useId, useRef, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { handleFocusTrapKeyDown } from "@/utils/accessibility";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidthClass?: string;
  closeOnBackdrop?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidthClass = "max-w-lg",
  closeOnBackdrop = true,
}: ModalProps) {
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      handleFocusTrapKeyDown(e, panelRef.current);
    };

    window.addEventListener("keydown", handleKeyDown);
    panelRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[1px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`surface-card flex max-h-[90vh] w-full flex-col overflow-hidden shadow-elevated focus:outline-none ${maxWidthClass}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="min-w-0">
            {subtitle && (
              <p id={subtitleId} className="text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
            <h3
              id={titleId}
              className="font-display mt-0.5 truncate text-lg font-medium text-foreground sm:text-2xl"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>
  );
}

interface SlideOverDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  widthClass?: string;
}

export function SlideOverDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  widthClass = "max-w-2xl",
}: SlideOverDrawerProps) {
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      handleFocusTrapKeyDown(e, panelRef.current);
    };

    window.addEventListener("keydown", handleKeyDown);
    panelRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`flex h-full w-full flex-col border-l border-border bg-card shadow-elevated focus:outline-none ${widthClass}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="min-w-0">
            {subtitle && (
              <p id={subtitleId} className="truncate text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
            <h3
              id={titleId}
              className="font-display mt-0.5 truncate text-lg font-medium text-foreground sm:text-2xl"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  subtitle?: string;
  description: string;
  details?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "destructive";
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  subtitle,
  description,
  details,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  busy = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} maxWidthClass="max-w-md">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          {tone === "destructive" && (
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive dark:text-red-400">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>

        {details && <div>{details}</div>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex h-10 items-center justify-center rounded-lg px-5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              tone === "destructive"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {busy ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
