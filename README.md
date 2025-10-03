# PQS - Project Quick Start

PQS is a command-line tool for automating the creation of new projects from templates. It allows developers to maintain a collection of project templates and quickly scaffold new projects with customized configurations.

## Installation

```bash
npm install -g @basementuniverse/pqs
```

## Usage

```bash
# Show version
pqs version
pqs v

# Show help
pqs
pqs help
pqs h

# List available templates
pqs list
pqs l

# Create a new project from a template
# The project will be created in the current directory
pqs create <template-name> [options]
pqs c <template-name> [options]
```

## Options

- `--output <directory>` or `-o <directory>`: Specify the output directory for the new project. If not provided, the current directory will be used.
- `--force` or `-f`: Force the creation of the project even if the output directory is not empty.
- `--dry-run` or `-d`: Perform a dry run, showing what would be done without actually creating the project.

If we specify an output directory, template files will be placed directly in this directory. If we do not specify an output directory, a new directory will be created with the name of the project (as provided by the user in `projectName`, `name`, or `project` values). If a project name cannot be determined, we use `new-project` as the directory name.

## Global configuration

PQS uses a global configuration file to define locations for templates and other settings. The configuration file should be placed in one of the following locations (we will check them in this order):

1. `./pqs.config.json` (in the current working directory)
2. `~/.pqs.config.json` (in the user's home directory)
3. `/etc/pqs.config.json` (system-wide configuration)

The configuration file should look something like this:

```json
{
  "templateLocations": [
    "~/templates"
  ]
}
```

#### `templateLocations`

An array of directories where PQS will look for project templates. We're basically searching for `pqs.config.js` files in these directories, or in their immediate subdirectories. Every directory where we find such a file is considered a template.

## Template configuration

```js
module.exports = {
  // The name of the template, used in the CLI command
  name: 'js-express',

  // An optional description of the template
  description: 'A minimal JavaScript project template for testing PQS',

  // Default values for placeholders and answers to questions
  values: {
    name: 'My JS Project',
    version: '0.0.1',
    description: 'A simple JavaScript project',
    author: process.env.USER || 'Your Name',
    initialiseGit: true,
  },

  // Questions to ask the user when creating a new project
  // If a question has an argument/shortArgument and the user has provided it on the command line, we will skip the question
  questions: [
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      argument: 'name',
      shortArgument: '-n',
      validate: (input) => input.length > 0 || 'Project name is required',
    },
    {
      type: 'input',
      name: 'description',
      message: 'Project description:',
      argument: 'description',
      shortArgument: '-d',
    },
    {
      type: 'input',
      name: 'author',
      message: 'Author:',
      argument: 'author',
      shortArgument: '-a',
    },
    {
      type: 'confirm',
      name: 'initialiseGit',
      message: 'Initialise git repository?',
      argument: 'git',
      shortArgument: '-g',
    },
  ],

  // Exclude certain files or directories from being copied from the template to the new project
  // These are glob patterns, e.g.:
  // - 'node_modules/**' would exclude the node_modules directory and all its contents
  // - '*.log' would exclude all .log files in the root of the template
  // - '**/*.log' would exclude all .log files in the template and its subdirectories
  // - '!README.md' would exclude everything except README.md (i.e. README.md would be included)
  exclude: [
    'pqs.config.js',
    '**/node_modules/**',
    '**/.git/**',
    '.DS_Store',
  ],

  // Steps to execute after creating the project
  steps: [
    {
      type: 'replace',
      // Each entry is a glob pattern, e.g:
      // - ['*'] would do substitutions in all files in the root of the template
      // - ['**/*'] would do substitutions in all files in the template and its subdirectories
      // - ['src/**/*.js'] would do substitutions in all .js files in the src directory and its subdirectories
      // - ['!README.md'] would exclude README.md from substitutions
      files: ['package.json', 'README.md', 'index.js'],
    },
    {
      type: 'command',
      command: 'npm install',
      description: 'Installing dependencies...',
    },
    {
      type: 'command',
      condition: (answers) => answers.initialiseGit,
      command: 'git init',
      description: 'Initializing git repository...',
    },
  ],
};
```

## Template substitutions

We can substitute placeholders in any text file within the template. Placeholders are defined using double curly braces, like this: `{{PQS:placeholderName}}`.

When creating a new project, PQS will replace these placeholders with the corresponding values from the `values` object or the user's answers to the questions.

Some transformations and aliases are also available:

- `{{PQS:UPPER(placeholderName)}}`: Converts the value to uppercase.
- `{{PQS:LOWER(placeholderName)}}`: Converts the value to lowercase.
- `{{PQS:CAMEL(placeholderName)}}`: Converts the value to camelCase.
- `{{PQS:KEBAB(placeholderName)}}`: Converts the value to kebab-case.
- `{{PQS:SNAKE(placeholderName)}}`: Converts the value to snake_case.
- `{{PQS:PASCAL(placeholderName)}}`: Converts the value to PascalCase.
- `{{PQS:TITLE(placeholderName)}}`: Converts the value to Title Case.
- `{{PQS:SLUG(placeholderName)}}`: Converts the value to a URL-friendly slug.
- `{{PQS:DATE(pattern)}}`: Inserts the current date/time formatted according to the provided pattern (using `date-fns` formatting).
- `{{PQS:UUID()}}`: Inserts a newly generated UUID.
