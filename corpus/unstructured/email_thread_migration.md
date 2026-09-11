---
doc_id: doc_email_migration
title: Email thread - Legacy data quality concerns
source_system: Email (Exchange export)
author: Rishabh Kapoor
date: 2026-08-21
permission_roles: [exec, team]
kind: email
---
# Thread: Legacy data quality concerns

**From: Rishabh Kapoor, 21 Aug 2026 09:14**
Team - first full profiling pass on the legacy CRM extract is done. 212,480 contacts. 18.7% are probable duplicates across sources, worse than the eyeball estimate. 4,100 records have no email and no phone. I recommend a dedupe pass in the sync engine before unification rules go into Customer Insights, otherwise we cement the duplicates into the golden record.

**From: Daniel Osei, 21 Aug 2026 10:02**
Agree. Dedupe belongs in the middleware, not in CI config. Rishabh, build it into falcon-crm-sync and I will review.

**From: Ankit S., 21 Aug 2026 11:37**
Worth telling Sara before the next status call - the 18.7% number will land better from us than from her own team finding it later. I will fold it into the week-6 status update.

**From: Priya Nair, 21 Aug 2026 12:05**
Yes, and log it in the risk register with Rishabh as owner. Please keep the tone factual - Falcon are sensitive about the state of the legacy data.
