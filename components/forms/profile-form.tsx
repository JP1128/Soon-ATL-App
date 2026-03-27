"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TextInputOverlay } from "@/components/ui/text-input-overlay";
import { formatPhoneNumber } from "@/lib/utils";
import type { Profile, ResponseRole, University } from "@/types/database";

interface ProfileFormProps {
  profile: Profile;
}

const ROLE_OPTIONS: { value: ResponseRole; label: string }[] = [
  { value: "driver", label: "Driver" },
  { value: "rider", label: "Rider" },
  { value: "attending", label: "Neither (Attending Only)" },
];

const UNIVERSITY_OPTIONS: University[] = [
  "University of Georgia",
  "Georgia Institute of Technology",
  "Georgia State University",
  "Emory University",
  "Kennesaw State University",
  "Other",
];

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
  const [defaultRole, setDefaultRole] = useState<ResponseRole | "">(
    profile.default_role ?? ""
  );
  const [university, setUniversity] = useState<University | "">(
    profile.university ?? ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const needsPhone = !profile.phone_number;

  const phoneValid = isValidPhoneNumber(phoneNumber);

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

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        phone_number: phoneNumber ? phoneNumber.replace(/\D/g, "") : null,
        default_role: defaultRole || null,
        university: university || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to update profile");
      setIsSaving(false);
      return;
    }

    setSaved(true);
    setIsSaving(false);
    router.refresh();
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
              className="flex h-9 w-full items-center rounded-4xl border border-input bg-input/30 px-3 text-base text-left transition-colors hover:bg-input/50 md:text-sm"
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
              className={`flex h-9 w-full items-center rounded-4xl border bg-input/30 px-3 text-base text-left transition-colors hover:bg-input/50 md:text-sm ${
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

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Default Form Preferences</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pre-filled when you open an event form.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="default_role" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Default Role</Label>
            <Select
              value={defaultRole}
              onValueChange={(val) => setDefaultRole(val as ResponseRole)}
            >
              <SelectTrigger className="w-full capitalize">
                <SelectValue placeholder="Select a default role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="university" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">University</Label>
            <Select
              value={university}
              onValueChange={(val) => setUniversity(val as University)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select your university" />
              </SelectTrigger>
              <SelectContent>
                {UNIVERSITY_OPTIONS.map((uni) => (
                  <SelectItem key={uni} value={uni}>
                    {uni}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={isSaving || !phoneValid} className="w-full rounded-xl">
          {isSaving ? "Saving…" : "Save Changes"}
        </Button>
      </form>
      {saved && (
        <p className="mt-3 text-center text-sm text-green-600">Profile updated!</p>
      )}
    </div>
  );
}
