# ADR-008 — 22-class ontology + 12-scenario A–L taxonomy

- **Status**: Accepted
- **Date**: 2026-05-05 (foundation), 2026-05-09 (locked)
- **Related spec**: `docs/superpowers/specs/2026-05-05-ontology-mfg-hitech-design.md`

## Context

The PoC needed a taxonomy that's:

- Wide enough to demo realistic Hi-Tech manufacturing complexity
  (BOM hierarchy + supply chain + standards + quality + operations / ESG)
- Narrow enough to load into Neptune in seconds and to teach in a 30-min
  demo
- Stable enough that the 12 scenario implementations can target it
  without churn

The mirror sister project (`ontology-for-retail`) had already settled
on a 22-class scheme in retail terms; we adapted to Hi-Tech MFG.

## Decision

**22 ontology classes** (Pydantic models in `data/schemas.py`) grouped
into 5 conceptual buckets, surfaced in the Web sidebar's "객체 탐색
(Knowledge Graph)" section:

| Group | Classes |
|-------|---------|
| BOM 계층 (4) | Product · Module · Component · RawMaterial |
| Supply (5) | Manufacturer · Supplier · SubSupplier · CustomerAccount · Plant |
| Geo / Lane (2) | Region · TradeLane |
| 표준·규제 (4) | Standard · Certification · Regulation · Substance |
| 품질 (3) | QualityIncident · EightDReport · RootCause |
| 운영 / ESG (4) | Telemetry · MaintenanceEvent · ESGIndicator · CarbonScope |

**12 scenarios** (A–L) span the workflow from search to operations:

| Letter | Title | Primary persona |
|--------|-------|-----------------|
| A | 의미 검색 | Buyer |
| B | 대화형 에이전트 | Engineer / Buyer |
| C | 인사이트 | Buyer / SCM |
| D | 스펙 매치 | Engineer |
| E | 규제 검증 | Quality |
| F | 대체 부품 | Buyer / Engineer |
| G | 단가/재고 비교 | Buyer |
| H | 글로벌 SCM lane | SCM |
| I | 협력사 RFM | Buyer |
| J | 8D / RCA | Quality |
| K | ESG / CBAM | SCM / Plant |
| L | PdM / IoT | Plant |

**5 personas** surface different framings on the same scenarios via
`useActivePersona()`: Buyer, Engineer, Quality, SCM, Plant.

## Alternatives Considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| ISO 22745 / OAGIS-aligned ontology | Industry standard | Too granular for PoC (1000+ classes); demo overhead | Wrong scale |
| GS1 Hi-Tech Manufacturing Map | Recognized retail-MFG bridge | Doesn't cover ESG / IoT cleanly | Coverage gap |
| Free-form per-scenario schema | Maximum flexibility | No coherent graph; loses the "ontology" demo value | Defeats purpose |
| Same 22 classes as retail with field renames only | Drop-in | Hi-Tech has different relationships (BOM is recursive, suppliers tier, lane regulations) — content drift | Naming alone insufficient |

## Consequences

- **Positive**:
  - 22 classes load into Neptune in seconds; 12 scenarios fit on one
    sidebar without scrolling
  - A–L letter codes give shorthand for cross-references across docs,
    UI badges, eval rows, log lines
  - Persona × scenario matrix gives 60 framings without 60 codepaths
- **Trade-offs**:
  - Real Hi-Tech ontology has more classes (Wafer, Mask, Process Step,
    Yield, Bin …); future expansion needs a clear additive policy
  - Persona logic lives in front-end context, not backend — so persona
    swap doesn't change API responses (intentional, but limits future
    server-side personalization)
- **Follow-ups**:
  - When scaling to real production data, expand classes additively
    (don't renumber A–L codes since they're cross-referenced everywhere)
  - Persona-scoped data filters (server side) when moving from synthetic
    to production data

## References

- Code: `data/schemas.py` (Pydantic), `api/routers/objects.py`
  (`_ALLOWED_LABELS`)
- Web: `web/app/page.tsx` (home grid), `web/components/Sidebar.tsx`
  (sidebar IA)
- Spec: `docs/superpowers/specs/2026-05-05-ontology-mfg-hitech-design.md` § 8
