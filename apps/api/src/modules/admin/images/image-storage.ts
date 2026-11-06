import { DeleteObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type ImageStorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

export type ImageStorage = {
  readonly configured: true;
  readonly bucket: string;
  readonly publicBaseUrl: string;
  verify(): Promise<{ httpStatus: number | undefined }>;
  head(objectKey: string): Promise<{ httpStatus: number | undefined }>;
  put(input: { objectKey: string; body: Uint8Array; contentType: string }): Promise<void>;
  delete(objectKey: string): Promise<void>;
};

const bucketVerifiedAt = new WeakMap<ImageStorage, number>();
const bucketVerifyTtlMs = 30_000;

export async function assertImageBucketReady(storage: ImageStorage, now = Date.now()): Promise<void> {
  const verifiedAt = bucketVerifiedAt.get(storage);
  if (verifiedAt !== undefined && now - verifiedAt < bucketVerifyTtlMs) {
    return;
  }
  const result = await storage.verify();
  if (result.httpStatus !== 200) {
    throw new Error("Image storage bucket verification failed");
  }
  bucketVerifiedAt.set(storage, now);
}

export type MemoryImageStorage = ImageStorage & {
  objects: Map<string, { body: Uint8Array; contentType: string }>;
  putCount: number;
  deleteCount: number;
  verifyCount: number;
};

export function createMemoryImageStorage(options?: {
  verifyHttpStatus?: number;
  putError?: string;
  deleteError?: string;
  putDelayMs?: number;
}): MemoryImageStorage {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const storage: MemoryImageStorage = {
    configured: true,
    bucket: "test-bucket",
    publicBaseUrl: "https://images.test",
    objects,
    putCount: 0,
    deleteCount: 0,
    verifyCount: 0,
    async verify() {
      storage.verifyCount += 1;
      if (options && "verifyHttpStatus" in options) {
        return { httpStatus: options.verifyHttpStatus };
      }
      return { httpStatus: 200 };
    },
    async head(objectKey) {
      return { httpStatus: objects.has(objectKey) ? 200 : 404 };
    },
    async put(input) {
      if (options?.putDelayMs) {
        await new Promise((resolve) => {
          setTimeout(resolve, options.putDelayMs);
        });
      }
      storage.putCount += 1;
      if (options?.putError) {
        throw new Error(options.putError);
      }
      objects.set(input.objectKey, { body: input.body, contentType: input.contentType });
    },
    async delete(objectKey) {
      storage.deleteCount += 1;
      if (options?.deleteError) {
        throw new Error(options.deleteError);
      }
      objects.delete(objectKey);
    },
  };
  return storage;
}

export function createImageStorage(config: ImageStorageConfig | null): ImageStorage | null {
  if (!config) {
    return null;
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return {
    configured: true,
    bucket: config.bucket,
    publicBaseUrl: config.publicBaseUrl.replace(/\/$/, ""),
    async verify() {
      const result = await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      return { httpStatus: result.$metadata.httpStatusCode };
    },
    async head(objectKey) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
        return { httpStatus: result.$metadata.httpStatusCode };
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        return { httpStatus: status };
      }
    },
    async put(input) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.objectKey,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );
    },
    async delete(objectKey) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: objectKey,
        }),
      );
    },
  };
}
