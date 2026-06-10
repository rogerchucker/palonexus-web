# PaloNexus Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Astro starter with a polished PaloNexus landing page for an agentic AI platform company.

**Architecture:** Keep the site static and single-page. Use one Astro component for the landing page content and page-local styles, with the existing layout responsible for document metadata and global body defaults.

**Tech Stack:** Astro 6, static CSS, Node verification script.

---

### Task 1: Homepage Verification

**Files:**
- Create: `scripts/check-homepage.mjs`
- Modify: `package.json`

- [ ] Add a Node script that reads `dist/index.html` and checks for required PaloNexus content.
- [ ] Add `test:homepage` script that runs `astro build` and then the Node check.
- [ ] Run `npm run test:homepage` and verify it fails before the landing page is implemented.

### Task 2: Layout Metadata

**Files:**
- Modify: `src/layouts/Layout.astro`

- [ ] Replace the starter title with PaloNexus metadata.
- [ ] Add description metadata for the agentic AI platform positioning.
- [ ] Keep body and root sizing minimal and framework-appropriate.

### Task 3: Landing Page Component

**Files:**
- Modify: `src/components/Welcome.astro`
- Modify: `src/pages/index.astro`

- [ ] Replace Astro starter content with the PaloNexus homepage sections.
- [ ] Keep the component static, accessible, and responsive.
- [ ] Remove unused starter asset imports from the homepage component.
- [ ] Run `npm run test:homepage` and verify it passes.

### Task 4: Final Verification

**Files:**
- Inspect all modified files.

- [ ] Run `npm run build`.
- [ ] Review `git diff --stat` and `git diff --check`.
- [ ] Start the Astro dev server and provide the local URL.
