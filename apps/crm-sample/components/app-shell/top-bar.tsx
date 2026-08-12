import { BellIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BrandMark } from "./brand-mark";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/80 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <MobileNav />
        <div className="flex items-center gap-2 lg:hidden">
          <BrandMark className="size-5" />
          <span className="text-sm font-semibold tracking-tight">Meridian</span>
        </div>

        {/* Only the actions claim the free space, so they stay hard right. */}
        <search className="min-w-0 flex-1 sm:max-w-sm">
          <Label htmlFor="global-search" className="sr-only">
            Search accounts, contacts and deals
          </Label>
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="global-search"
              type="search"
              autoComplete="off"
              placeholder="Search accounts, contacts, deals…"
              className="h-9 pr-16 pl-9"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground sm:block">
              ⌘K
            </kbd>
          </div>
        </search>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Notifications">
                <BellIcon aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Notifications</TooltipContent>
          </Tooltip>
          <ThemeToggle />
          <Separator
            orientation="vertical"
            className="mx-1 data-[orientation=vertical]:h-6"
          />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
