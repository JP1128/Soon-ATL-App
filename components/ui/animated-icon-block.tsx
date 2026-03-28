"use client";

import { useRef, useState } from "react";

interface AnimatedIconBlockProps {
  children: React.ReactNode;
}

export function AnimatedIconBlock({ children }: AnimatedIconBlockProps): React.ReactElement {
  const [key, setKey] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      key={key}
      ref={ref}
      className={`flex size-12 shrink-0 items-center justify-center rounded-lg bg-secondary ${key > 0 ? "animate-wiggle" : ""}`}
      onClick={() => setKey((k) => k + 1)}
    >
      {children}
    </div>
  );
}
