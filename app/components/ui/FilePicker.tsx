import { useId, useRef } from "react";
import { Button } from "./Button";

export function FilePicker(props: {
  label: string;
  description?: string;
  fileName?: string;
  accept?: string;
  onPick: (file: File | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement | null>(null);
  const picked = Boolean(props.fileName);

  return (
    <div
      className={[
        "group relative rounded-2xl border p-4 shadow-sm transition",
        picked
          ? "border-emerald-200 bg-linear-to-b from-emerald-50 to-white shadow-emerald-100/60"
          : "border-zinc-200 bg-linear-to-b from-white to-zinc-50",
        props.disabled ? "opacity-70" : "hover:border-zinc-300 hover:shadow-md",
      ].join(" ")}
      onClick={() => {
        if (!props.disabled) ref.current?.click();
      }}
      role="button"
      tabIndex={props.disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (props.disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ref.current?.click();
        }
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-zinc-950">{props.label}</div>
          {props.description ? <div className="text-xs text-zinc-600">{props.description}</div> : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            ref.current?.click();
          }}
          disabled={props.disabled}
        >
          {picked ? "Đổi file" : "Chọn file"}
        </Button>
      </div>

      <input
        id={id}
        ref={ref}
        type="file"
        accept={props.accept ?? ".xlsx,.xls,.csv"}
        className="hidden"
        onClick={(e) => {
          // allow picking the same file again => always fire onChange
          (e.currentTarget as HTMLInputElement).value = "";
        }}
        onChange={(e) => props.onPick(e.target.files?.[0] ?? null)}
        disabled={props.disabled}
      />

      <div
        className={[
          "mt-3 flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2 transition",
          picked ? "border-emerald-200" : "border-zinc-200",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-zinc-900">
            {props.fileName ? props.fileName : "Chưa chọn file"}
          </div>
          <div className="text-[11px] text-zinc-500">Hỗ trợ .xlsx, .xls, .csv</div>
        </div>
        <label
          htmlFor={id}
          onClick={(e) => e.stopPropagation()}
          className={[
            "cursor-pointer select-none text-xs font-semibold",
            props.disabled ? "text-zinc-300" : picked ? "text-emerald-700 hover:text-emerald-900" : "text-zinc-700 hover:text-zinc-950",
          ].join(" ")}
        >
          Browse
        </label>
      </div>
    </div>
  );
}

