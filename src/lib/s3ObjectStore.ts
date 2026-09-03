// Server-only: the S3 backend of ObjectStore. Credentials come from the
// EC2 instance's IAM role (no explicit credential config).
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ObjectStore, StoredObject } from "./objectStore";

const BUCKET = process.env.WORKFLOW_S3_BUCKET || "bucket-yn1ubx";

let client: S3Client | null = null;

function s3(): S3Client {
  // Built on first use so that a local-folder deployment never constructs an
  // AWS client at all. The bucket actually lives in ap-northeast-1: boto3
  // silently follows S3's cross-region redirect, but the JS SDK v3 doesn't -
  // it must target the bucket's real region or every request 301s
  // (PermanentRedirect).
  if (!client) client = new S3Client({ region: process.env.AWS_REGION || "ap-northeast-1" });
  return client;
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === "NoSuchKey" || name === "NotFound";
}

export function createS3ObjectStore(): ObjectStore {
  return {
    async get(key) {
      try {
        const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
        // @ts-expect-error - SDK v3's Body is a Node stream at runtime here.
        return (await res.Body.transformToString()) as string;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async put(key, body) {
      await s3().send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: body,
          ContentType: "application/json",
        })
      );
    },

    async remove(keys) {
      // DeleteObjects takes 1000 keys per call; histories are far smaller,
      // but chunking keeps that from being an assumption.
      for (let i = 0; i < keys.length; i += 1000) {
        await s3().send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
          })
        );
      }
    },

    async list(prefix) {
      const objects: StoredObject[] = [];
      let token: string | undefined;
      do {
        const res = await s3().send(
          new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token })
        );
        for (const o of res.Contents ?? []) {
          if (o.Key) objects.push({ key: o.Key, size: o.Size ?? 0 });
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
      return objects;
    },
  };
}
