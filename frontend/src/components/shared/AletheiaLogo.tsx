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
      className="flex-shrink-0"
    >
      {/* Outer hexagon - primary color */}
      <polygon
        points="50,5 93,27.5 93,72.5 50,95 7,72.5 7,27.5"
        stroke="hsl(var(--primary))"
        strokeWidth="2.5"
        fill="none"
        opacity="0.6"
      />

      {/* Upper triangle - accent color */}
      <polygon
        points="50,18 80,65 20,65"
        stroke="hsl(var(--accent))"
        strokeWidth="2"
        fill="hsl(var(--accent))"
        fillOpacity="0.08"
      />

      {/* Inverted inner triangle - primary color */}
      <polygon
        points="50,62 30,28 70,28"
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        fill="hsl(var(--primary))"
        fillOpacity="0.08"
      />

      {/* Center diamond - where triangles overlap */}
      <polygon
        points="50,28 62,45 50,62 38,45"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        fill="hsl(var(--primary))"
        fillOpacity="0.15"
        className="animate-pulse-glow"
      />
    </svg>
  );
}
