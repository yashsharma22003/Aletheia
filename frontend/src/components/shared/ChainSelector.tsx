import { CHAINS, ChainInfo } from "@/lib/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ChainSelectorProps {
  value: number;
  onChange: (chainId: number) => void;
  label?: string;
}

export function ChainSelector({ value, onChange, label }: ChainSelectorProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</label>}
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="glass-panel border-glass-border bg-secondary/50 h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-card border-glass-border">
          {CHAINS.map((chain: ChainInfo) => (
            <SelectItem key={chain.id} value={String(chain.id)}>
              <span className="flex items-center gap-2">
                <span>{chain.icon}</span>
                <span>{chain.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
