---
doc_id: doc_fsd
title: Functional Specification - falcon-crm-sync middleware
source_system: SharePoint / Design
author: Daniel Osei
date: 2026-08-22
permission_roles: [exec, team]
kind: fsd
---
# FSD - falcon-crm-sync middleware (v1.0)

Author: Daniel Osei (Solution Architect). Reviewed by Ankit S. and Rishabh Kapoor.

## Components
- sync-engine: CDC-based extraction from D365 Sales, orchestrates push to e-commerce. Designed by Daniel Osei.
- mapping: entity maps incl. the loyalty model drafted by Ankit Samriwal from Layla Haddad's tier rules.
- d365-client: D365 Web API wrapper with OAuth client-credentials against Azure AD. Written by Daniel Osei.
- webhooks: platform event receiver with retries and dead-letter queue, added by Ankit S. after the sandbox incident where burst product updates dropped silently.
- dedupe pass: built by Rishabh Kapoor (PR #14, reviewed by Daniel Osei), runs before Customer Insights unification.

## Non-functional
- Latency: under 5 minutes end-to-end (FR-205).
- Resilience: dead-letter queue with 24h replay; idempotent upserts keyed on source record ID.
- Security: no PII at rest beyond the 24h Data Lake staging window.
