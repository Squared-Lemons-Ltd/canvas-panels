import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app-shell/sidebar";
import { TopBar } from "@/components/app-shell/top-bar";
import { CommandPaletteHost } from "@/components/pipeline/command-palette";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Meridian — revenue, in one continuous surface",
    template: "%s · Meridian",
  },
  description:
    "Meridian is a fictional B2B CRM built to demonstrate Canvas Panels: a pipeline you navigate sideways instead of losing your place.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-svh antialiased">
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            {/*
              The command palette is an Overlay Workspace, and it covers the
              whole product rather than one route — so its host is mounted once,
              here, with everything the overlay makes inert inside it.
            */}
            <CommandPaletteHost>
              <a
                href="#main-content"
                className="sr-only rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
              >
                Skip to main content
              </a>
              <div className="flex min-h-svh">
                <AppSidebar />
                <div className="flex min-w-0 flex-1 flex-col">
                  <TopBar />
                  <main
                    id="main-content"
                    className="flex min-w-0 flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8"
                  >
                    {children}
                  </main>
                </div>
              </div>
            </CommandPaletteHost>
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
