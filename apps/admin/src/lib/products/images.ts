const safeRelativePath = /^\/(?:[A-Za-z0-9._-]+)(?:\/[A-Za-z0-9._-]+)*$/;

export function readImageBaseUrl(): string | null {
  const value = process.env["NEXT_PUBLIC_IMAGE_BASE_URL"]?.trim() ?? "";
  if (value.length === 0) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveProductImage(deliveryPath: string | null | undefined, imageBase: string | null): string | null {
  if (!deliveryPath || !imageBase) {
    return null;
  }
  let base: URL;
  try {
    base = new URL(imageBase);
  } catch {
    return null;
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    return null;
  }
  if (deliveryPath.startsWith("https://") || deliveryPath.startsWith("http://")) {
    try {
      const image = new URL(deliveryPath);
      if (image.origin !== base.origin || image.username || image.password || image.protocol !== base.protocol) {
        return null;
      }
      return image.toString();
    } catch {
      return null;
    }
  }
  if (!safeRelativePath.test(deliveryPath) || deliveryPath.includes("..")) {
    return null;
  }
  return new URL(deliveryPath, `${base.origin}/`).toString();
}
