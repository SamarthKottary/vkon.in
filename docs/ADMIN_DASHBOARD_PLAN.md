# Admin Dashboard Implementation Plan

This plan details the creation of a new "Dashboard" tab in the admin portal to provide a high-level, beautiful summary of the store's data, optimized for an "office live" display.

## Proposed Changes

### `src/app/admin/layout.tsx`
- Add a new "Dashboard" link to the admin navigation menu, placing it first in the list (before Products).

### `src/app/admin/page.tsx`
- Update the post-login redirect from `/admin/products` to `/admin/dashboard`.

### `src/app/admin/dashboard/page.tsx` (NEW)
- Create a new page component for the dashboard.
- **Data Fetching:** Fetch key metrics using existing database functions:
  - Orders: Total orders, pending orders, recent revenue (`orderSummary`, `listOrdersPage`).
  - Products: Total active products, out-of-stock products (`listProductsAdmin`).
  - Enquiries: Unread/recent enquiries (`listEnquiriesPage`).
  - Customers/Subscribers counts.
- **UI Design:** Build a highly visual, premium interface using the project's design system:
  - Use responsive metric cards for high-level numbers (Revenue, Pending Orders, New Enquiries).
  - Use smooth gradients, glassmorphism effects, or brand colors to make it look stunning.
  - Show a "Recent Activity" feed (latest orders/enquiries).
- **"Office Live" Mode:**
  - Implement a client-side auto-refresh mechanism (e.g., polling every 30-60 seconds using `useRouter().refresh()` or a dedicated client component) so the dashboard stays up-to-date automatically if left open on an office screen.

## Design Vision

- **Premium Aesthetics**: It uses a sleek theme with subtle glassmorphism and smooth gradients, ensuring it looks stunning on a large office display.
- **Top Metrics**: Instantly readable numbers for `Total Revenue`, `Pending Orders`, and `New Enquiries`.
- **Live Activity Feed**: A real-time section showing recent orders, new enquiries, and updates.
- **Charts & Trends**: Visual representation of sales or order trends over time.

## Status
- `src/components/admin/AutoRefresh.tsx` has been partially created.
- The UI and data fetching logic still needs to be built.
