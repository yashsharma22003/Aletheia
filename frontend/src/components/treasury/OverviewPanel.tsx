import { loadCheques } from "@/lib/cheque-store";
import { CHAINS } from "@/config/contracts";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Lock, FileCheck, ArrowDownToLine, Coins } from "lucide-react";

export function OverviewPanel() {
  const cheques = loadCheques();

  const totalMinted = cheques.length;
  const activeCheques = cheques.filter(c => !c.compliance && !c.redeemed).length;
  const proven = cheques.filter(c => c.compliance || c.proven).length;
  const settled = cheques.filter(c => c.redeemed).length;

  // Rough TVL: sum of unredeemed denominations
  const tvlRaw = cheques
    .filter(c => !c.redeemed)
    .reduce((sum, c) => sum + (c.denomination || 0), 0);
  const tvlFormatted = tvlRaw >= 1000
    ? `$${(tvlRaw / 1000).toFixed(1)}K`
    : tvlRaw > 0
      ? `$${tvlRaw}`
      : "$—";

  const stats = [
    { label: "Est. Value Locked", value: tvlFormatted, icon: Lock, color: "text-primary" },
    { label: "Pending Cheques", value: activeCheques, icon: FileCheck, color: "text-accent" },
    { label: "Settled", value: settled, icon: ArrowDownToLine, color: "text-primary" },
    { label: "Total Minted", value: totalMinted, icon: Coins, color: "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
        >
          <Card className="glass-panel border-glass-border">
            <CardContent className="p-5 flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
                <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
              </div>
              <stat.icon className={`w-5 h-5 ${stat.color} mt-1`} />
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
