"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { fetchWithUserSession } from "@/lib/client-auth";
import {
  EMPTY_PROFILE,
  HeadhunterProfile,
  MessageBanner,
  MessageState,
  SettingsFieldGroup,
  SettingsSection,
} from "./shared";

export function RecruiterProfileSection({
  initialProfile,
  onNameChange,
  refreshBilling,
}: {
  initialProfile: HeadhunterProfile;
  onNameChange: (name: string) => void;
  refreshBilling: () => Promise<void>;
}) {
  const [profile, setProfile] = useState<HeadhunterProfile>({ ...EMPTY_PROFILE, ...initialProfile });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<MessageState>(null);

  function updateField(field: keyof HeadhunterProfile, value: string) {
    const updated = { ...profile, [field]: value };
    setProfile(updated);
    if (field === "recruiter_name") onNameChange(value);
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    setProfileMessage(null);
    try {
      const res = await fetchWithUserSession("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_profile: profile }),
      });
      if (res.ok) {
        setProfileMessage({ type: "success", text: "Profile saved." });
        void refreshBilling();
      } else {
        const data = await res.json().catch(() => ({}));
        setProfileMessage({
          type: "error",
          text:
            typeof data.error === "string" && data.error.length > 0
              ? data.error
              : "Failed to save profile.",
        });
      }
    } catch {
      setProfileMessage({ type: "error", text: "Network error while saving profile." });
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <SettingsSection
      id="profile"
      eyebrow="Profile"
      title="Recruiter profile"
      description="Your profile as a headhunter. Hirelix uses this to personalize outreach — candidates will see your name and firm, not your client's."
    >
      <div className="space-y-5">
        <SettingsFieldGroup
          title="Identity"
          description="How you present yourself to candidates. Your client's name stays confidential."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Your name
              </label>
              <input
                type="text"
                value={profile.recruiter_name}
                onChange={(e) => updateField("recruiter_name", e.target.value)}
                placeholder="e.g. Sarah Chen"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Firm / agency name
              </label>
              <input
                type="text"
                value={profile.firm_name}
                onChange={(e) => updateField("firm_name", e.target.value)}
                placeholder="e.g. Apex Search Partners (optional)"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
          </div>
        </SettingsFieldGroup>

        <SettingsFieldGroup
          title="Focus area"
          description="Your recruiting specialization. Helps Hirelix frame outreach from a credible, relevant angle."
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Specialization
              </label>
              <input
                type="text"
                value={profile.specialization}
                onChange={(e) => updateField("specialization", e.target.value)}
                placeholder="e.g. Senior engineering roles at Series A–C startups"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Short bio
              </label>
              <textarea
                value={profile.bio}
                onChange={(e) => updateField("bio", e.target.value)}
                placeholder="A sentence or two about your background — used to make outreach feel personal and credible."
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
          </div>
        </SettingsFieldGroup>

        <div className="flex flex-col gap-4 border-t border-slate-200/80 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl text-sm text-slate-600">
            Outreach drafts will sign off with your name. Client company details remain confidential.
          </div>
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {savingProfile ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save profile
          </button>
        </div>

        <MessageBanner message={profileMessage} />
      </div>
    </SettingsSection>
  );
}
