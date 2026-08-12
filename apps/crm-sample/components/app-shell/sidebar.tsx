import { SparklesIcon } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { BrandMark } from "./brand-mark";
import { SidebarNav } from "./sidebar-nav";

export function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-3 px-2 pt-1">
        <BrandMark />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold tracking-tight">
            Meridian
          </span>
          <span className="truncate text-xs text-muted-foreground">
            Northwind Group
          </span>
        </div>
      </div>

      <SidebarNav {...(onNavigate ? { onNavigate } : {})} />

      <div className="mt-auto flex flex-col gap-3">
        <Separator />
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <SparklesIcon
              aria-hidden="true"
              className="size-3.5 text-primary"
            />
            Growth plan
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Sample workspace. Every figure on this screen is fictional.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
      <div className="sticky top-0 h-svh">
        <SidebarBody />
      </div>
    </aside>
  );
}
