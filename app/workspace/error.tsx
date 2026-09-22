'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
export default function WorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[65vh] max-w-lg flex-col justify-center gap-5 p-8">
      <AlertTriangle className="size-8 text-amber-700" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Your workspace could not load</h1>
      <p className="text-muted-foreground">
        The service may be temporarily unavailable. Try loading the workspace
        again. If you were saving a change, check its history before submitting
        it again.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={reset}>
          <RefreshCw className="size-4" />
          Try again
        </Button>
        <Link href="/" className="text-sm underline">
          Return to ConsultIQ
        </Link>
      </div>
    </main>
  );
}
