module.exports = {
  name: "Simple JS Express Project",
  shortName: 'js-express',
  description: "A minimal JavaScript project template for testing PQS",
  version: "1.0.0",

  questions: [
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      argument: 'name',
      shortArgument: '-n',
      default: 'my-js-project',
      validate: (input) => input.length > 0 || 'Project name is required',
    },
    {
      type: 'input',
      name: 'description',
      message: 'Project description:',
      argument: 'description',
      shortArgument: '-d',
      default: 'A simple JavaScript project',
    },
    {
      type: 'input',
      name: 'author',
      message: 'Author:',
      argument: 'author',
      shortArgument: '-a',
      default: process.env.USER || 'Your Name',
    },
    {
      type: 'confirm',
      name: 'initialiseGit',
      message: 'Initialise git?',
      argument: 'git',
      shortArgument: '-g',
      default: true,
    },
  ],

  exclude: [
    'pqs.config.js',
    'node_modules',
    '.git',
    '.DS_Store',
  ],

  steps: [
    {
      type: 'replace',
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
