const SIZES = {
  xs: 20,
  sm: 32,
  md: 48,
  lg: 80,
};

interface AletheiaLogoProps {
  size?: keyof typeof SIZES;
}

export function AletheiaLogo({ size = "md" }: AletheiaLogoProps) {
  const px = SIZES[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0 transition-all duration-700 hover:scale-110 hover:rotate-3 group"
    >
      <defs>
        <linearGradient id="crystalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="1" />
          <stop offset="50%" stopColor="hsl(var(--accent))" stopOpacity="0.6" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="1" />
        </linearGradient>

        <radialGradient id="prismLight" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="white" stopOpacity="0.4" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Main Framework - Hexagon */}
      <polygon
        points="50,5 93,26.5 93,73.5 50,95 7,73.5 7,26.5"
        stroke="url(#crystalGradient)"
        strokeWidth="2"
        fill="rgba(255, 255, 255, 0.03)"
        className="opacity-90 group-hover:stroke-[3] transition-all duration-500"
      />

      {/* Structural Ribs */}
      <line x1="50" y1="5" x2="50" y2="95" stroke="hsl(var(--primary))" strokeWidth="0.5" opacity="0.3" />
      <line x1="7" y1="26.5" x2="93" y2="73.5" stroke="hsl(var(--primary))" strokeWidth="0.5" opacity="0.3" />
      <line x1="93" y1="26.5" x2="7" y2="73.5" stroke="hsl(var(--primary))" strokeWidth="0.5" opacity="0.3" />

      {/* Rotating Truth Geometry */}
      <polygon
        points="50,22 82,68 18,68"
        fill="rgba(255, 255, 255, 0.05)"
        stroke="hsl(var(--accent))"
        strokeWidth="1.5"
        strokeDasharray="1 3"
        className="opacity-60"
        style={{ transformOrigin: '50% 50%', animation: 'polygon-rotate 20s linear infinite' }}
      />

      <polygon
        points="50,25 78,65 22,65"
        stroke="url(#crystalGradient)"
        strokeWidth="2.5"
        fill="none"
      />

      {/* Inner Inverted Crystal */}
      <polygon
        points="50,60 32,32 68,32"
        fill="hsl(var(--primary))"
        fillOpacity="0.1"
        stroke="hsl(var(--primary))"
        strokeWidth="1"
        className="group-hover:fill-opacity-20 transition-all duration-500"
      />

      {/* Central "Core" Diamond */}
      <g>
        <polygon
          points="50,35 62,48 50,61 38,48"
          fill="hsl(var(--accent))"
          fillOpacity="0.8"
        />
        <polygon
          points="50,35 62,48 50,61 38,48"
          fill="url(#prismLight)"
        />
      </g>

      {/* Reflection Highlight */}
      <path
        d="M 50 10 Q 80 30 85 50"
        stroke="white"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.2"
        className="group-hover:opacity-40 transition-opacity"
      />
    </svg>
  );
}
