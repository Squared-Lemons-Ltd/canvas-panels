import { BellIcon } from "lucide-react";

import { SkinMenu } from "@/components/canvas-skin/skin-menu";
import { CommandPaletteTrigger } from "@/components/pipeline/command-palette";
import { Button } from "@/components/ui/button";
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

        {/*
          Only the actions claim the free space, so they stay hard right. The
          search control opens the command palette Overlay Workspace rather
          than filtering in place: the results are records to navigate to.
        */}
        <search className="min-w-0 flex-1 sm:max-w-sm">
          <CommandPaletteTrigger />
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
          <SkinMenu />
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
