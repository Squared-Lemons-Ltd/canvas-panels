import {
  Building2Icon,
  ChartColumnIcon,
  type LucideIcon,
  RadioTowerIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react";

/**
 * The five sections, in the order a reader should meet them.
 *
 * Every one is built. There used to be a `demo` flag here, and a "Soon" badge
 * beside the sections that were signposts, so the navigation told the truth
 * about what happened when it was clicked — but with all five built the flag
 * was `true` everywhere, the badge branch was unreachable, and the comment
 * above it still said Contacts and Reports were signposts. A flag that cannot
 * be false is not a flag, so it has gone along with the stub it guarded.
 */
export type NavigationItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
};

export const navigation: readonly NavigationItem[] = [
  { href: "/", label: "Pipeline", icon: WorkflowIcon },
  { href: "/accounts", label: "Accounts", icon: Building2Icon },
  { href: "/contacts", label: "Contacts", icon: UsersIcon },
  { href: "/territories", label: "Territories", icon: RadioTowerIcon },
  { href: "/reports", label: "Reports", icon: ChartColumnIcon },
];
