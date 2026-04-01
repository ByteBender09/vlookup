import type { ReactNode } from "react";

export function Card(props: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">{props.title}</h2>
          {props.subtitle ? <p className="text-sm text-zinc-600">{props.subtitle}</p> : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

