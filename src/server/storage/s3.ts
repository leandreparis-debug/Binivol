import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import {
  assertValidKey,
  StorageNotFoundError,
  StorageUnavailableError,
  type StorageService,
} from "./types";

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** Network timeout of one request, in milliseconds. Default 10 s. */
  timeoutMs?: number;
}

/**
 * `s3` driver: any S3-compatible service (Supabase Storage through its S3
 * endpoint, MinIO, Scaleway, OVH…). Plain AWS SDK, no provider SDK. The
 * bucket must be **private**: this driver never creates public or presigned
 * URLs, files are streamed by the application.
 */
export function s3Storage(config: S3StorageConfig): StorageService {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 2,
    requestHandler: { requestTimeout: config.timeoutMs ?? 10_000, connectionTimeout: 5_000 },
  });
  const Bucket = config.bucket;

  return {
    driver: "s3",
    async put(key, body, contentType) {
      assertValidKey(key);
      try {
        await client.send(
          new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
        );
      } catch (error) {
        throw new StorageUnavailableError({ cause: error });
      }
    },
    async get(key) {
      assertValidKey(key);
      try {
        const result = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        if (!result.Body) throw new StorageNotFoundError(key);
        return Buffer.from(await result.Body.transformToByteArray());
      } catch (error) {
        if (error instanceof StorageNotFoundError) throw error;
        if (
          error instanceof NoSuchKey ||
          (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
        ) {
          throw new StorageNotFoundError(key);
        }
        throw new StorageUnavailableError({ cause: error });
      }
    },
    async delete(key) {
      assertValidKey(key);
      try {
        await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
      } catch (error) {
        throw new StorageUnavailableError({ cause: error });
      }
    },
  };
}
