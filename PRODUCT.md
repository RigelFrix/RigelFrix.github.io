# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: recruiters, hiring managers, and technical leads at game studios screening candidates for game developer roles. They open the link from a CV, LinkedIn, or job application, often between other candidates, and decide within a minute or two whether Francis is worth an interview. Their job: confirm he has shipped real games, see the work moving, and find contact details and the resume fast.

## Product Purpose

Personal portfolio of Francis Dave Tomy M. Yambao (handle RigelFrix), a mid-level game developer. It exists to get him interviews for game development roles by showing shipped and playable work with real footage. Success: a studio visitor watches at least one project, opens the resume or contact, and reaches out.

## Positioning

A game developer who has shipped live production web games in a company setting (DiJoker, TypeScript + Phaser, Cocos-linked systems) and also builds and finishes Unity games on his own since 2019, backed by full-stack experience (PHP, MySQL, JavaScript) that lets him work across gameplay, UI state, and backend-connected logic. Game developer first; full-stack is a supporting strength.

## Operating Context

- Visited on desktop (recruiter at work) and mobile (link opened from LinkedIn or messaging).
- Hosted as a static site on GitHub Pages at rigelfrix.github.io; no build step, no server.
- Content is data-driven: projects live in `gallery-data.js` (`window.PROJECT_ALBUMS`), rendered by `script.js`.

## Capabilities and Constraints

- Static HTML, CSS, and vanilla JavaScript only; must keep working on GitHub Pages with relative asset paths.
- Project data model: id, title, kicker, summary, cover, tags, highlights, optional links, media list (image/video). New projects are added by editing `gallery-data.js`.
- Existing functionality to keep: project detail viewer with media gallery (prev/next, thumbnails, keyboard arrows, Escape), profile photo preview, inline resume preview plus PDF link, contact links, reduced-motion support.
- Media is heavy (several 60–85 MB videos); performance is a known open problem. Video re-encoding is undecided and out of scope for the visual redesign.
- Copy may be rewritten and trimmed freely, but every fact must stay true. No invented metrics, clients, players counts, awards, or testimonials.

## Brand Commitments

- Name: Francis Yambao (full: Francis Dave Tomy M. Yambao); handle RigelFrix.
- The user asked for a game-like portfolio with a game UI feel (title screen, level select, HUD-style elements) that still scrolls and clicks like a normal site so recruiters can skim fast. Not a playable world that must be explored to find content.

## Evidence on Hand

- Projects (`gallery-data.js`): DiJoker / company game archive (5 production captures), TroubleFixIt (commissioned research-support Unity build, video + 10 editor shots), Disaster Game (mobile disaster escape Unity game, video + 12 shots), Build2Connect (finished guided PC-building sim for mobile and desktop, cutscenes, voice-led tutorial), 3D Basketball Shooting Game (Unity desktop prototype, with public GitHub repos for build and source), Prototype Lab (independent R&D captures incl. Pixel Pass).
- Inventory Management System (PHP, MySQL, JavaScript) — no media, described only.
- `assets/me.jpg` portrait, `assets/Francis-Yambao-Resume.pdf`, `assets/resume-display.jpg`, `assets/showcase/*-shot.*` stills.
- Contact: francisrigel11@gmail.com, +63 924 042 5935, github.com/RigelFrix, linkedin.com/in/francisyambao11.
- Facts: Unity since 2019; stack Unity, C#, Phaser, TypeScript, JavaScript, Cocos, PHP, SQL/MySQL, Shader Graph; available immediately or on short notice; based in the Philippines (+63), worked in a BGC-based production environment.
- Absent: no testimonials, no player/download numbers, no awards, no company logos cleared for use. Do not fabricate.

## Product Principles

1. Show the games moving before explaining them; footage is the proof.
2. A recruiter must reach any project, the resume, and contact within one or two actions.
3. Game developer first: production games and finished builds lead, full-stack supports.
4. Every claim on the page is something Francis can back up in an interview.

## Accessibility & Inclusion

Keyboard operable throughout, visible focus, respects prefers-reduced-motion, readable contrast; game styling must never hide content from screen readers or skimmers.
