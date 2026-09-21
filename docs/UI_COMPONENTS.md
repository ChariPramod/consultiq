# Workspace interface and recovery increment

## Stack and scope

The owner chose to preserve Sites/Vinext for this iteration. The application uses Next.js-compatible routing on Vinext, TypeScript, Tailwind CSS v4, shadcn/Base UI primitives and Lucide icons. This is not a migration to the official Next.js runtime.

Motion is now a declared dependency. Analysis activity uses short entry transitions and respects reduced-motion preferences. A single Magic UI Shine Border accent is adapted from the official registry, restricted to one animation cycle and disabled by the reduced-motion media variant. It is decorative, hidden from assistive technology and does not intercept pointer events. No Aceternity dependency was added; the selected Magic UI component is sufficient for this surface.

Component sources: [Motion installation](https://motion.dev/docs/react-installation), [reduced motion](https://motion.dev/docs/react-use-reduced-motion), and [Magic UI Shine Border](https://magicui.design/docs/components/shine-border). The original MIT notice is retained in `components/magicui/LICENSE`.

## Analysis activity

Open **Analysis activity** in the workspace navigation. Search by consultation title, coordinator, run ID, operation or error code. Filter by in-progress, completed or failed status. Counts and searches cover only the latest loaded jobs, currently at most 20; they are not all-time analytics.

Each run shows available duration and output-token measurements. Missing measurements remain unknown. Open the consultation to inspect saved results, use manual review or start a new analysis intentionally. Failed runs also offer approved-library navigation. No action automatically repeats a paid model request, changes providers or substitutes fabricated coaching.

Refresh loads the current workspace. A failed refresh retains the last loaded records with an error notice. An authentication failure during workspace refresh clears that workspace data. This does not implement universal session-expiry clearing in every existing detail form. No transcript or job history is cached in browser local storage by this feature. Consultation titles unavailable in the loaded list are explicitly labeled; opening the record still uses the authenticated detail endpoint.

## Client fallbacks

API requests carry a 70-second abort signal. A network failure on a write tells the user that the change may have been saved and to refresh/check before submitting again. Successful responses containing unreadable JSON or null are rejected rather than treated as a result. Existing structured API errors, including authentication errors, retain their status/code.

This is not offline editing or durable retry. Losing a response does not prove the server failed; checking saved results is the recovery path. Server-side provider limits, workspace isolation, validated evidence and atomic persistence remain unchanged.

## Validation and limitations

Tests cover lost writes without retries, malformed successful responses, authentication errors, valid responses and activity filtering. Local workspace HTTP rendering was checked. Browser interaction, screen-reader, cross-device and visual regression checks were not performed in this increment. No hosted deployment or live provider call was made.

The detailed work and owner responsibilities remain in [Project handoff](PROJECT_HANDOFF.md). An official Next.js runtime migration and deployment-adapter decision remain separate future work if requested.
