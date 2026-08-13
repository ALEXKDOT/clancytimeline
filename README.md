# Clancy Interactive Clinical Timeline

First-draft interactive visualization built from the existing 97-source corpus, with an evidence cutoff of August 11, 2026 after Trial Day 11.

## Open the finished local page

Open [Clancy_Interactive_Clinical_Timeline.html](standalone-dist/Clancy_Interactive_Clinical_Timeline.html) in a modern browser. It is a single self-contained file: no network connection or local server is required.

## Included interactions

- Clinical-course and post-offense views, with January 24 integrated into the main chronology
- An explicit timeline break compressing the clinically quiet interval between birth and late-August symptom onset
- Search and evidence-category filters
- Compact proportional chronology with automatic collision-managed card lanes
- Horizontal timeline zoom, one-click fit reset, and guided navigation
- Clickable event cards with details, evidentiary posture, certainty, source IDs, and interpretive cautions
- Separate cards for clinical encounters, patient communications, and important prescription/fill dates
- Thirteen medication lanes distinguishing prescribed/filled, reportedly taken, planned/uncertain, inpatient/recorded, and detected states
- Optional medication-context band above the main event timeline, with brand names, doses, and the same evidence-status styling
- Guided “Walk the story” mode
- Keyboard navigation and responsive layout

## Evidence boundary

This is an educational evidence visualization, not an independent diagnosis, malpractice opinion, criminal-responsibility opinion, or verdict recommendation. Prescription, fill, reported ingestion, documented administration, toxicologic detection, and causal effect remain separate propositions.

## Editable version

The application source is in `app/page.tsx` and `app/globals.css`. After editing, regenerate the standalone file with the `build:standalone` package script.
