"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Key, Eye, EyeOff, Check, Loader2, ExternalLink, AlertTriangle, Building2, Sparkles, Globe, Users, Heart, Zap } from "lucide-react";

interface CompanyProfile {
  name: string;
  website: string;
  industry: string;
  size: string;
  mission: string;
  culture: string;
  benefits: string;
  tech_stack: string;
  selling_points: string;
}

export default function SettingsPage() {
  const { user, session } = useAuth();
  const [pdlKey, setPdlKey] = useState("");
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Company profile state
  const emptyProfile: CompanyProfile = { name: "", website: "", industry: "", size: "", mission: "", culture: "", benefits: "", tech_stack: "", selling_points: "" };
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(emptyProfile);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyMessage, setCompanyMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [companyUrl, setCompanyUrl] = useState("");

  const fetchSettings = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHasKey(data.has_pdl_key);
        setMaskedKey(data.pdl_api_key_masked);
        if (data.company_profile && typeof data.company_profile === "object") {
          setCompanyProfile({ ...emptyProfile, ...data.company_profile });
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!session?.access_token) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ pdl_api_key: pdlKey }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "API key saved successfully!" });
        setPdlKey("");
        setShowKey(false);
        await fetchSettings();
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!session?.access_token) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ pdl_api_key: null }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "API key removed" });
        setPdlKey("");
        setHasKey(false);
        setMaskedKey(null);
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">Manage your API keys and preferences.</p>

      {/* PDL API Key Section */}
      <div className="mt-8 rounded-xl border border-border bg-surface p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Key className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">People Data Labs API Key</h2>
            <p className="mt-1 text-sm text-muted">
              Connect your PDL account to search real candidate profiles with verified data.
              Without a key, Hirelix will generate AI-simulated candidates instead.
            </p>
          </div>
        </div>

        {/* Current status */}
        <div className="mt-4 rounded-lg bg-background/50 px-4 py-3">
          {hasKey ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-700">Connected</span>
                <span className="text-xs text-muted">{maskedKey}</span>
              </div>
              <button
                onClick={handleRemove}
                disabled={saving}
                className="cursor-pointer text-xs text-red-500 hover:text-red-600 transition-colors"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
              <span className="text-sm text-muted">Not connected — using AI-generated candidates</span>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium">
            {hasKey ? "Update API Key" : "Enter API Key"}
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={pdlKey}
              onChange={(e) => setPdlKey(e.target.value)}
              placeholder="Paste your PDL API key here..."
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 pr-10 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !pdlKey.trim()}
            className="mt-3 cursor-pointer inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save Key
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mt-3 rounded-lg px-4 py-2 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {message.text}
          </div>
        )}

        {/* Help */}
        <div className="mt-5 rounded-lg border border-border/50 bg-background/30 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-500 shrink-0" />
            <div className="text-xs text-muted space-y-1.5">
              <p className="font-medium text-foreground">How to get a PDL API Key</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Sign up at <a href="https://www.peopledatalabs.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">peopledatalabs.com <ExternalLink className="h-3 w-3" /></a></li>
                <li>Go to your Dashboard → API Keys</li>
                <li>Copy your API key and paste it above</li>
              </ol>
              <p>Free accounts get <strong>100 searches/month</strong>. Pro accounts ($98/mo) get 350+ and unlock real email addresses.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Company Profile Section */}
      <div className="mt-8 rounded-xl border border-border bg-surface p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2">
            <Building2 className="h-5 w-5 text-blue-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Company Profile</h2>
            <p className="mt-1 text-sm text-muted">
              Tell us about your company so we can generate highly personalized outreach messages that sell your opportunity.
            </p>
          </div>
        </div>

        {/* AI Initialize */}
        <div className="mt-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">AI Auto-fill</p>
              <p className="mt-0.5 text-xs text-muted">Enter your company website and let AI research and fill in your profile automatically.</p>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={companyUrl}
                  onChange={(e) => setCompanyUrl(e.target.value)}
                  placeholder="e.g. stripe.com or your company website"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
                <button
                  onClick={handleAiInit}
                  disabled={aiLoading || !companyUrl.trim()}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {aiLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Researching...</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> Auto-fill with AI</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Manual form */}
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Building2 className="h-3.5 w-3.5 text-muted-light" /> Company Name
              </label>
              <input
                type="text"
                value={companyProfile.name}
                onChange={(e) => setCompanyProfile({ ...companyProfile, name: e.target.value })}
                placeholder="e.g. Stripe"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Globe className="h-3.5 w-3.5 text-muted-light" /> Website
              </label>
              <input
                type="text"
                value={companyProfile.website}
                onChange={(e) => setCompanyProfile({ ...companyProfile, website: e.target.value })}
                placeholder="e.g. stripe.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Zap className="h-3.5 w-3.5 text-muted-light" /> Industry
              </label>
              <input
                type="text"
                value={companyProfile.industry}
                onChange={(e) => setCompanyProfile({ ...companyProfile, industry: e.target.value })}
                placeholder="e.g. Fintech, SaaS"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Users className="h-3.5 w-3.5 text-muted-light" /> Company Size
              </label>
              <input
                type="text"
                value={companyProfile.size}
                onChange={(e) => setCompanyProfile({ ...companyProfile, size: e.target.value })}
                placeholder="e.g. 500-1000 employees"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Heart className="h-3.5 w-3.5 text-muted-light" /> Mission & What You Do
            </label>
            <textarea
              value={companyProfile.mission}
              onChange={(e) => setCompanyProfile({ ...companyProfile, mission: e.target.value })}
              placeholder="What does your company do? What problem are you solving?"
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Users className="h-3.5 w-3.5 text-muted-light" /> Culture & Work Environment
            </label>
            <textarea
              value={companyProfile.culture}
              onChange={(e) => setCompanyProfile({ ...companyProfile, culture: e.target.value })}
              placeholder="What's the work culture like? Remote-friendly? Fast-paced startup?"
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Zap className="h-3.5 w-3.5 text-muted-light" /> Benefits & Perks
            </label>
            <textarea
              value={companyProfile.benefits}
              onChange={(e) => setCompanyProfile({ ...companyProfile, benefits: e.target.value })}
              placeholder="Competitive salary, equity, unlimited PTO, health insurance..."
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Globe className="h-3.5 w-3.5 text-muted-light" /> Tech Stack
            </label>
            <input
              type="text"
              value={companyProfile.tech_stack}
              onChange={(e) => setCompanyProfile({ ...companyProfile, tech_stack: e.target.value })}
              placeholder="e.g. React, TypeScript, Node.js, AWS, Kubernetes"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-3.5 w-3.5 text-muted-light" /> Key Selling Points
            </label>
            <textarea
              value={companyProfile.selling_points}
              onChange={(e) => setCompanyProfile({ ...companyProfile, selling_points: e.target.value })}
              placeholder="What makes your company attractive to top talent? Recent funding, growth, interesting problems?"
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <button
            onClick={handleSaveCompany}
            disabled={savingCompany}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {savingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save Company Profile
          </button>

          {companyMessage && (
            <div className={`rounded-lg px-4 py-2 text-sm ${
              companyMessage.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {companyMessage.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  async function handleSaveCompany() {
    if (!session?.access_token) return;
    setSavingCompany(true);
    setCompanyMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ company_profile: companyProfile }),
      });
      if (res.ok) {
        setCompanyMessage({ type: "success", text: "Company profile saved!" });
      } else {
        setCompanyMessage({ type: "error", text: "Failed to save" });
      }
    } catch {
      setCompanyMessage({ type: "error", text: "Network error" });
    } finally {
      setSavingCompany(false);
    }
  }

  async function handleAiInit() {
    if (!session?.access_token || !companyUrl.trim()) return;
    setAiLoading(true);
    setCompanyMessage(null);
    try {
      const res = await fetch("/api/settings/ai-company", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ website: companyUrl.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setCompanyProfile({ ...emptyProfile, ...data.profile });
          setCompanyMessage({ type: "success", text: "AI filled your company profile! Review and save when ready." });
        }
      } else {
        setCompanyMessage({ type: "error", text: "AI research failed. Try filling manually." });
      }
    } catch {
      setCompanyMessage({ type: "error", text: "Network error" });
    } finally {
      setAiLoading(false);
    }
  }
}
