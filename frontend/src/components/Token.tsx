const colorMap: Record<string, string> = {
  green: "bg-ludo-green text-slate-900",
  yellow: "bg-ludo-yellow text-slate-900",
  red: "bg-ludo-red text-slate-900",
  blue: "bg-ludo-blue text-slate-900"
};

interface TokenProps {
  color: "green" | "yellow" | "red" | "blue";
  label: string;
  /** Use smaller size on board */
  small?: boolean;
}

export default function Token({ color, label, small }: TokenProps) {
  const size = small ? "h-6 w-6 text-[10px]" : "h-10 w-10 text-xs";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold shadow ${size} ${
        colorMap[color]
      }`}
    >
      {label}
    </span>
  );
}
