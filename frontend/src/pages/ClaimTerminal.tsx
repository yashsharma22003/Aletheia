import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { findCheque } from "@/lib/cheque-store";
import { Cheque, shortenHash, getChainName } from "@/lib/mock-data";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Search, Cpu, Banknote, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";

export default function ClaimTerminal() {
  const [searchParams] = useSearchParams();
  const [chequeIdInput, setChequeIdInput] = useState("");
  const [cheque, setCheque] = useState<Cheque | null>(null);
  const [looked, setLooked] = useState(false);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      setChequeIdInput(id);
      loadCheque(id);
    }
  }, [searchParams]);

  function loadCheque(id: string) {
    const found = findCheque(id);
    if (found) {
      setCheque(found);
    } else {
      const chain = Number(searchParams.get("chain")) || 11155111;
      const denom = Number(searchParams.get("denom")) || 1000;
      setCheque({
        id,
        denomination: denom,
        targetChainId: chain,
        compliance: false,
        proven: false,
        redeemed: false,
        timestamp: Date.now(),
      });
    }
    setLooked(true);
  }

  function handleLookup() {
    const raw = chequeIdInput.trim();
    if (!raw) return;

    // If user pasted a full Magic Link URL, extract the id param from it
    try {
      const url = new URL(raw);
      const id = url.searchParams.get("id");
      const chain = url.searchParams.get("chain");
      const denom = url.searchParams.get("denom");
      if (id && id.startsWith("0x")) {
        // Update input to show just the clean id
        setChequeIdInput(id);
        // Build a synthetic cheque from the URL params (overrides localStorage if not found)
        const found = findCheque(id);
        if (found) {
          setCheque(found);
        } else {
          setCheque({
            id,
            denomination: Number(denom) || 1000,
            targetChainId: Number(chain) || 11155111,
            compliance: false,
            proven: false,
            redeemed: false,
            timestamp: Date.now(),
          });
        }
        setLooked(true);
        return;
      }
    } catch {
      // Not a URL — fall through to raw id lookup
    }

    loadCheque(raw);
  }

  const queryString = cheque ? `?id=${cheque.id}&chain=${cheque.targetChainId}&denom=${cheque.denomination}` : "";

  return (
    <main className="container max-w-3xl py-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
          <Terminal className="w-7 h-7 text-accent" />
          Claim Terminal
        </h1>
        <p className="text-muted-foreground text-sm">Look up a cheque, then choose to validate or redeem.</p>
      </div>

      {/* Lookup */}
      <Card className="glass-panel border-glass-border">
        <CardHeader>
          <CardTitle className="text-lg">Enter Cheque ID or Magic Link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="0x... or paste Magic Link URL"
              value={chequeIdInput}
              onChange={e => setChequeIdInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLookup()}
              className="bg-secondary/50 border-glass-border font-mono text-xs flex-1"
            />
            <Button onClick={handleLookup} className="gap-1.5">
              <Search className="w-4 h-4" /> Lookup
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cheque info + action cards */}
      <AnimatePresence>
        {looked && cheque && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Info banner */}
            <Card className="glass-panel border-glass-border">
              <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Cheque ID</p>
                    <p className="font-mono text-xs">{shortenHash(cheque.id, 8)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Denomination</p>
                    <p className="font-mono text-sm font-bold text-primary">{cheque.denomination} USDC</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Target Chain</p>
                    <p className="text-sm">{getChainName(cheque.targetChainId)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {cheque.redeemed && <Badge className="bg-primary/15 text-primary text-xs">Settled</Badge>}
                  {cheque.compliance && !cheque.redeemed && <Badge className="bg-primary/10 text-primary text-xs">Proven</Badge>}
                  {!cheque.compliance && <Badge variant="secondary" className="text-xs">Pending</Badge>}
                </div>
              </CardContent>
            </Card>

            {/* Two action cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Validate Card */}
              <Card className={`glass-panel border-glass-border transition-all ${cheque.proven ? "opacity-60" : "hover:border-accent/50"}`}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-accent/10">
                      <Cpu className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <p className="font-semibold">Validate Cheque</p>
                      <p className="text-xs text-muted-foreground">Compliance & proof generation</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {cheque.proven ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                        <span className="text-xs text-primary font-medium">Proven</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Pending validation</span>
                      </>
                    )}
                  </div>

                  <Button
                    asChild={!cheque.proven}
                    disabled={cheque.proven}
                    variant={cheque.proven ? "secondary" : "default"}
                    className="w-full gap-2"
                  >
                    {cheque.proven ? (
                      <span>Already Validated</span>
                    ) : (
                      <Link to={`/claim/prove${queryString}`}>
                        Start Validation <ArrowRight className="w-4 h-4" />
                      </Link>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Redeem Card */}
              <Card className={`glass-panel border-glass-border transition-all ${!cheque.proven ? "opacity-60" : cheque.redeemed ? "opacity-60" : "hover:border-primary/50"}`}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Banknote className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">Redeem Funds</p>
                      <p className="text-xs text-muted-foreground">Settle via Settlement API</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {cheque.redeemed ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                        <span className="text-xs text-primary font-medium">Settled</span>
                      </>
                    ) : cheque.proven ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                        <span className="text-xs text-muted-foreground">Ready to redeem</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Requires validation first</span>
                      </>
                    )}
                  </div>

                  <Button
                    asChild={cheque.proven && !cheque.redeemed}
                    disabled={!cheque.proven || cheque.redeemed}
                    variant={cheque.proven && !cheque.redeemed ? "default" : "secondary"}
                    className="w-full gap-2"
                  >
                    {cheque.redeemed ? (
                      <span>Already Redeemed</span>
                    ) : cheque.proven ? (
                      <Link to={`/claim/redeem${queryString}`}>
                        Redeem Now <ArrowRight className="w-4 h-4" />
                      </Link>
                    ) : (
                      <span>Validate First</span>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
