import { attachmentError } from "@/lib/workspace/attachments";

export type PendingFile = {
  id: string;
  file: File;
  fileId?: string;
  status: "ready" | "uploading" | "uploaded" | "error";
  error?: string;
};

// Files stay on this browser until the user sends them. IndexedDB preserves the
// actual bytes; localStorage cannot safely hold a batch of binary attachments.
function openDrafts(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("hirelix-attachment-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Attachment draft storage is unavailable"));
  });
}

async function readDraft(key: string): Promise<PendingFile[]> {
  const db = await openDrafts();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", "readonly");
      const request = tx.objectStore("drafts").get(key);
      tx.oncomplete = () => resolve((request.result || []).map((item: PendingFile) => ({
        ...item,
        // An interrupted browser request is retried, never restored as busy.
        status: item.fileId ? "uploaded" : item.status === "uploading" ? "ready" : item.status,
      })));
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function saveDraft(key: string, files: PendingFile[]) {
  const db = await openDrafts();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      // Rejected files are not accepted draft material, and may be arbitrarily large.
      const accepted = files.filter(item => !attachmentError(item.file.name, item.file.size));
      if (accepted.length) store.put(accepted, key);
      else store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

// Preserve call order across navigation: a new composer must wait for the old
// composer's pending write, and a successful send's clear must be the last write.
let operations: Promise<unknown> = Promise.resolve();
function ordered<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.then(operation, operation);
  operations = next.catch(() => undefined);
  return next;
}
export function readAttachmentDraft(key: string) {
  return ordered(() => readDraft(key));
}
export function saveAttachmentDraft(key: string, files: PendingFile[]) {
  return ordered(() => saveDraft(key, files));
}
