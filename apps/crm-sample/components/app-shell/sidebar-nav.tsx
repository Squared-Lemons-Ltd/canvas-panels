"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { navigation } from "./navigation";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {navigation.map((item) => {
        const current = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            {...(current ? { "aria-current": "page" as const } : {})}
            className={cn(
              "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
              current &&
                "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs",
            )}
          >
            <item.icon
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                current ? "text-sidebar-primary" : "text-current",
              )}
            />
            <span className="flex-1 truncate">{item.label}</span>
            {item.demo ? null : (
              <Badge variant="outline" className="text-[0.625rem]">
                Soon
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
