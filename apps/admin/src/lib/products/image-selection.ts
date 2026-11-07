export const maxProductImages = 20;
const maxImageBytes = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type ImageFile = { name: string; size: number; type: string };

/** Adds what fits and explains anything left out, because the product is created before its images upload. */
export function addImageFiles<T extends ImageFile>(current: T[], incoming: T[]): { files: T[]; error: string | null } {
  const files = [...current];
  const problems: string[] = [];
  for (const file of incoming) {
    if (!allowedTypes.has(file.type)) {
      problems.push(`${file.name} is not a JPEG, PNG, or WebP image.`);
    } else if (file.size < 1 || file.size > maxImageBytes) {
      problems.push(`${file.name} must be between 1 byte and 5 MB.`);
    } else if (files.length >= maxProductImages) {
      problems.push(`You can add up to ${maxProductImages} images.`);
      break;
    } else {
      files.push(file);
    }
  }
  return { files, error: problems.length > 0 ? problems.join(" ") : null };
}

export function moveImageToFront<T>(files: T[], index: number): T[] {
  const file = files[index];
  if (index <= 0 || file === undefined) {
    return files;
  }
  return [file, ...files.filter((_, position) => position !== index)];
}
