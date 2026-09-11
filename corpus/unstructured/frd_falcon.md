---
doc_id: doc_frd
title: Functional Requirements Document - D365 Sales and Customer Insights
source_system: SharePoint / Requirements
author: Priya Nair
date: 2026-08-05
permission_roles: [exec, team, client]
kind: frd
---
# FRD - Project Falcon CRM (v0.9)

Author: Priya Nair. Contributors: Ankit Samriwal (loyalty model section), Layla Haddad (loyalty business rules).

## Module: Sales pipeline (D365 Sales)
- Lead-to-order process for B2B gifting with quote approval workflows per Falcon's delegation-of-authority matrix.
- Account hierarchy mirrors Falcon's 84 stores grouped into 6 regions.
- SLA tracking on quote turnaround (BO-2 target: under 4 hours).

## Module: Customer unification (Customer Insights)
- Unify 212,480 contacts from legacy CRM, e-commerce, loyalty spreadsheets.
- Dedupe before unification; probable duplicates go to a steward review queue (no auto-merge).
- Loyalty tiers Sand / Pearl / Falcon Gold with effective-dated history.

## Module: Integration
- Near-real-time sync to e-commerce via falcon-crm-sync middleware, target latency under 5 minutes.
- 24-hour PII staging window in Azure Data Lake, then purge.

## Traceability
Every FR maps to the BRD objectives BO-1..BO-4; see the requirements excerpt for FR-201..207 detail.
