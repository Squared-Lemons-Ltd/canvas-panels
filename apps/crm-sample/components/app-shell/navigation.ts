import {
  Building2Icon,
  ChartColumnIcon,
  type LucideIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react";

export type NavigationItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Everything but Pipeline is a signpost: the demo only builds one surface. */
  readonly demo: boolean;
};

export const navigation: readonly NavigationItem[] = [
  { href: "/", label: "Pipeline", icon: WorkflowIcon, demo: true },
  { href: "/accounts", label: "Accounts", icon: Building2Icon, demo: false },
  { href: "/contacts", label: "Contacts", icon: UsersIcon, demo: false },
  { href: "/reports", label: "Reports", icon: ChartColumnIcon, demo: false },
];
