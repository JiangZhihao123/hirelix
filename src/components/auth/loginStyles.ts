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
      ? "flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
      : "flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-border bg-background py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50",
    input: isModal
      ? "w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-950 placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
      : "w-full rounded-lg border border-border bg-background py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-light focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
    otpInput: isModal
      ? "w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-center text-base tracking-[0.45em] text-slate-950 placeholder:tracking-normal placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
      : "w-full rounded-lg border border-border bg-background py-3 pl-10 pr-4 text-center text-base tracking-[0.45em] text-foreground placeholder:tracking-normal placeholder:text-muted-light focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
    submitButton: isModal
      ? "flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(37,99,235,0.24)] transition-colors hover:bg-blue-700 disabled:opacity-50"
      : "flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50",
    secondaryButton: isModal
      ? "inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-900 disabled:opacity-50"
      : "inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary-dark disabled:opacity-50",
    dividerColor: isModal ? "bg-slate-200" : "bg-border",
    dividerText: isModal ? "text-slate-400" : "text-muted-light",
    icon: isModal ? "text-slate-400" : "text-muted-light",
    infoBox: isModal
      ? "rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"
      : "rounded-lg border border-border bg-background p-3 text-sm text-muted",
    successText: isModal ? "text-emerald-600" : "text-emerald-600",
  };
}
