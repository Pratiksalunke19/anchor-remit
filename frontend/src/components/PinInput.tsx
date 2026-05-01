import { useRef } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
};

export default function PinInput({ value, onChange, length = 6, autoFocus }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setChar = (i: number, char: string) => {
    const next = value.split("");
    next[i] = char;
    onChange(next.join("").slice(0, length));
    if (char && i < length - 1) refs.current[i + 1]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          value={value[i] ?? ""}
          onChange={(e) => setChar(i, e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) {
              refs.current[i - 1]?.focus();
            }
          }}
          className="w-12 h-14 text-center text-2xl font-semibold rounded-lg bg-black/40 border border-white/10 focus:border-btc focus:outline-none"
        />
      ))}
    </div>
  );
}
