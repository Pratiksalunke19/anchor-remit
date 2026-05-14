type Props = {
  steps: string[];
  current: number;
};

export default function StepIndicator({ steps, current }: Props) {
  return (
    <div className="flex items-center gap-3 mb-10">
      {steps.map((label, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <div key={label} className="flex-1 flex items-center gap-2.5">
            <div
              className={`flex-1 h-[3px] rounded-full transition-all duration-500 ${
                done
                  ? "bg-amber-sheen"
                  : active
                  ? "bg-amber/60"
                  : "bg-ivory/10"
              }`}
            />
            <span
              className={`text-[11px] font-semibold uppercase tracking-[0.18em] whitespace-nowrap transition ${
                active
                  ? "text-amber-300"
                  : done
                  ? "text-ivory/80"
                  : "text-ivory/35"
              }`}
            >
              {String(i + 1).padStart(2, "0")} · {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
