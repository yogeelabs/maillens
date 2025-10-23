import type { MouseEvent } from "react";

type FooterNavProps = {
  onBack?: () => void;
  onNext?: () => void;
  onCancel?: () => void;
  backLabel?: string;
  nextLabel?: string;
  cancelLabel?: string;
  disableNext?: boolean;
  disableCancel?: boolean;
  busy?: boolean;
  busyLabel?: string;
  nextVariant?: "primary" | "default";
};

export default function FooterNav({
  onBack,
  onNext,
  onCancel,
  backLabel = "Back",
  nextLabel = "Next",
  cancelLabel = "Cancel",
  disableNext = false,
  disableCancel = false,
  busy = false,
  busyLabel = "Working...",
  nextVariant = "primary",
}: FooterNavProps) {
  function handleBackClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail > 1) return;
    onBack?.();
  }

  function handleNextClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail > 1) return;
    onNext?.();
  }

  function handleCancelClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail > 1) return;
    onCancel?.();
  }

  return (
    <div className="wizard-footer">
      <div className="wizard-footer-left">
        {onCancel ? (
          <button className="btn btn-ghost" type="button" onClick={handleCancelClick} disabled={disableCancel}>
            {cancelLabel}
          </button>
        ) : null}
      </div>
      <div className="wizard-footer-right">
        {onBack ? (
          <button className="btn btn-secondary" type="button" onClick={handleBackClick}>
            {backLabel}
          </button>
        ) : null}
        {onNext ? (
          <button
            className={`btn ${nextVariant === "primary" ? "btn-primary" : "btn-secondary"}`}
            type="button"
            onClick={handleNextClick}
            disabled={disableNext || busy}
          >
            {busy ? busyLabel : nextLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
