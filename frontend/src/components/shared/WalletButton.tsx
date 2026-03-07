import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { shortenHash } from "@/lib/cheque-types";

export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {!connected ? (
              <Button
                onClick={openConnectModal}
                variant="outline"
                className="glass-panel border-glass-border gap-2 font-mono text-xs"
              >
                <Wallet className="w-3.5 h-3.5 text-primary" />
                Connect Wallet
              </Button>
            ) : chain.unsupported ? (
              <Button
                onClick={openChainModal}
                variant="outline"
                className="glass-panel border-destructive/50 gap-2 font-mono text-xs text-destructive"
              >
                Wrong Network
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                {/* Chain badge — clickable to switch network */}
                <Button
                  onClick={openChainModal}
                  variant="outline"
                  className="glass-panel border-glass-border gap-1.5 font-mono text-xs h-9 px-2.5"
                >
                  {chain.hasIcon && chain.iconUrl ? (
                    <img
                      src={chain.iconUrl}
                      alt={chain.name}
                      className="w-3.5 h-3.5 rounded-full"
                    />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                  )}
                  <span className="text-muted-foreground">{chain.name}</span>
                </Button>

                {/* Account button */}
                <Button
                  onClick={openAccountModal}
                  variant="outline"
                  className="glass-panel border-glass-border gap-2 font-mono text-xs h-9"
                >
                  <Wallet className="w-3.5 h-3.5 text-primary" />
                  <span className="text-foreground">{shortenHash(account.address, 4)}</span>
                  {account.displayBalance && (
                    <span className="text-primary">{account.displayBalance}</span>
                  )}
                </Button>
              </div>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
