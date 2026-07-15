import {
  adaptDatasetRecordToBrightDataProfile,
  downloadDatasetSnapshot,
} from "@/lib/brightdata";
import { generateEmbeddings } from "@/lib/candidate-index/embedding";
import {
  buildExperienceSearchDocument,
  normalizeBrightProfile,
} from "@/lib/candidate-index/profile";
import {
  buildProfileSearchDocument,
  generateProfileRepresentation,
} from "@/lib/candidate-index/representation";

function readSnapshotId() {
  const prefix = "--snapshot-id=";
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || null;
}

async function main() {
  const snapshotId = readSnapshotId();
  if (!snapshotId) throw new Error("--snapshot-id is required");
  if (!process.argv.includes("--allow-live-ai")) {
    console.log("Dry run only. Add --allow-live-ai to run one DeepSeek representation and embedding request.");
    return;
  }
  const token = process.env.BRIGHTDATA_API_TOKEN;
  if (!token) throw new Error("BRIGHTDATA_API_TOKEN is missing");
  const rows = await downloadDatasetSnapshot(token, snapshotId);
  if (rows.length === 0) throw new Error("Snapshot is empty");
  const profile = normalizeBrightProfile(adaptDatasetRecordToBrightDataProfile(rows[0]));
  const { representation, model } = await generateProfileRepresentation(profile);
  const semanticByRef = new Map(representation.experiences.map((item) => [item.experience_ref, item]));
  const profileDocument = buildProfileSearchDocument(profile, representation);
  const experienceDocuments = profile.experiences.map((experience) =>
    buildExperienceSearchDocument(experience, semanticByRef.get(experience.ref)),
  );
  const embeddings = await generateEmbeddings([profileDocument, ...experienceDocuments]);
  console.log(JSON.stringify({
    snapshot_id: snapshotId,
    representation_model: model,
    role_family_count: representation.role_families.length,
    skill_count: representation.skills.length,
    evidence_count: representation.evidence.length,
    experience_count: profile.experiences.length,
    embedding_model: embeddings.model,
    embedding_count: embeddings.embeddings.length,
    embedding_dimensions: embeddings.dimensions,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

