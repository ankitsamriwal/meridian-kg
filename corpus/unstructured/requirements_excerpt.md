---
doc_id: doc_requirements
title: Requirements excerpt - Customer unification and loyalty
source_system: SharePoint / Requirements
author: Ankit Samriwal
date: 2026-08-19
permission_roles: [exec, team, client]
kind: requirements
---
# Requirements excerpt - FR-201 to FR-207

- FR-201: The system shall unify contact records from the legacy CRM, e-commerce platform, and loyalty spreadsheets into a single customer profile in Customer Insights.
- FR-202: Unification shall preserve loyalty tier history (Sand, Pearl, Falcon Gold) with effective dates.
- FR-203: Duplicate detection shall run before unification; probable duplicates shall be queued for steward review, not auto-merged.
- FR-204: Marketing lists in D365 Sales shall be driven by Customer Insights segments.
- FR-205: The e-commerce platform shall receive near-real-time updates via the falcon-crm-sync middleware (target latency under 5 minutes).
- FR-206: Quote approvals shall follow Falcon's delegation-of-authority matrix.
- FR-207: Executive dashboards in Power BI shall refresh daily and include pipeline, migration progress, and loyalty KPIs.

Traceability: FR-201..203 map to Rishabh Kapoor's migration workstream; FR-204 and FR-206 to Daniel Osei's configuration workstream; FR-205 to the falcon-crm-sync repo; FR-207 to the Power BI pack.
