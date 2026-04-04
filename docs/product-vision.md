# OpenMusic — Product Vision

> Updated 04/04/2026.

## Positioning

OpenMusic is the music platform for music enthusiasts.

It is not trying to win by having the biggest licensed catalog. The point is to give users access, control, and creative freedom that mainstream streaming platforms do not offer well.

OpenMusic is for people who:

- care about alternate versions, remixes, edits, and hard-to-find uploads
- want to bring their existing music taste with them instead of rebuilding from scratch
- want to shape songs and playlists instead of only consuming them passively

## Core Problems

Mainstream platforms solve convenience, but they leave major gaps for serious music fans.

### 1. Catalog limits

Spotify, Apple Music, and other mainstream services have huge libraries, but they do not reliably surface:

- fan-made remixes
- unofficial edits
- niche live versions
- mashups
- alternate uploads that disappear from licensed catalogs

OpenMusic solves this by letting users import music from links across platforms rather than depending on one centralized catalog.

### 2. Painful switching costs

Users already have years of listening history and playlist curation elsewhere. Rebuilding that library manually is too tedious.

OpenMusic should reduce that friction through:

- playlist import from existing platforms
- remembered library context
- migration tools that make switching feel incremental instead of disruptive

### 3. Lack of creative control

Mainstream platforms are built for listening, not creative curation.

OpenMusic should let users become their own DJ by giving them tools to:

- clip tracks
- adjust song length
- change playback speed
- control volume per track or segment
- add transitions between songs
- customize playlist flow and presentation

## Product Pillars

### 1. Universal music intake

OpenMusic should accept the links and playlists users already have from places like:

- Spotify
- Apple Music
- YouTube Music
- YouTube
- TikTok
- SoundCloud
- other compatible sources over time

The product thesis is not "we host the world’s largest official catalog." It is "we let enthusiasts build the library they actually want."

### 2. Creative playlisting

A playlist should not be a static ordered list of untouched songs.

In OpenMusic, a playlist should become a programmable listening experience where users can:

- trim and clip songs
- control pacing and transitions
- tune playback behavior
- eventually add richer presentation and performance-like behavior

### 3. Seamless migration

Users should be able to bring their taste graph into OpenMusic with minimal effort.

That includes:

- playlist import
- account memory of prior sources
- preserving recognizable track identity even when the playable source changes underneath

### 4. AI-assisted music tools

AI should make editing and curation easier, not more complicated.

Promising directions include:

- smart clip suggestions
- popular-part detection
- loudness / energy change detection
- suggested transitions between songs
- user-friendly editing workflows that do not require technical audio knowledge

### 5. Music-centered modes beyond playback

OpenMusic should eventually expand beyond standard player behavior.

Examples already in scope conceptually:

- karaoke mode with lyrics
- video-backed playback when relevant
- listening modes optimized for discovery, editing, or performance

## Current Product vs Target Product

### Current product

Today, OpenMusic is best described as:

- a local-first multi-source archive
- a clip-aware playlist player
- a foundation for later editing and migration features

It already supports:

- multi-platform track ingestion by URL
- Spotify track, album, and playlist ingestion through matching
- clip creation
- playlist construction from tracks or clips
- persistent playback and ordering

### Target product

The target product is broader:

- a platform for music enthusiasts
- a migration path away from mainstream services
- a flexible editing and curation environment
- a home for alternate versions and enthusiast workflows

## Roadmap Framing

### Phase 1: Stronger collector workflow

Focus:

- stabilize multi-source imports
- improve track matching quality
- support playlist import from mainstream platforms
- make the library feel durable and trustworthy

### Phase 2: Real editing workflow

Focus:

- speed control
- volume control
- transitions
- richer clip editing
- better player tooling for enthusiasts

### Phase 3: Smart assistance

Focus:

- AI clip suggestions
- automated highlight detection
- playlist flow suggestions
- friendly editing copilots

### Phase 4: Expanded listening modes

Focus:

- karaoke
- lyric sync
- music video modes
- more expressive playlist presentation

## Architectural Implications

The current codebase is a strong foundation, but the new vision will require architectural expansion.

### Areas the current app already supports well

- source intake via URL
- normalized track records
- clips as first-class concepts
- playlists that can mix full tracks and clips
- a simple local-first backend/frontend contract

### Areas that will need substantial work

- playlist import pipelines
- richer track metadata and provenance
- editing state beyond simple clip boundaries
- advanced playback engine features
- user/library identity if the app evolves beyond single-user local usage
- legal and product-policy boundaries around sources, uploads, and playback modes

## Risks

### 1. Legal and platform constraints

The more OpenMusic leans into cross-platform intake and unofficial versions, the more important it becomes to define clear product boundaries and risk tolerance.

### 2. Matching quality

If a user imports from one platform and playback uses another source under the hood, the match quality has to feel trustworthy.

### 3. Scope creep

The product can easily become too broad. The pillars should be used to prioritize features that directly support the enthusiast workflow.

## Near-Term Product Principle

For now, every feature should answer at least one of these questions:

- Does it make it easier to bring music into OpenMusic?
- Does it make it easier to shape music or playlists creatively?
- Does it make OpenMusic feel like a better home for serious music fans than mainstream platforms?
