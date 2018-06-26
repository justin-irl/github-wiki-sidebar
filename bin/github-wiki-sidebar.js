#!/usr/bin/env node

/**
 * github-wiki-sidebar
 * Generates a GitHub wiki sidebar file with optional ordering an exclude list
 */
'use strict';
const debug = require('debug')('github-wiki-sidebar');
const path = require('path');
const shell = require('shelljs');
const fs = require('fs');
const Console = require('console').Console;
const inquirer = require('inquirer');
const chalk = require('chalk');

const myConsole = new Console(process.stdout, process.stderr);
const argv = require('minimist')(process.argv.slice(2));
let baseDir = __dirname;
let dataDir = path.join(baseDir, '../data');
let workDir = process.cwd();
let defaultOptions = require(path.join(dataDir, 'prototype-options.json'));
let optionFilePath = path.join(workDir, 'options.json');
let localOptions = {};
try {
    fs.accessSync(optionFilePath, fs.constants.R_OK | fs.constants.W_OK);
    localOptions = require(optionFilePath);
} catch (err) {
    myConsole.log('The options.json file is not present.');
}

let doGit =  argv['git-push'] || false;
let skipOptions =  argv['skip-options'] || false;
let skipSave =  argv['skip-save'] || false;
let skipCredentials = argv['skip-credentials'] || false;
const credentials = '\n[//]: # (generated by https://www.npmjs.com/package/github-wiki-sidebar)\n';

if (doGit && !shell.which('git')) {
    myConsole.error('Sorry, this option requires git to be installed!');
    process.exit(1);
}

let action = 'enquire';
if (argv['silent']) action = 'silent';
if (argv['help']) action = 'help';

const buildSidebar = function(doSidebar = true, doClean = true, doOptionFile = null, doGit = false,
    skipCredentials = false) {

    if (doGit) {
        debug('Pushing results to origin');
        shell.exec('git fetch origin');
        shell.exec('git pull');
    }

    if (doOptionFile) {
        debug('Generating the custom options.json file ...');
        try {
            let fileContent = JSON.stringify(doOptionFile, null, 2);
            fs.writeFileSync(optionFilePath, fileContent);
        } catch (e) {
            myConsole.error('Failure running job!', e);
            process.exit(1);
        }
    }

    if (doSidebar) {
        debug('Build the _Sidebar.md file ...');
        let pathBin = path.join(baseDir, '../node_modules/git-wiki-to-html/bin/git-wiki-to-html');
        let result = shell.exec('node ' + pathBin + ' --template=markdown', {silent: true}).stdout;
        if (result.match(/DONE/g)) {
            let credentialStr =  shell.ShellString(credentials);
            if (!skipCredentials)  credentialStr.toEnd(path.join(workDir, '_Sidebar.md'));
            myConsole.log(chalk.bold('\n_Sidebar.md generated.'));
        } else {
            myConsole.log('Error generating _Sidebar.md: ' + result);
        }
    }

    if (doClean) {
        debug('Removing temporary options.json file');
        shell.exec('rm ' + optionFilePath);
    }

    if (doGit) {
        debug('Pushing updates to git');
        shell.exec('git add .');
        shell.exec('git commit -am "Automatic update of _Sidebar.md from github-wiki-sidebar"');
        shell.exec('git push origin master');
    }

    myConsole.log(chalk.bold.white.bgGreen('\n//-- Job completed.      '));
};

debug('Executing job %s', action);

switch (action) {
case 'help':
    myConsole.log(`
NAME:
    github-wiki-sidebar

SYNOPSIS
    github-wiki-sidebar [--silent] [--git-push] [--skip-credentials] [--skip-options]
                        [--skip-sidebar] [--help]

DESCRIPTION
    Executes the run job based on step by step user input - enquire mode. This is default mode for the job.

    silent          Updates _Sidebar.md file based on the local option.json file

    git-push        Updates repository before running job and push updates automatically at the end.

    skip-credentials
                    Removes the hidden comment in the generated _Sidebar.md pointing to this package
    skip-options
                    Not saving an option file
    skip-sidebar
                Not saving an option file
        `);
    break;
case 'enquire': {
    myConsole.log(chalk.bold.white.bgGreen('//-- github-wiki-sidebar: enquire mode'));
    myConsole.log('Press <Enter> to leave the default/saved options unchanged>\n');
    // get the list of files
    const files = [];
    const filesExclude = [];
    const filesOrder = [];
    shell.ls('[!_]*.md').forEach((file) => {
        files.push(file);
    });
    const filesExcluded = localOptions['rules'] && localOptions['rules']['exclude'] ?
        localOptions['rules']['exclude'] : [];
    files.forEach((item) => { filesExclude.push({name: item, checked: filesExcluded.indexOf(item) !== -1}); });
    // TODO move utility methods to a separate file
    const reducer = (accumulator, currentValue, currentIndex) => {
        return accumulator + '\n' + currentIndex + ') ' + chalk.reset(currentValue);
    };

    const getDisplayList = () => {
        let listStr = filesOrder.reduce(reducer, '\n') + chalk.reset('\n---\n');
        return 'Change the priority/order of the items in menu'
        + chalk.reset(' <space separated list of ids - ex: 0 2 3')
        + listStr;
    };

    const getOrderFromLocals = () => {
        let localeList = localOptions['rules'] && localOptions['rules']['order'] ? localOptions['rules']['order'] : [];
        let defaultIds = [];
        localeList.forEach((item) => {
            if (filesOrder.indexOf(item) !== -1) {
                defaultIds.push(filesOrder.indexOf(item));
            }
        });
        return defaultIds.join(' ');
    };

    let questions = [
        {
            type: 'input',
            name: 'separator',
            message: 'Define the category separator for multi-level menu:',
            validate: (input) => {
                if (process.platform === 'win32') {
                    return !!(input.match(/^[a-z#~ @_]+$/i)) || 'The following characters are allowed a-z#~ @_!';
                }
                return !!(input.match(/^[a-z:#~ @_]+$/i)) || 'The following characters are allowed a-z:#~ @_!';
            },
            default: (localOptions['separator'] || defaultOptions['separator']).replace(/-/g, ' ')
        },
        {
            type: 'input',
            name: 'linkTemplate',
            message: 'Define the format of the page links:',
            validate: (input) => {
                return !!(input.match(/%s/)) || 'The %s is missing from your format!';
            },
            default: localOptions['linkTemplate'] || defaultOptions['linkTemplate']
        },
        {
            type: 'input',
            name: 'category-1',
            message: 'Define the _Sidebar.md content template:',
            validate: (input) => {
                return !!(input.match(/%s/)) || 'The %s is missing from your format!';
            },
            default: localOptions['menu'] && localOptions['menu']['category-1'] ?
                localOptions['menu']['category-1'].replace('{{{subitems}}}\n', '%s')
                    .replace(/\n/g, '\\n') : '%s'
        },
        {
            type: 'checkbox',
            name: 'exclude',
            message: 'Select the items to be excluded from menu:',
            choices: filesExclude,
            default: ''
        },
        {
            type: 'input',
            name: 'order',
            message: getDisplayList,
            default: getOrderFromLocals,
            when: (answers) => {
                let sepString = answers['separator'].replace(/ /g, '-');
                files.forEach((item) => {
                    if (!answers['exclude'].some((exclItem) => {
                        return exclItem === item || item.indexOf(exclItem.replace('.md', sepString)) === 0;
                    })) filesOrder.push(item);
                });
                if (filesOrder.length === 0) {
                    myConsole.log(chalk.bold.red('\nNo items left after excluded removed! <Exit>\n'));
                    process.exit(1);
                }
                return true;
            },
            validate: (input) => {
                if (input === '' || input.match(/^[0-9]+([ ]{1,}[0-9]+)*$/)) {
                    return true;
                }
                return 'Please enter a space separated list of numbers (ex: 0 2 1)';
            }
        }
    ];

    inquirer.prompt(questions).then(answers => {
        let options = Object.assign({}, defaultOptions);
        options['separator'] = answers['separator'].replace(/ /g, '-');
        options['linkTemplate'] = answers['linkTemplate'];
        options['menu']['category-1'] = answers['category-1']
            .replace(/\\n/g, '\n')
            .replace('%s', defaultOptions['menu']['category-1']);
        options['rules']['exclude'] = answers['exclude'];
        // build order
        if (answers['order']) {
            let orderIndexes = answers['order']
                .toString()
                .split(' ')
                .filter((item) => { return item.trim() !== ''; })
                .map((item) => { return filesOrder[parseInt(item)]; });
            options['rules']['order'] = [... new Set([...orderIndexes])];
        }
        // execute job
        buildSidebar(!skipSave, skipOptions, options, doGit, skipCredentials);
    });
    break;
}

case 'silent': {
    myConsole.log(chalk.bold.white.bgGreen('//-- github-wiki-sidebar: enquire mode'));
    // if local file update it when modifiers / otherwise create temporary options file
    let options = localOptions || {};
    if (argv['separator']) options['separator'] = argv['separator'].replace(/ /g, '-');
    if (argv['link-template']) options['linkTemplate'] = argv['linkTemplate'];

    if (argv['menu-template']) {
        options['menu'] = options['menu'] || {};
        options['menu']['category-1'] = argv['menu-template']
            .replace(/\\n/g, '\n')
            .replace('%s', defaultOptions['menu']['category-1']);
    }

    options = Object.keys(options).length !== 0 ? options : null;
    buildSidebar(!skipSave, skipOptions, options, doGit, skipCredentials);
}
}
