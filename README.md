# ConsultIQ dashboard

A consultation review workspace built from the ConsultIQ project scope. The original planning and owner-authored documents remain in the parent directory.

## Run locally

```sh
npm ci
npm run dev
```

Open the local address printed by the development server.

## Included

- Overview with summaries calculated from the selected demo consultations.
- Searchable consultation list with coordinator and outcome filters, plus CSV export.
- Call reports with illustrative rubric assessments and linked transcript excerpts.
- Coordinator comparisons and descriptive outcome patterns.
- Pasted transcript and plain-text file import, including speaker-label validation.

## Data and integration status

The bundled consultations, scores, and acceptance estimates are authored demo examples. No model has been trained or evaluated. Source excerpts illustrate evidence navigation; they do not validate the correctness of a rubric score. Outcome comparisons are descriptive and do not establish causation or statistical significance.

Imports exist only in the active page session and disappear on refresh. They remain unscored. CSV export contains consultation metadata, not transcript content. Speaker swapping changes the current review display only and does not recalculate demo scores.

Audio transcription, persistent storage, rubric judging, validated judge evidence, and calibrated prediction are not connected. The final rubric anchors and judge prompts remain owner-authored. The Python pipeline described in the parent documents has not been implemented by this dashboard slice.

The frontend uses React and Vinext for the web experience while leaving the planned Python analysis pipeline as a future integration boundary. This starts the web application requested in the current task rather than implementing the previously proposed Streamlit interface.

## Validation

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tests cover transcript parsing and rejection, summary denominators, unscored imports, composed filters, CSV escaping, and demo fixture integrity. Lint excludes the unchanged scaffold component catalog and its mobile hook; TypeScript still checks them. No browser interaction or screenshot testing was requested.

An optional feature-detected WebMCP tool opens a demo consultation through the same review state as the interface. The preview browser did not expose a supported WebMCP context, so its runtime contract has not been verified.

## Dependencies

The Sites scaffold supplies React and Vinext for rendering, Base UI and Shadcn for accessible controls, Lucide for icons, Tailwind and CSS utilities for styling, and the Sites and Cloudflare tooling for preview and hosting. The scaffold dependency catalog and lockfile are retained. The application adds no packages beyond the scaffold. Tests use the built-in Node test runner.

## Hosting

The hosted application is a static export. Server rendering and analysis services are not deployed. The scaffold currently reports dependency audit advisories, including server and development tooling; review and update these dependencies before introducing a production backend.
