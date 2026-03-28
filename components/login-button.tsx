"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { triggerFluidWave } from "@/components/ui/fluid-wave-loader";
import { motion } from "motion/react";

export function LoginButton(): React.ReactElement {
  const [clicked, setClicked] = useState(false);

  return (
    <a
      href="/api/auth/google"
      onClick={() => {
        setClicked(true);
        triggerFluidWave();
      }}
    >
      <motion.div whileTap={{ scale: 0.95 }}>
        <Button size="lg" className="rounded-full px-8" disabled={clicked}>
          {clicked ? "Logging in…" : "Login"}
        </Button>
      </motion.div>
    </a>
  );
}
