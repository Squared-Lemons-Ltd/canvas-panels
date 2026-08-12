import { ConstructionIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The demo only builds the Pipeline. The other sections exist so the navigation
 * tells the truth about what it does when you click it.
 */
export function SectionStub({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ConstructionIcon aria-hidden="true" className="size-4" />
            Not part of this demo
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Meridian exists to show one thing: how a Canvas Workspace feels when
          you work a real pipeline in it.
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline">
            <Link href="/">Go to the Pipeline</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
