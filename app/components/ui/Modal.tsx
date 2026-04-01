import type { ReactNode } from "react";
import { Button } from "./Button";

export function Modal(props: {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl" | "full";
  panelClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}) {
  if (!props.open) return null;

  const maxW =
    props.size === "full"
      ? "max-w-7xl"
      : props.size === "xl"
        ? "max-w-5xl"
        : props.size === "lg"
          ? "max-w-3xl"
          : "max-w-2xl";

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-zinc-950/20 backdrop-blur-sm"
        onClick={props.onClose}
        role="button"
        tabIndex={-1}
      />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <div
          className={[
            "flex w-full flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl",
            maxW,
            props.panelClassName ?? "",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-5">
            <div className="flex flex-col gap-1">
              <div className="text-base font-semibold tracking-tight text-zinc-950">{props.title}</div>
              {props.description ? <div className="text-sm text-zinc-600">{props.description}</div> : null}
            </div>
            <Button variant="ghost" onClick={props.onClose}>
              Đóng
            </Button>
          </div>
          <div className={["flex-1 overflow-auto p-5", props.bodyClassName ?? ""].join(" ")}>
            {props.children}
          </div>
          <div
            className={[
              "flex items-center justify-end gap-3 border-t border-zinc-200 p-5",
              props.footerClassName ?? "",
            ].join(" ")}
          >
            {props.footer ? props.footer : <Button variant="secondary" onClick={props.onClose}>Đóng</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

