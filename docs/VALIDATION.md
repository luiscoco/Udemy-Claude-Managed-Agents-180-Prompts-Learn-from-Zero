# Student package validation

The course source was packaged on 22 November 2026. Student package checks are documented here; original instructor recordings and historical receipts are not shipped in this repository.

## Repository audit

Run `npm run verify:catalog` from the repository root. It checks all 180 numbered applications for their README, package file, lockfile, source, frontend, tests and start command. It also checks local Markdown file links and scans packaged text for common private-key and Anthropic-key patterns without printing any suspected value.

This is a packaging check. It does not run the applications, prove absence of every possible secret or validate a live provider integration.

## Runtime checks

Use [SETUP.md](SETUP.md) to install one lesson, check TypeScript and run its browser exercise. Browser tests require Chromium or a configured alternative executable.

The prepared package passed these checks on 22 November 2026:

- Catalog coverage for all 180 applications and local Markdown file links.
- Clean locked dependency installations through the student launcher for Lessons 1 and 9.
- TypeScript checks for Lesson 1 and all 172 standalone applications in Lessons 9–180.
- All five Lesson 1 core tests, using local fixtures.
- Browser walkthroughs for Lessons 9, 26 and 180, including code preservation and coloured syntax tokens in light/dark themes. Lesson 26 exercised an actual local Playwright screenshot.

Browser checks used installed Chrome through the documented configuration. macOS, Linux and the downloaded-Chromium fallback were not exercised in this preparation run. Optional live provider integrations were not tested. GitHub Actions has been configured for catalog checks and representative TypeScript checks; a hosted workflow result requires publication.
