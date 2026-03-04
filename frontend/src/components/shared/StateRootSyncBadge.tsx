import { cn } from "@/lib/utils";

interface StateRootSyncBadgeProps {
  synced?: boolean;
}

export function StateRootSyncBadge({ synced = true }: StateRootSyncBadgeProps) {
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <div
        className={cn(
          "w-2 h-2 rounded-full",
          synced ? "bg-primary animate-pulse-glow" : "bg-destructive"
        )}
      />
      <span className="text-muted-foreground">
        {synced ? "State Root Synced" : "Out of Sync"}
      </span>
    </div>
  );
}
