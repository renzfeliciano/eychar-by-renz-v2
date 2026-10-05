"use client";

import { useEffect } from "react";
import { TriangleAlertIcon, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center shadow-[var(--shadow-raised)]">
        <CardHeader className="items-center">
          <div className="mb-1 text-destructive">
            <TriangleAlertIcon className="size-5" />
          </div>
          <CardTitle className="text-xl">This page couldn&apos;t load</CardTitle>
          <CardDescription>
            Try again in a moment. If it keeps happening, tell your administrator{error.digest ? ` (reference ${error.digest})` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={reset} className="w-full" icon={RotateCcw}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
