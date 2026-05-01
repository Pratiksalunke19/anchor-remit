type Props = {
  steps: string[];
  current: number;
};

export default function StepIndicator({ steps, current }: Props) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((label, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <div key={label} className="flex-1 flex items-center gap-2">
            <div
              className={`flex-1 h-1.5 rounded-full transition ${
                done ? "bg-btc" : active ? "bg-btc/60" : "bg-white/10"
              }`}
            />
            <span
              className={`text-xs font-medium whitespace-nowrap ${
                active ? "text-btc" : done ? "text-white/80" : "text-white/40"
              }`}
            >
              {i + 1}. {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
