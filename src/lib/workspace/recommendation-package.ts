import {zipSync} from 'fflate';
import {clientDocument, assertSharingAllowed, readSharedDocument} from './document-sharing';
import {owned, expectVersion, WorkspaceError} from './database';
import {readFile, attachment} from './files';
import {renderDocument} from './document-export';
import type {Deliverable} from './types';
import type {ClientDocument} from './document-sharing';

function safeName(value: string) { return value.replace(/[\\/\r\n\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0,120) || 'document'; }
async function packageFiles(userId: string, doc: ClientDocument) {
  const entries: Record<string, Uint8Array> = {};
  entries['Recommendation.pdf'] = await renderDocument(doc.title, doc.content, 'pdf');
  let size = entries['Recommendation.pdf'].length;
  for (const [index, selected] of doc.files.entries()) {
    const file = await readFile(userId, selected.id);
    if (file.sha256 !== selected.sha256) throw new WorkspaceError('A selected CV has changed. Review the recommendation again.',409);
    size += file.bytes.length;
    if (size > 50 * 1024 * 1024) throw new WorkspaceError('This package is too large. Download the files individually.',413);
    const person = doc.people.find(p => p.id === selected.person_id);
    entries[`CVs/${index+1}-${safeName(person?.name || 'Candidate')}-${safeName(file.name)}`] = file.bytes;
  }
  return zipSync(entries, {level: 1});
}
export async function downloadRecommendationPackage(userId: string, id: string, version: number) {
  const document = await owned<Deliverable>(userId,'deliverable',id);
  expectVersion(document.version,version);
  const doc = clientDocument(document);
  await assertSharingAllowed(userId,document.role_id,doc);
  const bytes = await packageFiles(userId,doc);
  await assertSharingAllowed(userId,document.role_id,doc);
  return attachment(bytes,`${safeName(doc.title)}.zip`,'application/zip');
}
export async function downloadSharedPackage(token: string) {
  const share = await readSharedDocument(token);
  if (!share) throw new WorkspaceError('This recommendation is unavailable',404);
  const bytes = await packageFiles(share.user_id,share.snapshot);
  if (!await readSharedDocument(token)) throw new WorkspaceError('This recommendation is unavailable',404);
  return attachment(bytes,`${safeName(share.snapshot.title)}.zip`,'application/zip');
}
