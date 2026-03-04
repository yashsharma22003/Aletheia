import { Link, useLocation } from "react-router-dom";
import { WalletButton } from "@/components/shared/WalletButton";
import { StateRootSyncBadge } from "@/components/shared/StateRootSyncBadge";
import { AletheiaLogo } from "@/components/shared/AletheiaLogo";
import { cn } from "@/lib/utils";
import { Shield, Terminal } from "lucide-react";
import { ConnectButton } from '@rainbow-me/rainbowkit';

const NAV_ITEMS = [
  { path: "/treasury", label: "Treasury", icon: Shield },
  { path: "/claim", label: "Claim Terminal", icon: Terminal },
];

export function AppHeader() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo + Nav */}
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2">
            <AletheiaLogo size="sm" />
            <span className="font-bold text-lg tracking-tight">Aletheia</span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const isActive = path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <StateRootSyncBadge />
          {/* <WalletButton /> */}
              <ConnectButton />
        </div>
      </div>
    </header>
  );
}
