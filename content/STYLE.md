# How Groundwork lessons are written

Groundwork's learners are real beginners. A friend testing it put the problem plainly: lessons "talk as if he knows things he doesn't". These rules exist to stop that.

## The beginner rule

**A lesson may only rely on what an earlier lesson taught, or what it teaches itself.**

This is checked by the build:

- Every idea has an entry in [concepts.yaml](concepts.yaml): an id, a plain name, and a one-line definition.
- Each lesson's frontmatter lists `teaches:` (ideas it explains properly) and `uses:` (ideas it relies on).
- `npm run check-content` fails if a lesson uses an idea that no earlier lesson in course order teaches.

When you write or change a lesson:

1. List every term, command, file type and piece of code syntax the lesson mentions, *including in its exercises and quiz questions*.
2. Each one must be either in `uses` (and taught earlier) or in `teaches` (and explained here).
3. If something is only mentioned in passing ("you'll meet Docker much later"), say so in the text and don't list it. The reader must never need it to follow the lesson or pass the exercises.

## Prerequisites

```yaml
prerequisites:
  - id: kinds-of-programs
    need: essential        # the lesson leans on it
    why: Node.js is introduced there.
  - id: bash-basics
    need: helpful          # useful background, not required
```

Every lesson that provides a concept this lesson `uses` should normally be an essential prerequisite, unless it's far back and obviously done. Each `why` is one short sentence the learner sees at the top of the lesson.

## Writing the Learn section

- **Start from zero.** The first time a word appears, **bold it** and explain it in a plain sentence straight after. Assume no technical background at all.
- **One new idea at a time.** Build in small steps: idea, example, then what you'd see on screen.
- **Show, then tell.** Give a concrete example before the general rule.
- **Use analogies, then drop them.** One everyday comparison per idea is plenty. Say where it breaks down if it matters.
- **Explain every line of code you show** the first time each construct appears. Use comments, or a short list under the block.
- **Add a quick check after each big section:**

  ```mdx
  <details>
  <summary>Quick check: what does `..` mean in a path?</summary>

  The folder one level up from where you are.
  </details>
  ```

- **End with "Words in this lesson"**: a table of every new term and its plain meaning.
- **Callouts:** `<Callout kind="warn" title="…">` for traps, `<Callout title="…">` for asides, `<ConsultantNote>` for why it matters at work.
- **Glossary links:** `<Term id="json">JSON</Term>` shows a definition from concepts.yaml, with a link to where it's taught. Use it when a lesson leans on an earlier idea the reader may have forgotten.
- **Length:** around 1,500 to 3,000 words is normal. Longer is fine when it's clear. Never cut an explanation to save space.

## Exercises

- **Use only what's been taught.** If a Python exercise needs a function, functions must already have been taught.
- **Start each task with what it needs:** "You'll use: `if`, `elif`, `return` (from *Python: your first functions*)."
- **Scaffold early on:** give a starter with the shape in place, plus a hint in a comment. Later lessons can ask for more from a blank page.
- **Keep ids stable.** Lesson, task, question and card ids are stored with a learner's progress. Change the content behind an id freely, but only rename an id if the idea behind it is gone.

## Revisions

Raise `revision:` whenever a lesson changes in a way a learner who already finished it should know about. They'll see "Rewritten since you finished: worth a re-read".
