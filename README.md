# Agricultural Input Subsidy Distribution Register

A pure HTML/CSS/JavaScript register — no build step, no backend process.

**Live demo:** https://agriculture-subsity-distribution-re.vercel.app/

## Run it

Just open `index.html` directly in a browser — double-click it. The dataset loads from `data.js` as a plain script, not a `fetch` request, so there's no local-server requirement and no CORS restriction to work around.

(`data.json` is also included alongside it as the plain, documented version of the same 40 records — useful for reading the data on its own — but the page itself loads `data.js`.)

## Files

- `index.html` — page structure (masthead, summary strip, search/filter toolbar, table, new/edit entry modal)
- `style.css` — visual design
- `app.js` — the "server": field validation, derived-figure calculations, and the create/update/list functions the UI calls. This is the one place any rule or number is computed.
- `render.js` — the UI: renders whatever `app.js` returns, wires up search/filter/form events, and shows loading/empty/error states.
- `data.js` — the same 40 starting records as a JavaScript file, so the browser can load it directly with a `<script>` tag (works with a plain double-click, no server needed).
- `data.json` — the same dataset again, in plain JSON, for reading/reference and as the documented Task 1 deliverable.

## Fields

| Field | Meaning |
|---|---|
| `record_id` | Unique ID for this entitlement line, format `REG-2026-####` |
| `farmer_id` | Unique ID for the farmer, format `FARM-####` |
| `farmer_name` | Farmer's name |
| `village` | Village the entitlement was issued for |
| `input_type` | The seed or fertiliser variety |
| `entitlement_qty` | Kilograms the farmer is entitled to this season |
| `issued_qty` | Kilograms actually handed over so far (can be less than entitlement for a partial issue) |
| `issue_date` | Date of the (most recent) issue, `YYYY-MM-DD` |
| `balance` | `entitlement_qty − issued_qty`, always recalculated, never hand-entered |

## How the derived figures work

All computed in `app.js`, never in the browser's render step:

- **Balance** = entitlement − issued, recomputed on every read.
- **Status** — `fully_issued` (balance ≤ 0), `partially_issued` (some but not all issued), `not_collected` (nothing issued yet), or `unrecorded` (issued quantity was never logged).
- **Days waiting** — days between the issue date and a fixed register date (26 Jul 2026), shown only while the entitlement is not fully issued.
- **Register totals** (top strip) — sums of entitlement/issued/balance and status counts across the whole filtered-out register, not just the visible page.

## The three deliberately awkward records

- `REG-2026-0040` — `issued_qty` and `issue_date` are both missing, to test how the screen handles a value it can't calculate.
- `REG-2026-0038` / `REG-2026-0039` — two entries for "Srinivas Reddy" in the same village with different farmer IDs, to test that search and duplicate-checking key off `farmer_id`, not the name.
- `REG-2026-0999` — an unrelated placeholder row, to test that the table and totals don't break on data that doesn't fit the pattern.

## Demo video

[Watch the demo](https://youtu.be/7LeXvm_b5cI)

## Persistence

New entries and edits made in the browser are kept in `localStorage`, layered on top of `data.json`. Refreshing the page keeps them. **Reset to sample data** in the header clears that layer and returns to the original 40 records.

## What's unfinished

- Duplicate-issue prevention is enforced by `record_id` uniqueness plus the `issued_qty ≤ entitlement_qty` rule; it does not yet stop a second *record* being created for the same farmer + input type in the same season (only the API/DB layer of a real backend could enforce that with a proper constraint).
- Delete/void of a record is not implemented — only create and edit.
