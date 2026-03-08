import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Terminal, Cpu, Banknote, ArrowRight, Building2, User } from "lucide-react";
import { TARGET_CHAINS } from "@/config/contracts";

const DEFAULT_CHAIN_ID = TARGET_CHAINS[0].id;

function extractChequeParams(raw: string): { id: string; chain: number; schain: number; denom: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Full magic link URL
  try {
    const url = new URL(trimmed);
    const id = url.searchParams.get("id");
    const chain = Number(url.searchParams.get("chain")) || DEFAULT_CHAIN_ID;
    const schain = Number(url.searchParams.get("schain")) || DEFAULT_CHAIN_ID;
    const denom = Number(url.searchParams.get("denom")) || 1000;
    if (id && /^0x[0-9a-fA-F]{64}$/.test(id)) return { id, chain, schain, denom };
  } catch { /* not a URL */ }
  // Bare bytes32 hex
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return { id: trimmed, chain: DEFAULT_CHAIN_ID, schain: DEFAULT_CHAIN_ID, denom: 1000 };
  }
  return null;
}

function RoleCard({
  icon: Icon,
  iconColor,
  borderHover,
  badge,
  title,
  subtitle,
  description,
  placeholder,
  btnLabel,
  btnClass,
  targetPath,
  delay,
}: {
  icon: React.ElementType;
  iconColor: string;
  borderHover: string;
  badge: string;
  badgeClass: string;
  title: string;
  subtitle: string;
  description: string;
  placeholder: string;
  btnLabel: string;
  btnClass: string;
  targetPath: string;
  delay: number;
}) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  function handleGo() {
    const params = extractChequeParams(input);
    if (!params) {
      setError(true);
      setTimeout(() => setError(false), 2000);
      return;
    }
    navigate(`${targetPath}?id=${params.id}&chain=${params.chain}&schain=${params.schain}&denom=${params.denom}`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <Card className={`glass-panel border-glass-border h-full transition-all duration-300 hover:${borderHover} group`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className={`p-3 rounded-xl ${iconColor} mb-3`}>
              <Icon className="w-7 h-7" />
            </div>
            <Badge variant="outline" className="text-[10px] border-glass-border text-muted-foreground">{badge}</Badge>
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <p className="text-xs text-muted-foreground font-medium">{subtitle}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>

          <div className="space-y-2">
            <Input
              placeholder={placeholder}
              value={input}
              onChange={e => { setInput(e.target.value); setError(false); }}
              onKeyDown={e => e.key === "Enter" && handleGo()}
              className={`font-mono text-xs bg-secondary/50 transition-colors ${error
                ? "border-destructive focus-visible:ring-destructive"
                : "border-glass-border"
                }`}
            />
            {error && (
              <p className="text-[11px] text-destructive">Enter a valid cheque ID (0x...) or Magic Link URL</p>
            )}
          </div>

          <Button onClick={handleGo} className={`w-full gap-2 ${btnClass}`}>
            {btnLabel} <ArrowRight className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function ClaimTerminal() {
  return (
    <main className="container max-w-4xl py-10 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-center gap-3 mb-1"
        >
          <Terminal className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight">Claim Terminal</h1>
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="text-muted-foreground"
        >
          Select your role to proceed. Each portal operates independently.
        </motion.p>
      </div>

      {/* Role Banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="p-4 rounded-xl border border-glass-border bg-secondary/30 flex items-start gap-3"
      >
        <div className="mt-0.5 text-muted-foreground">
          <Terminal className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-medium">Decoupled Proving Model</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Proving and Redemption are separate operations. Provers generate proofs on server-grade infrastructure; Claimants redeem independently.
          </p>
        </div>
      </motion.div>

      {/* Two role cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Prover Card */}
        <RoleCard
          icon={Building2}
          iconColor="bg-accent/10 text-accent"
          borderHover="border-accent/50"
          badge="Prover"
          badgeClass=""
          title="Prover Portal"
          subtitle="Generate & submit ZK proof"
          description="Generate and submit ZK proofs via Chainlink CRE using server-grade infrastructure."
          placeholder="Cheque ID (0x...) or Magic Link URL"
          btnLabel="Open Prover Portal"
          btnClass="bg-accent text-accent-foreground hover:bg-accent/90 glow-amethyst"
          targetPath="/claim/prove"
          delay={0.3}
        />

        {/* Claimant Card */}
        <RoleCard
          icon={User}
          iconColor="bg-primary/10 text-primary"
          borderHover="border-primary/50"
          badge="Claimant"
          badgeClass=""
          title="Claimant Portal"
          subtitle="Redeem your cheque"
          description="Zero-burden settlement. Redemption is handled entirely by the Chainlink Verify Oracle enclave. No proof generation required."
          placeholder="Cheque ID (0x...) or Magic Link URL"
          btnLabel="Open Claimant Portal"
          btnClass="glow-green"
          targetPath="/claim/redeem"
          delay={0.4}
        />
      </div>

      {/* Role info footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
      >
        {[
          { icon: Building2, label: "Prover", desc: "Signs & generates proof on server infrastructure" },
          { icon: Cpu, label: "Verifier (Chainlink)", desc: "Validates proof hash inside DON enclave" },
          { icon: User, label: "Claimant", desc: "Submits chequeId: no compute required" },
        ].map(({ icon: Icon, label, desc }, i) => (
          <div key={label} className="p-3 rounded-lg border border-glass-border bg-secondary/20 flex items-start gap-2.5">
            <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium">{label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </motion.div>
    </main>
  );
}
