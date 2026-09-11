# Meridian - Enterprise Knowledge Graph POC

A working end-to-end POC of the six-stage enterprise knowledge graph architecture, built over a fictional (but realistic) Dynamics 365 client engagement corpus: Alpha Data delivering Project Falcon CRM for Falcon Retail Group.

Live: https://meridian-kg.vercel.app

## The six stages, as built

1. **Enterprise sources** - `corpus/`: structured exports (D365 CE entities, project roster CSV, git repo graph) + unstructured documents (proposal, meeting notes, email threads, requirements, risk register, architecture note), each with author/date/permission metadata.
2. **Ingestion layer** - front-matter metadata preserved on every document; provenance (doc id, title, excerpt) attached to every edge and chunk.
3. **Extraction** - structured sources are mapped **directly** into entities/edges (deterministic, no LLM). Only genuinely unstructured documents go through LLM extraction (Gemini), with per-edge confidence scores.
4. **Entity resolution** - three mechanisms, all logged: name/alias normalization, a person-initials rule ("Ankit S." = "Ankit Samriwal"), and embedding similarity (>= 0.90) across remaining clusters. Edges are repointed to canonical nodes, never dropped.
5. **Graph storage** - pipeline output is a versioned store (`data/graph.json`: entities, edges, chunks with 768-dim embeddings, documents, resolution log) bundled with the deploy. This is the POC-shaped stand-in for Neo4j / Cosmos Gremlin / Supabase pgvector: the query layer talks to it through one module (`api/_lib/graphstore.js`), so swapping in a real graph DB means reimplementing that module's load + traversal, not the app.
6. **App layer** - GraphRAG chat (`api/chat.js`): question embedding -> vector search over chunks -> seed entities -> 2-hop graph traversal -> LLM synthesis grounded only in retrieved context, returning the answer **with its traversal path and source documents**. Plus a 3D explorer (`3d-force-graph`) and a pipeline dashboard.

## Design principles honored

- **Structured sources mapped directly, never re-extracted with an LLM.** Only docs/emails/notes go through extraction.
- **Entity resolution is not optional.** It is a first-class pipeline stage with a visible merge log (Pipeline tab).
- **Provenance and permissions travel with the data.** Every entity, edge, and chunk carries `permission_roles` from its source system; the role switcher (Exec sponsor / Delivery team / Client) enforces them **at query time** - vector search, traversal, and synthesis all run on the role-filtered subgraph.
- **Hybrid retrieval, not vector search alone.** Vectors find related chunks; the graph traversal answers how things connect and via which path; the LLM only synthesizes from what retrieval returned.

## Running the pipeline

The pipeline runs as server-side stages (Vercel function `api/admin/run-pipeline.js`, guarded by `EXTRACTION_SECRET`):

```
GET  /api/admin/run-pipeline?stage=structured&secret=...
POST /api/admin/run-pipeline?stage=extract&doc=<file>&secret=...   body: {knownEntities: [...]}
POST /api/admin/run-pipeline?stage=assemble&secret=...             body: {structured, extracted[]}
```

The assembled store is committed as `data/graph.json` (baked into the deploy). To re-run: run the stages in order, save the assemble output, push.

## Environment

- `GEMINI_API_KEY` - LLM extraction, embeddings, chat synthesis (Gemini 2.5 Flash + text-embedding-004)
- `EXTRACTION_SECRET` - guards the pipeline endpoint

POC scope notes: fictional corpus only; the embedded store serves one engagement-sized graph (a few hundred nodes) where in-memory cosine + BFS is instant. At real enterprise scale the store module swaps to Neo4j/Cosmos/Supabase pgvector without touching retrieval or UI.
