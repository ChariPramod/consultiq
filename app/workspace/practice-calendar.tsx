'use client';
import { useId, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { practiceCalendar } from '@/lib/calendar';

export function PracticeCalendar({ assignmentId }: { assignmentId: string }) {
  const id = useId();
  const [date, setDate] = useState('');
  const [message, setMessage] = useState('');
  function download() {
    try {
      const content = practiceCalendar({
        assignmentId,
        date,
        origin: window.location.origin,
      });
      const url = URL.createObjectURL(
        new Blob([content], { type: 'text/calendar;charset=utf-8' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'consultiq-practice.ics';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        'Calendar file prepared. Import it into your calendar; no automatic sync is enabled.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Calendar file could not be prepared.',
      );
    }
  }
  return (
    <div className="mt-4 border-t pt-4">
      <Label htmlFor={id}>Practice reminder date</Label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          id={id}
          type="date"
          min="2000-01-01"
          max="2099-12-31"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setMessage('');
          }}
          className="w-auto"
        />
        <Button variant="outline" size="sm" disabled={!date} onClick={download}>
          <CalendarPlus />
          Download calendar reminder
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Import the .ics file into Google Calendar, Outlook, or Apple Calendar.
        No transcript or coaching notes are included. Choose the workspace after
        signing in.
      </p>
      {message && <output className="mt-2 block text-xs">{message}</output>}
    </div>
  );
}
