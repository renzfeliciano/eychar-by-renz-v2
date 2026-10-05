import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center shadow-[var(--shadow-raised)]">
        <CardHeader className="items-center">
          <div className="mb-1 text-primary">
            <CompassIcon className="size-5" />
          </div>
          <CardTitle className="text-xl">Page not found</CardTitle>
          <CardDescription>The page you&apos;re looking for doesn&apos;t exist or may have moved.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard" className={buttonVariants({ className: "w-full" })}>
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
