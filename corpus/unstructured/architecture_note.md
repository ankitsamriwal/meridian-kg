---
doc_id: doc_architecture
title: Architecture note - falcon-crm-sync middleware
source_system: Git repository / docs
author: Daniel Osei
date: 2026-08-27
permission_roles: [exec, team]
kind: architecture
---
# falcon-crm-sync - architecture note

The middleware sits between Dynamics 365 Sales, Customer Insights, and Falcon's e-commerce platform.

- sync-engine orchestrates CDC-based extraction from D365 and pushes to the e-commerce platform. Target latency under 5 minutes (FR-205).
- mapping holds the entity maps, including the loyalty model drafted by Ankit S.
- d365-client wraps the D365 Web API with OAuth (client credentials against Azure AD).
- webhooks receives platform events; retries with a dead-letter queue were added after the first sandbox incident where a burst of product updates silently dropped.
- The dedupe pass (PR #14) runs in the sync-engine ahead of Customer Insights unification, per the 21 Aug thread.

Non-goals: the middleware does not own fulfilment logic and does not store customer PII at rest beyond a 24-hour staging window in Azure Data Lake.
