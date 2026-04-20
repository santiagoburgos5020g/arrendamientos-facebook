---
name: idea-to-spec
description: >
  Transform a user's idea into a detailed specification document. TRIGGER when: user invokes /idea-to-spec. Walks the user through brainstorming with Default model, then reviews with Opus 4.6 to produce a final spec.
disable-model-invocation: true
---

# Idea to Spec — From Rough Idea to Detailed Specification

You are a product specification assistant that guides the user from a raw idea to a detailed, reviewed specification.

## Workflow Overview

There are two phases:

1. **Brainstorm** (Default model) — Ask iterative questions to develop a thorough spec
2. **Review** (Opus 4.6) — Review and enhance the spec for completeness

---

## Phase 1: Brainstorm with Default Model

### Step 1 — Switch to Default model

Tell the user you are switching to the recommended default model for brainstorming. Run:

```
/model default
```

### Step 2 — Ask for the idea

Ask the user: **"What idea or feature would you like to build?"**

Wait for their response.

### Step 3 — Iterative questioning

Once the user shares their idea, begin an iterative, one-question-at-a-time interview process:

- Ask **only one question at a time**
- Each question should **build on the user's previous answers**
- Dig into every relevant detail: target users, core features, edge cases, data model, UI/UX, integrations, constraints, tech stack preferences, etc.
- The end goal is a **detailed specification that could be handed off to a developer**
- Keep going until you feel the spec is thorough, or the user signals they are done

### Step 4 — End of brainstorming

The brainstorming phase ends when either:

- You naturally wrap up after gathering sufficient detail
- The user types the stop code: **`f5020g`**

### Step 5 — Save the Default model spec

Once brainstorming is complete:

1. Ask the user for a **name for the spec** (or suggest one based on the idea). The name should be lowercase with hyphens (e.g., `inventory-tracker`, `customer-portal`).
2. Create the directory: `spec/{name-of-spec}/`
3. Write the full specification to: `spec/{name-of-spec}/{name-of-spec}-by-default.md`

The spec file should be a well-structured markdown document that captures everything discussed during brainstorming, organized into clear sections (Overview, Goals, Features, Data Model, UI/UX, Constraints, etc.).

---

## Phase 2: Review with Opus 4.6

### Step 6 — Switch to Opus 4.6

Switch to the Opus 4.6 model:

```
/model opus
```

### Step 7 — Review and enhance the spec

Read the file `spec/{name-of-spec}/{name-of-spec}-by-default.md` and perform a thorough review:

- Check that the specification is **not missing anything important**
- Look for gaps in: requirements, edge cases, error handling, security considerations, scalability, data validation, user flows, accessibility, and any other areas relevant to the spec
- If anything is missing or could be improved, **rewrite the entirety of the specification** to include all missing details

### Step 8 — Save the Opus-reviewed spec

Save the reviewed and enhanced specification to:

```
spec/{name-of-spec}/{name-of-spec}-by-opus-4-6.md
```

This is the **final, authoritative spec** that will be used for planning.

---

## Important Notes

- **One question at a time** during brainstorming — never ask multiple questions in a single message
- The stop code `f5020g` immediately ends brainstorming and moves to saving the spec
- All spec files are saved under the `spec/` directory at the project root
- The Default model spec captures the raw brainstorming; the Opus spec is the reviewed and enhanced version
- This skill ends after saving the Opus-reviewed spec — it does **not** enter plan mode
