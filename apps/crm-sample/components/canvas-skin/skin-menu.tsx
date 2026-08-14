"use client";

import { PaletteIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { navigation } from "@/components/app-shell/navigation";

import {
  describeRouteSkins,
  isSkinChoice,
  type SkinChoice,
  skinForRoute,
  skinStorageKey,
  skins,
} from "./skins";

/**
 * Each section named the way the sidebar names it, so the menu and the
 * navigation cannot disagree about what a route is called either.
 */
const sectionSkins = describeRouteSkins(
  (prefix) => navigation.find(({ href }) => href === prefix)?.label ?? prefix,
);

/**
 * The Canvas skin switcher.
 *
 * The attribute it writes lives on `<html>` rather than on either Canvas mount,
 * for two reasons. The command palette is an Overlay Workspace portalled to the
 * document body, so an attribute on a mount would never reach it; and the
 * skin's custom properties are declared on `:root`, which means every Canvas on
 * the page — primary, nested or overlaid — inherits them without any of them
 * having to be told.
 *
 * It is deliberately separate from the light/dark control beside it. That one
 * changes the application; this one changes only the Canvas.
 */
export function SkinMenu() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<SkinChoice>("auto");

  // Read once on mount rather than during render: the value is not available
  // on the server, and the blocking bootstrap script in the document head has
  // already put the right skin on `<html>` — this only catches the menu's own
  // checked state up with it.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(skinStorageKey);
      if (stored !== null && isSkinChoice(stored)) setChoice(stored);
    } catch {
      // A blocked storage is not a reason to render nothing.
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-meridian-skin",
      choice === "auto" ? skinForRoute(pathname) : choice,
    );
  }, [choice, pathname]);

  const change = (value: string) => {
    if (!isSkinChoice(value)) return;
    setChoice(value);
    try {
      if (value === "auto") localStorage.removeItem(skinStorageKey);
      else localStorage.setItem(skinStorageKey, value);
    } catch {
      // The choice still applies for this session.
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Change the Canvas skin"
          size="icon-sm"
          variant="ghost"
        >
          <PaletteIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span>Canvas skin</span>
          <span className="text-xs font-normal text-muted-foreground">
            Custom properties only. The Panels, the DOM and the package are the
            same in every one.
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup onValueChange={change} value={choice}>
          <DropdownMenuRadioItem
            className="items-start gap-2 py-2"
            value="auto"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Match the section</span>
              <span className="text-xs text-muted-foreground">
                {sectionSkins}
              </span>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {skins.map((skin) => (
            <DropdownMenuRadioItem
              className="items-start gap-2 py-2"
              key={skin.id}
              value={skin.id}
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{skin.label}</span>
                <span className="text-xs text-muted-foreground">
                  {skin.note}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
