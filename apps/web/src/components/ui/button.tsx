import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "danger";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        variant === "default" &&
          "border border-brand-primary bg-brand-primary text-white shadow-[0_12px_30px_rgba(7,56,77,0.18)] hover:-translate-y-0.5 hover:bg-brand-primary-deep",
        variant === "outline" &&
          "border border-brand-primary/25 bg-white/75 text-brand-primary shadow-[0_10px_24px_rgba(7,56,77,0.06)] hover:-translate-y-0.5 hover:border-brand-primary/40 hover:bg-white",
        variant === "ghost" &&
          "bg-transparent text-brand-primary hover:bg-brand-primary/8",
        variant === "danger" &&
          "border border-red-500/20 bg-red-600 text-white shadow-[0_12px_30px_rgba(220,38,38,0.18)] hover:-translate-y-0.5 hover:bg-red-700",
        className
      )}
      {...props}
    />
  );
}
