"use client";

import { SidebarMenu } from "@/components/dashboard/sidebar-menu";
import { useDashboard } from "@/components/dashboard/dashboard-context";

interface PageHeaderProps {
  title: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, children }: PageHeaderProps): React.ReactElement {
  const { fullName, avatarUrl } = useDashboard();

  return (
    <div className="mb-6 flex items-center gap-3">
      <SidebarMenu fullName={fullName} avatarUrl={avatarUrl} />
      <h1 className="flex-1 text-lg font-semibold">{title}</h1>
      {children}
    </div>
  );
}
