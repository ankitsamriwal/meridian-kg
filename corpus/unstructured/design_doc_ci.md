---
doc_id: doc_design
title: Design document - Customer Insights unification and dedupe
source_system: SharePoint / Design
author: Rishabh Kapoor
date: 2026-08-29
permission_roles: [exec, team]
kind: design
---
# Design: unification and dedupe pipeline

Author: Rishabh Kapoor. Reviewed by Daniel Osei.

## Dedupe design
Three-pass matching on the 212,480 legacy contacts: exact key match (email/phone), fuzzy name+address, then householding collapse. Probable duplicates (18.7%) queue for steward review per FR-203 - Sara Ahmed's team acts as stewards.

## Unification design
Customer Insights unification rules: legacy CRM wins on identity fields, e-commerce wins on consent flags, loyalty spreadsheets win on tier history. Conflict matrix agreed with Layla Haddad on 26 Aug.

## Data quality gates
Gate 1 before unification: under 2% unmatched keys. Gate 2 before go-live: golden record sample audit of 500 profiles by Falcon marketing.

## Open item
Falcon Gold tier has 1,300 members with no matching e-commerce account - Rishabh to propose a match rule by 12 Sep.
