# Vodafone Service Desk — UI Revamp Design Spec

You are redesigning **one page** of an existing React (Vite + Tailwind v4) enterprise
app — "Vodafone Service Desk" — as part of a full, page-by-page UI revamp. The visual
language is ALREADY established by two reference pages. **Read these first and match them exactly:**

- `frontend/src/pages/dashboard.jsx`  (cards, KPIs, hero, donut chart, panels)
- `frontend/src/pages/tickets.jsx`    (tables, toolbars, filters, segmented tabs, pagination, bulk bar)

Also skim the primitives you'll use in `frontend/src/components/ui/`:
`PageHeader.jsx, Card.jsx, Button.jsx, Badge.jsx, Icon.jsx, Input.jsx, Modal.jsx,
Tabs.jsx, EmptyState.jsx, Skeleton.jsx, chart.jsx, useConfirm.jsx` and design tokens in
`frontend/src/styles/main.css`.

## HARD RULES (do not violate)

1. **Preserve ALL functionality.** This is a UI / UX / layout / visual redesign ONLY.
   Keep every piece of state, effect, event handler, API call, prop, route, and data
   flow. Do not change behavior or data contracts. Do not rename the default export.
   Do not remove features (filters, toggles, bulk actions, modals, tabs, etc.).
2. **Edit ONLY the file(s) you are assigned.** Do NOT touch anything under
   `components/ui/`, `styles/`, `contexts/`, `services/`, `App.jsx`, `AppLayout.jsx`,
   or the login page. If a shared primitive seems missing, inline a local solution in
   your page rather than editing shared files.
3. **Do NOT start dev servers, run builds, or use browser tools.** Just edit code and
   ensure valid JSX: balanced tags, every imported identifier exists, no undefined refs.
4. **Theme-safe (dark AND light).** Use CSS variables for all surfaces/text/borders:
   `var(--bg-base|--bg-elevated|--bg-surface|--bg-surface-hover|--fg-primary|
   --fg-secondary|--fg-muted|--fg-subtle|--border-default|--border-hover|--border-strong|
   --accent|--accent-hover|--success|--warning|--error|--info)`. For status/semantic
   colors use Tailwind `*-500` tints: `text-emerald-500`, `bg-emerald-500/10`,
   `border-emerald-500/15`. NEVER hardcode near-black/near-white text colors.
5. **No dynamic Tailwind class names.** Tailwind v4 JIT cannot see `bg-${x}-500`. When
   mapping data → color, use a lookup object of FULL static class strings, or inline `style`.

## DESIGN LANGUAGE (mirror the reference pages)

- **Page root:** `<div className="space-y-5">`. Cards enter with `animate-fade-up` and a
  small staggered inline `style={{ animationDelay: "120ms" }}`.
- **Header:** always
  `import PageHeader from "../components/ui/PageHeader"` →
  `<PageHeader icon="<iconName>" title="..." subtitle="..." actions={<>…</>} />`.
  Primary CTA: `<Button icon={<Icon name="plus" size={16}/>}>New X</Button>`.
  Small bordered icon-buttons for refresh/filters/view toggles (see tickets.jsx `ControlButton`).
- **Panels/cards:** `rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)]
  shadow-[var(--shadow-card)]`. Header row inside a panel:
  `flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]` with a tinted
  icon tile `h-8 w-8 rounded-lg bg-<c>-500/10 text-<c>-500 flex items-center justify-center`
  and `<h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">`.
  Hover-elevate interactive cards: `transition-all duration-200 hover:-translate-y-0.5
  hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]`.
- **Tables:** wrap in the elevated rounded-2xl card + `overflow-hidden`; inner `overflow-x-auto`.
  thead row `bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]`,
  `<th className="px-4 py-3 text-left text-label">`. tbody `divide-y divide-[var(--border-default)]`,
  rows `hover:bg-[var(--bg-surface)] transition-colors cursor-pointer group`.
  IDs/codes: `font-mono text-[var(--accent)]`. Pagination footer like tickets.jsx.
- **KPI / stat cards:** mirror dashboard KPIs (label via `.text-label`, tinted icon tile,
  big value `text-[32px] font-semibold tracking-tight tabular-nums`, hover lift,
  `animate-kpi-rise` staggered). Or `import { StatCard } from "../components/ui/Card"`.
- **Badges:** `import Badge, { StatusBadge } from "../components/ui/Badge"`.
  `<Badge tone="emerald|blue|amber|rose|red|slate|violet|indigo|cyan|orange|accent" size="sm" dot>`.
- **Buttons:** `import Button, { IconButton } from "../components/ui/Button"` — variants
  primary/secondary/ghost/danger/success/outline/glass; sizes xs/sm/md/lg; props icon, loading.
- **Forms:** `import Input, { Textarea, Select, SearchableSelect, SearchInput } from "../components/ui/Input"`
  (label/error/helperText/icon/size). Group fields into sections with a small `.text-label`
  heading + `grid grid-cols-1 sm:grid-cols-2 gap-4`.
- **Modals:** `import Modal, { ConfirmModal } from "../components/ui/Modal"`
  (open,onClose,title,subtitle,children,actions,size sm/md/lg/xl/full). For destructive
  confirms prefer `import useConfirm from "../components/ui/useConfirm"` →
  `const { confirm, confirmDialog } = useConfirm()` and render `{confirmDialog}`.
- **Tabs:** `import Tabs from "../components/ui/Tabs"` →
  `<Tabs variant="underline|pills" tabs={[{value,label,icon,count}]} value={..} onChange={..} />`.
- **Loading:** `import Skeleton, { SkeletonTable, SkeletonKpis, SkeletonCard } from
  "../components/ui/Skeleton"`. Match the content shape. NEVER a lone centered spinner for
  a full-page load.
- **Empty / no-results / error:** `import EmptyState from "../components/ui/EmptyState"`
  → `<EmptyState icon=".." title=".." description=".." action={<Button…/>} />`.
- **Charts (only if the page already has analytics data):** recharts +
  `import { CHART_SERIES, CHART_COLORS, useChartTheme, ChartTooltip, ChartGradient } from
  "../components/ui/chart"`. Put `isAnimationActive={false}` on Pie/donut to avoid mount
  flicker. Never fabricate data the code doesn't already fetch.
- **Icons:** `import Icon from "../components/ui/Icon"`; use names that exist in Icon.jsx
  (unknown names fall back to a generic glyph — pick a real one).
- **Motion:** subtle, professional. Entrance fades + small stagger; hover lifts; color
  transitions. Don't overdo it. (Global `prefers-reduced-motion` handling already exists.)
- **Responsive:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-N`; tables `overflow-x-auto`;
  PageHeader already stacks. Mentally verify 375 / 768 / 1440 px.

## OUTPUT

After editing, reply with a SHORT summary: what you visually restructured, explicit
confirmation that all logic / handlers / API calls / features are preserved, and any risks
or follow-ups. Do NOT paste the whole file back.
