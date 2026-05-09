# Route stub registry

Tracks routes that are referenced or expected but not yet implemented. Each
entry says when the route is scheduled to be built and what currently
happens if a user lands on it.

The registry is referenced from
[v4.1-implementation-plan.md](v4.1-implementation-plan.md) Phase 0
"Definition of done".

| Path | Current state | Linked from | Scheduled |
|------|---------------|-------------|-----------|
| `/kasse` | 404 (page.tsx not present) | Nothing in code links here. Cart's `CheckoutButton` calls `initiateCheckoutAction` directly and redirects to Vipps. | Phase 3 — when Vipps capture flow is rebuilt with stock reservations. The dedicated checkout page is built then with address form, delivery/pickup choice per sub-order, and a clear "Til Vipps" button. |
| `/admin/brukere` | 404 (page.tsx not present) | Not linked from admin sidebar or anywhere else. Spec §16 says SUPER_ADMIN should manage users here. | Phase 6 (Hardening) — bundles with admin MFA enforcement, since user management and MFA setup share the same admin surface. |
| `/admin/fakturaer` | 404 (page.tsx not present) | Not linked from admin sidebar. Spec §16 lists it for STORE_MANAGER. | Phase 7 (Returns + SAF-T) — invoice list belongs with the SAF-T export and refund flows that reference invoices. |
| `/info/deletyper` | 404 (page.tsx not present) | Will be linked from the new admin product form's ⓘ icon, the storefront filter's ⓘ icon, and the storefront footer once Phase 0.7 ships. | Phase 0.7 — Condition / provenance / fitment filters. |
| `/sok` | Search route is currently routed via `/produkter?q=` | Phase 0.5 search bar will submit here. | Phase 0.5 — Storefront chrome redesign. |
| `/info/personvern` | 404 | Will be linked from the GDPR cookie banner and footer. | Phase 9 — GDPR. |
| `/konto/mine-maskiner` | 404 | Will be linked from header dropdown and from filter chips. | Phase 0.7 — Condition / provenance / fitment filters. |
| `/konto/retur` | 404 | Will be a customer-facing return-request page. | Phase 7 — Returns + Quotes + A11y + SAF-T. |

## Rules for this file

- An entry is added the moment a route is referenced from a UI element that
  does not yet have a page.
- An entry is removed the moment the route's `page.tsx` exists and renders
  successfully.
- The "Scheduled" column always names a phase from
  [v4.1-implementation-plan.md](v4.1-implementation-plan.md). If a route
  has no scheduled phase, it does not belong here — it belongs in the
  dead-link audit (`docs/audit/`) for D0.3 fixes.
