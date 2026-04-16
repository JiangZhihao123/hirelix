import type { FormEvent } from "react";
import { Loader2, Lock, RefreshCcw, ShieldCheck } from "lucide-react";
import type { LoginFormStyles } from "./loginStyles";

export function OtpPhase({
  email,
  otpCode,
  onOtpChange,
  onSubmit,
  onResend,
  onSwitchToPassword,
  onUseDifferentEmail,
  loading,
  styles,
}: {
  email: string;
  otpCode: string;
  onOtpChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onResend: () => void;
  onSwitchToPassword: () => void;
  onUseDifferentEmail: () => void;
  loading: boolean;
  styles: LoginFormStyles;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className={styles.infoBox}>
        <p className="font-medium text-inherit">Code sent to {email}</p>
        <p className="mt-1 text-xs opacity-80">
          Enter the 6-digit code from your email to finish signing in.
        </p>
      </div>
      <div className="relative">
        <ShieldCheck
          className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${styles.icon}`}
        />
        <input
          type="text"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          value={otpCode}
          onChange={(e) => onOtpChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className={styles.otpInput}
        />
      </div>
      <button
        type="submit"
        disabled={loading || otpCode.trim().length < 6}
        className={styles.submitButton}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify code"}
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onResend}
          disabled={loading}
          className={styles.secondaryButton}
        >
          <RefreshCcw className="h-4 w-4" />
          Resend code
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
