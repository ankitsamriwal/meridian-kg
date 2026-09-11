---
doc_id: doc_testcases
title: Test case catalogue - Project Falcon CRM
source_system: SharePoint / QA
author: Meera Krishnan
date: 2026-09-01
permission_roles: [exec, team]
kind: test_cases
---
# Test cases (extract)

Author: Meera Krishnan (QA Lead, Alpha Data). Execution starts 20 Oct; UAT with Falcon from 10 Nov.

- TC-101 Unification accuracy: 500-profile golden record audit passes at >= 98% (covers FR-201, design gate 2). Owner: Meera Krishnan.
- TC-102 Dedupe steward queue: probable duplicates are queued, none auto-merged (FR-203). Owner: Meera Krishnan.
- TC-103 Sync latency: e-commerce update lands under 5 minutes p95 (FR-205). Owner: Rishabh Kapoor.
- TC-104 Dead-letter replay: failed webhook events replay within 24h without duplicates. Owner: Rishabh Kapoor.
- TC-105 Quote approval matrix: approvals route per delegation-of-authority (FR-206). Owner: Daniel Osei.
- TC-106 Loyalty tier history: effective-dated tiers survive migration (FR-202, Layla Haddad sign-off). Owner: Meera Krishnan.
- TC-107 Power BI dashboard refresh: daily refresh completes by 06:00 GST (FR-207). Owner: Priya Nair.

Coverage note: migration and sync flows are fully covered; approval workflows partially covered (TC-105 covers 3 of 7 authority tiers - gap logged).
