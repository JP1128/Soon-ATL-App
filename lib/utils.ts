import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDisplayAddress(address: string): string {
  return address.replace(/,?\s*[A-Z]{2}\s*\d{5}(-\d{4})?\s*$/, "").replace(/,?\s*USA?\s*$/, "").trim();
}

export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  const limited = digits.slice(0, 10);
  if (limited.length === 0) return "";
  if (limited.length <= 3) return `(${limited}`;
  if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
  return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
}
