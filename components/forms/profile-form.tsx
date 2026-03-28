"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TextInputOverlay } from "@/components/ui/text-input-overlay";
import { HugeiconsIcon } from "@hugeicons/react";
import { Logout01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { AnimatePresence, motion } from "motion/react";
import { triggerFluidWave, dismissFluidWave } from "@/components/ui/fluid-wave-loader";
import { createClient } from "@/lib/supabase/client";
import { formatPhoneNumber } from "@/lib/utils";
import type { Profile } from "@/types/database";

interface ProfileFormProps {
  profile: Profile;
}

function isValidPhoneNumber(value: string): boolean {
  if (value === "") return true;
  const digits = value.replace(/\D/g, "");
  return digits.length === 10;
}

export function ProfileForm({ profile }: ProfileFormProps): React.ReactElement {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.full_name);
  const [phoneNumber, setPhoneNumber] = useState(
    profile.phone_number ? formatPhoneNumber(profile.phone_number) : ""
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const needsPhone = !profile.phone_number;

  const phoneValid = isValidPhoneNumber(phoneNumber);

  // Clear saved state when user makes changes
  useEffect(() => {
    if (saved) setSaved(false);
  }, [fullName, phoneNumber]);

  // Auto-open phone overlay when it needs attention
  useEffect(() => {
    if (needsPhone) {
      setPhoneOpen(true);
    }
  }, [needsPhone]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSaved(false);
    triggerFluidWave();

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        phone_number: phoneNumber ? phoneNumber.replace(/\D/g, "") : null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to update profile");
      setIsSaving(false);
      dismissFluidWave();
      return;
    }

    setSaved(true);
    setIsSaving(false);
    dismissFluidWave();
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="rounded-2xl border p-5">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Avatar size="lg">
          <AvatarImage src={profile.avatar_url ?? undefined} alt={fullName} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="text-center">
          <p className="font-semibold">{profile.full_name}</p>
          <p className="text-xs text-muted-foreground">{profile.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Full Name</Label>
            <button
              type="button"
              onClick={() => setNameOpen(true)}
              className="flex h-9 w-full items-center rounded-4xl border border-input bg-input/30 px-3 text-sm text-left transition-colors hover:bg-input/50"
            >
              {fullName ? (
                <span className="truncate">{fullName}</span>
              ) : (
                <span className="text-muted-foreground">First Last</span>
              )}
            </button>
            <TextInputOverlay
              open={nameOpen}
              onClose={() => setNameOpen(false)}
              onConfirm={(value) => setFullName(value)}
              initialValue={fullName}
              title="Full Name"
              placeholder="First Last"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Phone Number</Label>
            <button
              type="button"
              onClick={() => setPhoneOpen(true)}
              className={`flex h-9 w-full items-center rounded-4xl border bg-input/30 px-3 text-sm text-left transition-colors hover:bg-input/50 ${
                needsPhone && !phoneNumber ? "border-destructive" : "border-input"
              }`}
            >
              {phoneNumber ? (
                <span className="truncate">{phoneNumber}</span>
              ) : (
                <span className="text-muted-foreground">(555) 123-4567</span>
              )}
            </button>
            <TextInputOverlay
              open={phoneOpen}
              onClose={() => setPhoneOpen(false)}
              onConfirm={(value) => setPhoneNumber(formatPhoneNumber(value))}
              initialValue={phoneNumber}
              title="Phone Number"
              placeholder="(555) 123-4567"
              type="tel"
              inputMode="tel"
              formatValue={formatPhoneNumber}
            />
            {needsPhone && !phoneNumber && (
              <p className="text-xs text-destructive">Phone number is required</p>
            )}
            {phoneNumber && !phoneValid && (
              <p className="text-xs text-destructive">Enter a valid 10-digit US phone number</p>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          disabled={isSaving || !phoneValid || saved}
          className="relative w-full rounded-xl overflow-hidden"
        >
          <AnimatePresence mode="wait">
            {saved ? (
              <motion.span
                key="saved"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="inline-flex items-center gap-1.5"
              >
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
                Saved
              </motion.span>
            ) : (
              <motion.span
                key="save"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {isSaving ? "Saving\u2026" : "Save Changes"}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </form>
      <Button
        type="button"
        variant="ghost"
        className="mt-6 w-full rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={async () => {
          triggerFluidWave();
          const supabase = createClient();
          await supabase.auth.signOut();
          router.push("/");
          router.refresh();
        }}
      >
        <HugeiconsIcon icon={Logout01Icon} className="size-4" />
        Sign Out
      </Button>
    </div>
  );
}
