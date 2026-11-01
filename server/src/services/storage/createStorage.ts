import { env, isProd } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { S3Storage } from "./S3Storage.js";
import { LocalDiskStorage, type Storage } from "./Storage.js";

/**
 * Picks the file storage from the environment. Production must use S3-compatible storage in the EU:
 * the disk of a PaaS container is wiped on every deploy, and uploaded files (bills, photos) would be lost.
 */
export function createStorage(uploadDir: string): Storage {
  const driver = env.STORAGE_DRIVER ?? (isProd ? "s3" : "local");

  if (driver === "s3") {
    const { S3_BUCKET: bucket, S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = env;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error("STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (see server/.env.example).");
    }
    logger.info(`Datoteke: S3 (${bucket}, ${env.S3_REGION})`);
    return new S3Storage({ bucket, region: env.S3_REGION, accessKeyId, secretAccessKey, endpoint: env.S3_ENDPOINT, forcePathStyle: env.S3_FORCE_PATH_STYLE });
  }

  if (isProd) logger.warn("STORAGE_DRIVER=local v produkciji: datoteke se ob vsakem deployu izgubijo.");
  logger.info(`Datoteke: lokalna mapa ${uploadDir}`);
  return new LocalDiskStorage(uploadDir);
}
