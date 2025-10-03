#!/usr/bin/env node

const { Command } = require('commander');
const {
  input,
  confirm,
  select,
  checkbox,
  Separator,
} = require('@inquirer/prompts');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const { glob } = require('glob');
const pkg = require('../package.json');
const { v4: uuid } = require('uuid');
const { format } = require('date-fns');
const TemplateSource = require('./template-source');

const execAsync = promisify(exec);

/**
 * Main PQS class for project quick start functionality
 */
class PQS {
  constructor() {
    this.config = null;
    this.templates = new Map();
  }

  /**
   * Load configuration from various locations
   * Searches for config files in order: current directory, home directory, etc.
   */
  async loadConfig() {
    const configPaths = [
      path.join(process.cwd(), 'pqs.config.json'),
      path.join(os.homedir(), '.pqs', 'pqs.config.json'),
      path.join(os.homedir(), '.pqs.config.json'),
      '/etc/pqs.config.json',
    ];

    for (const configPath of configPaths) {
      try {
        if (await fs.pathExists(configPath)) {
          this.config = await fs.readJson(configPath);
          console.log(`Using config from: ${configPath}`);
          return;
        }
      } catch (error) {
        // Continue to next config path
      }
    }

    // Default configuration if no config file found
    this.config = {
      templateLocations: [path.join(os.homedir(), 'templates')],
    };
    console.log(
      'No config file found, using default template location: ~/templates'
    );
  }

  /**
   * Discover templates by finding pqs.config.js files in all configured locations
   */
  async discoverTemplates() {
    this.templates.clear();

    // Create TemplateSource instances for all configured locations
    const templateSources = TemplateSource.fromArray(
      this.config.templateLocations
    );

    for (const source of templateSources) {
      try {
        // Check if the source is available before trying to discover templates
        if (!(await source.isAvailable())) {
          const displayInfo = source.getDisplayInfo();
          console.warn(
            `Warning: Template source not available: ${displayInfo.display}`
          );
          continue;
        }

        // Discover templates in this source
        const templates = await source.discoverTemplates();

        // Add discovered templates to our collection
        for (const template of templates) {
          this.templates.set(template.name, template);
        }
      } catch (error) {
        const displayInfo = source.getDisplayInfo();
        console.warn(
          `Warning: Failed to discover templates in ${displayInfo.display}: ${error.message}`
        );
      }
    }
  }

  /**
   * List all available templates to the console
   */
  listTemplates() {
    if (this.templates.size === 0) {
      console.log('No templates found.');
      return;
    }

    console.log('Available templates:');
    for (const [name, template] of this.templates) {
      let sourceInfo = '';
      if (template.isRemote && template.sourceInfo) {
        sourceInfo = ` (remote: ${template.sourceInfo.host}/${template.sourceInfo.full})`;
      } else if (!template.isRemote) {
        sourceInfo = ` (local: ${template.source})`;
      }

      console.log(
        `  ${name}${
          template.description ? ` - ${template.description}` : ''
        }${sourceInfo}`
      );
    }
  }

  /**
   * Transform text based on transformation functions
   * @param {string} text - The text to transform
   * @param {string} transformation - The transformation type (UPPER, LOWER, CAMEL, etc.)
   * @returns {string} The transformed text
   */
  transformText(text, transformation) {
    switch (transformation.toUpperCase()) {
      case 'UPPER':
        return text.toUpperCase();
      case 'LOWER':
        return text.toLowerCase();
      case 'CAMEL':
        return text.replace(/[-_\s]+(.)?/g, (_, char) =>
          char ? char.toUpperCase() : ''
        );
      case 'KEBAB':
        return text
          .toLowerCase()
          .replace(/[_\s]+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
      case 'SNAKE':
        return text
          .toLowerCase()
          .replace(/[-\s]+/g, '_')
          .replace(/[^a-z0-9_]/g, '');
      case 'PASCAL':
        return text
          .replace(/[-_\s]+(.)?/g, (_, char) =>
            char ? char.toUpperCase() : ''
          )
          .replace(/^(.)/, (_, char) => char.toUpperCase());
      case 'TITLE':
        return text.replace(
          /\w\S*/g,
          txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
      case 'SLUG':
        return text
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
      default:
        return text;
    }
  }

  /**
   * Generate a UUID v4
   * @returns {string} A new UUID
   */
  generateUUID() {
    return uuid();
  }

  /**
   * Format the current date using date-fns with backward compatibility for legacy patterns
   * @param {string} pattern - The date format pattern (supports both date-fns and legacy formats)
   * @returns {string} The formatted date string
   */
  formatDate(pattern) {
    const now = new Date();

    // Convert legacy patterns to date-fns format patterns for backward
    // compatibility
    const legacyPatterns = {
      YYYY: 'yyyy',
      MM: 'MM',
      DD: 'dd',
      HH: 'HH',
      mm: 'mm',
      ss: 'ss',
    };

    // Check if the pattern contains legacy patterns and convert them
    let dateFnsPattern = pattern;
    for (const [legacy, dateFns] of Object.entries(legacyPatterns)) {
      dateFnsPattern = dateFnsPattern.replace(new RegExp(legacy, 'g'), dateFns);
    }

    try {
      // Use date-fns format function
      return format(now, dateFnsPattern);
    } catch (error) {
      // Fallback to original pattern if date-fns format fails
      console.warn(
        `Warning: Invalid date format pattern '${pattern}', using fallback`
      );
      return pattern
        .replace('YYYY', now.getFullYear())
        .replace('MM', String(now.getMonth() + 1).padStart(2, '0'))
        .replace('DD', String(now.getDate()).padStart(2, '0'))
        .replace('HH', String(now.getHours()).padStart(2, '0'))
        .replace('mm', String(now.getMinutes()).padStart(2, '0'))
        .replace('ss', String(now.getSeconds()).padStart(2, '0'));
    }
  }

  /**
   * Perform placeholder substitutions in content using {{PQS:placeholder}} syntax
   * @param {string} content - The content to process
   * @param {object} values - The values to substitute
   * @returns {string} The content with substitutions performed
   */
  performSubstitutions(content, values) {
    return content.replace(/\{\{PQS:([^}]+)\}\}/g, (match, placeholder) => {
      // Handle transformations
      const transformMatch = placeholder.match(/^(\w+)\(([^)]+)\)$/);
      if (transformMatch) {
        const [, transform, arg] = transformMatch;

        if (transform === 'DATE') {
          return this.formatDate(arg);
        } else if (transform === 'UUID') {
          return this.generateUUID();
        } else if (values[arg] !== undefined) {
          return this.transformText(String(values[arg]), transform);
        }
      }

      // Direct placeholder replacement
      if (values[placeholder] !== undefined) {
        return String(values[placeholder]);
      }

      return match; // Leave unchanged if no replacement found
    });
  }

  /**
   * Extract command line arguments that correspond to template questions
   * @param {object} options - The command line options object
   * @returns {object} Filtered arguments excluding built-in CLI options
   */
  getCliArgs(options) {
    const args = {};

    // Copy all options to args, excluding the built-in CLI options
    const builtInOptions = new Set(['output', 'force', 'dryRun']);

    for (const [key, value] of Object.entries(options)) {
      if (!builtInOptions.has(key) && value !== undefined) {
        args[key] = value;
      }
    }

    return args;
  }

  /**
   * Ask user questions defined in the template, skipping those provided via CLI
   * @param {object} template - The template object containing questions
   * @param {object} cliArgs - Command line arguments that may answer questions
   * @returns {object} The answers to all questions
   */
  async askQuestions(template, cliArgs) {
    const answers = {};

    for (const question of template.questions || []) {
      // Skip if provided via CLI - check by argument name first, then by question name
      if (question.argument && cliArgs[question.argument] !== undefined) {
        answers[question.name] = cliArgs[question.argument];
        continue;
      }
      if (cliArgs[question.name] !== undefined) {
        answers[question.name] = cliArgs[question.name];
        continue;
      }

      try {
        let answer;
        switch (question.type) {
          case 'confirm':
            answer = await confirm({
              message: question.message,
              default: question.default,
            });
            break;
          case 'input':
            answer = await input({
              message: question.message,
              default: question.default,
              validate: question.validate,
            });
            break;
          case 'select':
            answer = await select({
              message: question.message,
              choices: question.choices.map(choice => {
                if (typeof choice === 'string' && choice === '---') {
                  return new Separator();
                }
                return choice;
              }),
              default: question.default,
            });
            break;
          case 'checkbox':
            answer = await checkbox({
              message: question.message,
              choices: question.choices.map(choice => {
                if (typeof choice === 'string' && choice === '---') {
                  return new Separator();
                }
                return choice;
              }),
              default: question.default,
            });
            break;
          default:
            throw new Error(`Unknown question type: ${question.type}`);
        }

        answers[question.name] = answer;
      } catch (error) {
        if (error.name === 'ExitPromptError') {
          console.log('\nOperation cancelled.');
          process.exit(0);
        }
        throw error;
      }
    }

    return answers;
  }

  /**
   * Copy template files to output directory with exclusion patterns
   * @param {string} templatePath - Source template directory path
   * @param {string} outputPath - Destination directory path
   * @param {string[]} excludePatterns - Array of glob patterns to exclude
   * @param {boolean} dryRun - Whether to perform a dry run (list files only)
   * @returns {string[]} Array of files that were copied (or would be copied in dry run)
   */
  async copyTemplate(
    templatePath,
    outputPath,
    excludePatterns,
    dryRun = false
  ) {
    const allFiles = await glob('**/*', {
      cwd: templatePath,
      dot: true,
      nodir: true,
    });

    // Convert excludePatterns to proper glob patterns if they aren't already
    const normalizedExcludePatterns = excludePatterns.map(pattern => {
      // If it's already a glob pattern (contains * ? [ ]), leave it as is
      if (/[*?[\]]/.test(pattern)) {
        return pattern;
      }

      // For simple names like '.git', make it match directories specifically
      // This prevents '.git' from matching '.gitignore'
      if (pattern.startsWith('.') && !pattern.includes('/')) {
        return `**/${pattern}/**`;
      }

      // For other simple patterns, make them match anywhere in the path
      return `**/${pattern}/**`;
    });

    // Use minimatch (which glob uses internally) to filter files
    const { minimatch } = require('minimatch');

    const filesToCopy = allFiles.filter(file => {
      return !normalizedExcludePatterns.some(pattern => {
        // Check if the file path matches the exclude pattern
        return (
          minimatch(file, pattern) ||
          minimatch(file, pattern.replace('/**', ''))
        );
      });
    });

    if (dryRun) {
      console.log('Files that would be copied:');
      filesToCopy.forEach(file => console.log(`  ${file}`));
      return filesToCopy;
    }

    for (const file of filesToCopy) {
      const srcPath = path.join(templatePath, file);
      const destPath = path.join(outputPath, file);

      await fs.ensureDir(path.dirname(destPath));
      await fs.copy(srcPath, destPath);
    }

    return filesToCopy;
  }

  /**
   * Process a replace step that substitutes placeholders in files
   * @param {object} step - The replace step configuration
   * @param {string} outputPath - The output directory path
   * @param {object} values - Values for placeholder substitution
   * @param {boolean} dryRun - Whether to perform a dry run
   */
  async processReplaceStep(step, outputPath, values, dryRun = false) {
    const filesToProcess = [];

    for (const filePattern of step.files) {
      const matchedFiles = await glob(filePattern, { cwd: outputPath });
      filesToProcess.push(...matchedFiles);
    }

    if (dryRun) {
      console.log(
        `  Replace step would process files: ${filesToProcess.join(', ')}`
      );
      return;
    }

    for (const file of filesToProcess) {
      const filePath = path.join(outputPath, file);

      try {
        const content = await fs.readFile(filePath, 'utf8');
        const processedContent = this.performSubstitutions(content, values);
        await fs.writeFile(filePath, processedContent, 'utf8');
      } catch (error) {
        // Skip binary files or files we can't process
        continue;
      }
    }
  }

  /**
   * Process a command step that executes a shell command
   * @param {object} step - The command step configuration
   * @param {string} outputPath - The output directory path to run command in
   * @param {object} answers - User answers for condition evaluation
   * @param {boolean} dryRun - Whether to perform a dry run
   */
  async processCommandStep(step, outputPath, answers, dryRun = false) {
    // Check condition if present
    if (step.condition && !step.condition(answers)) {
      return;
    }

    if (dryRun) {
      console.log(`  Command step would run: ${step.command}`);
      return;
    }

    if (step.description) {
      console.log(step.description);
    }

    try {
      const { stdout, stderr } = await execAsync(step.command, {
        cwd: outputPath,
      });
      if (stdout) {
        console.log(stdout);
      }
      if (stderr) {
        console.error(stderr);
      }
    } catch (error) {
      console.error(`Command failed: ${error.message}`);
    }
  }

  /**
   * Process a copy step that copies specific files or directories from template
   * @param {object} step - The copy step configuration
   * @param {string} templatePath - The template source directory path
   * @param {string} outputPath - The output directory path
   * @param {object} answers - User answers for condition evaluation
   * @param {boolean} dryRun - Whether to perform a dry run
   */
  async processCopyStep(
    step,
    templatePath,
    outputPath,
    answers,
    dryRun = false
  ) {
    // Check condition if present
    if (step.condition && !step.condition(answers)) {
      return;
    }

    const source = step.source;
    const destination = step.destination || source;
    const excludePatterns = step.exclude || [];

    const sourcePath = path.join(templatePath, source);
    const destPath = path.join(outputPath, destination);

    if (dryRun) {
      console.log(`  Copy step would copy '${source}' to '${destination}'`);
      if (excludePatterns.length > 0) {
        console.log(`    Excluding: ${excludePatterns.join(', ')}`);
      }
      return;
    }

    try {
      // Check if source exists
      if (!(await fs.pathExists(sourcePath))) {
        console.warn(`Warning: Source path '${source}' not found in template`);
        return;
      }

      const sourceStats = await fs.stat(sourcePath);

      if (sourceStats.isDirectory()) {
        // Copy directory with exclusions
        const filesToCopy = await this.getFilesToCopy(
          sourcePath,
          excludePatterns
        );

        for (const file of filesToCopy) {
          const srcFilePath = path.join(sourcePath, file);
          const destFilePath = path.join(destPath, file);

          await fs.ensureDir(path.dirname(destFilePath));
          await fs.copy(srcFilePath, destFilePath);
        }
      } else {
        // Copy single file
        await fs.ensureDir(path.dirname(destPath));
        await fs.copy(sourcePath, destPath);
      }
    } catch (error) {
      console.error(`Failed to copy '${source}': ${error.message}`);
    }
  }

  /**
   * Helper method to get files to copy with exclusions applied
   * @param {string} sourcePath - The source directory path
   * @param {string[]} excludePatterns - Array of glob patterns to exclude
   * @returns {string[]} Array of file paths to copy
   */
  async getFilesToCopy(sourcePath, excludePatterns) {
    const allFiles = await glob('**/*', {
      cwd: sourcePath,
      dot: true,
      nodir: true,
    });

    if (excludePatterns.length === 0) {
      return allFiles;
    }

    // Use minimatch to filter files based on exclude patterns
    const { minimatch } = require('minimatch');

    return allFiles.filter(file => {
      return !excludePatterns.some(pattern => {
        return (
          minimatch(file, pattern) ||
          minimatch(file, pattern.replace('/**', ''))
        );
      });
    });
  }

  /**
   * Collect all unique options from all templates for dynamic CLI setup
   * @returns {Map} Map of option names to option configurations
   */
  async collectTemplateOptions() {
    await this.loadConfig();
    await this.discoverTemplates();

    const allOptions = new Map();
    const conflictingOptions = new Set([
      'output',
      'o',
      'force',
      'f',
      'dry-run',
      'd',
    ]);

    for (const [, template] of this.templates) {
      if (template.questions) {
        for (const question of template.questions) {
          // Check for long argument
          if (question.argument && !conflictingOptions.has(question.argument)) {
            allOptions.set(question.argument, {
              long: question.argument,
              short: question.shortArgument,
              description: question.message || `${question.name} option`,
              name: question.name,
            });
          }

          // Check for short argument (only if long argument doesn't conflict)
          if (
            question.shortArgument &&
            !conflictingOptions.has(question.shortArgument) &&
            !conflictingOptions.has(question.argument)
          ) {
            if (allOptions.has(question.argument)) {
              allOptions.get(question.argument).short = question.shortArgument;
            }
          }
        }
      }
    }

    return allOptions;
  }

  /**
   * Create a new project from a template
   * @param {string} templateName - The name of the template to use
   * @param {object} options - Command line options
   */
  async createProject(templateName, options) {
    await this.loadConfig();
    await this.discoverTemplates();

    const template = this.templates.get(templateName);
    if (!template) {
      console.error(`Template "${templateName}" not found.`);
      this.listTemplates();
      return;
    }

    console.log(`Creating project from template: ${template.name}`);

    if (options.dryRun) {
      console.log('\n--- DRY RUN MODE ---');
    }

    // Ask questions first to get the project name
    const cliArgs = this.getCliArgs(options);
    const answers = await this.askQuestions(template, cliArgs);

    // Determine output path - use provided output or default to slugified
    // project name
    let outputPath;
    if (options.output) {
      outputPath = path.resolve(options.output);
    } else {
      // Find the project name from answers - look for common project name
      // fields
      const projectName =
        answers.projectName || answers.name || answers.project || 'new-project';
      const slugifiedName = this.transformText(projectName, 'SLUG');
      outputPath = path.resolve(process.cwd(), slugifiedName);
    }

    // Check if output directory exists and is not empty
    if (await fs.pathExists(outputPath)) {
      const files = await fs.readdir(outputPath);
      if (files.length > 0 && !options.force) {
        console.error(
          `Output directory ${outputPath} is not empty. Use --force to override.`
        );
        return;
      }
    }

    console.log(`Output directory: ${outputPath}`);

    // Create output directory
    if (!options.dryRun) {
      await fs.ensureDir(outputPath);
    }

    // Copy template files
    console.log('\nCopying template files...');
    const copiedFiles = await this.copyTemplate(
      template.path,
      outputPath,
      template.exclude || [],
      options.dryRun
    );

    // Process steps
    if (template.steps) {
      console.log('\nProcessing template steps...');

      for (const step of template.steps) {
        if (step.type === 'replace') {
          await this.processReplaceStep(
            step,
            outputPath,
            {
              ...(template.values ?? {}),
              ...answers,
            },
            options.dryRun
          );
        } else if (step.type === 'command') {
          await this.processCommandStep(
            step,
            outputPath,
            answers,
            options.dryRun
          );
        } else if (step.type === 'copy') {
          await this.processCopyStep(
            step,
            template.path,
            outputPath,
            answers,
            options.dryRun
          );
        }
      }
    }

    if (options.dryRun) {
      console.log('\n--- END DRY RUN ---');
    } else {
      console.log('\nProject created successfully!');
    }
  }
}

/**
 * Set up the CLI with dynamic options based on available templates
 */
async function setupCLI() {
  const program = new Command();
  const pqs = new PQS();

  program
    .name('pqs')
    .description('PQS - Project Quick Start: Create projects from templates')
    .version(pkg.version);

  program
    .command('version')
    .alias('v')
    .description('Show version')
    .action(() => {
      console.log(`PQS version ${pkg.version}`);
    });

  program
    .command('list')
    .alias('l')
    .description('List available templates')
    .action(async () => {
      await pqs.loadConfig();
      await pqs.discoverTemplates();
      pqs.listTemplates();
    });

  // Create the create command with dynamic options
  const createCommand = program
    .command('create <template>')
    .alias('c')
    .description('Create a new project from a template')
    .option('-o, --output <directory>', 'Output directory')
    .option(
      '-f, --force',
      'Force creation even if output directory is not empty'
    )
    .option('-d, --dry-run', 'Perform a dry run');

  // Add dynamic options based on template configurations
  try {
    const templateOptions = await pqs.collectTemplateOptions();

    for (const [optionName, optionConfig] of templateOptions) {
      let optionFlag = `--${optionName}`;
      if (optionConfig.short) {
        optionFlag = `-${optionConfig.short}, --${optionName}`;
      }

      // Add value placeholder for input options
      optionFlag += ' <value>';

      createCommand.option(optionFlag, optionConfig.description);
    }
  } catch (error) {
    // If we can't load template options, just continue with basic options
    console.warn(
      'Warning: Could not load template options for dynamic CLI setup'
    );
  }

  createCommand.action(async (template, options) => {
    await pqs.createProject(template, options);
  });

  // Default help command
  program
    .command('help')
    .alias('h')
    .description('Show help')
    .action(() => {
      program.help();
    });

  // Show help by default if no command provided
  if (process.argv.length <= 2) {
    program.help();
  } else {
    program.parse();
  }
}

/**
 * Initialize the CLI application
 */
setupCLI().catch(error => {
  console.error('Failed to setup CLI:', error.message);
  process.exit(1);
});
