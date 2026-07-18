import type { BrightDataProfile } from "@/lib/brightdata";

export type ProfilePrecheckResult = {
  decision: "incomplete";
  missingInformation: string[];
  reason: string;
};

export function precheckBrightProfile(profile: BrightDataProfile): ProfilePrecheckResult | null {
  if (!profile.linkedin_id && !profile.url) {
    return {
      decision: "incomplete",
      missingInformation: ["Missing LinkedIn identity"],
      reason: "Profile cannot be deduplicated or reused without a LinkedIn identity.",
    };
  }
  if (!profile.name?.trim() || profile.experience.length === 0) {
    return {
      decision: "incomplete",
      missingInformation: [
        ...(!profile.name?.trim() ? ["Missing candidate name"] : []),
        ...(profile.experience.length === 0 ? ["Missing work experience"] : []),
      ],
      reason: "Profile lacks the minimum data required for reusable indexing.",
    };
  }
  return null;
}
