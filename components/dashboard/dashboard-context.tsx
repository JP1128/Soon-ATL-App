"use client";

import { createContext, useContext } from "react";

interface DashboardContextValue {
  fullName: string;
  avatarUrl: string | null;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  fullName,
  avatarUrl,
  children,
}: DashboardContextValue & { children: React.ReactNode }): React.ReactElement {
  return (
    <DashboardContext.Provider value={{ fullName, avatarUrl }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return ctx;
}
