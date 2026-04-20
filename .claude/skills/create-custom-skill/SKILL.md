---
name: create-custom-skill
description: Scaffold a new Claude Code skill in this project. Guides the user through naming, configuration, and description, then generates the SKILL.md following best practices.
disable-model-invocation: true
user-invocable: true
allowed-tools: Read Write Bash(mkdir *)
---

# Create Custom Skill

You are a skill scaffolding assistant. Your job is to guide the user through creating a new Claude Code skill in this project, then generate the skill files following best practices.

## Workflow

Follow these steps **in order**. Use the `AskUserQuestion` tool for each step so the user can answer interactively.

### Step 1 — Ask for the skill name

Ask the user: **"What is the name of the new skill?"**

Validation rules for the name:
- Only lowercase letters, numbers, and hyphens are allowed
- Maximum 64 characters
- Must not conflict with an existing skill in `.claude/skills/`

If the user provides an invalid name, explain the rules and ask again.

### Step 2 — Ask for `disable-model-invocation`

Ask the user: **"Should Claude be prevented from auto-invoking this skill? (`disable-model-invocation`)"**

Offer these options:
- **No (default)** — Claude can load this skill automatically when relevant
- **Yes** — Only the user can invoke it via `/skill-name`

Default: `false` (No).

### Step 3 — Ask for `user-invocable`

Ask the user: **"Should this skill be invocable by the user via the `/` menu? (`user-invocable`)"**

Offer these options:
- **Yes (default)** — The skill appears in the `/` menu for direct invocation
- **No** — Hidden from the `/` menu; only Claude can load it as background knowledge

Default: `true` (Yes).

### Step 4 — Ask for the skill description

Ask the user: **"Provide a description for the skill."**

Guidelines to share with the user:
- The description tells Claude **when** to use the skill
- Put the most important usage keywords at the beginning
- Keep it under 250 characters for best results (longer descriptions get truncated in the skill list)
- Example: `"Deploy the application to staging or production environments. Use when the user asks to deploy, release, or push to an environment."`

### Step 5 — Ask for the skill instructions

Ask the user: **"What instructions should this skill contain? Describe what Claude should do when this skill is invoked."**

Let the user know they can provide:
- Step-by-step procedures
- Rules and constraints
- Code examples or templates
- References to other files

If the user provides a short or vague answer, help them expand it into well-structured markdown instructions.

### Step 6 — Generate the skill

Once you have all the information, create the skill:

1. Create the directory: `.claude/skills/<skill-name>/`
2. Create `.claude/skills/<skill-name>/SKILL.md` with the following structure:

```yaml
---
name: <skill-name>
description: <description>
disable-model-invocation: <true|false>
user-invocable: <true|false>
---

<skill instructions provided by the user, formatted as clean markdown>
```

**Frontmatter rules:**
- Always include `name` and `description`
- Only include `disable-model-invocation` if the value is `true` (omit if `false`, since `false` is the default)
- Only include `user-invocable` if the value is `false` (omit if `true`, since `true` is the default)
- If the user requested additional frontmatter fields (like `allowed-tools`, `argument-hint`, `context`, `paths`, etc.), include them as well

### Step 7 — Confirm creation

After creating the file:

1. Read back the generated `SKILL.md` to the user
2. Tell the user how to use the new skill:
   - If `user-invocable` is `true`: they can invoke it with `/<skill-name>`
   - If `disable-model-invocation` is `false`: Claude will also auto-load it when relevant
3. Remind the user they can edit `.claude/skills/<skill-name>/SKILL.md` at any time to refine the skill

## Important notes

- All skills MUST be created inside `.claude/skills/` in this project (project-scoped skills)
- Each skill lives in its own directory with a `SKILL.md` file as the entry point
- Do NOT create skills outside the project directory
- Follow the existing project convention seen in `.claude/skills/tdd-enforcement/SKILL.md`
