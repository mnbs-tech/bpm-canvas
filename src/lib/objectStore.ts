// Server-only: picks where saved flows live. Only import this (and the two
// backends) from route handlers, never from a "use client" component.
//
// Both backends address objects by the same string keys
// (`workflow-builder/flows/<id>.json`, ...), so the local folder is a
// literal mirror of the S3 layout - a data directory can be uploaded to the
// bucket, or a bucket prefix downloaded into one, with no conversion.
import { createFsObjectStore } from "./fsObjectStore";
import { createS3ObjectStore } from "./s3ObjectStore";

export interface StoredObject {
  key: string;
  size: number;
}

export interface ObjectStore {
  /** `null` when the key does not exist - not an error. */
  get(key: string): Promise<string | null>;
  put(key: string, body: string): Promise<void>;
  /** Removing a key that is already gone is a no-op. */
  remove(keys: string[]): Promise<void>;
  list(prefix: string): Promise<StoredObject[]>;
}

const USE_LOCAL = (process.env.WORKFLOW_STORAGE || "s3").toLowerCase() === "local";

let store: ObjectStore | null = null;

export function objectStore(): ObjectStore {
  if (!store) store = USE_LOCAL ? createFsObjectStore() : createS3ObjectStore();
  return store;
}
