import {
  adaptDatasetRecordToBrightDataProfile,
  downloadDatasetSnapshot,
} from "@/lib/brightdata";
import { normalizeBrightProfile } from "@/lib/candidate-index/profile";

function readSnapshotId() {
  const prefix = "--snapshot-id=";
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || null;
}

async function main() {
  const snapshotId = readSnapshotId();
  if (!snapshotId) throw new Error("--snapshot-id is required");
  const token = process.env.BRIGHTDATA_API_TOKEN;
  if (!token) throw new Error("BRIGHTDATA_API_TOKEN is missing");
  const rows = await downloadDatasetSnapshot(token, snapshotId);
  const normalized = [];
  const errors: Array<{ index: number; error: string }> = [];
  for (const [index, row] of rows.entries()) {
    try {
      normalized.push(normalizeBrightProfile(adaptDatasetRecordToBrightDataProfile(row)));
    } catch (error) {
      errors.push({ index, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const uniqueIdentities = new Set(normalized.map((profile) => profile.linkedinId || profile.linkedinUrl));
  const firstProfile = normalized[0];
  console.log(JSON.stringify({
    snapshot_id: snapshotId,
    downloaded: rows.length,
    normalized: normalized.length,
    rejected: errors.length,
    unique_identities: uniqueIdentities.size,
    with_experience: normalized.filter((profile) => profile.experiences.length > 0).length,
    with_parsed_years: normalized.filter((profile) => profile.yearsExperience != null).length,
    with_education: normalized.filter((profile) => profile.schools.length > 0).length,
    first_profile_signal_density: firstProfile ? {
      about_characters: firstProfile.rawProfile.about?.length || 0,
      experience_count: firstProfile.experiences.length,
      titled_experience_count: firstProfile.experiences.filter((experience) => Boolean(experience.title)).length,
      described_experience_count: firstProfile.experiences.filter((experience) => Boolean(experience.description)).length,
      description_characters: firstProfile.experiences.reduce((sum, experience) => sum + (experience.description?.length || 0), 0),
    } : null,
    sample_errors: errors.slice(0, 3),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
