# FPF Pattern Journal

This log tracks new or substantially revised behavioral patterns detected in the First Principles Framework specification.

## 2025-11-04 — Run 19061947769

**Commit:** 07271431988f955a38c04ce92309926091b01e1f

### New Patterns Detected

- **C.24 — C.Agent-Tools-CAL (Agentic Tool-Use & Call-Planning)** — Architheory specification (CAL) defining conceptual calculus for agentic selection and sequencing of tool calls under budgets, trust gates, and policy. Instantiates Bitter-Lesson Preference and Scaling-Law Lens for scalable, policy-aware orchestration of tool sequences with explicit explore/exploit governance.  
  Source: Part C — Architheory Specifications, Table of Contents line 145, detailed §19891-20025 · Evidence: `"Defines the conceptual calculus for **agentic selection and sequencing of tool calls** under budgets, trust gates, and policy"` with normative laws ATC-1 through ATC-7 covering Model-the-Call distinction, BLP preference for general methods, budget/harm gates, explore-share discipline, provenance/replay requirements, and assurance-first decisions.

- **C.18.1 — SLL (Scaling-Law Lens)** — Binding pattern providing scale-awareness for search and method selection by declaring scale variables (S), elasticity classes (compute/data/resolution), exponent expectations, knee points, and diminishing returns regimes. Coordinates with NQD-CAL, E/E-LOG, and parity harness (G.9) to enable iso-scale comparison and scale-probe overturns of domain-specific heuristics.  
  Source: Part C Table line 138 · Evidence: `"*Keywords:* scaling law, scale variables (S), compute‑elasticity, data‑elasticity, resolution‑elasticity, exponent class, knee, diminishing returns"` — makes search and selection "scale-savvy" by surfacing elasticities.

- **C.19.1 — BLP (Bitter-Lesson Preference)** — Policy pattern establishing default preference for general, scale-amenable methods over domain-specific heuristics when assurance and budget are comparable. Requires explicit BLP-waiver with expiry and rationale if overridden by deontic constraints or scale-probe evidence. Instantiated in C.24 Agent-Tools-CAL as ATC-2 law.  
  Source: Part C Table line 140 · Evidence: `"What is the default policy when a domain‑specific trick competes with a scalable general method?"` — operationalizes the "Bitter Lesson" trajectory (compute + data + freedom over hand-tuned rules) as normative policy with α/δ tolerances.

- **C.25 — Q-Bundle (Structured Treatment of "-ilities")** — Definitional pattern providing uniform shape for engineering quality families (availability, reliability, resilience, etc.) as structured bundles combining Measures [CHR] + Scope [USM] + Mechanism/Status slots. Prevents category errors from conflating set-algebra (scope) with numeric measurement (CHR) and keeps assurance math stable.  
  Source: Part C Table line 146, detailed §20026-20081 · Evidence: `"Clarifies how to model common "-ilities" (availability, reliability, etc.) either as single measurable Characteristics or as composite bundles"` — enforces separation of concerns between measurement, scope, and mechanism presence.

- **A.0 — Onboarding Glossary (NQD & E/E-LOG)** — Normative on-ramp pattern providing manager-first introduction to generative engine terminology for problem-solving/search loops. Defines portfolio publication standards: novelty (N), use-value (U), constraint-fit (C), diversity measures, ReferencePlane, CL^plane, ParetoOnly default, parity runs, and illumination maps. Constrains any pattern/UTS row describing generators, selectors, or portfolios.  
  Source: Part A Table line 30, detailed evidence §590-717 · Evidence: `"This pattern gives newcomers a plain‑language starter kit for FPF's *generative* engine so they can run a lawful **problem‑solving / search loop** on day one"` — instantiates P-10 Open-Ended Evolution as operational vocabulary with CC-A0 conformance clauses for comparability.

- **A.7 — Strict Distinction (Clarity Lattice)** — Architectural pattern establishing core ontological distinctions to prevent category errors: Object ≠ Description, Role ≠ Work, Entity ≠ System, Holder ≠ Role. Serves as guard-rail constraining all patterns to maintain conceptual purity and avoid common modeling confusions.  
  Source: Part A Table line 54, expanded §5987+ · Evidence: `"category error, Object ≠ Description, Role ≠ Work, ontology"` — provides "a single, didactically clear lattice of distinctions" that keeps models free from category errors across the framework.

- **B.2.5 — Supervisor-Subholon Feedback Loop** — Behavioral pattern for control architecture establishing layered feedback structure where supervisor holon monitors and adjusts subholon parameters via external transformer principle. Models stability, hierarchical control, and meta-system transitions with clear separation between controller and controlled.  
  Source: Part B Table line 86 · Evidence: `"control architecture, feedback loop, supervisor, stability, layered control"` — canonical pattern for "How does FPF model control systems?" building on Meta-Holon Transition (B.2) and holonic foundation (A.1).

### Pattern Evolution Notes

The specification shows maturation of the generative/creative dimension with formalization of:
- **Scale-aware policies** (SLL, BLP) that operationalize the "Bitter Lesson" trajectory as normative architectural decisions
- **Agentic orchestration** (C.24) bringing tool-use planning under Role-Method-Work discipline with explicit budget/trust gates
- **Portfolio-first publication** (A.0) replacing single-winner selection with illumination maps and Pareto fronts
- **Quality bundling** (C.25) preventing measurement/scope conflation in "-ilities"

All new patterns maintain strict alignment with FPF's Eleven Pillars (E.2), particularly P-10 (Open-Ended Evolution), P-3 (Scalable Formality), P-7 (Pragmatic Utility), and P-11 (SoTA Alignment).

### Recommended Manual Review

1. **C.24 conformance clauses** (CC-ATC-1 through CC-ATC-8) establish strong normative requirements for any agentic system implementation — may require coordination with Part G (Discipline SoTA Kit) for selector integration.

2. **BLP policy precedence** (§19973) creates potential tensions with safety-critical scripts — DRR process for overrides should be validated against existing regulatory profiles.

3. **A.0 glossary** positions itself as "on-ramp" layer but constrains publication surface for generators/selectors — verify backward compatibility with existing UTS rows in deployed contexts.

4. Relationship between **SLL scale variables** and **CSLC** (A.18) measurement standards needs cross-reference validation to ensure no conflicting normative requirements for scale declaration.
