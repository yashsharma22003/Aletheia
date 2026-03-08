import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Terminal, Lock, Zap, Eye, ArrowRight, FileCheck, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GeometricLoader } from "@/components/shared/GeometricLoader";
import { AletheiaLogo } from "@/components/shared/AletheiaLogo";

const FEATURES = [
  {
    icon: Lock,
    title: "Zero-Knowledge Privacy",
    description: "Validate ownership without revealing sensitive data via SNARKs.",
    color: "text-accent",
  },
  {
    icon: Shield,
    title: "Chain-Agnostic",
    description: "Trustless cross-chain settlement via Merkle Patricia Trie proofs.",
    color: "text-primary",
  },
  {
    icon: Eye,
    title: "Compliance Gate",
    description: "On-chain attestations ensure regulatory compliance privately.",
    color: "text-accent",
  },
  {
    icon: Zap,
    title: "Auto-Denomination",
    description: "Instant deposit splitting for optimal liquidity and fungibility.",
    color: "text-primary",
  },
];

const STATS = [
  { label: "Total Value Locked", value: "$0" },
  { label: "Cheques Minted", value: "0" },
  { label: "Chains Supported", value: "0" },
  { label: "Settlements", value: "0" },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Hero */}
      <section className="relative container pt-24 pb-20">
        {/* Background glow effects */}
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col items-center text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <AletheiaLogo size="lg" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-5xl md:text-6xl font-bold tracking-tight mb-4"
          >
            <span className="text-gradient-green">Trustless</span>{" "}
            <span className="text-foreground">Chain-Agnostic</span>
            <br />
            <span className="text-foreground">Settlement Protocol</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-muted-foreground text-lg max-w-xl mb-10"
          >
            Mint privacy-preserving cheques and settle across chains with zero-knowledge proofs.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="flex gap-4"
          >
            <Button asChild size="lg" className="gap-2 glow-green">
              <Link to="/treasury">
                <Shield className="w-4 h-4" />
                Open Treasury
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2 glass-panel border-glass-border">
              <Link to="/claim">
                <Terminal className="w-4 h-4" />
                Claim Terminal
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border/50 bg-card/30 backdrop-blur-sm">
        <div className="container py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
                className="text-center"
              >
                <p className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-20">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl font-bold tracking-tight mb-3">Protocol Architecture</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Built on cryptographic primitives for verifiable, private, and composable value transfer.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {FEATURES.map((feat, i) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 + i * 0.1 }}
            >
              <Card className="glass-panel border-glass-border h-full hover:border-primary/30 transition-colors">
                <CardContent className="p-6">
                  <feat.icon className={`w-8 h-8 ${feat.color} mb-4`} />
                  <h3 className="text-lg font-semibold mb-2">{feat.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feat.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/50 bg-card/20">
        <div className="container py-20">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl font-bold tracking-tight mb-3">How It Works</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Three distinct phases: mint, prove, and settle.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                step: "01",
                icon: Coins,
                title: "Mint",
                desc: "Deposit USDC and create privacy-preserving cheques.",
                color: "text-primary",
                glowClass: "glow-green",
              },
              {
                step: "02",
                icon: FileCheck,
                title: "Prove",
                desc: "Generate ZK proofs to verify ownership privately.",
                color: "text-accent",
                glowClass: "glow-amethyst",
              },
              {
                step: "03",
                icon: ArrowRight,
                title: "Settle",
                desc: "Redeem validated cheques on any target chain.",
                color: "text-primary",
                glowClass: "glow-green",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.75 + i * 0.12 }}
                className="text-center"
              >
                <div className={`w-14 h-14 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-4 ${item.glowClass}`}>
                  <item.icon className={`w-6 h-6 ${item.color}`} />
                </div>
                <span className="font-mono text-xs text-muted-foreground">{item.step}</span>
                <h3 className="text-lg font-semibold mt-1 mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="glass-panel border-glass-border rounded-2xl p-10 md:p-14 text-center max-w-2xl mx-auto glow-green"
        >
          <GeometricLoader size={48} color="primary" />
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
            Ready to settle <span className="text-gradient-amethyst">trustlessly</span>?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Access the treasury to mint cheques or open the claim terminal to validate and redeem.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="gap-2">
              <Link to="/treasury">
                <Shield className="w-4 h-4" />
                Launch Treasury
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2 border-glass-border">
              <Link to="/claim">
                <Terminal className="w-4 h-4" />
                Open Claim Terminal
              </Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <AletheiaLogo size="xs" />
            <span>Aletheia Protocol</span>
          </div>
          <p className="font-mono">Trustless · Private · Composable</p>
        </div>
      </footer>
    </div>
  );
}
