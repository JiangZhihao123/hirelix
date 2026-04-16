export interface LoginFormStyles {
  container: string;
  googleButton: string;
  input: string;
  otpInput: string;
  submitButton: string;
  secondaryButton: string;
  dividerColor: string;
  dividerText: string;
  icon: string;
  infoBox: string;
  successText: string;
}

export function getLoginFormStyles(variant: "page" | "modal"): LoginFormStyles {
  const isModal = variant === "modal";
  return {
    container: isModal ? "w-full max-w-md space-y-5" : "w-full max-w-sm space-y-4",
    googleButton: isModal
      ? "flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-white/[0.12] bg-white/[0.06] py-3 text-sm font-medium text-white transition-colors hover:border-white/[0.18] hover:bg-white/[0.09] disabled:opacity-50"
      : "flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-border bg-background py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50",
    input: isModal
      ? "w-full rounded-xl border border-white/[0.12] bg-white/[0.06] py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-400 focus:border-sky-300/60 focus:outline-none focus:ring-2 focus:ring-sky-300/20"
      : "w-full rounded-lg border border-border bg-background py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-light focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
    otpInput: isModal
      ? "w-full rounded-xl border border-white/[0.12] bg-white/[0.06] py-3 pl-10 pr-4 text-center text-base tracking-[0.45em] text-white placeholder:tracking-normal placeholder:text-slate-400 focus:border-sky-300/60 focus:outline-none focus:ring-2 focus:ring-sky-300/20"
      : "w-full rounded-lg border border-border bg-background py-3 pl-10 pr-4 text-center text-base tracking-[0.45em] text-foreground placeholder:tracking-normal placeholder:text-muted-light focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
    submitButton: isModal
      ? "flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-300 disabled:opacity-50"
      : "flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50",
    secondaryButton: isModal
      ? "inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-sky-200 transition-colors hover:text-white disabled:opacity-50"
      : "inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary-dark disabled:opacity-50",
    dividerColor: isModal ? "bg-white/[0.12]" : "bg-border",
    dividerText: isModal ? "text-slate-400" : "text-muted-light",
    icon: isModal ? "text-slate-400" : "text-muted-light",
    infoBox: isModal
      ? "rounded-xl border border-white/[0.12] bg-white/[0.04] p-3 text-sm text-slate-200"
      : "rounded-lg border border-border bg-background p-3 text-sm text-muted",
    successText: isModal ? "text-emerald-300" : "text-emerald-600",
  };
}
