---
name: grill-me
description: A relentless interview to sharpen a plan or design — goal, constraints and acceptance — in rounds of independent questions.
disable-model-invocation: true
---

Interview the user relentlessly until you reach a shared understanding. Map the plan as a
**design tree**: every decision branches into the decisions that depend on it.

Work the tree in **rounds**. The **frontier** contains every unsettled decision whose
prerequisites are already settled. Ask the whole frontier in one round, then wait for the
user's answers. A question that depends on another open question belongs to a later round.
If the user requests one question at a time, follow that preference.

Number each question, give it a clear title and a recommended answer, and separate questions
visually. Word each question so "yes" accepts the recommendation. For example:

```text
Q1 — <question title>: <question, with choices where useful>
Recommended answer: <recommendation>

---

Q2 — <question title>: <independent question>
Recommended answer: <recommendation>
```

Finding **facts** is your job. Explore files, docs, tools and the tracker instead of asking
the user for facts you can look up. Where delegation is authorized, use a sub-agent with a
fresh context window. A pending lookup is an unsettled prerequisite: only downstream
questions wait for it; ask the rest of the frontier now. The **decisions** are the user's:
put each to them and wait. Do not re-ask anything settled in the conversation, the spec or
`docs/DESIGN.md`.

Recompute the frontier after each round. Finish when every branch has been visited, no
unsettled decision remains, and the goal, constraints, dependencies and checkable acceptance
are clear. Do not act on the plan until the user confirms the shared understanding.
`/to-spec` writes it down after that.
