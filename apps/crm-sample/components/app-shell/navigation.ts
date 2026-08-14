import {
  Building2Icon,
  ChartColumnIcon,
  type LucideIcon,
  RadioTowerIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react";

export type NavigationItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /**
   * Whether the section is built. Contacts and Reports are signposts; Pipeline
   * and Accounts are two Canvas Workspaces built out of the same package and
   * deliberately unalike, which is what the demo is for.
   */
  readonly demo: boolean;
};

export const navigation: readonly NavigationItem[] = [
  { href: "/", label: "Pipeline", icon: WorkflowIcon, demo: true },
  { href: "/accounts", label: "Accounts", icon: Building2Icon, demo: true },
  { href: "/contacts", label: "Contacts", icon: UsersIcon, demo: true },
  {
    href: "/territories",
    label: "Territories",
    icon: RadioTowerIcon,
    demo: true,
  },
  { href: "/reports", label: "Reports", icon: ChartColumnIcon, demo: true },
];
