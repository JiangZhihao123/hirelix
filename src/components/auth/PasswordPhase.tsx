import type { FormEvent } from "react";
import { Loader2, Lock, Mail } from "lucide-react";
import type { LoginFormStyles } from "./loginStyles";

export function PasswordPhase({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onSwitchToEmail,
  onUseDifferentEmail,
  loading,
  styles,
}: {
  email: string;
  password: string;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onSwitchToEmail: () => void;
  onUseDifferentEmail: () => void;
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
          onChange={(e) => onEmailChange(e.target.value)}
          className={styles.input}
        />
      </div>
      <div className="relative">
        <Lock className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${styles.icon}`} />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          className={styles.input}
        />
      </div>
      <button type="submit" disabled={loading} className={styles.submitButton}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue with password"}
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSwitchToEmail}
          disabled={loading}
          className={styles.secondaryButton}
        >
          <Mail className="h-4 w-4" />
          Use email code instead
        </button>
        <button
          type="button"
          onClick={onUseDifferentEmail}
          disabled={loading}
          className={styles.secondaryButton}
        >
          Use a different email
        </button>
      </div>
    </form>
  );
}
