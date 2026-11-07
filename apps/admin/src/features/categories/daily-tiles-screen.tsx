"use client";

import { adminCategorySchema, adminDailyTileSchema } from "@ghartak/contracts";
import { useEffect, useState, type FormEvent } from "react";
import type { z } from "zod";
import { controlClassName, Field } from "@/components/ui/field";
import { ImagePicker } from "@/components/ui/image-picker";
import { useAuthRedirect } from "@/features/auth/use-auth-redirect";
import { useSession } from "@/features/auth/session-provider";
import { fetchDailyTiles, removeDailyTileImage, updateDailyTile, uploadDailyTileImage } from "@/lib/categories/requests";
import { readImageBaseUrl, resolveProductImage } from "@/lib/products/images";
import { fetchCategories } from "@/lib/products/requests";

type Tile = z.infer<typeof adminDailyTileSchema>;
type Category = z.infer<typeof adminCategorySchema>;

export function DailyTilesScreen() {
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    void Promise.all([fetchDailyTiles(client), fetchCategories(client)]).then(async ([tileResult, categoryResult]) => {
      if (cancelled) {
        return;
      }
      if (!tileResult.ok || !categoryResult.ok) {
        const failure = !tileResult.ok ? tileResult : categoryResult;
        if (!failure.ok && (await redirect(failure))) {
          return;
        }
        setError("Your daily everything could not be loaded.");
        return;
      }
      setError(null);
      setTiles(tileResult.data.tiles);
      setCategories(categoryResult.data.categories);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, client, redirect]);

  if (error) {
    return (
      <section className="rounded-2xl border border-line bg-white p-6 shadow-card" role="alert">
        <p className="text-sm text-secondary">{error}</p>
        <button type="button" className="mt-4 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white" onClick={() => { setError(null); setAttempt((value) => value + 1); }}>
          Try again
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm leading-6 text-secondary">
        These four boxes appear under “Your daily everything” on the customer home screen. Set each box’s name and image, and choose the category it opens.
      </p>
      {tiles === null ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-80 animate-pulse rounded-2xl border border-line bg-white" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tiles.map((tile) => (
            <TileEditor
              key={tile.position}
              tile={tile}
              categories={categories}
              onSaved={(saved) => setTiles((current) => current?.map((row) => (row.position === saved.position ? saved : row)) ?? null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TileEditor({ tile, categories, onSaved }: { tile: Tile; categories: Category[]; onSaved: (tile: Tile) => void }) {
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const [label, setLabel] = useState(tile.label);
  const [categoryId, setCategoryId] = useState(tile.categoryId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | undefined>();

  const choices = categories.filter((category) => category.isActive || category.id === tile.categoryId);
  const trimmed = label.trim();
  const changedLabel = trimmed !== tile.label;
  const changedCategory = categoryId !== (tile.categoryId ?? "");
  const dirty = changedLabel || changedCategory || file !== null || removeImage;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!client || pending || !dirty) {
      return;
    }
    if (trimmed.length === 0 || trimmed.length > 40) {
      setLabelError("Use 1 to 40 characters.");
      return;
    }
    setLabelError(undefined);
    setMessage(null);
    setPending(true);
    let latest = tile;
    const steps = [
      changedLabel || changedCategory
        ? () =>
            updateDailyTile(client, tile.position, {
              ...(changedLabel ? { label: trimmed } : {}),
              ...(changedCategory ? { categoryId: categoryId || null } : {}),
            })
        : null,
      file ? () => uploadDailyTileImage(client, tile.position, file) : null,
      removeImage ? () => removeDailyTileImage(client, tile.position) : null,
    ];
    for (const step of steps) {
      if (!step) {
        continue;
      }
      const result = await step();
      if (!result.ok) {
        setPending(false);
        onSaved(latest);
        if (!(await redirect(result))) {
          setMessage(result.message);
        }
        return;
      }
      latest = result.data;
    }
    setPending(false);
    setFile(null);
    setRemoveImage(false);
    onSaved(latest);
    setMessage("Saved.");
  }

  const inputId = `tile-${tile.position}`;
  const savedUrl = removeImage ? null : resolveProductImage(tile.imageDeliveryPath, readImageBaseUrl());

  return (
    <form className="space-y-4 rounded-2xl border border-line bg-white p-5 shadow-card" onSubmit={(event) => void submit(event)}>
      <h2 className="font-display text-lg font-extrabold">Box {tile.position}</h2>
      <Field id={`${inputId}-label`} label="Name" error={labelError}>
        <input id={`${inputId}-label`} value={label} maxLength={40} className={controlClassName} onChange={(event) => setLabel(event.target.value)} />
      </Field>
      <ImagePicker
        label="Image"
        savedUrl={savedUrl}
        file={file}
        disabled={pending}
        onFile={(next) => {
          setFile(next);
          setRemoveImage(false);
        }}
        onRemoveSaved={() => setRemoveImage(true)}
      />
      <Field id={`${inputId}-category`} label="Opens category">
        <select id={`${inputId}-category`} value={categoryId} className={controlClassName} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">All categories</option>
          {choices.map((category) => (
            <option key={category.id} value={category.id}>
              {category.isActive ? category.name : `${category.name} (inactive)`}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-secondary" role="status">
          {message}
        </p>
        <button type="submit" disabled={!dirty || pending} className="h-11 shrink-0 rounded-xl bg-ink px-4 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Saving" : "Save"}
        </button>
      </div>
    </form>
  );
}
