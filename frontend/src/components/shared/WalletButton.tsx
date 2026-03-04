import { MOCK_WALLET, shortenHash } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";

export function WalletButton() {
  return (
    <Button variant="outline" className="glass-panel border-glass-border gap-2 font-mono text-xs">
      <Wallet className="w-3.5 h-3.5 text-primary" />
      <span className="text-foreground">{shortenHash(MOCK_WALLET.address, 4)}</span>
      <span className="text-primary">{MOCK_WALLET.balance} USDC</span>
    </Button>
  );
}
