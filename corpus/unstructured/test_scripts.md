---
doc_id: doc_testscripts
title: Automated test scripts - falcon-crm-sync
source_system: Git repository / tests
author: Meera Krishnan
date: 2026-09-09
permission_roles: [exec, team]
kind: test_scripts
---
# Automated test scripts - repo /tests

Maintained by Meera Krishnan; Rishabh Kapoor contributes sync-engine fixtures.

- sync.latency.spec.ts - asserts p95 latency under 5 minutes against a replayed production event log (TC-103).
- dedupe.queue.spec.ts - asserts probable duplicates reach the steward queue and are never auto-merged (TC-102).
- webhooks.replay.spec.ts - kills the webhook consumer mid-burst, asserts dead-letter replay with idempotency (TC-104).
- mapping.loyalty.spec.ts - validates the loyalty entity map against Layla's tier fixtures (TC-106).

Current state: 31 automated checks green on CI, 4 skipped pending the Customer Insights sandbox refresh.
