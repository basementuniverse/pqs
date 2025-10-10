module.exports = {
  name: 'js-express',
  description: 'A minimal JavaScript project template for testing PQS',
  values: {
    name: 'My JS Project',
    version: '0.0.1',
    description: 'A simple JavaScript project',
    author: process.env.USER || 'Your Name',
    initialiseGit: true,
  },
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
