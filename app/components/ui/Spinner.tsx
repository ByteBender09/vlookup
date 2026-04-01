export function Spinner(props: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-600">
      <span className="relative inline-flex h-4 w-4">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-300 opacity-60" />
        <span className="relative inline-flex h-4 w-4 rounded-full bg-zinc-400" />
      </span>
      {props.label ?? "Loading..."}
    </div>
  );
}

