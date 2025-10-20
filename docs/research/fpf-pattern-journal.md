# FPF Pattern Journal

This log tracks new or substantially revised behavioral patterns detected in the First Principles Framework specification.

## 2025-10-20 — Run 18662027940

**Baseline Context:**
- Commit: `e5e18bc8ceef371d167a8255cb4417ab59f82588`
- Source: `yadisk/First Principles Framework — Core Conceptual Specification (holonic).md`
- Total lines: 32,849

**New Patterns Identified:**

- **B.2.5 — Supervisor–Subholon Feedback Loop** — Universal architectural motif for layered supervisory control decomposing management into functional layers at different spatiotemporal scales. Applies across physical systems, epistemic artifacts, and organizations. Enforces distinction between structural hierarchy (Levels/parts) and functional hierarchy (Layers/supervisors).  
  Source: §B.2.5 · Evidence: "Each layer operates at a different spatiotemporal scale and level of abstraction, communicating with its neighbors through well-defined interfaces."

- **Reflexive Split Pattern** — Resolves self-action paradoxes by decomposing a system into distinct Regulator and Regulated subsystems with explicit internal boundary. Prevents "self-magic" by enforcing external causality principle—every transformation must have an identifiable external agent acting across a boundary.  
  Source: §A.12 (Pattern A.12), subsection 4.2 · Evidence: "Model as Two Holons...The regulating part becomes the holder of the TransformerRole. The regulated part becomes the Target."

- **Handover Pattern** — Temporal role-assignment choreography ensuring clean transitions between role holders by closing one assignment window and opening another without deleting historic assignments. Maintains audit trail and prevents temporal gaps in role coverage.  
  Source: §A.2.1, subsection 7.1 · Evidence: "Handover pattern: Close A#Role@..t and open B#Role@t.. — never delete history."

- **K1 — Behavioral Pattern (KindAT tier)** — Classification tier for kinds representing role/behavioral patterns stated via Standards or controlled natural language, typically "duck-typing" flavor. Guides ΔF investment toward F3→F4 predicate-like acceptances and requires testing behavioral diversity for assurance.  
  Source: §C.3.5 (KindAT), subsection 3.2 · Evidence: "The kind is a behavioral pattern ('things that act like ...'), typically stated via Standards or controlled NL, not a full type."

- **NQD — Novelty-Quality-Diversity Search Pattern** — Open-ended generative search calculus maintaining portfolios on Pareto fronts across Quality components while maximizing Diversity and encouraging Novelty. Prevents premature convergence by keeping hypothesis generation formally open through illumination-style emitters and exploration quotas.  
  Source: §A.0, §B.5.2.1, §C.18 · Evidence: "NQD-Generate...returns a finite, non-dominated set of candidate hypotheses that maximize Quality (per-component) while maintaining Diversity and encouraging Novelty."

- **E/E-LOG — Explore–Exploit Governor** — Policy framework for balancing exploration (generating novel diverse candidates) vs exploitation (refining known solutions). Governs EmitterPolicies, exploration quotas, and selection lenses to prevent mode collapse while enabling timely convergence.  
  Source: §C.19 · Evidence: "E/E-LOG starts Explore-heavy, flips Exploit-heavy once ≥ K distinct niches are lit."

- **Guard Patterns (ESG & Method–Work)** — Context-local gate conditions using typed guards over Kinds and USM scopes to control work eligibility. Separate Epistemic/Skill/Governance constraints from acceptance criteria, ensuring assignments and method instances satisfy regulatory profiles.  
  Source: §A.2.6, subsection 10 · Evidence: "Guard Patterns (ESG & Method–Work)" section heading; governs when RoleEnactments and Work instances are permitted.

- **Two-Hats Analogy Pattern** — Didactic pattern for explaining Reflexive Split where an entity must metaphorically wear different "hats" (Doer vs Reviewer) to separate execution from self-assessment. Formalizes internal quality control loops by making regulator/regulated roles explicit.  
  Source: §A.12, subsection 4.2 (Didactic Note) · Evidence: "Think of the Reflexive Split like a manager who needs to review their own work. To do it properly, they must metaphorically wear 'two hats.'"

- **Typical Temporal Patterns (shift rotation, shadowing, emergency bundle)** — Collection of archetypal role-assignment time patterns including shift handovers, trainee supervision, and emergency role bundling. Each demonstrates different temporal choreographies for role windows and state transitions.  
  Source: §A.2.1, subsection 7.4 · Evidence: Lists "Shift rotation", "Shadowing", "Emergency bundle" as didactic patterns for temporal role management.

- **Parity Run Pattern** — Benchmark methodology ensuring fair, scale-aware comparison of competing MethodFamilies under iso-scale conditions. Pins editions, enforces freshness windows, uses lawful orders (Pareto/Archive), and maintains comparability across variants through controlled experimental design.  
  Source: §A.0, §G.9 · Evidence: "Parity run" defined as method for establishing comparability; §G.9 details "iso-scale parity" and "scale-probe" mechanisms.

**Summary:** First baseline scan identified 10 distinct behavioral patterns ranging from architectural motifs (Supervisor-Subholon, Reflexive Split) to generative patterns (NQD, E/E-LOG) to temporal choreographies (Handover, Shift Rotation) and evaluation patterns (Parity Run, Guard Patterns). All patterns support FPF's core mission of providing generative scaffolds for transdisciplinary reasoning.

**Notes for Manual Review:**
- Many anti-pattern sections exist (e.g., "Ghost in the Machine", "Functional Soup", "Perfect Communication Fallacy") but these are diagnostic patterns showing what to avoid rather than behavioral patterns to adopt.
- The document contains numerous "archetypal grounding" sections demonstrating patterns across U.System/U.Episteme/socio-technical domains—these are exemplifications rather than new patterns.
- Part G contains several generator/selector patterns (G.1 CG-Frame-Ready Generator, G.5 Multi-Method Dispatcher) that may warrant future tracking if they evolve beyond their current specification.
