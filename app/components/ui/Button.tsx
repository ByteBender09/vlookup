import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
};

export function Button({ variant = "primary", className = "", ...props }: Props) {
  const base =
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 active:translate-y-px disabled:pointer-events-none disabled:opacity-40";

  const styles =
    variant === "primary"
      ? "bg-zinc-950 text-white shadow-md shadow-zinc-900/15 hover:bg-zinc-900"
      : variant === "secondary"
        ? "border border-zinc-200 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50"
        : "text-zinc-900 hover:bg-zinc-100";

  return <button {...props} className={[base, styles, className].join(" ")} />;
}

