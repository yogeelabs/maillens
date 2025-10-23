import { ReactNode } from "react";
import FooterNav from "./FooterNav";
import ProgressBar from "./ProgressBar";

type WizardLayoutProps = {
  currentStep: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  onCancel?: () => void;
  nextLabel?: string;
  backLabel?: string;
  cancelLabel?: string;
  disableNext?: boolean;
  disableCancel?: boolean;
  busy?: boolean;
  busyLabel?: string;
  nextVariant?: "primary" | "default";
  debugInfo?: Record<string, unknown>;
};

export default function WizardLayout({
  currentStep,
  totalSteps,
  title,
  subtitle,
  children,
  onNext,
  onBack,
  onCancel,
  nextLabel,
  backLabel,
  cancelLabel,
  disableNext,
  disableCancel,
  busy,
  busyLabel,
  nextVariant = "primary",
  debugInfo,
}: WizardLayoutProps) {
  const progressValue = totalSteps > 1 ? ((currentStep + 1) / totalSteps) * 100 : 100;

  return (
    <div className="wizard-layout">
      <header className="wizard-header">
        <div>
          <p className="wizard-step">
            Step {currentStep + 1} of {totalSteps}
          </p>
          <h1 className="wizard-title">{title}</h1>
          {subtitle ? <p className="wizard-subtitle">{subtitle}</p> : null}
        </div>
        <ProgressBar value={progressValue} />
      </header>
      <main className="wizard-body">{children}</main>
      <FooterNav
        onBack={onBack}
        onNext={onNext}
        onCancel={onCancel}
        nextLabel={nextLabel}
        backLabel={backLabel}
        cancelLabel={cancelLabel}
        disableNext={disableNext}
        disableCancel={disableCancel}
        busy={busy}
        busyLabel={busyLabel}
        nextVariant={nextVariant}
      />
      {debugInfo ? (
        <div className="wizard-debug">
          <p className="wizard-debug-title">Debug</p>
          <dl>
            {Object.entries(debugInfo).map(([key, value]) => (
              <div key={key} className="wizard-debug-row">
                <dt>{key}</dt>
                <dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
