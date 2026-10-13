import { createHash } from "node:crypto";
import type { SourceRecord } from "./types";

export const assessmentSignature = (records: Pick<SourceRecord, "id" | "version">[]) =>
  createHash("sha256").update(JSON.stringify(records.map(record => [record.id, record.version]).sort())).digest("hex");
