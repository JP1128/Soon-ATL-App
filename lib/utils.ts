import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDisplayAddress(address: string): string {
  return address.replace(/,?\s*[A-Z]{2}\s*\d{5}(-\d{4})?\s*$/, "").replace(/,?\s*USA?\s*$/, "").trim();
}
