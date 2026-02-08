"use client";

import { useEffect, useState } from "react";
import type { DepositStep } from "@/hooks/useDeposit";

interface PipelineStep {
  key: string;
  label: string;
  detail: string;
}

const CROSS_CHAIN_STEPS: PipelineStep[] = [
  { key: "quoting", label: "Finding route", detail: "Getting best bridge quote via LI.FI" },
  { key: "approve-source", label: "Approve", detail: "Approve USDC on source chain" },
  { key: "bridge-send", label: "Bridge", detail: "Sending cross-chain transfer" },
  { key: "bridge-wait", label: "Confirming bridge", detail: "Waiting for bridge + gas delivery" },
  { key: "approve-base", label: "Approve on Base", detail: "Approve USDC for vault deposit" },
  { key: "depositing", label: "Deposit into vault", detail: "Creating your LP position" },
  { key: "confirming", label: "Finalizing", detail: "Confirming on-chain" },
];

const BASE_STEPS: PipelineStep[] = [
  { key: "approve-base", label: "Approve USDC", detail: "Approve USDC for vault deposit" },
  { key: "depositing", label: "Deposit into vault", detail: "Creating your LP position" },
  { key: "confirming", label: "Finalizing", detail: "Confirming on-chain" },
];

// Map each deposit step to its index in the pipeline
function getStepIndex(step: DepositStep, steps: PipelineStep[]): number {
  return steps.findIndex((s) => s.key === step);
}

function StepDot({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return (
      <div className="relative z-10 w-7 h-7 rounded-full bg-accent-green flex items-center justify-center animate-[scaleIn_0.3s_ease]">
        <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="relative z-10 w-7 h-7 rounded-full bg-foreground flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-foreground/30 animate-ping" />
        <div className="w-2 h-2 rounded-full bg-white" />
      </div>
    );
  }

  return (
    <div className="relative z-10 w-7 h-7 rounded-full bg-surface border-2 border-border flex items-center justify-center">
      <div className="w-1.5 h-1.5 rounded-full bg-border" />
    </div>
  );
}

export function DepositProgress({
  step,
  errorMsg,
  isBase,
  chainName,
  amount,
  onClose,
  onDone,
}: {
  step: DepositStep;
  errorMsg: string;
  isBase: boolean;
  chainName: string;
  amount: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const steps = isBase ? BASE_STEPS : CROSS_CHAIN_STEPS;
  const activeIndex = getStepIndex(step, steps);
  const isDone = step === "done";
  const isError = step === "error";

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (isDone || isError) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [isDone, isError]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  if (isDone) {
    return (
      <div className="flex flex-col items-center py-6 animate-[fadeIn_0.4s_ease]">
        {/* Success circle */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-full bg-accent-green/10 flex items-center justify-center animate-[scaleIn_0.4s_ease]">
            <div className="w-14 h-14 rounded-full bg-accent-green flex items-center justify-center">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          {/* Decorative ring */}
          <div className="absolute -inset-2 rounded-full border border-accent-green/20 animate-[scaleIn_0.6s_ease]" />
        </div>

        <h3 className="font-serif text-2xl font-bold text-foreground mb-1">Position Created</h3>
        <p className="text-[13px] text-muted mb-1">${amount} USDC deposited into ETH/USDC LP</p>
        <p className="text-[11px] text-muted mb-6">Completed in {timeStr}</p>

        <div className="flex gap-3 w-full">
          <button
            onClick={onDone}
            className="flex-1 py-3 text-[13px] font-bold bg-foreground text-background rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
          >
            View Position
          </button>
          <button
            onClick={onClose}
            className="px-5 py-3 text-[13px] font-medium text-muted bg-surface rounded-xl hover:bg-border transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center py-6 animate-[fadeIn_0.3s_ease]">
        <div className="w-16 h-16 rounded-full bg-accent-red/10 flex items-center justify-center mb-5">
          <div className="w-11 h-11 rounded-full bg-accent-red flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
              <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <h3 className="font-serif text-xl font-bold text-foreground mb-2">Transaction Failed</h3>
        <p className="text-[12px] text-muted text-center mb-6 max-w-[320px] leading-relaxed">
          {errorMsg || "Something went wrong. Your funds are safe — please try again."}
        </p>

        <button
          onClick={onClose}
          className="w-full py-3 text-[13px] font-bold bg-foreground text-background rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="animate-[fadeIn_0.3s_ease]">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-serif text-xl font-bold text-foreground">
          {isBase ? "Depositing" : `${chainName} → Base`}
        </h3>
        <span className="text-[11px] text-muted tabular-nums font-medium bg-surface px-2.5 py-1 rounded-lg">{timeStr}</span>
      </div>
      <p className="text-[12px] text-muted mb-7">${amount} USDC into Uniswap v4 LP</p>

      {/* Pipeline */}
      <div className="relative">
        {/* Vertical track line — centered on dots (dots are w-7 = 28px, center = 14px) */}
        <div className="absolute left-3.5 top-3.5 bottom-3.5 w-[1px] bg-border -translate-x-1/2" />
        {/* Progress fill */}
        {activeIndex >= 0 && (
          <div
            className="absolute left-3.5 top-3.5 w-[2px] bg-foreground -translate-x-1/2 transition-all duration-700 ease-out"
            style={{
              height: `${(activeIndex / Math.max(steps.length - 1, 1)) * 100}%`,
              maxHeight: "calc(100% - 28px)",
            }}
          />
        )}

        <div className="space-y-0">
          {steps.map((s, i) => {
            let status: "done" | "active" | "pending" = "pending";
            if (activeIndex > i) status = "done";
            else if (activeIndex === i) status = "active";

            return (
              <div
                key={s.key}
                className="flex items-start gap-4 py-3 first:pt-0 last:pb-0"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <StepDot status={status} />
                <div className="flex-1 pt-0.5">
                  <div
                    className={`text-[13px] font-semibold transition-colors duration-300 ${
                      status === "active"
                        ? "text-foreground"
                        : status === "done"
                          ? "text-accent-green"
                          : "text-muted"
                    }`}
                  >
                    {s.label}
                  </div>
                  {status === "active" && (
                    <div className="text-[11px] text-muted mt-0.5 animate-[fadeIn_0.3s_ease]">
                      {s.detail}
                    </div>
                  )}
                </div>
                {status === "active" && (
                  <div className="pt-1">
                    <div className="flex gap-1">
                      <div className="w-1 h-1 rounded-full bg-foreground animate-[bounce_1.4s_ease-in-out_infinite]" />
                      <div className="w-1 h-1 rounded-full bg-foreground animate-[bounce_1.4s_ease-in-out_0.2s_infinite]" />
                      <div className="w-1 h-1 rounded-full bg-foreground animate-[bounce_1.4s_ease-in-out_0.4s_infinite]" />
                    </div>
                  </div>
                )}
                {status === "done" && (
                  <span className="text-[10px] text-accent-green font-medium pt-1">Done</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Wallet hint */}
      {(step === "approve-source" || step === "approve-base" || step === "bridge-send" || step === "depositing") && !isDone && (
        <div className="mt-7 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-accent-blue-soft border border-accent-blue/10 animate-[fadeIn_0.3s_ease]">
          <svg className="w-4 h-4 text-accent-blue flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="6" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M16 13a1 1 0 100-2 1 1 0 000 2z" fill="currentColor" />
            <path d="M6 6V5a3 3 0 013-3h6a3 3 0 013 3v1" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="text-[11px] text-accent-blue font-medium">Confirm in your wallet</span>
        </div>
      )}

      {/* Bridge wait hint */}
      {step === "bridge-wait" && (
        <div className="mt-7 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-surface border border-border animate-[fadeIn_0.3s_ease]">
          <svg className="w-4 h-4 text-muted flex-shrink-0 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
            <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-[11px] text-muted font-medium">Bridge in progress — this usually takes 30-90 seconds</span>
        </div>
      )}
    </div>
  );
}
