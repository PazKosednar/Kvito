import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import type { Storage } from "./Storage.js";

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Custom endpoint for S3-compatible providers (e.g. an EU object store). Empty = AWS. */
  endpoint?: string | undefined;
  /** Needed by some S3-compatible providers and by MinIO. */
  forcePathStyle?: boolean | undefined;
}

/**
 * S3-compatible storage (EU region). Objects stay private: the app streams them to the client only after
 * checking access and a signed Kvito URL, so no public bucket policy or S3 pre-signed URLs are needed.
 */
export class S3Storage implements Storage {
  private readonly client: Pick<S3Client, "send">;

  constructor(
    private readonly config: S3Config,
    client?: Pick<S3Client, "send">,
  ) {
    this.client =
      client ??
      new S3Client({
        region: config.region,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        forcePathStyle: config.forcePathStyle ?? false,
      });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: data, ContentType: contentType }),
    );
  }

  async get(key: string) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
    if (!out.Body) throw new Error("Empty S3 body");
    return { stream: out.Body as Readable, size: out.ContentLength ?? 0 };
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}
