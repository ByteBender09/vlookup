export type Step = {
  id: string;
  title: string;
  subtitle?: string;
  done?: boolean;
  current?: boolean;
};

export function Stepper(props: { steps: Step[] }) {
  return (
    <ol className="grid grid-cols-1 gap-3 md:grid-cols-4">
      {props.steps.map((s, idx) => (
        <li
          key={s.id}
          className={[
            "rounded-2xl border p-4",
            s.current ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
              Step {idx + 1}
            </div>
            <div
              className={[
                "flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-semibold",
                s.current
                  ? "bg-white/15 text-white"
                  : s.done
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-zinc-100 text-zinc-700",
              ].join(" ")}
            >
              {s.done ? "✓" : idx + 1}
            </div>
          </div>
          <div className="mt-2 text-sm font-semibold">{s.title}</div>
          {s.subtitle ? (
            <div className={["mt-1 text-xs", s.current ? "text-white/80" : "text-zinc-500"].join(" ")}>
              {s.subtitle}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

