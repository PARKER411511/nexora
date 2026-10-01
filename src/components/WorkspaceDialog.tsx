"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

export function WorkspaceDialog({
  ariaLabelledBy,
  children,
  className,
  onDismiss,
}: {
  ariaLabelledBy: string;
  children: ReactNode;
  className: string;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      openerRef.current?.focus();
    };
  }, []);

  return (
    <dialog
      aria-labelledby={ariaLabelledBy}
      className={className}
      onCancel={(event) => {
        event.preventDefault();
        dismissRef.current();
      }}
      ref={dialogRef}
    >
      {children}
    </dialog>
  );
}
