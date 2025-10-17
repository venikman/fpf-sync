# FPF Pattern Journal

This log tracks new or substantially revised behavioral patterns detected in the First Principles Framework specification.

## 2025-10-17 — Run 18602221223

**Commit:** `e5e18bc8ceef371d167a8255cb4417ab59f82588`

### New Patterns Detected

- **C.Agent-Tools-CAL (C.24) — Agentic Tool-Use & Call-Planning** — Architheory specification (CAL) for scalable, policy-aware sequencing of agentic tool calls under budgets and trust gates; instantiates Bitter-Lesson Preference and the Scaling-Law Lens. Provides conceptual API for agents to plan tool calls lawfully, audibly, and scalably with explicit budgets, assurance gates (F-G-R), and explore/exploit policies.  
  Source: Part C — Architheory Specifications, Section C.24 (line 19591) · Evidence: `"This CAL provides the **conceptual API for thought** that lets any implementation (LLM-based, search-based, code-based, robotic) plan calls **lawfully**, **audibly**, and **scalably**."`.

- **BLP (C.19.1) — Bitter-Lesson Preference (policy)** — Default policy that prefers general, scale-amenable methods over domain-specific heuristics unless forbidden by deontics or overturned by a scale-probe. When two admissible choices are within δ (assurance) and α (budget), prefer the more general method whose slope vector Pareto-dominates under declared E/E-LOG objectives; overrides must record BLP-waiver with expiry.  
  Source: Part C — Architheory Specifications, Section C.19.1 (line 138) · Evidence: `"What is the default policy when a domain-specific trick competes with a scalable general method?"`.

- **SLL (C.18.1) — Scaling-Law Lens (binding)** — Characterization lens for making search scale-savvy by declaring scale variables (S), compute-elasticity, data-elasticity, resolution-elasticity, exponent class, knee points, and diminishing returns. Coordinates with NQD-CAL and E/E-LOG to enable scale-aware portfolio reporting.  
  Source: Part C — Architheory Specifications, Section C.18.1 (line 136) · Evidence: `"How to make search scale-savvy? Where to declare scale variables and expected elasticities?"`.

- **KindAT (C.3.5) — Intentional Abstraction Facet for Kinds (K0…K3)** — Informative facet (not a Characteristic) attached to U.Kind that classifies the intentional abstraction stance: K0 Instance, K1 Behavioral Pattern, K2 Formal Kind/Class, K3 Up-to-Iso. Guides ΔF/ΔR planning, bridge expectations, catalog/search, and refactoring. Has no algebra, no thresholds, and must not appear in guards or composition math.  
  Source: Part C — Architheory Specifications, Section C.3.5 (line 117, detailed at line 16269) · Evidence: `"Defines **KindAT** as an **informative facet** attached to 'U.Kind' that classifies the **intentional abstraction stance** of a kind"`.

- **B.2.5 — Supervisor–Subholon Feedback Loop** — Control architecture pattern describing the layered feedback loop where a supervisor system (often emergent from Meta-Holon Transition) controls subholons through observation, decision, and actuation cycles. Elaborates the "Supervisor Emergence" (S) trigger in Meta-Holon Transition (MHT).  
  Source: Part B — Trans-disciplinary Reasoning Cluster, Section B.2.5 (line 84, detailed at line 11274) · Evidence: `"How does FPF model control systems? What is the supervisor-subholon pattern?"`.

- **Meta-Holon Transition (MHT, B.2)** — Universal pattern for emergence describing how a collection of holons becomes a new, coherent whole. Triggered by BOSC criteria (Boundary, Objective, Supervisor, Complexity) and specialized into Meta-System Transition (MST, B.2.2), Meta-Epistemic Transition (MET, B.2.3), and Meta-Functional Transition (MFT, B.2.4).  
  Source: Part B — Trans-disciplinary Reasoning Cluster, Section B.2 (line 79) · Evidence: `"How does FPF model emergence? What is a Meta-Holon Transition? When does a collection become more than the sum of its parts?"`.

- **Tell-Show-Show (E.7) — Archetypal Grounding Principle** — Didactic pattern requiring that all [A] patterns that claim generative behavior must embed both a U.System and a U.Episteme illustration, demonstrating substrate-independent universality. This "Tell-Show-Show" pedagogy ensures concepts are grounded in dual archetypal examples.  
  Source: Part E — The FPF Constitution and Authoring Guides, Section E.7 (line 181) · Evidence: `"How are FPF patterns explained? What are the standard examples in FPF?"` and requirement at line 639: `"Any [A] pattern that claims generative behaviour **MUST** embed **both** a **U.System** and a **U.Episteme** illustration"`.

- **Handover Pattern** — Temporal transition pattern for role assignment where one holder's role ends and another's begins. Canonical form: Close `A#Role@..t` and open `B#Role@t..` — never delete history. Ensures auditability and continuity in role transitions.  
  Source: Part A — Kernel Architecture Cluster, mentioned in context of Role Assignment (line 1387) · Evidence: `"**Handover pattern:** Close 'A#Role@..t' and open 'B#Role@t..' — never delete history."`.

- **D.2.3 — Ecosystem Stewardship** — Multi-scale ethics pattern addressing inter-architheory externalities and tragedy-of-commons mitigations. Part of the four-nested-arena ethics framework (Self → Team → Ecosystem → Planet) providing scoping rules for ethical considerations at ecosystem scale.  
  Source: Part D — Multi-scale Ethics & Conflict-Optimisation, Section D.2.3 (line 153) · Evidence: `"Modeling ethical impact on an ecosystem."`.

- **NQD (Novelty-Quality-Diversity) with E/E-LOG** — Combined generative pattern from C.17 (Creativity-CHR), C.18 (NQD-CAL), and C.19 (E/E-LOG) that operationalizes open-ended evolution through structured search. Portfolios reported as sets with scale-aware fronts (utility × novelty × constraint-fit × scale-elasticity classes) rather than single winners. Normalizes quality-diversity and open-endedness as first-class search objectives with explore/exploit governance.  
  Source: Part A Onboarding Glossary (A.0), and sections C.17-C.19 (lines 134-137), operational use in B.5.2.1 (line 98) · Evidence: `"How to systematically generate creative ideas? What is NQD in FPF?"` and `"this glossary surfaces those ideas as **publication standards**, not tool recipes"`.

### Summary

Ten distinct behavioral patterns or pattern-linked concepts were catalogued from the First Principles Framework specification. Key additions include the new agentic tool-use calculus (C.Agent-Tools-CAL), the Bitter-Lesson Preference policy that governs method selection, the Scaling-Law Lens for scale-aware search, and several didactic and governance patterns like Tell-Show-Show and the Handover pattern. The Meta-Holon Transition pattern family and its specializations provide a structured approach to modeling emergence. All patterns are anchored to specific sections in the source document for traceability.

### Notes for Manual Review

- The C.Agent-Tools-CAL pattern (C.24) is particularly significant as it provides a comprehensive framework for agentic systems with explicit budgets, trust gates, and policy governance — this appears to be a major addition addressing modern LLM-based and autonomous agents.
- BLP and SLL work together as a coherent policy framework for scale-aware method selection, directly instantiated in C.Agent-Tools-CAL.
- KindAT introduces a useful classification scheme (K0-K3) for kinds but is explicitly marked as informative only, not a characteristic with algebraic properties.
- Several patterns have cross-references suggesting a highly interconnected pattern language; future scans should track evolution of these dependencies.
