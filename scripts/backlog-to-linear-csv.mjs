#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    input: 'BACKLOG.md',
    output: 'output/linear-backlog-open.csv',
    mode: 'open',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--output' && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--mode' && argv[i + 1]) {
      args.mode = argv[i + 1];
      i += 1;
      continue;
    }
  }

  if (!['open', 'all'].includes(args.mode)) {
    throw new Error(`Unsupported mode: ${args.mode}. Use "open" or "all".`);
  }

  return args;
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function parseBacklog(content) {
  const lines = content.split(/\r?\n/);
  const tasks = [];
  let currentStage = '';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const stageMatch = line.match(/^##\s+(Этап\s+\d+:\s+.+)$/);
    if (stageMatch) {
      currentStage = stageMatch[1].trim();
      continue;
    }

    const taskMatch = line.match(/^- \[( |x)\] \[([A-Z]+)\]-\[(\d+)\] (.+)$/);
    if (!taskMatch) {
      continue;
    }

    const task = {
      done: taskMatch[1] === 'x',
      area: taskMatch[2],
      number: taskMatch[3],
      id: `${taskMatch[2]}-${taskMatch[3]}`,
      title: taskMatch[4].trim(),
      stage: currentStage,
      context: '',
      dod: '',
    };

    let activeField = '';
    for (let j = i + 1; j < lines.length; j += 1) {
      const nextLine = lines[j];
      if (
        /^- \[( |x)\] \[([A-Z]+)\]-\[(\d+)\] /.test(nextLine) ||
        /^##\s+/.test(nextLine)
      ) {
        break;
      }

      const contextMatch = nextLine.match(/^Task Context:\s*(.*)$/);
      if (contextMatch) {
        task.context = contextMatch[1].trim();
        activeField = 'context';
        continue;
      }

      const dodMatch = nextLine.match(/^Task DOD:\s*(.*)$/);
      if (dodMatch) {
        task.dod = dodMatch[1].trim();
        activeField = 'dod';
        continue;
      }

      const trimmed = nextLine.trim();
      if (!trimmed || !activeField) {
        continue;
      }

      task[activeField] = `${task[activeField]} ${trimmed}`.trim();
    }

    tasks.push(task);
  }

  return tasks;
}

function toLinearCsvRows(tasks, mode) {
  const header = [
    'Title',
    'Description',
    'Priority',
    'Status',
    'Assignee',
    'Labels',
    'Estimate',
    'Created',
    'Completed',
  ];

  const filtered = mode === 'open' ? tasks.filter((task) => !task.done) : tasks;

  const rows = [header];
  for (const task of filtered) {
    const descriptionParts = [
      `Source: BACKLOG.md`,
      `ID: ${task.id}`,
      task.stage ? `Этап: ${task.stage}` : '',
      '',
      task.context ? `Task Context: ${task.context}` : 'Task Context: (not specified)',
      '',
      task.dod ? `Task DOD: ${task.dod}` : 'Task DOD: (not specified)',
    ].filter(Boolean);

    const status = task.done ? 'Done' : 'Backlog';
    const labels = `backlog,area-${task.area.toLowerCase()}`;

    rows.push([
      `[${task.id}] ${task.title}`,
      descriptionParts.join('\n'),
      '',
      status,
      '',
      labels,
      '',
      '',
      '',
    ]);
  }

  return rows;
}

function serializeCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);

  const backlog = readFileSync(inputPath, 'utf8');
  const tasks = parseBacklog(backlog);
  const rows = toLinearCsvRows(tasks, args.mode);
  const csv = serializeCsv(rows);

  writeFileSync(outputPath, csv, 'utf8');

  const total = tasks.length;
  const open = tasks.filter((task) => !task.done).length;
  const exported = rows.length - 1;

  process.stdout.write(
    `Parsed ${total} tasks (${open} open). Exported ${exported} tasks to ${outputPath}\n`,
  );
}

main();
