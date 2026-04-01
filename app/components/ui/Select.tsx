import type { ReactNode, SelectHTMLAttributes } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  children: ReactNode;
};

export function Select({ label, hint, className = "", children, ...props }: Props) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      <select
        {...props}
        className={[
          "h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none",
          "focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-50 disabled:text-zinc-400",
          className,
        ].join(" ")}
      >
        {children}
      </select>
      {hint ? <span className="text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

