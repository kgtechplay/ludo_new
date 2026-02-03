const colorMap: Record<string, string> = {
  green: "bg-ludo-green",
  yellow: "bg-ludo-yellow",
  red: "bg-ludo-red",
  blue: "bg-ludo-blue"
};

interface TokenProps {
  color: "green" | "yellow" | "red" | "blue";
  label: string;
  /** Use smaller size on board */
  small?: boolean;
}

export default function Token({ color, label, small }: TokenProps) {
  const size = small ? "h-full w-full text-[10px]" : "h-10 w-10 text-xs";
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full font-semibold text-white shadow-[0_3px_6px_rgba(0,0,0,0.22)] ring-2 ring-white/60 ${size} ${colorMap[color]}`}
    >
      <span className="absolute inset-[14%] rounded-full bg-white/20" />
      <span className="absolute left-[18%] top-[16%] h-[26%] w-[26%] rounded-full bg-white/45" />
      <span className="relative z-10">{label}</span>
    </span>
  );
}
