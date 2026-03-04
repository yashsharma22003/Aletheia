import { MOCK_STATS } from "@/lib/mock-data";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Lock, FileCheck, ArrowDownToLine, Coins } from "lucide-react";

const stats = [
  { label: "Total Value Locked", value: MOCK_STATS.tvl, icon: Lock, color: "text-primary" },
  { label: "Active Cheques", value: MOCK_STATS.activeCheques, icon: FileCheck, color: "text-accent" },
  { label: "Recent Settlements", value: MOCK_STATS.recentSettlements, icon: ArrowDownToLine, color: "text-primary" },
  { label: "Total Minted", value: MOCK_STATS.totalMinted, icon: Coins, color: "text-muted-foreground" },
];

export function OverviewPanel() {
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
