"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Key, Eye, EyeOff, Check, Loader2, ExternalLink, AlertTriangle } from "lucide-react";

export default function SettingsPage() {
  const { user, session } = useAuth();
  const [pdlKey, setPdlKey] = useState("");
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
    </div>
  );
}
