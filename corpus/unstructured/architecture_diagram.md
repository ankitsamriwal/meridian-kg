---
doc_id: doc_archdiagram
title: Solution architecture diagram - Project Falcon CRM
source_system: SharePoint / Design
author: Daniel Osei
date: 2026-08-27
permission_roles: [exec, team, client]
kind: diagram
---
# Solution architecture (diagram description)

Author: Daniel Osei. Diagram file: falcon-solution-arch v3 (SharePoint / Design).

[D365 Sales] --OData/Web API--> [falcon-crm-sync middleware] --REST/webhooks--> [Falcon e-commerce platform]
[Legacy CRM SQL backups] --> [Azure Data Lake staging] --> [dedupe pass in sync-engine] --> [Customer Insights unification] --> [golden customer profile]
[Loyalty spreadsheets] --> [Azure Data Lake staging]
[Customer Insights] --segments--> [D365 Sales marketing lists]
[D365 Sales + Customer Insights] --> [Power BI executive dashboards]

Trust boundaries: all PII inside Falcon's Azure tenant; middleware deployed to Alpha Data's managed Azure subscription with Falcon-managed service principals; 24-hour staging purge job.

Diagram history: v1 by Daniel Osei 10 Aug; v2 added the dedupe pass 24 Aug; v3 added the dead-letter queue after the sandbox webhook incident (27 Aug).
