"use client";

import { useEffect, useId, useState } from "react";
import { addImageFiles, maxProductImages, moveImageToFront } from "@/lib/products/image-selection";

export function MultiImagePicker({
  label,
  files,
  disabled,
  onFiles,
}: {
  label: string;
  files: File[];
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      {files.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-4">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="w-24">
              <Thumbnail file={file} />
              <p className="mt-1 text-xs font-medium text-secondary">{index === 0 ? "Cover" : `Photo ${index + 1}`}</p>
              {index > 0 ? (
                <button type="button" className="block text-xs text-secondary underline" disabled={disabled} onClick={() => onFiles(moveImageToFront(files, index))}>
                  Make cover
                </button>
              ) : null}
              <button
                type="button"
                className="block text-xs text-secondary underline"
                aria-label={`Remove photo ${index + 1}`}
                disabled={disabled}
                onClick={() => {
                  setError(null);
                  onFiles(files.filter((_, position) => position !== index));
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-col items-start gap-2">
        <label htmlFor={inputId} className={`rounded-xl border border-line px-3 py-2 text-sm font-medium ${disabled ? "opacity-60" : "cursor-pointer"}`}>
          {files.length > 0 ? "Add more images" : "Upload images"}
        </label>
        <input
          id={inputId}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const result = addImageFiles(files, Array.from(event.target.files ?? []));
            setError(result.error);
            onFiles(result.files);
            event.target.value = "";
          }}
        />
        <p className="text-xs text-muted">JPEG, PNG, or WebP, up to 5 MB each and {maxProductImages} images. Customers swipe through them in this order.</p>
        {error ? <p className="text-sm font-medium text-danger" role="alert">{error}</p> : null}
      </div>
    </div>
  );
}

function Thumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return (
    <div className="size-24 overflow-hidden rounded-xl border border-line bg-wash">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
    </div>
  );
}
