# Proofline document control MVP

A browser-based prototype for centralising audit and inspection evidence from multiple operating sites.

## Run it

1. Open PowerShell in this folder.
2. Run `node server.mjs`.
3. Open <http://localhost:4173>.

The prototype stores changes in the current browser using `localStorage`. It does not upload files to a server yet. This keeps the MVP safe for demonstrations, but it is not production document storage.

## Included

- Headquarters compliance dashboard
- Site performance overview
- Searchable document register
- Upload intake form
- Approve and request-correction actions
- Missing-document visibility
- Persistent browser data
- Exportable audit trail
- Responsive mobile layout

## Production roadmap

Add authenticated users and roles, encrypted object storage, a database, server-side audit logs, retention rules, backups, OCR, notifications, and deployment before using the system for real records.
