import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, AudioLines, LockKeyhole } from 'lucide-react';
import Tour from './tour';
export const metadata: Metadata = {
  title: 'Product tour | ConsultIQ',
  description:
    'Explore the consultation review workflow and inspect how source evidence is checked.',
};
export default function TourPage() {
  return (
    <div className="min-h-screen bg-[#f6f8f7] text-[#20383a]">
      <a href="#tour" className="sr-only focus:not-sr-only">
        Skip to product tour
      </a>
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-b px-6 py-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-semibold"
        >
          <AudioLines aria-hidden="true" />
          ConsultIQ
        </Link>
        <Link
          href="/workspace"
          className="flex items-center gap-2 text-sm font-medium"
        >
          Private workspace <ArrowRight className="size-4" />
        </Link>
      </header>
      <main id="tour" className="mx-auto max-w-7xl px-6 py-12 md:py-16">
        <div className="mb-10 max-w-3xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#587772]">
            Product walkthrough
          </p>
          <h1 className="text-4xl font-medium tracking-tight md:text-5xl">
            From conversation to
            <br />
            reviewable coaching.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#53696b]">
            See what a reviewer examines, how evidence is checked, and where
            human judgment stays in control.
          </p>
          <p className="mt-5 flex items-start gap-2 rounded-xl border bg-white p-4 text-sm leading-relaxed">
            <LockKeyhole className="mt-0.5 size-4 shrink-0" />
            Illustrative synthetic conversation. This tour saves nothing and
            makes no AI calls. The quote checker uses the same validation
            function as the application.
          </p>
        </div>
        <Tour />
        <section
          className="mt-12 grid gap-8 border-t pt-10 md:grid-cols-2"
          aria-label="Product scope"
        >
          <div>
            <h2 className="text-xl font-semibold">
              What you can evaluate today
            </h2>
            <p className="mt-3 leading-relaxed text-[#53696b]">
              The code implements transcript import, evidence-backed assessment,
              append-only human reviews, approved-source retrieval, coaching
              review and practice assignments. The tour illustrates their
              sequence; it does not execute the authenticated workflow.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">
              What still needs validation
            </h2>
            <p className="mt-3 leading-relaxed text-[#53696b]">
              Hosted sign-in and storage require owner configuration and
              verification. AI quality needs an approved rubric and
              independently reviewed examples. Team access needs configured
              pilot accounts. Billing, audio transcription and live call support
              are not implemented.
            </p>
          </div>
        </section>
        <footer className="mt-10 flex flex-wrap gap-6 text-sm underline underline-offset-4">
          <Link href="/workspace">Open the workspace</Link>
          <a href="https://github.com/ChariPramod/consultiq/blob/main/docs/PRESENTATION_GUIDE.md">
            Presentation guide
          </a>
          <a href="https://github.com/ChariPramod/consultiq">
            Inspect the source
          </a>
        </footer>
      </main>
    </div>
  );
}
