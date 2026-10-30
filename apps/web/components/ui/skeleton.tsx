import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-sm bg-muted motion-safe:animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
