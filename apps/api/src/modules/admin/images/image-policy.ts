export const maxImageBytes = 5 * 1024 * 1024;

const mimeExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ImageContentType = keyof typeof mimeExtensions;

export function assertImageUpload(input: { contentType: string; byteLength: number }): ImageContentType {
  if (!(input.contentType in mimeExtensions)) {
    throw new Error("Only JPEG, PNG, and WebP images are accepted");
  }
  if (!Number.isInteger(input.byteLength) || input.byteLength < 1 || input.byteLength > maxImageBytes) {
    throw new Error("Images must be between 1 byte and 5 MB");
  }
  return input.contentType as ImageContentType;
}

export function detectImageContent(body: Uint8Array): ImageContentType {
  if (body.byteLength < 1) {
    throw new Error("Images must be between 1 byte and 5 MB");
  }
  if (body.byteLength > maxImageBytes) {
    throw new Error("Images must be between 1 byte and 5 MB");
  }
  if (startsWith(body, [0x47, 0x49, 0x46, 0x38])) {
    throw new Error("GIF images are not accepted");
  }
  if (looksLikeSvg(body)) {
    throw new Error("SVG images are not accepted");
  }
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return "image/jpeg";
  }
  if (startsWith(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    if (pngIsAnimated(body)) {
      throw new Error("Animated images are not accepted");
    }
    return "image/png";
  }
  if (isWebp(body)) {
    if (webpIsAnimated(body)) {
      throw new Error("Animated images are not accepted");
    }
    return "image/webp";
  }
  throw new Error("Only JPEG, PNG, and WebP images are accepted");
}

function startsWith(body: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => body[index] === value);
}

function looksLikeSvg(body: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(body.slice(0, 256)).trimStart().toLowerCase();
  return head.startsWith("<?xml") || head.startsWith("<svg") || head.includes("<svg");
}

function isWebp(body: Uint8Array): boolean {
  return (
    body.byteLength >= 16 &&
    startsWith(body, [0x52, 0x49, 0x46, 0x46]) &&
    body[8] === 0x57 &&
    body[9] === 0x45 &&
    body[10] === 0x42 &&
    body[11] === 0x50
  );
}

function webpIsAnimated(body: Uint8Array): boolean {
  if (body.byteLength < 21) {
    return false;
  }
  if (body[12] === 0x56 && body[13] === 0x50 && body[14] === 0x38 && body[15] === 0x58) {
    return ((body[16] ?? 0) & 0x02) !== 0;
  }
  return false;
}

function pngIsAnimated(body: Uint8Array): boolean {
  let offset = 8;
  while (offset + 8 <= body.byteLength) {
    const length = (body[offset]! << 24) | (body[offset + 1]! << 16) | (body[offset + 2]! << 8) | body[offset + 3]!;
    const type = String.fromCharCode(body[offset + 4]!, body[offset + 5]!, body[offset + 6]!, body[offset + 7]!);
    if (type === "acTL") {
      return true;
    }
    if (type === "IDAT" || type === "IEND") {
      return false;
    }
    offset += 12 + length;
  }
  return false;
}

export function catalogueObjectKey(productId: string, imageId: string, contentType: ImageContentType): string {
  return `catalog/${productId}/${imageId}.${mimeExtensions[contentType]}`;
}

export function catalogueDeliveryPath(productId: string, imageId: string, contentType: ImageContentType): string {
  return `/${catalogueObjectKey(productId, imageId, contentType)}`;
}
