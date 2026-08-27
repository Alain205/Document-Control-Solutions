# Proofline document control MVP

A browser-based prototype for centralising audit and inspection evidence from multiple operating sites.

## Run it

1. Open PowerShell in this folder.
2. Run `node server.mjs`.
3. Open <http://localhost:4173>.

The application stores its records in `data/db.json` and uploaded files in `data/uploads/`. Both are created automatically and excluded from Git because they contain operational data.

Demo accounts (all use password `demo2026`):

- Administrator: `christiane.matabaro@sonas.cd`
- Manager (Nord-Kivu): `manager@sonas.cd`
- Employee (Sud-Kivu): `employee@sonas.cd`
- Sender (Kinshasa): `sender@sonas.cd`

## Included

- Headquarters compliance dashboard
- Site performance overview
- Searchable document register
- Upload intake form
- Approve and request-correction actions
- Missing-document visibility
- Server-side persistent data and file uploads
- Password-based authentication and expiring sessions
- Profile and password settings
- Authenticated file downloads
- Exportable audit trail
- Responsive mobile layout

## Production roadmap

Before production use, add HTTPS, a production database, encrypted object storage, multi-user role administration, backups, retention rules, malware scanning, OCR, notifications, and deployment monitoring.
