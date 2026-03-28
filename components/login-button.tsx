"use client";

import { Button } from "@/components/ui/button";
import { triggerFluidWave } from "@/components/ui/fluid-wave-loader";

export function LoginButton(): React.ReactElement {
  return (
    <a
      href="/api/auth/google"
      onClick={() => triggerFluidWave()}
    >
      <Button size="lg" className="rounded-full px-8">Login</Button>
    </a>
  );
}
