# Vibe-coded UI pitfalls

Date: 2026-11-14

A model predicts the most likely next token, so an underspecified UI request returns the statistical average of the web it was trained on. Anthropic calls this distributional convergence. Each choice is defensible alone; together they show that nobody decided anything. Banning one default only moves the model to the next most probable one.

## Typography

- **Inter (or Roboto, Open Sans, Lato, system stack) on every word, including the centred hero headline.**
  - Why: the commonest UI font in training data and the default in design tools.
  - Instead: one or two families chosen for a stated reason. Weights 200 vs 800 and sizes 3x apart, not 400 vs 600.
- **The "escape" fonts: Space Grotesk, Geist, Instrument Serif, Fraunces, JetBrains Mono for anything technical, one serif-italic accent word in the headline.**
  - Why: told to avoid Inter, the model picks the runner-up.
  - Instead: take the typeface from a reference or the brand, not a ban list.
- **Tracked all-caps eyebrow labels over every heading, monospace micro-labels, "01 / 02 / 03" markers, "//" separators.**
  - Why: chrome copied from developer-tool marketing sites.
  - Instead: label only where it informs. Number only real sequences.

## Colour

- **Indigo or violet primary (`#6366f1`, Tailwind `indigo-500`), purple-to-blue gradients.**
  - Why: Tailwind UI demos used `bg-indigo-500` and thousands of tutorials copied it.
  - Instead: 4 to 6 named colours, each with a role, derived from the product.
- **Second-wave defaults: cream (`#faf8f5`) with a serif and terracotta or forest green; near-black with one acid-green accent.**
  - Why: "less AI" prompts land on the next cluster.
  - Instead: check your direction against these too.

## Layout and structure

- **Stock order: centred hero, pill badge above the H1, two buttons, logo row, three identical icon-top cards, stat banner, numbered steps, CTA. App screens get a hero too.**
  - Why: the most repeated page skeleton on the web.
  - Instead: lead with a real screenshot or real data. App screens open on the table, form or editor.
- **Spacing drift (`gap-4` here, `gap-8` there), icons off-centre from their text, clipped text on mobile, z-index clashes.**
  - Why: each component gets the nearest utility class in isolation.
  - Instead: one spacing scale, named z-index tokens, a check by eye at 375px and 900px.

## Components and decoration

- **A card around everything, cards inside cards, all `rounded-2xl` with one soft shadow.**
  - Why: wrapping is the model's only grouping tool.
  - Instead: group with whitespace and type. Cards only for independently actionable items.
- **Coloured stripe on the left or top edge of rounded cards, a different colour per card.**
  - Why: components are styled singly, with no page-wide colour budget.
  - Instead: delete it. One dominant colour, one accent, one neutral.
- **Pulsing "Live", "New", "Verified" pills and status dots that map to no state.**
  - Why: borrowed from admin dashboards where they meant something.
  - Instead: every indicator maps to real state or goes.
- **Emoji as icons in nav, headings and greetings; thin 16px Lucide icons on every card.**
  - Why: visual rhythm without assets.
  - Instead: one icon set, only where it aids scanning.
- **Gradient text (`bg-clip-text`), gradient buttons, `backdrop-blur` panels, neon glow on permanent dark mode.**
  - Why: launch pages taught that glow means "premium".
  - Instead: solid colour, at most one reasoned gradient, depth from surface contrast.
- **Unmodified shadcn/ui: `baseColor: "slate"`, `rounded-lg border bg-card shadow-sm`, one radius everywhere, pill buttons.**
  - Why: the stock tokens were never edited.
  - Instead: set colour, radius-by-role and elevation tokens before building.

## Copy and text

- **Hype taglines ("Build faster. Ship smarter.", "Supercharge", "Transform your X") beside invented stats, testimonials and logos.**
  - Why: the median SaaS page has slots for them.
  - Instead: say who it is for and what it does. Delete any number you cannot source.
- **Subtitle under every heading, helper text under every field, tooltips repeating the label, unrequested counters.**
  - Why: adding costs a model nothing.
  - Instead: delete first. Restore only what hurts comprehension when missing.
- **Prompt and implementation leakage: "Built with Hugo", "3 campuses, one app", "Your files never leave your browser", internal state names.**
  - Why: chat context is the nearest material.
  - Instead: move every string into one file and edit it by hand.

## Motion

- **Fade-and-slide-up on every section, `scale: 1.05` hover on every card, bounce easing, count-up stats, scrolljacking.**
  - Why: animation libraries appear in most examples.
  - Instead: motion that answers a user action. 200 to 300ms, ease-out, transform and opacity only, `prefers-reduced-motion` honoured.

## Interaction and accessibility theatre

- **Default state only: no hover, `:focus-visible`, active, disabled, loading, empty or error states; forms without validation.**
  - Why: models learn from static snapshots, not flows.
  - Instead: list the states per component and build each.
- **ARIA attributes on clickable divs; mid-grey text on dark, glass panels and thin Inter weights that fail contrast.**
  - Why: studies find LLMs manage alt text and basic contrast but get ARIA wrong.
  - Instead: native elements first, a keyboard-only pass, body contrast at 4.5:1 or better.

## Process causes

- **No reference and no written constraints ("make it look modern").**
  - Why: the model fills every gap with the average.
  - Instead: 3 to 5 real products, what works in each, then a written direction.
- **Negative-only prompts ("no purple").**
  - Why: they point attention at the banned thing and trigger the next default.
  - Instead: a positive spec with examples.

## Before you build

1. Name the reference and what you take from it.
2. Write the direction: colour roles, typefaces, radius scale, lead content.
3. Check it against the purple and cream-serif defaults.
4. Edit theme tokens before any component.
5. Justify every card, badge, dot, icon and gradient, or cut it.
6. Write copy last. Cut text that restates the visible.
7. No invented numbers, logos or testimonials.
8. Build every state of each interactive element.
9. Motion only in response to an action.
10. Keyboard pass, contrast check, 375px check.

## Sources

Read in full:

- Anthropic, "Improving frontend design through Skills": https://claude.com/resources/articles/improving-frontend-design-through-skills
- Anthropic cookbook, "Prompting for frontend aesthetics": https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics
- Adrian Krebs, "Scoring Show HN submissions for AI design patterns" (2026-04-20): https://www.adriankrebs.ch/blog/design-slop/
- GIGAZINE summary of the Krebs audit, with per-pattern percentages: http://gigazine.net/gsc_news/en/20260423-design-slop
- Pranav Desai, "10 tells of a slop UI" (2026-09-27): https://godobject.dev/blog/10-tells-of-slop
- Hacker News thread on the above: https://news.ycombinator.com/item?id=49867038
- The Fountain Institute, "7 Signs a UI Has Been Vibe Coded": https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui
- "You don't have to make AI slop" (2026-04-30): https://blode.co/writing/you-dont-have-to-make-ai-slop
- Capital & Compute, "How to Fix AI Slop in Web Design, Tell by Tell" (2026-09-25): https://capitalandcompute.net/blog/fix-ai-slop-design/
- "unslop-ui" playbook (tell frequencies from Reddit threads): https://claudecodehq.com/playbooks/unslop-ui
- 925 Studios, "AI Slop Fonts and Gradients": https://www.925studios.co/blog/ai-slop-design-tells
- "Why Your AI Keeps Building the Same Purple Gradient Website" (2025-10-26): https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website
- Frank Stallone, "AI is very good at adding. Design is required to subtract.": https://frankstallone.netlify.app/blog/ai-is-very-good-at-adding-design-is-required-to-subtract
- Noqta, "AI design slop: overused UI patterns" (2026-06-04): https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026
- "Vibe coding problems: 7 visual bugs AI code generators always ship": https://dev.to/oqa/vibe-coding-problems-7-visual-bugs-ai-code-generators-always-ship-37mf
- Suh et al., "Human or LLM? A Comparative Study on Accessible Code Generation Capability" (2025): https://arxiv.org/abs/2503.15885

Found in search, not read (403 on fetch):

- UX Collective, "How to de-slopify your designs": https://uxdesign.cc/how-to-de-slopify-your-designs-4c40c57c1dc9
- UX Collective, "AI design isn't ugly, it's fluent, and that's the problem": https://uxdesign.cc/ai-design-isnt-ugly-it-s-fluent-and-that-s-the-problem-131b2f4eb78c
