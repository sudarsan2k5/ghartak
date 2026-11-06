import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const jobFile = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin$/i;

export type ImageUploadStaging = {
  readonly directory: string;
  readonly maxBytes: number;
  write(jobId: string, body: Uint8Array): Promise<void>;
  read(jobId: string): Promise<Uint8Array | undefined>;
  remove(jobId: string): Promise<void>;
  bytesInUse(): Promise<number>;
};

export function createDiskImageStaging(
  directory: string,
  options?: { maxBytes?: number },
): ImageUploadStaging {
  const maxBytes = options?.maxBytes ?? 64 * 1024 * 1024;
  return {
    directory,
    maxBytes,
    async write(jobId, body) {
      assertJobId(jobId);
      await mkdir(directory, { recursive: true });
      const used = await directoryBytes(directory);
      const destination = path.join(directory, `${jobId}.bin`);
      let replacing = 0;
      try {
        replacing = (await stat(destination)).size;
      } catch {
        replacing = 0;
      }
      if (used - replacing + body.byteLength > maxBytes) {
        throw new Error("Image staging capacity is full");
      }
      const temporary = path.join(directory, `.${jobId}.${process.pid}.partial`);
      try {
        await writeFile(temporary, body);
        await rename(temporary, destination);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    },
    async read(jobId) {
      assertJobId(jobId);
      try {
        return await readFile(path.join(directory, `${jobId}.bin`));
      } catch (error) {
        if (isMissing(error)) {
          return undefined;
        }
        throw error;
      }
    },
    async remove(jobId) {
      assertJobId(jobId);
      await rm(path.join(directory, `${jobId}.bin`), { force: true });
    },
    async bytesInUse() {
      return directoryBytes(directory);
    },
  };
}

export function uploadPayloadHash(input: {
  body: Uint8Array;
  contentType: string;
  altText: string | null;
  isPrimary: boolean;
}): string {
  const hash = createHash("sha256");
  hash.update(input.contentType);
  hash.update("\0");
  hash.update(input.altText ?? "");
  hash.update("\0");
  hash.update(input.isPrimary ? "1" : "0");
  hash.update("\0");
  hash.update(input.body);
  return hash.digest("hex");
}

function assertJobId(jobId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error("Invalid image staging id");
  }
}

async function directoryBytes(directory: string): Promise<number> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (isMissing(error)) {
      return 0;
    }
    throw error;
  }
  let total = 0;
  for (const name of names) {
    if (!jobFile.test(name) && !name.endsWith(".partial")) {
      continue;
    }
    try {
      total += (await stat(path.join(directory, name))).size;
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
  }
  return total;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
