"use client";

import { useEffect, useId, useRef } from "react";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, pending]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 px-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-card"
      >
        <h2 id={titleId} className="font-display text-xl font-extrabold">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-secondary">{body}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Working" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
