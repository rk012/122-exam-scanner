# `src/lib/sheets`

The app's interfacing layer with the check-in spreadsheet.

## Layers

| File | Role |
|---|---|
| `api.ts` | `SheetsApi` interface plus a thin `fetch`-based Google Sheets v4 client (`values.batchGet`, `values.update`). Callers pass index-based `SheetRange`s (rows 1-based, columns 0-based); A1 strings are built only here, with tab names always quoted. Takes a bearer-token getter so writes happen as the proctoring TA. |
| `layout.ts` | Pure parser for header rows 1–6: discovers room blocks and reports layout problems. |
| `checkinSheet.ts` | `openCheckinSheet(...)`: allowlist check, `reloadLayout`, `findExam`, `setGotPaper`. |
| `testing/` | All sheets test code: `sheets.test.ts`, run against an in-memory `SheetsApi` seeded from `testSheet.csv` (a TEMPLATE-shaped tab with a few made-up students). Not imported by app code. |

## Layout assumptions (a copy of the TEMPLATE tab)

- Rows 1–6 are headers; students start at row 7.
- Rooms are laid out horizontally as blocks. Row 6 holds each block's column
  headers: `First name, Last name, Andrew id, Section, Exam #, Seat #, Got paper, …, Notes`.
  The Makeup and accommodations blocks (row-2 room name `Makeup` / `Accom`)
  are ignored by name: the app never reads or writes them. Any other header
  run in row 6 must be a complete check-in block, or it is a layout problem.
- Row 2 of a block: room name at the first column, room code two columns
  right, timeslot three columns right. Row 3 has `capacity: N`; row 4 has
  `Sections: A, B, C` (or `#N/A`) in the block's `Notes` column.
- A room is a (room name, timeslot) pair, e.g. `DH 2210, 7:00 - 7:35pm`.
  There is no separate notion of time: the same physical room at two times is
  two rooms, and a repeated pair is a layout problem.
- Blocks are **discovered by header text**, never by a fixed column stride.
  Any drift (renamed header, missing room code, duplicate room code) is
  returned as a layout problem, and lookups refuse to run against a
  mismatched layout. That is what the setup screen's "layout matches" check
  reports.
- Merged cells come back from the API only in their top-left cell; the
  parser does not depend on separator columns being blank.

## Sheets queries

This module only requests strictly needed data ranges, so sensitive regions like
accomodation data shouldn't be requested.

Data requests ask for exactly four columns per block: `Andrew id`,
`Section`, `Exam #`, `Got paper`, as contiguous column ranges (`'Exam 1'!C7:E`
and `'Exam 1'!G7:G` in A1). Header rows 1–6 are read whole, which is safe
because they contain no student data. `testing/sheets.test.ts` checks every range
sent to the API against the CSV's row-6 headers.

## Write rule

`setGotPaper` writes **one cell**: a block's `Got paper` checkbox on one row,
with `valueInputOption=RAW` and a boolean. Before writing it makes one read of
the `Exam #` and `Got paper` header cells plus that row's exam number and
checkbox. It refuses if either header moved (columns inserted or rearranged),
the exam number changed (sheet edited underneath us), or the box is already
TRUE when setting TRUE (double scan).

## Lookup rule

`findExam` is an exact match on the trimmed exam-number text across every
block, returning `found`, `not-found`, or `duplicate`. No fuzzy matching: a
misread digit must surface as a flag, not resolve to a neighbouring row. The
wrong-room / no-Andrew-ID / wrong-section flag rules belong in a layer above
this one.

## Caching and cost per scan

The layout and rows (the four permitted columns only) are cached in memory
per spreadsheet tab and shared by every TA, since all TAs have the same access
to the same sheet. Reads may go through any TA's token; writes always use the
scanning TA's token, so the sheet's edit history names them.

- **Layout:** read once per process. Columns are assumed not to move during
  an exam; `setGotPaper`'s header check is the backstop if they do.
- **Rows:** `findExam` answers from the cache only for a clean hit (one row,
  box unchecked) while the cache is under `ROW_CACHE_TTL_MS` (60 s) old. Any
  error against the cache (not found, duplicate, already checked) refreshes it
  first and answers from the sheet, so students added mid-exam are still found
  and a stale checkbox is never reported. Every `setGotPaper` refusal drops the
  cache.

On the hot path a scan is therefore **1 read + 1 write**: the read and write
in `setGotPaper`. An expired cache or a lookup error costs one more read (two
if this process has never seen the layout). Staleness can make a clean hit's
room/section flags out of date for up to the TTL, or miss a duplicate added in
that window, but it can't misdirect a write, because the write's own read
re-checks every cell it depends on.
