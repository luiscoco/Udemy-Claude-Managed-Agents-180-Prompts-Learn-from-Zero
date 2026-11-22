# Checked classroom artifact fixtures

These four prebuilt files use the same approved inventory facts as the interactive engine: 12 × USD 25, 30 × USD 2 and 8 × USD 10, totaling USD 440 across 50 units.

The lessons download these checked fixtures. They do not call a hosted skill or generate documents through a provider account. This distinction is visible in the application.

- DOCX: package/table facts checked and actual file rendered with `docx-preview` in Chrome. Word and LibreOffice are unavailable, so native pagination and layout fidelity are unverified.
- PPTX: editable native table, package integrity and geometry checked, exported and re-imported with Artifact Tool, all slide previews reviewed. Native PowerPoint execution is unverified.
- XLSX: formulas recalculate in Artifact Tool, including a zero-quantity boundary and restored source inputs. Preview reviewed. Native Excel execution is unverified.
- PDF: extracted source facts checked, one page rendered through Poppler and visually reviewed.

The private authoring and QA scripts are in `../../.build`; regular application users need only `npm ci` and `npm start`. The fixtures ship with the runtime, independently of its disposable `.runtime` state directory.
