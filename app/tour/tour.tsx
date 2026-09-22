'use client';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Quote,
  BookOpen,
  ClipboardCheck,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { validateEvidence } from '@/lib/evidence';
const turns = [
  { role: 'Patient', text: 'I would like some time to think about it.' },
  {
    role: 'Coordinator',
    text: 'Of course. Would Thursday afternoon work for a follow-up?',
  },
  { role: 'Patient', text: 'Thursday afternoon works for me.' },
];
const steps = [
  { title: 'Read the conversation', label: 'Transcript', icon: FileText },
  { title: 'Check the evidence', label: 'Evidence', icon: Quote },
  { title: 'Ground the coaching', label: 'Guidance', icon: BookOpen },
  {
    title: 'Review and follow through',
    label: 'Human review',
    icon: ClipboardCheck,
  },
];
export default function Tour() {
  const [step, setStep] = useState(0);
  const [turn, setTurn] = useState(1);
  const [quote, setQuote] = useState(
    'Would Thursday afternoon work for a follow-up?',
  );
  const [result, setResult] = useState<'supported' | 'rejected' | null>(null);
  const changeQuote = (value: string) => {
    setQuote(value);
    setResult(null);
  };
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[240px_1fr]">
      <nav
        aria-label="Tour steps"
        className="grid grid-cols-2 gap-2 lg:grid-cols-1"
      >
        {steps.map((item, index) => (
          <Button
            key={item.label}
            variant={step === index ? 'default' : 'outline'}
            aria-current={step === index ? 'step' : undefined}
            onClick={() => setStep(index)}
            className="h-auto justify-start whitespace-normal px-4 py-4 text-left"
          >
            <item.icon aria-hidden="true" />
            <span>
              {index + 1}. {item.label}
            </span>
          </Button>
        ))}
      </nav>
      <Card className="bg-white shadow-sm">
        <CardHeader className="border-b pb-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Step {step + 1} of 4 · Illustration
          </p>
          <CardTitle>
            <h2 className="text-2xl leading-tight">{steps[step].title}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          {step === 0 && (
            <>
              <p className="leading-relaxed text-muted-foreground">
                Start with a speaker-labeled role-play transcript. A reviewer
                can return to the original words when questioning an assessment.
              </p>
              <Transcript />
              <div className="rounded-xl bg-[#edf3f1] p-5">
                <h3 className="font-semibold">An observation, not a score</h3>
                <p className="mt-2 leading-relaxed">
                  The coordinator proposes a follow-up time. Whether that meets
                  the team’s standard depends on the owner-approved rubric. This
                  illustration assigns no numeric score.
                </p>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <p className="leading-relaxed text-muted-foreground">
                A quote must occur in the specific transcript turn it cites. Try
                the original quote, an unsupported claim, or the right quote
                attached to the wrong speaker.
              </p>
              <Transcript selected={turn} />
              <div className="space-y-2">
                <label
                  htmlFor="tour-turn"
                  className="block text-sm font-medium"
                >
                  Cited transcript turn
                </label>
                <select
                  id="tour-turn"
                  value={turn}
                  onChange={(event) => {
                    setTurn(Number(event.target.value));
                    setResult(null);
                  }}
                  className="w-full rounded-lg border bg-background p-3 text-sm"
                >
                  {turns.map((item, index) => (
                    <option key={index} value={index}>
                      Turn {index + 1} · {item.role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="tour-quote" className="text-sm font-medium">
                  Supporting quote
                </label>
                <Textarea
                  id="tour-quote"
                  value={quote}
                  onChange={(event) => changeQuote(event.target.value)}
                  maxLength={1000}
                  className="min-h-24"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() =>
                    setResult(
                      validateEvidence(turns, [
                        { turn_index: turn, span: quote },
                      ]).valid.length
                        ? 'supported'
                        : 'rejected',
                    )
                  }
                >
                  Check quote
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    changeQuote(
                      'The patient agreed to start treatment immediately.',
                    )
                  }
                >
                  Try unsupported claim
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setTurn(1);
                    changeQuote(
                      'Would Thursday afternoon work for a follow-up?',
                    );
                  }}
                >
                  <RotateCcw />
                  Reset example
                </Button>
              </div>
              <output
                aria-live="polite"
                className="block min-h-20 rounded-xl border p-4"
              >
                {result === 'supported' ? (
                  <>
                    <p className="font-semibold text-emerald-800">
                      Quote found in the cited turn
                    </p>
                    <p className="mt-1 text-sm">
                      This verifies textual support, not the clinical
                      correctness of advice or the validity of a score.
                    </p>
                  </>
                ) : result === 'rejected' ? (
                  <>
                    <p className="font-semibold text-amber-900">
                      Evidence rejected
                    </p>
                    <p className="mt-1 text-sm">
                      Use at least eight characters from the cited turn. The
                      application cannot retain a numeric score without
                      validated supporting evidence.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Choose a turn and check the quote to inspect its support.
                  </p>
                )}
              </output>
            </>
          )}
          {step === 2 && (
            <>
              <p className="leading-relaxed text-muted-foreground">
                Coaching can retrieve passages from the reviewer’s approved
                training library. The application checks cited source IDs and
                quoted text before saving generated advice.
              </p>
              <div className="rounded-xl border-l-4 border-l-[#688e86] bg-[#f4f7f5] p-6">
                <p className="text-xs font-semibold uppercase tracking-widest">
                  Illustrative guidance · not an approved training source
                </p>
                <blockquote className="mt-4 text-lg leading-relaxed">
                  “Agree on a follow-up time and confirm who will make contact.”
                </blockquote>
              </div>
              <h3 className="text-lg font-semibold">
                What a reviewer would ask
              </h3>
              <p className="leading-relaxed">
                The conversation includes a time. Does it also make clear who
                will initiate contact? A reviewer can examine that gap before
                deciding on coaching.
              </p>
              <p className="rounded-xl border p-4 text-sm leading-relaxed text-muted-foreground">
                This is an authored illustration, not generated advice or a
                retrieval result. In the product, matching a citation proves the
                text exists; human review is still needed to assess whether the
                advice follows from it.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <p className="leading-relaxed text-muted-foreground">
                The reviewer decides what feedback is useful. Corrections append
                to history, and practice work stays tied to a human-reviewed
                baseline.
              </p>
              <ol className="space-y-5">
                {[
                  [
                    'Review the advice',
                    'Approve, reject or correct generated coaching. Keep the decision traceable.',
                  ],
                  [
                    'Assign focused practice',
                    'Choose a behavior to rehearse and connect the assignment to the reviewed conversation.',
                  ],
                  [
                    'Compare a follow-up',
                    'Use a different role-play and the same rubric version. Missing evidence remains unscored.',
                  ],
                ].map(([title, detail]) => (
                  <li key={title} className="flex gap-3 rounded-xl border p-5">
                    <CheckCircle2
                      className="mt-1 size-5 shrink-0 text-[#688e86]"
                      aria-hidden="true"
                    />
                    <div>
                      <h3 className="font-semibold">{title}</h3>
                      <p className="mt-2 leading-relaxed text-muted-foreground">
                        {detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="text-sm leading-relaxed text-muted-foreground">
                These are implemented workspace capabilities, not actions
                executed in this tour. No practice task or review has been
                saved.
              </p>
            </>
          )}
          <div className="flex items-center justify-between border-t pt-5">
            <Button
              variant="ghost"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft />
              Previous
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)}>
                Next step
                <ArrowRight />
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setStep(0);
                  setTurn(1);
                  changeQuote('Would Thursday afternoon work for a follow-up?');
                }}
              >
                Restart tour
                <RotateCcw />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
function Transcript({ selected }: { selected?: number }) {
  return (
    <ol aria-label="Synthetic transcript" className="space-y-3">
      {turns.map((item, index) => (
        <li
          key={index}
          className={`rounded-xl border p-4 ${selected === index ? 'border-[#688e86] bg-[#edf3f1]' : 'bg-[#fafbfa]'}`}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide">
            Turn {index + 1} · {item.role}
            {selected === index ? ' · Cited turn' : ''}
          </p>
          <p className="leading-relaxed">{item.text}</p>
        </li>
      ))}
    </ol>
  );
}
