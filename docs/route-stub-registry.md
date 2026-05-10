# Route stub registry

Tracks routes that are referenced from the UI but don't have a `page.tsx`
yet. Each row says where the route is linked from and which phase will
build it.

The registry is referenced from
[v4.1-implementation-plan.md](v4.1-implementation-plan.md) Phase 0
"Definition of done", and is checked on every commit by
`npm run audit:links`.

**As of end-of-session 10 May 2026 (Phases 0–5 + 4.5 live):**
`audit:links` reports **2 broken references** (the rows marked
"actively broken" below). The other rows are forward-looking — the
phase that ships them will introduce the UI reference and the page
together.

| Path | Currently broken? | Linked from / will be linked from | Scheduled |
|------|-------------------|-------------------------------------|-----------|
| `/kampanjer` | **yes (audit:links)** | `CategoryDrawer.tsx` primary tier + `PrimaryNav` "KAMPANJER". `/admin/kampanjer` exists; the public landing does not. | Content backlog — public campaigns landing |
| `/info/finn-lager` | **yes (audit:links)** | `PrimaryNav.tsx` "VELG LAGER" + InfoCardsRow "VÅRE LAGRE" + drawer secondary tier | Content backlog — copy + store list |
| `/kasse` | not currently referenced (CheckoutButton calls `initiateCheckoutAction` directly) | Phase 7+ may add a dedicated address/delivery form page | Phase 7 — Returns + Quotes (for richer checkout UX with quotes/B2B address picker) |
| `/admin/brukere` | no UI reference yet | SUPER_ADMIN user management per spec §16 | Phase 6 (Hardening) — bundles with admin MFA enforcement |
| `/admin/fakturaer` | no UI reference yet | Spec §16 admin invoice list | Phase 7 — Returns + SAF-T |
| `/info/personvern` | no UI reference yet | Will be linked from GDPR cookie banner + footer | Phase 9 — GDPR |
| `/konto/retur` | no UI reference yet | Customer-facing return-request flow | Phase 7 — Returns + Quotes + A11y + SAF-T |
| `/info/bedriftskunde` | drawer "Våre tjenester" pane | Marketing copy | Phase 8 — B2B richness, or earlier as content lands |
| `/info/tilbud` | drawer pane + InfoCardsRow "BE OM TILBUD" | RFQ flow proper page | Phase 7 — Quote / RFQ flow |
| `/info/levering-og-retur` | drawer "Våre tjenester" pane | — | Phase 7 — Returns + Quotes |
| `/info/reklamasjon` | drawer "Våre tjenester" pane | — | Phase 7 — Returns + Quotes |
| `/info/kundeservice` | drawer secondary tier + PrimaryNav last item | Copy only | Content backlog |
| `/info/om-oss` | drawer secondary tier | Copy only | Content backlog |
| `/info/kunnskapsbase` | drawer secondary tier | Copy only | Content backlog |
| `/info/tips-og-rad` | drawer secondary tier | Copy only | Content backlog |
| `/info/nyheter` | drawer secondary tier | Copy only | Content backlog |
| `/info/kontakt` | drawer secondary tier + InfoCardsRow KONTAKT OSS | Copy only | Content backlog |
| `/maskiner` | PrimaryNav MASKINER + drawer pane VIS ALT | Make/Model directory landing page | Originally Phase 0.7; deferred — the filter bar shipped without a top-level Make/Model directory. Build when there is appetite |
| `/maskiner/[makeSlug]` | drawer machines pane links here per make | — | Same as `/maskiner` above |
| `/varemerker` | PrimaryNav VAREMERKER | List of brands with product counts | Content backlog |
| `/outlet` | PrimaryNav OUTLET | Filter products by promotion or discontinued | Content backlog |

## Routes built in v4.1 (removed from this registry)

For audit purposes, the following stubs have been **resolved** and are
no longer in the table:

- `/sok` — built in Phase 0.5 (storefront search results page sharing the Phase 0.7 filter bar)
- `/info/deletyper` — built in Phase 0.7 (Originaldeler / OEM / Aftermarket help page)
- `/konto/mine-maskiner` — built in Phase 0.7 (saved-machine list with add/edit/delete)
- `/admin/backup/setup` — built in Phase 4.5 (in-browser keypair generation)

## Rules for this file

- An entry is added the moment a route is referenced from a UI element
  that does not yet have a page.
- An entry is removed the moment the route's `page.tsx` exists and
  renders successfully.
- The "Scheduled" column always names a phase from
  [v4.1-implementation-plan.md](v4.1-implementation-plan.md) or
  "Content backlog" for routes that need only static copy.
- The "Currently broken?" column is the source of truth for whether
  `audit:links` will fail on this route. Forward-looking entries (no
  current UI reference) live here so the planned scope is documented in
  one place; they don't appear in `audit:links` output.
