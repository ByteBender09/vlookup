import { useEffect, useId, useMemo, useRef, useState } from "react";

type Option = { value: string; label: string; disabled?: boolean };

export function Dropdown(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const selected = useMemo(
    () => props.options.find((o) => o.value === props.value),
    [props.options, props.value]
  );

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!open) return;
      if (!rootRef.current) return;
      if (e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-zinc-800">
        {props.label}
      </label>

      <div className="relative">
        <button
          id={id}
          ref={buttonRef}
          type="button"
          disabled={props.disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => {
            if (props.disabled) return;
            setOpen((v) => !v);
          }}
          className={[
            "group flex h-11 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 text-left text-sm shadow-sm",
            "border-zinc-200 text-zinc-900 hover:border-zinc-300",
            "focus:outline-none focus:ring-2 focus:ring-zinc-900/10",
            "disabled:bg-zinc-50 disabled:text-zinc-400 disabled:hover:border-zinc-200",
          ].join(" ")}
        >
          <span className={["min-w-0 truncate", selected ? "text-zinc-900" : "text-zinc-500"].join(" ")}>
            {selected?.label ?? props.placeholder ?? "Chọn..."}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-5 w-px bg-zinc-200" />
            <span className={["text-zinc-500 transition-transform", open ? "rotate-180" : ""].join(" ")}>
              ▾
            </span>
          </span>
        </button>

        {open ? (
          <div
            role="listbox"
            aria-label={props.label}
            className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
          >
            <div className="max-h-64 overflow-auto p-1">
              {props.options.map((o) => {
                const active = o.value === props.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={o.disabled}
                    onClick={() => {
                      if (o.disabled) return;
                      props.onChange(o.value);
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                    className={[
                      "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm",
                      o.disabled ? "cursor-not-allowed text-zinc-300" : "text-zinc-800 hover:bg-zinc-50",
                      active ? "bg-zinc-100 text-zinc-950 ring-1 ring-inset ring-zinc-200" : "",
                    ].join(" ")}
                  >
                    <span className="min-w-0 truncate">{o.label}</span>
                    {active ? <span className="text-xs font-semibold text-zinc-900">✓</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {props.hint ? <span className="text-xs text-zinc-500">{props.hint}</span> : null}
    </div>
  );
}

