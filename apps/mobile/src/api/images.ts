const safeRelativePath = /^\/(?:[A-Za-z0-9._-]+)(?:\/[A-Za-z0-9._-]+)*$/;

export function resolveCatalogueImage(deliveryPath: string | null | undefined, imageBase: string | null): string | null {
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
      if (image.origin !== base.origin) {
        return null;
      }
      if (image.username || image.password || image.protocol !== base.protocol) {
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
  return new URL(deliveryPath, base).toString();
}
