#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, readFileSync } from 'node:fs';
import { fetchSources } from './lib/source-fetcher.js';
import { buildComparePrompt, buildVerifyPrompt } from './lib/prompt-builder.js';
import { routeToAI, hasCLIBackend } from './lib/ai-router.js';
import { processOutput } from './lib/output-processor.js';
import { getConfig, setConfig, deleteConfig, listConfig, resetConfig } from './lib/config.js';

const program = new Command();

program
  .name('loom')
  .description('Source-grounded comparison and verification tool')
  .version('0.2.0');

// --- config subcommand ---

const configCmd = new Command('config')
  .description('Manage local configuration (apiKey, apiBase, model)');

configCmd
  .command('set <key> <value>')
  .description('Set a config value')
  .action((key: string, value: string) => {
    setConfig(key, value);
    console.log(chalk.green(`✓ ${key} saved to ${key === 'apiKey' ? '***' : value}`));
  });

configCmd
  .command('get <key>')
  .description('Get a config value')
  .action((key: string) => {
    const value = getConfig(key);
    if (value === undefined) {
      console.log(chalk.yellow(`${key} is not set`));
    } else {
      console.log(key === 'apiKey' ? `${key}: ***` : `${key}: ${value}`);
    }
  });

configCmd
  .command('delete <key>')
  .description('Delete a config value')
  .action((key: string) => {
    const removed = deleteConfig(key);
    if (removed) {
      console.log(chalk.green(`✓ ${key} removed`));
    } else {
      console.log(chalk.yellow(`${key} was not set`));
    }
  });

configCmd
  .command('list')
  .description('List all config values (apiKey masked)')
  .action(() => {
    const config = listConfig();
    const entries = Object.entries(config);
    if (entries.length === 0) {
      console.log(chalk.dim('No config values set'));
      return;
    }
    for (const [key, value] of entries) {
      const display = key === 'apiKey' ? '***' : value;
      console.log(`  ${key}: ${display}`);
    }
  });

configCmd
  .command('reset')
  .description('Delete all config and the config directory')
  .action(() => {
    resetConfig();
    console.log(chalk.green('✓ All config cleared'));
  });

program.addCommand(configCmd);

// --- verify subcommand ---

program
  .command('verify')
  .description('Verify claims in a text file against source URLs')
  .argument('<file>', 'Text file to verify (use - for stdin)')
  .requiredOption('-s, --sources <urls...>', 'Source URLs to verify against')
  .option('-o, --output <file>', 'Output file path (defaults to stdout)')
  .option('-m, --model <model>', 'Model override (for BYOK API mode)')
  .option('--api-key <key>', 'API key for BYOK mode (prefer config or env var)')
  .action(async (file: string, options: {
    sources: string[];
    output?: string;
    model?: string;
    apiKey?: string;
  }) => {
    // Read text to verify
    let text: string;
    if (file === '-') {
      // Read from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(Buffer.from(chunk));
      }
      text = Buffer.concat(chunks).toString('utf-8');
    } else {
      text = readFileSync(file, 'utf-8');
    }

    if (!text.trim()) {
      console.error(chalk.red('Error: Input text is empty'));
      process.exit(1);
    }

    // Step 1: Fetch sources
    const spinner = ora('Fetching sources...').start();
    const sources = await fetchSources(options.sources);
    const fetched = sources.filter((s) => s.content.length > 0);

    if (fetched.length === 0) {
      spinner.fail('Could not extract content from any source URL');
      process.exit(1);
    }

    spinner.succeed(`Fetched ${fetched.length}/${sources.length} sources`);

    for (const s of sources) {
      const status = s.content ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${status} ${s.id}: ${s.title}`);
    }

    // Step 2: Build verify prompt
    spinner.start('Building verification prompt...');
    const prompt = buildVerifyPrompt(text, sources);
    spinner.succeed('Prompt built');

    // Step 3: Route to AI
    spinner.start('Sending to AI backend...');
    try {
      if (options.model) {
        process.env.LOOM_MODEL = options.model;
      }
      if (options.apiKey) {
        process.env.LOOM_API_KEY = options.apiKey;
      }

      const aiResponse = await routeToAI(
        prompt,
        sources.map((s) => ({ id: s.id, content: s.content })),
      );

      spinner.succeed(`AI response received (${aiResponse.backend}, model: ${aiResponse.model})`);

      // Step 4: Process output
      spinner.start('Processing output...');
      const result = processOutput(aiResponse.content, { mode: 'verify' });
      spinner.succeed('Output processed');

      // Step 5: Write output
      if (options.output) {
        writeFileSync(options.output, result.rendered, 'utf-8');
        console.log(chalk.green(`\nOutput written to ${options.output}`));
      } else {
        console.log('\n' + result.rendered);
      }

      // Print compliance summary to stderr
      console.error(chalk.dim(`\n--- Compliance ---`));
      console.error(chalk.dim(`Evidence tags: ${result.compliance.hasEvidenceTags ? '✓' : '✗'}`));
      console.error(chalk.dim(`Source references: ${result.compliance.sourceRefCount}`));
    } catch (err) {
      spinner.fail('AI processing failed');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

// --- compare (default hidden command) ---

program
  .command('compare', { isDefault: true, hidden: true })
  .argument('<topic>', 'Comparison topic (e.g. "React vs Vue for enterprise")')
  .option('-s, --sources <urls...>', 'Source URLs (required in BYOK mode, optional with Claude/Codex CLI)')
  .option('-o, --output <file>', 'Output full report to file (card always goes to stdout)')
  .option('--full', 'Output card + full report to stdout')
  .option('-m, --model <model>', 'Model override (for BYOK API mode)')
  .option('--api-key <key>', 'API key for BYOK mode (prefer config or env var)')
  .action(async (topic: string, options: {
    sources?: string[];
    output?: string;
    full?: boolean;
    model?: string;
    apiKey?: string;
  }) => {
    const hasSources = options.sources && options.sources.length > 0;
    const hasCLI = hasCLIBackend();

    // Determine mode
    const autoSource = !hasSources && hasCLI;

    if (!hasSources && !hasCLI) {
      console.error(chalk.red('Error: No AI backend detected and no source URLs provided.\n'));
      console.error('  Options:');
      console.error('    1. Install Claude CLI or Codex CLI for auto-source search');
      console.error('    2. Provide source URLs: loom compare "X" -s url1 url2 url3');
      console.error('    3. Configure BYOK API key: loom config set apiKey <key>');
      process.exit(1);
    }

    // Step 1: Fetch sources (if provided)
    let sources: Awaited<ReturnType<typeof fetchSources>> = [];
    if (hasSources) {
      const spinner = ora('Fetching sources...').start();
      sources = await fetchSources(options.sources!);
      const fetched = sources.filter((s) => s.content.length > 0);

      if (fetched.length === 0) {
        spinner.fail('Could not extract content from any source URL');
        process.exit(1);
      }

      spinner.succeed(`Fetched ${fetched.length}/${sources.length} sources`);

      for (const s of sources) {
        const status = s.content ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${status} ${s.id}: ${s.title}`);
      }
    }

    // Step 2: Build compare prompt
    const spinner = ora('Building comparison prompt...').start();
    const prompt = buildComparePrompt(
      topic,
      hasSources ? sources : undefined,
      autoSource,
    );
    spinner.succeed('Prompt built');

    // Step 3: Route to AI
    spinner.start('Sending to AI backend...');
    try {
      if (options.model) {
        process.env.LOOM_MODEL = options.model;
      }
      if (options.apiKey) {
        process.env.LOOM_API_KEY = options.apiKey;
      }

      const sourcePayload = hasSources
        ? sources.map((s) => ({ id: s.id, content: s.content }))
        : [];

      const aiResponse = await routeToAI(
        prompt,
        sourcePayload,
        { autoSource },
      );

      spinner.succeed(`AI response received (${aiResponse.backend}, model: ${aiResponse.model})`);

      // Step 4: Process output
      spinner.start('Processing output...');
      const result = processOutput(aiResponse.content, { mode: 'compare' });
      spinner.succeed('Output processed');

      // Step 5: Write output
      // Card always to stdout
      if (result.card) {
        console.log('\n' + result.card);
      } else {
        // No separator found — just show full output
        console.log('\n' + result.raw);
      }

      // Report to file (-o) or stdout (--full)
      if (options.output) {
        writeFileSync(options.output, result.rendered, 'utf-8');
        console.log(chalk.green(`\nFull report written to ${options.output}`));
      } else if (options.full) {
        console.log('\n---\n' + result.report);
      }

      // Print compliance summary to stderr
      console.error(chalk.dim(`\n--- Compliance ---`));
      console.error(chalk.dim(`Evidence tags: ${result.compliance.hasEvidenceTags ? '✓' : '✗'}`));
      console.error(chalk.dim(`Conflict section: ${result.compliance.hasConflictSection ? '✓' : '✗'}`));
      console.error(chalk.dim(`Unverified claims: ${result.compliance.unverifiedCount}`));
      console.error(chalk.dim(`Source references: ${result.compliance.sourceRefCount}`));
    } catch (err) {
      spinner.fail('AI processing failed');
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

program.parse();
