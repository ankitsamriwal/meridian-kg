---
doc_id: doc_workshop
title: Workshop notes - B2B gifting pipeline process mapping
source_system: SharePoint / Meetings
author: Priya Nair
date: 2026-08-12
permission_roles: [exec, team, client]
kind: meeting_notes
---
# Workshop - B2B gifting pipeline (12 Aug 2026)

Attendees: Priya Nair, Ankit Samriwal, Daniel Osei (Alpha Data); Sara Ahmed, Layla Haddad (Falcon).

- Mapped the current gifting sales flow: enquiry via account managers, quote in Excel, approval by the Falcon commercial director, fulfilment tracked in the e-commerce admin panel.
- Decision: D365 Sales will own lead-to-quote; fulfilment stays in the e-commerce platform and syncs back through the falcon-crm-sync middleware.
- Falcon asked for quote approval workflows matching their delegation-of-authority matrix - Daniel to configure using standard D365 approval frameworks.
- Layla confirmed Customer Insights segments must be available inside D365 Sales as marketing lists.
- Risk raised by Sara: Falcon's IT change freeze runs 15 Nov - 15 Dec; go-live on 30 Nov needs a change-freeze exemption. Mohammed Al Farsi to sponsor the exemption request.
