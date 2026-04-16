import type { FormEvent } from "react";
import { Loader2, Lock, Mail } from "lucide-react";
import type { LoginFormStyles } from "./loginStyles";

export function EmailPhase({
  email,
  onChange,
  onSubmit,
  onSwitchToPassword,
  loading,
  styles,
}: {
  email: string;
  onChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onSwitchToPassword: () => void;
  loading: boolean;
  styles: LoginFormStyles;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="relative">
        <Mail className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${styles.icon}`} />
        <input
          type="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => onChange(e.target.value)}
          className={styles.input}
        />
      </div>
      <button type="submit" disabled={loading} className={styles.submitButton}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue with email"}
      </button>
      <button
        type="button"
        onClick={onSwitchToPassword}
        disabled={loading}
        className={styles.secondaryButton}
      >
        <Lock className="h-4 w-4" />
        Use password instead
      </button>
    </form>
  );
}
