---
name: idea-to-skill
description: >
  Transform a user's idea into a Claude Code skill via brainstorming and spec review. TRIGGER when: user invokes /idea-to-skill. Walks the user through brainstorming with Default model, reviews with Opus 4.6, then generates a complete SKILL.md.
disable-model-invocation: true
---

# Idea to Skill — From Rough Idea to a Complete Claude Code Skill

You are a skill creation assistant that guides the user from a raw idea to a fully functional Claude Code skill, going through brainstorming, spec review, and skill generation.

## Workflow Overview

There are three phases:

1. **Brainstorm** (Default model) — Ask iterative questions to develop a thorough skill spec
2. **Review** (Opus 4.6) — Review and enhance the spec for completeness
3. **Generate Skill** — Use the finalized spec to create a complete SKILL.md

---

## Phase 1: Brainstorm with Default Model

### Step 1 — Switch to Default model

Tell the user you are switching to the recommended default model for brainstorming. Run:

```
/model default
```

### Step 2 — Ask for the idea

Ask the user: **"What skill idea would you like to build? Describe what Claude should do when this skill is invoked."**

Wait for their response.

### Step 3 — Iterative questioning

Once the user shares their idea, begin an iterative, one-question-at-a-time interview process:

- Ask **only one question at a time**
- Each question should **build on the user's previous answers**
- Dig into every relevant detail:
  - What is the skill's purpose and when should it trigger?
  - What step-by-step workflow should it follow?
  - What tools or commands does it need to use?
  - What rules, constraints, or guardrails should it enforce?
  - What inputs does it expect from the user?
  - What outputs or artifacts should it produce?
  - What edge cases or error scenarios should it handle?
  - Should Claude auto-invoke it, or is it user-only?
  - Should it be visible in the `/` menu?
- The end goal is a **detailed specification of the skill's behavior**
- Keep going until you feel the spec is thorough, or the user signals they are done

### Step 4 — End of brainstorming

The brainstorming phase ends when either:

- You naturally wrap up after gathering sufficient detail
- The user types the stop code: **`f5020g`**

### Step 5 — Save the Default model spec

Once brainstorming is complete:

1. Ask the user for a **name for the spec** (or suggest one based on the idea). The name should be lowercase with hyphens (e.g., `deploy-assistant`, `code-reviewer`).
2. Create the directory: `spec/{name-of-spec}/`
3. Write the full specification to: `spec/{name-of-spec}/{name-of-spec}-by-default.md`

The spec file should be a well-structured markdown document that captures everything discussed during brainstorming, organized into clear sections (Overview, Purpose, Trigger Conditions, Workflow Steps, Rules & Constraints, Inputs/Outputs, Edge Cases, Frontmatter Settings, etc.).

---

## Phase 2: Review with Opus 4.6

### Step 6 — Switch to Opus 4.6

Switch to the Opus 4.6 model:

```
/model opus
```

### Step 7 — Review and enhance the spec

Read the file `spec/{name-of-spec}/{name-of-spec}-by-default.md` and perform a thorough review:

- Check that the specification is **not missing anything important** for a well-defined skill
- Look for gaps in: workflow steps, edge cases, error handling, user interaction patterns, output format, naming conventions, and any other areas relevant to the skill
- If anything is missing or could be improved, **rewrite the entirety of the specification** to include all missing details

### Step 8 — Save the Opus-reviewed spec

Save the reviewed and enhanced specification to:

```
spec/{name-of-spec}/{name-of-spec}-by-opus-4-6.md
```

This is the **final, authoritative spec** that will be used for skill generation.

---

## Phase 3: Generate the Skill

### Step 9 — Derive skill metadata from the spec

From the finalized spec (`spec/{name-of-spec}/{name-of-spec}-by-opus-4-6.md`), determine:

- **Skill name**: lowercase with hyphens, max 64 characters (validate it doesn't conflict with existing skills in `.claude/skills/`)
- **Description**: a concise description (under 250 characters) that tells Claude when to use the skill, with the most important keywords first
- Any additional frontmatter fields needed (e.g., `allowed-tools`, `argument-hint`, `context`, `paths`)

### Step 9b — Ask the user for frontmatter settings

After deriving the metadata, ask the user the following two questions:

1. **"Should Claude be prevented from auto-invoking this skill? (`disable-model-invocation`)"**
   - **No (default)** — Claude can load this skill automatically when relevant
   - **Yes** — Only the user can invoke it via `/{skill-name}`
   - Default: `false` (No)

2. **"Should this skill be invocable by the user via the `/` menu? (`user-invocable`)"**
   - **Yes (default)** — The skill appears in the `/` menu for direct invocation
   - **No** — Hidden from the `/` menu; only Claude can load it as background knowledge
   - Default: `true` (Yes)

### Step 10 — Generate the SKILL.md

1. Create the directory: `.claude/skills/{skill-name}/`
2. Create `.claude/skills/{skill-name}/SKILL.md` with proper frontmatter and well-structured markdown instructions derived from the spec

**Frontmatter rules:**
- Always include `name` and `description`
- Only include `disable-model-invocation` if the value is `true` (omit if `false`, since `false` is the default)
- Only include `user-invocable` if the value is `false` (omit if `true`, since `true` is the default)
- Include any additional frontmatter fields identified in Step 9

**Instructions should:**
- Be clear, actionable markdown
- Include a workflow overview section
- Break the workflow into numbered steps
- Specify rules, constraints, and guardrails
- Include examples or templates where helpful
- End with important notes or caveats

### Step 11 — Confirm creation

After creating the skill:

1. Read back the generated `SKILL.md` to the user
2. Tell the user how to use the new skill:
   - If `user-invocable` is `true`: they can invoke it with `/{skill-name}`
   - If `disable-model-invocation` is `false`: Claude will also auto-load it when relevant
3. Remind the user they can edit `.claude/skills/{skill-name}/SKILL.md` at any time to refine the skill

---

## Important Notes

- **One question at a time** during brainstorming — never ask multiple questions in a single message
- The stop code `f5020g` immediately ends brainstorming and moves to saving the spec
- All spec files are saved under the `spec/` directory at the project root
- The Default model spec captures the raw brainstorming; the Opus spec is the reviewed and enhanced version
- Always use the Opus-reviewed spec (not the Default model one) for skill generation
- All skills MUST be created inside `.claude/skills/` in this project
- Each skill lives in its own directory with a `SKILL.md` file as the entry point
- Validate skill names against existing skills to avoid conflicts
