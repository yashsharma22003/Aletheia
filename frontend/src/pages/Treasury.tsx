import { useState, useCallback } from "react";
import { OverviewPanel } from "@/components/treasury/OverviewPanel";
import { DepositWidget } from "@/components/treasury/DepositWidget";
import { ChequeLedger } from "@/components/treasury/ChequeLedger";
import { loadCheques } from "@/lib/cheque-store";
import { Cheque } from "@/lib/cheque-types";

export default function Treasury() {
  const [cheques, setCheques] = useState<Cheque[]>(() => loadCheques());

  const refresh = useCallback(() => {
    setCheques(loadCheques());
  }, []);

  return (
    <main className="container py-8 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Treasury Dashboard</h1>
        <p className="text-muted-foreground text-sm">Manage deposits, mint cheques, and distribute magic links.</p>
      </div>
      <OverviewPanel />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <DepositWidget onMinted={refresh} />
        <div className="xl:col-span-1" />
      </div>
      <ChequeLedger cheques={cheques} />
    </main>
  );
}
