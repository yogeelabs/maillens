import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import WizardLayout from "../components/WizardLayout";
import StepSelectSource from "./wizard/StepSelectSource";
import StepConfigureSource from "./wizard/StepConfigureSource";
import StepConfirm from "./wizard/StepConfirm";
import StepProgress from "./wizard/StepProgress";
import StepComplete from "./wizard/StepComplete";
import {
  EmailSummary,
  ProgressSnapshot,
  StatsSummary,
  cancelIngest,
  getProgress,
  initDB,
  startIngest,
} from "../lib/api";
import { useAppState } from "../store/appState";

type WizardMode = "onboarding" | "reingest" | "addsource";
type WizardStepKey = "select" | "configure" | "confirm" | "progress" | "complete";

type WizardState = {
  sourceId: string | null;
  path: string | null;
  ingestStarted: boolean;
  ingestCompleted: boolean;
  ingestError: string | null;
  progress: ProgressSnapshot | null;
  stats: StatsSummary | null;
  emails: EmailSummary[];
};

const STEP_ORDER: WizardStepKey[] = ["select", "configure", "confirm", "progress", "complete"];

const STEP_DETAILS: Record<WizardStepKey, { title: string; subtitle: string; nextLabel?: string }> = {
  select: {
    title: "Choose a mail source",
    subtitle: "MailLens currently supports Apple Mail mailboxes stored on this device.",
    nextLabel: "Continue",
  },
  configure: {
    title: "Pick your mail folder",
    subtitle: "Select the local folder you want MailLens to ingest.",
    nextLabel: "Review",
  },
  confirm: {
    title: "Confirm settings",
    subtitle: "Double-check the source and folder before starting ingestion.",
    nextLabel: "Start Ingestion",
  },
  progress: {
    title: "Ingestion in progress",
    subtitle: "MailLens is processing your emails locally.",
  },
  complete: {
    title: "All set!",
    subtitle: "Review your stats and head to the dashboard.",
    nextLabel: "Finish",
  },
};

function parseMode(value: string | null): WizardMode {
  if (value === "reingest" || value === "addsource") {
    return value;
  }
  return "onboarding";
}

function computeMaxIndex(state: WizardState): number {
  if (!state.sourceId) return 0;
  if (!state.path) return 1;
  if (!state.ingestStarted) return 2;
  if (!state.ingestCompleted) return 3;
  return STEP_ORDER.length - 1;
}

function fallbackId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `source-${Date.now()}`;
}

export default function WizardPage() {
  const { stepId } = useParams<{ stepId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { meta, setMeta } = useAppState();

  const mode = parseMode(searchParams.get("mode"));
  const queryString = searchParams.toString();

  const initialPathFromMeta = useMemo(() => {
    if (mode === "reingest" && meta.active_source) {
      const active = meta.sources.find((source) => source.id === meta.active_source);
      return active?.path ?? null;
    }
    return null;
  }, [mode, meta]);

  const interactionLockUntilRef = useRef(0);
  const userStartRef = useRef(false);
  const cancelGuardRef = useRef(false);

  const setInteractionLock = useCallback((durationMs = 450) => {
    interactionLockUntilRef.current = Date.now() + durationMs;
  }, []);

  const isInteractionLocked = useCallback(() => Date.now() < interactionLockUntilRef.current, []);

  const [state, setState] = useState<WizardState>(() => ({
    sourceId: "emlx",
    path: initialPathFromMeta,
    ingestStarted: false,
    ingestCompleted: false,
    ingestError: null,
    progress: null,
    stats: null,
    emails: [],
  }));
  const [isStarting, setIsStarting] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    if (!state.path && initialPathFromMeta) {
      setState((prev) => ({ ...prev, path: initialPathFromMeta }));
    }
  }, [initialPathFromMeta, state.path]);

  const gotoStep = useCallback(
    (step: WizardStepKey, options: { replace?: boolean; lock?: boolean } = {}) => {
      const { replace = false, lock = true } = options;
      if (lock) {
        setInteractionLock();
      }
      const suffix = queryString ? `?${queryString}` : "";
      navigate(`/wizard/${step}${suffix}`, { replace });
    },
    [navigate, queryString, setInteractionLock],
  );

  useEffect(() => {
    if (!stepId) {
      gotoStep(STEP_ORDER[0], { replace: true, lock: false });
      return;
    }
    if (!STEP_ORDER.includes(stepId as WizardStepKey)) {
      gotoStep(STEP_ORDER[0], { replace: true, lock: false });
    }
  }, [stepId, gotoStep]);

  const currentStepKey: WizardStepKey = STEP_ORDER.includes(stepId as WizardStepKey)
    ? (stepId as WizardStepKey)
    : STEP_ORDER[0];
  const currentIndex = STEP_ORDER.indexOf(currentStepKey);

  const maxAllowedIndex = useMemo(() => computeMaxIndex(state), [state]);

  useEffect(() => {
    if (currentIndex > maxAllowedIndex) {
      gotoStep(STEP_ORDER[maxAllowedIndex], { replace: true });
    }
  }, [currentIndex, maxAllowedIndex, gotoStep]);

  const handleCancelWizard = useCallback(() => {
    navigate(meta.first_run_complete ? "/dashboard" : "/welcome", { replace: true });
  }, [navigate, meta.first_run_complete]);

  const handleSelectSource = useCallback((sourceId: string) => {
    setState((prev) => ({
      ...prev,
      sourceId,
    }));
  }, []);

  const handleSelectPath = useCallback((path: string) => {
    setState((prev) => ({
      ...prev,
      path,
    }));
  }, []);

  const handleClearPath = useCallback(() => {
    setState((prev) => ({
      ...prev,
      path: null,
    }));
  }, []);

  useEffect(() => {
    if (currentStepKey !== "confirm") {
      userStartRef.current = false;
    }
  }, [currentStepKey]);

  const handleStartIngest = useCallback(async () => {
    if (currentStepKey !== "confirm") {
      console.info("[wizard] start suppressed: not on confirm");
      return;
    }
    if (isInteractionLocked()) {
      console.info("[wizard] start suppressed due to navigation lock");
      return;
    }
    if (!userStartRef.current) {
      console.info("[wizard] start suppressed: no explicit user start intent");
      return;
    }
    userStartRef.current = false;
    if (!state.path || isStarting) {
      if (!state.path) {
        setState((prev) => ({ ...prev, ingestError: "Select a folder to continue." }));
      }
      return;
    }
    console.info("[wizard] start button pressed", {
      path: state.path,
      source: state.sourceId,
      timestamp: Date.now(),
    });
    const targetPath = state.path;
    const sourceId = state.sourceId ?? "emlx";
    setInteractionLock();
    setIsStarting(true);
    try {
      setState((prev) => ({
        ...prev,
        ingestStarted: true,
        ingestCompleted: false,
        ingestError: null,
        progress: null,
        sourceId,
        path: targetPath,
      }));
      await initDB();
      await startIngest(targetPath);
      let snapshot: ProgressSnapshot | null = null;
      const startedAt = Date.now();
      while (Date.now() - startedAt < 3000) {
        try {
          const latest = await getProgress();
          snapshot = latest;
          if (latest.status === "running" || latest.status === "done") {
            break;
          }
        } catch (pollErr) {
          console.warn("Progress poll failed", pollErr);
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      if (snapshot) {
        setState((prev) => ({ ...prev, progress: snapshot }));
      }

      setInteractionLock(600);
      gotoStep("progress", { lock: false });
    } catch (err) {
      console.warn("Failed to start ingestion", err);
      const message =
        typeof err === "object" && err !== null && "detail" in err
          ? String((err as any).detail)
          : err instanceof Error
            ? err.message
            : "Failed to start ingestion";
      setState((prev) => ({
        ...prev,
        ingestError: message,
        ingestStarted: false,
        ingestCompleted: false,
      }));
      gotoStep("confirm", { lock: false });
    } finally {
      setIsStarting(false);
    }
  }, [
    currentStepKey,
    state.path,
    state.sourceId,
    isStarting,
    gotoStep,
    isInteractionLocked,
    setInteractionLock,
  ]);

  const handleProgressUpdate = useCallback((snapshot: ProgressSnapshot) => {
    setState((prev) => ({
      ...prev,
      progress: snapshot,
    }));
  }, []);

  const handleProgressComplete = useCallback(() => {
    setState((prev) => {
      if (prev.ingestCompleted) return prev;
      return {
        ...prev,
        ingestCompleted: true,
      };
    });
    gotoStep("complete", { lock: false });
  }, [gotoStep]);

  const handleProgressError = useCallback(
    (message: string) => {
      setState((prev) => ({
        ...prev,
        ingestError: message,
        ingestStarted: false,
        ingestCompleted: false,
      }));
      gotoStep("confirm");
    },
    [gotoStep],
  );

  const handleProgressCancel = useCallback(async () => {
    if (isCanceling || cancelGuardRef.current) return;
    cancelGuardRef.current = true;
    setIsCanceling(true);
    console.info("[wizard] cancel requested", { timestamp: Date.now() });
    try {
      await cancelIngest();
      setState((prev) => ({
        ...prev,
        ingestStarted: false,
        ingestCompleted: false,
        ingestError: "Ingestion cancelled",
      }));
      userStartRef.current = false;
      setInteractionLock(800);
      gotoStep("confirm", { lock: true });
    } catch (err) {
      console.warn("Failed to cancel ingestion", err);
    } finally {
      setIsCanceling(false);
      cancelGuardRef.current = false;
    }
  }, [isCanceling, gotoStep, setInteractionLock]);

  const handleCompletionLoaded = useCallback((stats: StatsSummary, emails: EmailSummary[]) => {
    setState((prev) => ({
      ...prev,
      stats,
      emails,
    }));
  }, []);

  const handleFinish = useCallback(async () => {
    if (isFinishing) return;
    if (!state.path) {
      navigate("/dashboard", { replace: true });
      return;
    }
    setIsFinishing(true);
    try {
      const totalEmails = state.stats?.total ?? 0;
      const timestamp = Date.now();
      const path = state.path;
      const sourceType = state.sourceId ?? "emlx";

      setMeta((current) => {
        const existing = current.sources.find((entry) => entry.path === path);
        const updatedId = existing?.id ?? fallbackId();
        const updatedSource = {
          id: updatedId,
          type: sourceType,
          path,
          total_emails: totalEmails,
          last_ingest_ts: timestamp,
        };
        const nextSources = existing
          ? current.sources.map((entry) => (entry.id === existing.id ? { ...entry, ...updatedSource } : entry))
          : [...current.sources, updatedSource];
        return {
          ...current,
          first_run_complete: true,
          sources: nextSources,
          active_source: updatedSource.id,
        };
      });

      navigate("/dashboard");
    } finally {
      setIsFinishing(false);
    }
  }, [isFinishing, state.path, state.stats, state.sourceId, setMeta, navigate]);

  const detail = STEP_DETAILS[currentStepKey];
  let nextLabel = detail.nextLabel;
  let cancelLabel = "Cancel";
  let onNext: (() => void) | undefined;
  let onBack: (() => void) | undefined;
  let onCancel: (() => void) | undefined = handleCancelWizard;
  let disableNext = false;
  let disableCancel = false;
  let busy = false;
  let busyLabel: string | undefined;

  switch (currentStepKey) {
    case "select":
      onNext = () => gotoStep("configure");
      disableNext = !state.sourceId;
      if (mode === "onboarding") {
        cancelLabel = "Exit setup";
      }
      onBack = undefined;
      break;
    case "configure":
      onNext = () => gotoStep("confirm");
      onBack = () => gotoStep("select");
      disableNext = !state.path;
      if (!state.path) {
        disableNext = true;
      }
      break;
    case "confirm":
      onNext = () => {
        userStartRef.current = true;
        void handleStartIngest();
      };
      onBack = () => gotoStep("configure");
      nextLabel = isStarting ? "Starting…" : detail.nextLabel ?? "Start";
      disableNext = !state.path || isStarting;
      busy = isStarting;
      busyLabel = "Starting…";
      break;
    case "progress":
      onNext = undefined;
      onBack = undefined;
      onCancel = handleProgressCancel;
      cancelLabel = isCanceling ? "Cancelling…" : "Cancel ingest";
      disableCancel = isCanceling;
      break;
    case "complete":
      onNext = handleFinish;
      onBack = undefined;
      nextLabel = isFinishing ? "Finishing…" : detail.nextLabel ?? "Finish";
      disableNext = isFinishing;
      busy = isFinishing;
      busyLabel = "Finishing…";
      cancelLabel = "Later";
      break;
    default:
      break;
  }

  let content: JSX.Element | null = null;
  if (currentStepKey === "select") {
    content = <StepSelectSource selectedSourceId={state.sourceId} onSelect={handleSelectSource} />;
  } else if (currentStepKey === "configure") {
    content = (
      <StepConfigureSource selectedPath={state.path} onSelectPath={handleSelectPath} onClearPath={handleClearPath} />
    );
  } else if (currentStepKey === "confirm") {
    if (state.sourceId && state.path) {
      content = <StepConfirm selectedSourceId={state.sourceId} selectedPath={state.path} error={state.ingestError} />;
    } else {
      content = <p className="wizard-text">Please choose a mail source and folder to continue.</p>;
    }
  } else if (currentStepKey === "progress") {
    content = (
      <StepProgress
        onProgress={handleProgressUpdate}
        onComplete={handleProgressComplete}
        onError={handleProgressError}
      />
    );
  } else if (currentStepKey === "complete") {
    content = <StepComplete stats={state.stats} emails={state.emails} onLoaded={handleCompletionLoaded} />;
  }

  const lockActive = Date.now() < interactionLockUntilRef.current;

  const debugInfo = useMemo(
    () => ({
      mode,
      currentStep: currentStepKey,
      path: state.path,
      source: state.sourceId,
      ingestStarted: state.ingestStarted,
      ingestCompleted: state.ingestCompleted,
      progressStatus: state.progress?.status ?? "(none)",
      nextLabel: nextLabel ?? "",
      disableNext,
      busy,
      cancelLabel,
      disableCancel,
      isStarting,
      isCanceling,
      isFinishing,
      lockActive,
    }),
    [
      mode,
      currentStepKey,
      state.path,
      state.sourceId,
      state.ingestStarted,
      state.ingestCompleted,
      state.progress,
      nextLabel,
      disableNext,
      busy,
      cancelLabel,
      disableCancel,
      isStarting,
      isCanceling,
      isFinishing,
      lockActive,
    ],
  );

  return (
    <WizardLayout
      currentStep={currentIndex}
      totalSteps={STEP_ORDER.length}
      title={detail.title}
      subtitle={detail.subtitle}
      onNext={onNext}
      onBack={onBack}
      onCancel={onCancel}
      nextLabel={nextLabel}
      cancelLabel={cancelLabel}
      disableNext={disableNext}
      disableCancel={disableCancel}
      busy={busy}
      busyLabel={busyLabel}
      debugInfo={debugInfo}
    >
      {content}
    </WizardLayout>
  );
}
