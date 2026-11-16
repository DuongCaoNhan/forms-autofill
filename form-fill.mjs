// Fill a Microsoft Forms response page from answers.json and submit it, N times.
//
//   node form-fill.mjs --no-submit          # test: fill once, don't submit, leave the window open
//   node form-fill.mjs                      # fill + submit once
//   node form-fill.mjs --runs 10            # loop 10 times
//   node form-fill.mjs --url "<new link>" --answers other.json
//
// answers.json: { "url": "...", "answers": [ ... ] }, either
//   - one entry per question in form order, or
//   - { "question": "<title>", "answer": ... } objects, matched by question title (any order;
//     an unmatched question stops the run before submitting).
// Each answer:
//   "B"            -> choice by letter (A = first option) when no option is literally named "B"
//   "Option text"  -> choice whose label matches exactly, or text typed into a text question
//   ["A", "C"]     -> checkbox question: tick all; radio question: the first one the form offers
//   null           -> skip the question
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string' },
    answers: { type: 'string', default: 'answers.json' },
    runs: { type: 'string', default: '1' },
    'no-submit': { type: 'boolean', default: false },
  },
});

const config = JSON.parse(await readFile(args.answers, 'utf8'));
const url = args.url ?? config.url;
const answers = config.answers;
const runs = Number(args.runs);
if (!url || !Array.isArray(answers) || !(runs > 0)) {
  throw new Error('Need a url (in answers.json or --url), an "answers" array, and --runs > 0');
}

const byTitle = answers.length > 0 && answers.every((a) => a && typeof a === 'object' && 'question' in a);

// "12. Chọn button Edit *" -> "chọn button edit"
const normalize = (s) =>
  String(s).replace(/^\s*\d+[.)]\s*/, '').replace(/\*\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Exact title match first, else the longest listed question contained in the title.
function answerFor(title) {
  const t = normalize(title);
  const exact = answers.find((a) => normalize(a.question) === t);
  if (exact) return exact;
  return answers
    .filter((a) => t.includes(normalize(a.question)))
    .sort((a, b) => b.question.length - a.question.length)[0];
}

const SEL = {
  question: '[data-automation-id="questionItem"]',
  next: '[data-automation-id="nextButton"]',
  submit: '[data-automation-id="submitButton"]',
};

// Persistent profile: you sign in once in this window; later runs reuse the session.
let context;
try {
  context = await chromium.launchPersistentContext(path.resolve('.profile'), {
    channel: 'msedge', // Edge ships with Windows, so no browser download
    headless: false,
    viewport: null,
  });
} catch (err) {
  // Usually a window from an earlier run still holds the .profile folder.
  console.error(err.message.split('\n')[0]);
  console.error('Không mở được Edge: có thể cửa sổ Edge của lần chạy trước vẫn đang mở. Đóng nó rồi chạy lại.');
  process.exit(1);
}
const page = context.pages()[0] ?? (await context.newPage());

async function openForm() {
  await page.goto(url);
  console.log('Waiting for the form (sign in in the browser window if asked)...');
  // Some forms open on a cover page with a "Click to start" button before the questions.
  const start = page.getByRole('button', { name: /start/i });
  const question = page.locator(SEL.question).first();
  await question.or(start).first().waitFor({ timeout: 0 });
  if (await start.isVisible()) {
    await start.click();
    console.log('  Clicked start');
  }
  await question.waitFor({ timeout: 0 });
}

async function pickChoice(question, role, answer) {
  const byName = question.getByRole(role, { name: answer, exact: true });
  if ((await byName.count()) > 0) return byName.first().check({ force: true });
  if (/^[A-Z]$/i.test(answer)) {
    const index = answer.toUpperCase().charCodeAt(0) - 65;
    const options = question.getByRole(role);
    if (index < (await options.count())) return options.nth(index).check({ force: true });
  }
  throw new Error(`No option "${answer}"`);
}

async function pickFirstAvailable(question, role, candidates) {
  for (const c of candidates) {
    try {
      return await pickChoice(question, role, String(c));
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`None of ${JSON.stringify(candidates)} is an option`);
}

async function fillQuestion(question, answer, number) {
  // The number ("1.") can sit on its own line, so take the first line with text after it.
  const lines = (await question.innerText()).split('\n');
  const title = (lines.find((l) => normalize(l) !== '') ?? lines[0]).trim();
  if (byTitle) {
    const entry = answerFor(title);
    if (!entry) throw new Error(`Q${number} "${title}": no matching "question" in answers.json`);
    answer = entry.answer;
  }
  if (answer === null || answer === undefined) return;
  try {
    if ((await question.getByRole('radio').count()) > 0) {
      await pickFirstAvailable(question, 'radio', [answer].flat());
    } else if ((await question.getByRole('checkbox').count()) > 0) {
      for (const a of [answer].flat()) await pickChoice(question, 'checkbox', String(a));
    } else {
      await question.getByRole('textbox').first().fill(String(answer));
    }
    console.log(`  Q${number} ok: ${title}`);
  } catch (err) {
    throw new Error(`Q${number} "${title}": ${err.message}`);
  }
}

async function fillAllPages() {
  let n = 0;
  for (;;) {
    const questions = await page.locator(SEL.question).all();
    for (const q of questions) {
      await fillQuestion(q, answers[n], n + 1);
      n++;
    }
    const next = page.locator(SEL.next);
    if (!(await next.isVisible())) break;
    await next.click();
    await page.locator(SEL.question).first().waitFor();
  }
  if (!byTitle && n !== answers.length) console.warn(`  Warning: form has ${n} questions, answers.json has ${answers.length}`);
}

async function submit() {
  const button = page.locator(SEL.submit);
  await button.click();
  await button.waitFor({ state: 'detached', timeout: 30_000 }); // gone = thank-you page shown
}

try {
  for (let i = 1; i <= runs; i++) {
    console.log(`Run ${i}/${runs}`);
    await openForm();
    await fillAllPages();
    if (args['no-submit']) {
      console.log('Filled, not submitted (--no-submit). Check the form, then close the browser.');
      await page.waitForEvent('close', { timeout: 0 });
      break;
    }
    await submit();
    console.log(`  Submitted run ${i}`);
  }
} finally {
  await context.close().catch(() => {});
}
