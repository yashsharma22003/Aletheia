import { motion } from "framer-motion";

interface GeometricLoaderProps {
  stage?: string;
  color?: "accent" | "primary";
  size?: number;
}

export function GeometricLoader({ stage, color = "accent", size = 64 }: GeometricLoaderProps) {
  const colorClass = color === "accent" ? "stroke-accent" : "stroke-primary";
  const glowClass = color === "accent" ? "glow-amethyst" : "glow-green";

  return (
    <div className={`flex flex-col items-center gap-4 ${glowClass} rounded-2xl p-6`}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* Outer hexagon */}
        <motion.svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full animate-polygon-spin"
        >
          <polygon
            points="50,5 93,25 93,75 50,95 7,75 7,25"
            fill="none"
            className={colorClass}
            strokeWidth="1.5"
            opacity="0.3"
          />
        </motion.svg>

        {/* Inner triangle */}
        <motion.svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
          animate={{ rotate: -360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          <polygon
            points="50,15 85,75 15,75"
            fill="none"
            className={colorClass}
            strokeWidth="2"
            opacity="0.7"
          />
        </motion.svg>

        {/* Center diamond */}
        <motion.svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
          animate={{ scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <polygon
            points="50,30 65,50 50,70 35,50"
            fill="none"
            className={colorClass}
            strokeWidth="2"
          />
        </motion.svg>
      </div>

      {stage && (
        <motion.p
          key={stage}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-mono text-muted-foreground text-center"
        >
          {stage}
        </motion.p>
      )}
    </div>
  );
}
