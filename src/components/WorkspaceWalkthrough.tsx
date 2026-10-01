"use client";

import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { useState } from "react";
import { WorkspaceDialog } from "./WorkspaceDialog";

type WalkthroughLink = {
  label: string;
  href: string;
  secondary?: { label: string; href: string };
};

const steps = [
  {
    kicker: "01 / Shape the brief",
    title: "Start with a real draft.",
    text: "Open the fictional café project to see how a rough brief becomes editable analysis, pages, deliverables, and milestones.",
  },
  {
    kicker: "02 / Lock the baseline",
    title: "See an approved scope.",
    text: "The coaching studio example is already approved. Its scope is locked, while the original review response remains visible as evidence.",
  },
  {
    kicker: "03 / Handle a change",
    title: "Review a pending proposal.",
    text: "The journal example has a client request and an owner proposal waiting for a decision. Open the client review first, then use the owner Responses & changes link to follow the handoff.",
  },
];

export function WorkspaceWalkthrough({
  draftLink,
  approvedLink,
  pendingLink,
  ready = true,
  loadError = "",
  onLoadSamples,
  onDismiss,
}: {
  draftLink: WalkthroughLink;
  approvedLink: WalkthroughLink;
  pendingLink: WalkthroughLink;
  ready?: boolean;
  loadError?: string;
  onLoadSamples?: () => void;
  onDismiss: () => void;
}) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const links = [draftLink, approvedLink, pendingLink];

  return (
    <WorkspaceDialog
      ariaLabelledBy="workspace-walkthrough-title"
      className="workspace-dialog walkthrough-dialog"
      onDismiss={onDismiss}
    >
      <div className="walkthrough-topline">
        <span className="section-kicker">A quick workspace tour</span>
        <button
          aria-label="Close workspace walkthrough"
          className="icon-button"
          data-dialog-initial-focus
          onClick={onDismiss}
          type="button"
        >
          <X size={16} />
        </button>
      </div>
      {!ready ? (
        <>
          <div className="section-kicker walkthrough-intro-kicker">
            Examples are optional
          </div>
          <h2 id="workspace-walkthrough-title">
            Load the guided examples first.
          </h2>
          <p>
            This existing workspace has no sample projects yet. Add three
            fictional examples without changing your saved projects, then walk
            through the draft, approval, and pending change flow.
          </p>
          {loadError && (
            <p className="form-error" role="alert">
              {loadError}
            </p>
          )}
          <div className="walkthrough-controls walkthrough-intro-actions">
            <button
              className="button-secondary"
              onClick={onDismiss}
              type="button"
            >
              Skip walkthrough
            </button>
            <button
              className="button-primary"
              onClick={onLoadSamples}
              type="button"
            >
              Load sample projects <ArrowRight size={14} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            aria-label={`Step ${step + 1} of ${steps.length}`}
            className="walkthrough-progress"
          >
            {steps.map((item, index) => (
              <span
                className={index <= step ? "is-active" : ""}
                key={item.kicker}
              />
            ))}
          </div>
          <div className="section-kicker">{current.kicker}</div>
          <h2 id="workspace-walkthrough-title">{current.title}</h2>
          <p>{current.text}</p>
          <Link
            className="walkthrough-action"
            href={links[step].href}
            onClick={onDismiss}
          >
            {links[step].label} <ArrowRight size={14} />
          </Link>
          {links[step].secondary && (
            <Link
              className="walkthrough-secondary-action"
              href={links[step].secondary.href}
              onClick={onDismiss}
            >
              {links[step].secondary.label}
            </Link>
          )}
          <div className="walkthrough-controls">
            <button
              className="button-secondary"
              disabled={step === 0}
              onClick={() => setStep((currentStep) => currentStep - 1)}
              type="button"
            >
              Back
            </button>
            {step < steps.length - 1 ? (
              <button
                className="button-primary"
                onClick={() => setStep((currentStep) => currentStep + 1)}
                type="button"
              >
                Next <ArrowRight size={14} />
              </button>
            ) : (
              <button
                className="button-primary"
                onClick={onDismiss}
                type="button"
              >
                Done <Check size={14} />
              </button>
            )}
          </div>
          <button
            className="walkthrough-skip"
            onClick={onDismiss}
            type="button"
          >
            Skip walkthrough
          </button>
        </>
      )}
    </WorkspaceDialog>
  );
}
