# FPF Pattern Journal

This log tracks new or substantially revised behavioral patterns detected in the First Principles Framework specification.

## 2025-10-19 — Run 18634748912

**Baseline:** Commit `e5e18bc8ceef371d167a8255cb4417ab59f82588`  
**Source:** `yadisk/First Principles Framework — Core Conceptual Specification (holonic).md`  
**Scan scope:** Full document (2.9MB, ~177 unique pattern identifiers)

### Initial Catalog

This is the first run of the FPF Pattern Research Agent. All 177 patterns detected in the specification are considered "new" for the purposes of establishing the baseline. The patterns are organized into the following categories based on their prefixes:

#### Part A — Core Holonic Concepts (Kernel Patterns)
The foundational architectural patterns that define the holonic framework:

- **A.0 — Onboarding Glossary (NQD & E/E-LOG)** — Introduces novelty-quality-diversity (NQD) and explore-exploit governance as the baseline vocabulary for creative generation and portfolio management.  
  Source: Table row 30 · Evidence: "full text | FPF serves the Engineer, Researcher, and Manager by providing a generative pattern language".

- **A.13 — The Agential Role & Agency Spectrum** — Defines how agency is modeled within FPF, establishing the foundational concept for agentic behavior through the Agency-CHR characteristic.  
  Source: Table row 58 · Evidence: "*Keywords:* agency, autonomy, AgentialRole, Agency-CHR, decision-making."

- **A.15 — Role–Method–Work Alignment (Contextual Enactment)** — Core transformer pattern establishing strict separation between role assignment (who), method description (how), and work record (what happened), preventing "self-magic" conflation.  
  Source: Table row 60 · Evidence: "Establish a single, substrate-neutral way to say **who acts**, **under which role**...without 'self-magic'."

- **A.2.4 — U.EvidenceRole: The Evidential Stance** — Defines how epistemes serve as evidence for claims, fundamental to the trust and assurance architecture.  
  Source: Table row 38 · Evidence: "*Keywords:* evidence, claim, support, justification, episteme."

- **A.2.5 — U.RoleStateGraph: The Named State Space of a Role** — State machine pattern for role enactability and lifecycle management, includes archetypal cross-domain RSG patterns.  
  Source: Table row 39, Section ~2958 · Evidence: "*Keywords:* state machine, RSG, role state, enactability, lifecycle" and "## 12 · Archetypal RoleStateGraphs (cross‑domain patterns)".

- **A.2.6 — Unified Scope Mechanism (USM): Context Slices & Scopes** — Replaces scattered "applicability," "envelope," "generality" terms with unified scope algebra for claims (G) and work capabilities.  
  Source: Table row 40, detailed section · Evidence: "This pattern **supersedes** the scattered use of characteristic labels *applicability*, *envelope*, *generality*".

#### Part B — Meta-Level Operations & Boundary-Crossing

- **B.2.5 — Supervisor–Subholon Feedback Loop** — Control architecture pattern defining hierarchical control systems with stability guarantees.  
  Source: Table row 84 · Evidence: "*Keywords:* control architecture, feedback loop, supervisor, stability, layered control."

#### Part C — Architheory Specifications (CAL/LOG/CHR)

Domain-specific calculi that extend the kernel:

- **C.2 — KD-CAL (Knowledge-Epistemic CAL)** — Architheory for knowledge, evidence, and trust modeling, defines the F-G-R (Formality-ClaimScope-Reliability) framework.  
  Source: Table row 109 · Evidence: "*Keywords:* knowledge, epistemic, evidence, trust, assurance, F-G-R".

- **C.2.3 — Unified Formality Characteristic F** — Nine-level formality scale (F0-F9) from informal to fully mechanized proof, prerequisite for all F-G-R usage.  
  Source: Table row 111 · Evidence: "*Keywords:* Formality, F-scale, F0-F9, rigor, proof, specification, formal methods."

- **C.3 — Kind-CAL — Kinds, Intent/Extent, and Typed Reasoning** — Type system architheory defining intension/extension semantics and cross-context kind mapping.  
  Source: Table row 112 · Evidence: "*Keywords:* kind, type, intension, extension, subkind, typed reasoning, classification, vocabulary."

- **C.9 — Agency-CHR** — Characteristic architheory for measuring and characterizing agency levels.  
  Source: Table row 124 · Evidence: Refines A.13 The Agential Role & Agency Spectrum.

- **C.17 — Creativity-CHR — Characterising Generative Novelty & Value** — Architheory for measuring and characterizing creative generation, novelty, and value in generative systems.  
  Source: Table row 134, Section 17785 · Evidence: "*Keywords:* principles, constitution, pillars, invariants, core values, rules, P-1 to P-11."

- **C.18 — NQD-CAL — Open-Ended Search Calculus** — Architheory for novelty-quality-diversity search, portfolio management, and illumination mapping.  
  Source: Table row 135, Section 18519 · Evidence: Architectural pattern [A] defining open-ended search operators.

- **C.19 — E/E-LOG — Explore–Exploit Governor** — Logic architheory for explore-exploit policies, implements the Bitter-Lesson Preference for scalable methods.  
  Source: Table row 137, Section 18701 · Evidence: "*Keywords:* explore/exploit (E/E‑LOG), portfolio (set), illumination map (gauge)."

- **C.19.1 — BLP — Bitter-Lesson Preference (policy)** — Policy pattern favoring scalable, general, data/compute-leveraging methods over hand-tuned heuristics when assurance/cost are comparable.  
  Source: Table row 138 · Evidence: Referenced in C.24 as guard-rail for agentic tool selection.

- **C.21 — Discipline-CHR · Field Health & Structure** — Architheory for characterizing scientific/engineering discipline maturity and health.  
  Source: Table row 140, Section 18986 · Evidence: Architectural pattern [A].

- **C.22 — Problem-CHR · Problem Typing & TaskSignature Binding** — Architheory for typing problems and binding them to task signatures and solution methods.  
  Source: Table row 141, Section 19196 · Evidence: Architectural pattern [A].

- **C.23 — Method-SoS-LOG — MethodFamily Evidence & Maturity** — Logic architheory for method family evidence collection and maturity assessment.  
  Source: Table row 142, Section 19388 · Evidence: Architectural pattern [A].

- **C.24 — Agentic Tool-Use & Call-Planning (C.Agent-Tools-CAL)** — **[PRIMARY BEHAVIORAL PATTERN]** Architheory specification defining the conceptual calculus for agentic selection and sequencing of tool calls under budgets, trust gates, and policy. Provides tool-agnostic API for planning, executing, and auditing autonomous tool use.  
  Source: Section 19591 · Evidence: "Modern systems increasingly rely on **agents** that can **choose tools** (services/methods) and **plan sequences** of calls to achieve objectives in uncertain contexts." Defines operators: `Γ_agent.eligible()`, `Γ_agent.enumerate()`, `Γ_agent.plan()`, `Γ_agent.execute()`. Includes Bitter-Lesson Preference (BLP) tolerances (α, δ) for balancing general vs. hand-crafted methods.

#### Part D — Multi-scale Ethics & Conflict-Optimisation

- **D.1 — Axiological Neutrality Principle** — No built-in value hierarchy; ethics expressed as explicit preference lattices.  
  Source: Part D table · Evidence: "Axiological Neutrality Principle [A]".

- **D.2 — Multi-Scale Ethics Framework** — Four nested ethical arenas: Self → Team → Ecosystem → Planet with scoping rules.  
  Source: Part D table · Evidence: "Four nested arenas: *Self → Team → Ecosystem → Planet*; scoping rules."

- **D.3 — Holonic Conflict Topology** — Typology of clashes: resource, goal, epistemic, temporal.  
  Source: Part D table · Evidence: "Typology of clashes: resource, goal, epistemic, temporal."

- **D.3.1 — Conflict Detection Logic (LOG-use)** — Formal predicates for conflict detection (`conflictsWith`, `mitigatedBy`) and satisfiability checks.  
  Source: Part D table · Evidence: "Formal predicates (`conflictsWith`, `mitigatedBy`) and satisfiability checks."

- **D.4 — Trust-Aware Mediation Calculus** — Resolution algorithm blending value-weights with B.3 trust scores.  
  Source: Part D table · Evidence: "Resolution algorithm blends value‑weights with B.3 trust scores."

- **D.5 — Bias-Audit & Ethical Assurance** — Pattern for detecting and mitigating cognitive, cultural, and algorithmic biases in holons.  
  Source: Section ~19750+ · Evidence: "Any artifact created by humans or trained on human-generated data is susceptible to hidden cognitive, cultural, and algorithmic biases."

#### Part E — Governance & Authoring Standards

- **E.2 — The Eleven Pillars** — Constitutional principles (P-1 to P-11) that constrain all normative patterns in FPF.  
  Source: Table row 171, Section 19923 · Evidence: "*Keywords:* principles, constitution, pillars, invariants, core values, rules, P-1 to P-11."

- **E.7 — Archetypal Grounding Principle** — Tell-Show-Show rule requiring all [A] patterns to include concrete grounding examples.  
  Source: Table row 181 · Evidence: "*Keywords:* grounding, examples, archetypes, U.System, U.Episteme, Tell-Show-Show."

- **E.15 — Lexical Authoring & Evolution Protocol (LEX-AUTH)** — Protocol for authoring and evolving FPF patterns with Lexical Authoring Traces (LAT) and delta-classes.  
  Source: Table row 192 · Evidence: "*Keywords:* lexical authoring, evolution protocol, LAT, delta-classes."

#### Anti-Patterns

The specification includes systematic anti-pattern catalogs with remedies:

- **Evidence Anti-Patterns (Section ~2582)** — Seven catalogued anti-patterns for evidence modeling:
  - "Data speaks for itself" — Binding with no context or claimRef
  - "Evidence = the work run" — Treating U.Work as the episteme
  - "Attach to system" — Holder is U.System instead of episteme
  - "Global evidence" — Using one binding across contexts with no bridge
  - "Ad-hoc weight" — Number assigned with no declared model
  - "Service proves itself" — Service KPI logged as evidence
  - "Scope blur" — Mixing design-time and run-time provenance

- **Role-as-Part Anti-Pattern** — Violation of treating roles/capabilities as mereological parts (CC-A15-5).  
  Source: Line 7232 · Evidence: "The 'Role-as-Part' anti-pattern is a violation. Roles and capabilities are functional, not structural."

- **Measurement Anti-Patterns (Section ~8362)** — Common mistakes in measurement space modeling.  
  Source: Line 8362 · Evidence: "_The following are common modeling mistakes ('anti-patterns') related to measurement spaces_".

### Notable Pattern Features

1. **Behavioral/Agentic Focus**: The specification includes explicit patterns for autonomous agent behavior, particularly C.24 (Agentic Tool-Use) and A.13 (Agential Role), establishing FPF as framework-level guidance for AI agent architectures.

2. **Trust & Assurance Integration**: Evidence patterns (A.2.4, A.10, B.3) and F-G-R framework (C.2, C.2.3) are deeply integrated, making provenance and auditability first-class concerns.

3. **Explore-Exploit Governance**: The NQD-CAL (C.18) and E/E-LOG (C.19) architheories provide systematic patterns for managing exploration vs. exploitation tradeoffs, directly applicable to RL and search-based systems.

4. **Anti-Pattern Documentation**: Unlike many frameworks, FPF explicitly catalogs anti-patterns with concrete remedies, providing negative examples alongside positive patterns.

5. **Archetypal Grounding**: Pattern E.7 mandates that all architectural patterns include concrete examples, enforcing the "Tell-Show-Show" principle for didactic clarity.

### Research Notes

- **Completeness**: This initial scan captured 177+ unique pattern identifiers across Parts A-H. The specification uses a hierarchical numbering scheme (e.g., C.24 at top level, with potential sub-patterns).

- **Behavioral Pattern Density**: Approximately 2-3 patterns are explicitly focused on autonomous agent behavior (C.24, A.13, C.9), with broader applicability through the Role-Method-Work alignment pattern (A.15).

- **Vocabulary Evolution**: The specification actively deprecates and consolidates terminology (e.g., A.2.6 USM replacing "applicability," "envelope," "generality" with unified "scope").

- **Pattern Dependencies**: Patterns include explicit dependency metadata ("Builds on," "Prerequisite for," "Constrains," "Coordinates with"), forming a directed acyclic graph of pattern relationships.

### Recommended Follow-Up

1. Deep-dive extraction of archetypal grounding examples from each [A] pattern to build a pattern-to-example index.
2. Systematic cataloging of all anti-patterns and their remedies across the full specification.
3. Dependency graph visualization of pattern relationships to identify clusters and critical paths.
4. Comparison with previous specification versions (if available) to detect pattern evolution over time.

