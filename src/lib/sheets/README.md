# `src/lib/sheets`

The app's only way of talking to the check-in spreadsheet. Nothing else in the
codebase may call the Sheets API directly.

## Layers

| File | Role |
|---|---|
| `api.ts` | `SheetsApi` interface plus a thin `fetch`-based Google Sheets v4 client (`values.batchGet`, `values.update`). Callers pass index-based `SheetRange`s (rows 1-based, columns 0-based); A1 strings are built only here, with tab names always quoted. Takes a bearer-token getter so writes happen as the proctoring TA. |
| `layout.ts` | Pure parser for header rows 1–6: discovers room blocks and reports layout problems. |
| `checkinSheet.ts` | `openCheckinSheet(...)`: allowlist check, `inspect`, `loadRows`, `findExam`, `setGotPaper`. |
| `testing/` | All sheets test code: `sheets.test.ts`, run against an in-memory `SheetsApi` seeded from `testSheet.csv` (a TEMPLATE-shaped tab with a few made-up students). Not imported by app code. |

## Layout assumptions (a copy of the TEMPLATE tab)

- Rows 1–6 are headers; students start at row 7.
- Rooms are laid out horizontally as blocks. Row 6 holds each block's column
  headers: `First name, Last name, Andrew id, Section, Exam #, Seat #, Got paper, …, Notes`.
  The Makeup block has no `Exam #`/`Got paper` and is ignored. The
  accommodations block (room name `Accom`) is also ignored: the app never
  reads or writes it.
- Row 2 of a block: room name at the first column, room code two columns
  right, timeslot three columns right. Row 3 has `capacity: N`; row 4 has
  `Sections: A, B, C` (or `#N/A`) in the block's `Notes` column.
- A room is a (room name, timeslot) pair, e.g. `DH 2210, 7:00 - 7:35pm`.
  There is no separate notion of time: the same physical room at two times is
  two rooms, and a repeated pair is a layout problem.
- Blocks are **discovered by header text**, never by a fixed column stride.
  Any drift (renamed header, missing room code, duplicate room code) is
  returned as a layout problem, and `loadRows` refuses to run against a
  mismatched layout. That is what the setup screen's "layout matches" check
  reports.
- Merged cells come back from the API only in their top-left cell; the
  parser does not depend on separator columns being blank.

## FERPA column rule

The sheet holds names, seats, notes, and accommodations. This module never
requests them. Data requests ask for exactly four columns per block: `Andrew id`,
`Section`, `Exam #`, `Got paper`, as contiguous column ranges (`'Exam 1'!C7:E`
and `'Exam 1'!G7:G` in A1). Header rows 1–6 are read whole, which is safe
because they contain no student data. `testing/sheets.test.ts` checks every range
sent to the API against the CSV's row-6 headers.

## Write rule

`setGotPaper` writes **one cell**: a block's `Got paper` checkbox on one row,
with `valueInputOption=RAW` and a boolean. Before writing it re-reads that
row's exam number and checkbox and refuses if the exam number changed (sheet
edited underneath us) or the box is already TRUE when setting TRUE (double
scan). Unchecking is allowed, for undo.

## Lookup rule

`findExam` is an exact match on the trimmed exam-number text across every
block, returning `found`, `not-found`, or `duplicate`. No fuzzy matching: a
misread digit must surface as a flag, not resolve to a neighbouring row. The
wrong-room / no-Andrew-ID / wrong-section flag rules belong in a layer above
this one.
