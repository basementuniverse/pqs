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
  questions: [
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      argument: 'name',
      shortArgument: 'n',
      validate: (input) => input.length > 0 || 'Project name is required',
    },
    {
      type: 'input',
      name: 'description',
      message: 'Project description:',
      argument: 'description',
      shortArgument: 'd',
    },
    {
      type: 'input',
      name: 'author',
      message: 'Author:',
      argument: 'author',
      shortArgument: 'a',
    },
    {
      type: 'confirm',
      name: 'initialiseGit',
      message: 'Initialise git repository?',
      argument: 'git',
      shortArgument: 'g',
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
      command: 'git init',
      description: 'Initializing git repository...',
      condition: (answers) => answers.initialiseGit,
    },
  ],
};
```

## Questions

```js
{
  // The type of question to ask (see below)
  type: 'input',

  // The variable name to store the answer in
  name: 'projectName',

  // The question to display to the user
  message: 'Project name:',

  // An optional command-line argument to use for this question
  // If this is provided and the user has specified a value for this argument, we will use that value instead of asking the question
  argument: 'name',

  // An optional short version of the command-line argument (single character)
  shortArgument: 'n',

  // An optional function to validate the answer
  // The function should return true if the answer is valid, or a string with an error message if the answer is invalid
  validate: (input) => input.length > 0 || 'Project name is required',

  // Optional function to determine if the question should be asked based on previous answers
  condition: (answers) => true,
}
```

## Question types

### `input`

A simple text input field.

### `confirm`

A yes/no question.

### `select`

A multiple-choice question where the user can select one option from a list.

`choices` can be an array of strings or an array of objects:

```ts
type SelectChoice = string | {
  name: string;
  value: string;
  description?: string;
  disabled?: boolean;
};
```

If a `choices` entry is the string `---`, a separator line will be added to the list of choices.

### `checkbox`

A multiple-choice question where the user can select multiple options from a list.

`choices` can be an array of strings or an array of objects:

```ts
type CheckboxChoice = string | {
  name: string;
  value: string;
  description?: string;
  disabled?: boolean;
  checked?: boolean;
};
```

If a `choices` entry is the string `---`, a separator line will be added to the list of choices.

## Steps

```js
{
  // The type of step to execute (see below)
  type: 'command',

  // A description of the step (will be displayed to the user before executing the step)
  description: 'Installing dependencies...',

  // Optional function to determine if the step should be executed based on answers
  condition: (answers) => true,
}
```

## Step types

### `replace`

Replace placeholders in the specified files.

`files` is an array of glob patterns specifying which files to process. See the "Template substitutions" section below for details on how placeholders work.

### `command`

Run a shell command.

`command` is a string containing the command to run.

### `copy`

Copy additional files or directories from the template to the new project.

`source` is the path to the file or directory in the template (relative to the template root).

`destination` is the path to the file or directory in the new project (relative to the project root).

If `destination` is not provided, the file or directory will be copied to the same relative path in the new project.

`exclude` is an optional array of glob patterns to exclude certain files or directories from being copied.

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
- `{{PQS:UUID_FIXED(n)}}`: Inserts and caches a UUID for the current project based on the provided fixed name `n`. This ensures that the same UUID is used consistently throughout the project wherever this placeholder appears.

We can include or omit sections of text based on boolean values using the following syntax:

```
{{#PQS:conditionName}}
This text will be included if 'conditionName' is truthy.
{{/PQS:conditionName}}

{{^PQS:conditionName}}
This text will be included if 'conditionName' is falsey.
{{/PQS:conditionName}}
```
