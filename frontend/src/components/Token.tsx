const colorMap: Record<string, string> = {
  green: "bg-ludo-green text-slate-900",
  yellow: "bg-ludo-yellow text-slate-900",
  red: "bg-ludo-red text-slate-900",
  blue: "bg-ludo-blue text-slate-900"
};

interface TokenProps {
  color: "green" | "yellow" | "red" | "blue";
  label: string;
}

export default function Token({ color, label }: TokenProps) {
  return (
    <span
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold shadow ${
        colorMap[color]
      }`}
    >
      {label}
    </span>
  );
}
