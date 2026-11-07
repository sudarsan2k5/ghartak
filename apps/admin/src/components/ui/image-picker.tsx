"use client";

import { useEffect, useId, useState } from "react";

export function ImagePicker({
  label,
  savedUrl,
  file,
  disabled,
  onFile,
  onRemoveSaved,
}: {
  label: string;
  savedUrl: string | null;
  file: File | null;
  disabled?: boolean;
  onFile: (file: File | null) => void;
  onRemoveSaved: () => void;
}) {
  const inputId = useId();
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const preview = fileUrl ?? savedUrl;

  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-2 flex items-center gap-4">
        <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-wash">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <span className="px-2 text-center text-xs text-muted">No image</span>
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <label htmlFor={inputId} className={`rounded-xl border border-line px-3 py-2 text-sm font-medium ${disabled ? "opacity-60" : "cursor-pointer"}`}>
            {preview ? "Change image" : "Upload image"}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              onFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
          {preview ? (
            <button
              type="button"
              className="text-sm text-secondary underline"
              disabled={disabled}
              onClick={() => (file ? onFile(null) : onRemoveSaved())}
            >
              {file ? "Undo" : "Remove image"}
            </button>
          ) : null}
          <p className="text-xs text-muted">JPEG, PNG, or WebP, up to 5 MB.</p>
        </div>
      </div>
    </div>
  );
}
