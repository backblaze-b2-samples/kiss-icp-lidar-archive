# Product

## Register

product

## Users

Robotics / autonomous-vehicle engineers and ML teams running continuous LiDAR SLAM
who need a cheap, S3-compatible archive for the pipeline's output — raw scans,
odometry, map snapshots, and trajectories — that they can query offline for analysis,
dataset building, and model retraining. Also the AI coding agents and "vibe coders"
who adapt this sample: it reuses Backblaze's B2 full-stack starter-kit scaffolding, so
the shared scaffolding (UI kit, full-bucket File Explorer, Upload) is kept and the
domain surface (Sessions + KISS-ICP) is the part they restyle for their own workload.

## Product Purpose

A full-stack sample (Next.js 16 + React 19 + Tailwind v4 + shadcn/ui frontend, FastAPI
backend) that ingests LiDAR scan frames, runs the real open-source **KISS-ICP** SLAM
engine on the backend (CPU-only), and streams every artifact into Backblaze B2 over the
S3-compatible API. It shows B2 as the storage layer for a high-rate, data-heavy
robotics pipeline. Success = a builder can clone it, run a synthetic session end-to-end
with only `B2_*` credentials, see the recovered trajectory and the growing B2 archive,
and trust every screen enough to point it at their own scans.

## Maturity and Support Boundary

This is a maintained open-source template/sample, not a complete hosted SaaS product.
It is built with production-minded controls and can be adapted for production use with
caution, but adopters own product-specific validation, security, deployment, and
operations. Repository defects and feature requests go through the public GitHub issue
tracker; B2 account, billing, service, and API questions go through Backblaze Support.
The template/sample itself is not covered by the Backblaze service level agreement,
and no SLA is provided for the repository software.

## Brand Personality

Confident, precise, quietly professional. Voice is direct and free of hype ("Stop
wiring boilerplate and start building"). The interface should feel like a modern
developer tool — considered, calm, trustworthy — not a marketing showpiece. It is a
**neutral foundation** that others rebrand: the design carries craft through restraint,
not through a strong opinionated identity of its own.

## Anti-references

- **Generic AI/SaaS slop.** No gradient text, hero-metric templates, identical
  icon-card grids, tracked uppercase eyebrows, or decorative glassmorphism. These are
  the exact 2026 AI tells this kit exists to help builders avoid.
- **Over-branded / loud.** No heavy brand-color drenching, decorative motion, or flashy
  effects. It is scaffolding to be rebranded, not a hero page.
- **Toy / prototype feel.** No missing states, inconsistent components, or placeholder
  polish. Must read as polished, dependable scaffolding.
- **Enterprise-drab.** No Bootstrap-era gray boxes or dense-but-lifeless admin-panel
  look. Considered, like modern dev tools (Linear, GitHub Primer, Stripe).

## Design Principles

- **Practice what you preach.** The kit itself must model the engineering quality it
  asks agents to produce. Slop here propagates into every project built on it.
- **Neutral foundation, easy to rebrand.** Identity lives in tokens (`globals.css`) and
  one config file. Screens are built from the shared UI kit so a rebrand is a token
  swap, not a rewrite.
- **Earned familiarity over novelty.** Use standard, trusted affordances (top bar +
  side nav, command palette, data tables). The tool disappears into the task.
- **Every state is designed.** Default, hover, focus, active, disabled, loading (skeleton),
  empty (teaches the interface), and error (says what's wrong + offers retry) — never
  half-shipped.
- **Consistency is the feature.** One button vocabulary, one form-control set, one icon
  style across every screen. Divergence is a bug.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥ 4.5:1, large/bold text ≥ 3:1, visible focus
indicators on every interactive element, full keyboard navigation, correct semantic
landmarks and heading order, labelled form controls, and a `prefers-reduced-motion`
alternative for every animation. Full light and dark theme parity.
