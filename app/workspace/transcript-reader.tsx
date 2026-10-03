'use client';
import { useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import type { Turn } from '@/lib/product';
import { matchingTurns, transcriptMatches } from '@/lib/transcript-search';
function MarkedText({ text, query }: { text: string; query: string }) {
  const matches = transcriptMatches(text, query);
  const spans = matches.map(({ start, end }, index) => {
    const before = text.slice(matches[index - 1]?.end ?? 0, start);
    return (
      <span key={start}>
        {before}
        <mark className="rounded bg-amber-200 px-0.5 text-slate-950">
          {text.slice(start, end)}
        </mark>
      </span>
    );
  });
  return (
    <>
      {spans}
      {text.slice(matches.at(-1)?.end ?? 0)}
    </>
  );
}
export function TranscriptReader({
  turns,
  citedTurn,
}: {
  turns: Turn[];
  citedTurn: number | null;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<'all' | Turn['role']>('all');
  const [position, setPosition] = useState(-1);
  const [message, setMessage] = useState('');
  const matches = useMemo(
    () => matchingTurns(turns, query, role),
    [turns, query, role],
  );
  const active = position >= 0 ? matches[position] : undefined;
  function jump(direction: number) {
    if (!matches.length) return;
    const next =
      position < 0
        ? direction > 0
          ? 0
          : matches.length - 1
        : (position + direction + matches.length) % matches.length;
    setPosition(next);
    const element = document.getElementById(`source-turn-${matches[next]}`);
    element?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'center',
    });
    element?.focus({ preventScroll: true });
  }
  return (
    <section className="product-panel transcript-record">
      <div className="product-panel-heading">
        <div>
          <h2>Original transcript</h2>
          <p>Speaker labels and timestamps are preserved from your import.</p>
        </div>
        <span className="product-status">Read only</span>
      </div>
      <form
        className="space-y-3 border-b p-5"
        onSubmit={(event) => {
          event.preventDefault();
          jump(1);
        }}
      >
        <Label htmlFor={id}>Find a phrase in this conversation</Label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
            <Input
              id={id}
              className="pl-9"
              value={query}
              maxLength={200}
              placeholder="Search the original words…"
              onChange={(e) => {
                setQuery(e.target.value);
                setPosition(-1);
              }}
            />
          </div>
          <NativeSelect
            aria-label="Search speaker"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as typeof role);
              setPosition(-1);
            }}
          >
            <NativeSelectOption value="all">Both speakers</NativeSelectOption>
            <NativeSelectOption value="Coordinator">
              Coordinator
            </NativeSelectOption>
            <NativeSelectOption value="Patient">Patient</NativeSelectOption>
          </NativeSelect>
          <Button
            type="button"
            variant="outline"
            disabled={!matches.length}
            aria-label="Previous matching turn"
            onClick={() => jump(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="submit"
            variant="outline"
            disabled={!matches.length}
            aria-label="Next matching turn"
          >
            <ArrowDown />
          </Button>
          {!!query && (
            <Button
              type="button"
              variant="ghost"
              aria-label="Clear transcript search"
              onClick={() => {
                setQuery('');
                setPosition(-1);
              }}
            >
              <X />
            </Button>
          )}
        </div>
        <output className="block text-xs text-slate-500" aria-live="polite">
          {query.trim()
            ? `${matches.length} matching turns${position >= 0 ? ` · ${position + 1} of ${matches.length}` : ''}. All original turns remain visible.`
            : 'Search matches literal words, not meanings. Press Enter to jump to the next matching turn.'}
        </output>
      </form>
      {message && (
        <output className="block px-5 pt-4 text-sm text-slate-600">
          {message}
        </output>
      )}
      <div className="source-turns">
        {turns.map((turn, index) => (
          <article
            tabIndex={-1}
            id={`source-turn-${index}`}
            key={index}
            className={`source-turn ${citedTurn === index || active === index ? 'highlighted' : ''}`}
          >
            <span
              className={
                turn.role === 'Coordinator'
                  ? 'speaker-avatar'
                  : 'speaker-avatar patient'
              }
            >
              {turn.role === 'Coordinator' ? 'TC' : 'P'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="source-turn-meta flex-wrap">
                <strong>{turn.role}</strong>
                <span>
                  Turn {index + 1}
                  {turn.time ? ` · ${turn.time}` : ''}
                </span>
                {citedTurn === index && (
                  <span className="product-status approved">
                    Cited evidence
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Copy turn ${index + 1}`}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `Turn ${index + 1} — ${turn.role}${turn.time ? ` [${turn.time}]` : ''}:\n${turn.text}`,
                      );
                      setMessage(`Copied turn ${index + 1}.`);
                    } catch {
                      setMessage(
                        'Clipboard access was blocked. Select the original text to copy it manually.',
                      );
                    }
                  }}
                >
                  <Copy />
                </Button>
              </div>
              <p>
                <MarkedText
                  text={turn.text}
                  query={role === 'all' || role === turn.role ? query : ''}
                />
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
