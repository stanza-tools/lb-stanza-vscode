#!/usr/bin/env zx

import 'zx/globals';
import { access, rm, watch, readFile } from 'fs/promises';
import { constants } from 'fs';
import parseArgs from 'minimist';

/**========================================================================
 *                           Definitions Database
 *========================================================================**/

async function exists(p) {
    try { await access(p, constants.F_OK); return true }
    catch { return false }
}

class DefinitionsDatabase {
    constructor(mainProjPath, datPath, projFiles) {
        // has this def database been generated already which
        // would then require merging?
        this.isGenerated = false;

        // path to the main stanza.proj file that will be supplied
        // to the definitions-database command
        this.mainProjPath = mainProjPath;

        // path to the dat file that the definitions-database command
        // generates (for parsing by a language server)
        this.datPath = datPath;

        // a list of all stanza.proj files in the source folder
        this.projFiles = projFiles;

        // a list of all *.stanza files that are currently being watched
        this.stzFiles = [];

        // a way to quickly abort all file watchers
        this.abortController = new AbortController();
    }
    abortAllWatchers() { this.abortController.abort() }
    clear() { this.abortAllWatchers; this.stzFiles = [] }
    async generate() {
        let args = [this.mainProjPath, '-o', this.datPath]
        if (this.isGenerated) args.push('-merge-with', this.datPath);
        let results = await $`stanza definitions-database ${args}`;
        this.isGenerated = true;
        return results;
    }
    async traverse() {
        for (var projFile of this.projFiles) await this.setupProjWatcher(projFile);
    }
    async setupProjWatcher(projFile) {
        try {
            let watcher = watch(projFile, this.abortController.signal);
            for await (let event of watcher) {
                if (event == 'change') this.readProjFile(projFile)
            }
        } catch (err) { if (err.name == 'AbortError') return }
    }
    async readProjFile(p) {
        try {
            let projFile = await readFile(p);
            let definedFiles = projFile.toString()
                .matchAll(/defined-in "([\w\/\\:\.]\.stanza)"/)
                .map(v => v[1]);
            let filteredFiles = await Promise.all(
                definedFiles.filter(async function(v) { await exists(v) }))
            for (let file of filteredFiles) this.watchStzFile(file)
        } catch(err) { throw err }
    }
    async watchStzFile(stzFile) {
        if (!(this.stzFiles.includes(stzFile))) {
            let watcher = watch(stzFile, this.abortController.signal)
            this.stzFiles.push(stzFile);
            for await (let event of watcher) {
                if (event == 'change') this.generate();
            }
        }
    }
}

const mainProjPath = path.join(argv.workspaceDir, 'stanza.proj');
if (!(await exists(mainProjPath))) throw "No main stanza.proj file";
        
const datPath = path.join(argv.workspaceDir, 'lb-stanza-code_defsdb.dat');
if (await exists(datPath)) await rm(this.datPath);

const projFiles = await glob(`${argv.workspaceDir}/**/stanza.proj`, {gitignore: true})

let defDB = new DefinitionsDatabase(mainProjPath, datPath, projFiles);

// let defs = await $`stanza ./scripts/deserialize.stanza `

/*=============== END OF Definitions Database ==============*/

/**========================================================================
 *                           Commands
 *========================================================================**/



/**========================================================================
 *                           Command Line
 *========================================================================**/

const choices = [
    'document-symbols',
    'folder-symbols',
    'references',
    'hover',
    'completions',
    'diagnostic',
    'definition',
    'implementations',
    "signature",
    'quit'
]

function tokenArgs(argStr) {
    const iter = argStr[Symbol.iterator](); let [curr, buff, rslt] = [iter.next(), [], []];
    while (!curr.done) {
        switch(curr.value) {
        case ' ': if (buff.length > 0) { rslt.push(buff.join('')); buff = [] }; break;
        case "'": // fallthrough
        case '"': rslt.push(eatDelimited(iter, curr)); break;
        default : buff.push(curr.value) }
        curr = iter.next();
    }
    return buff.length > 0 ? rslt.concat([buff.join('')]) : rslt;
}

function eatDelimited(iter, curr) {
    const dlmt = curr.value; let [prev, buff] = [dlmt, []];
    while ((() => { prev = curr.value; curr = iter.next(); return !curr.done; })()) {
        switch(curr.value) {
        case dlmt: if (!(prev == '\\')) return buff.join('');
        default  : buff.push(curr.value) }
    }
    return buff.join('')
}

while (true) {
    let answer = await question('stnzls> ', { choices })
    const actionArgs = parseArgs(tokenArgs(answer));
    console.log(actionArgs);
    switch(actionArgs._[0]) {
        case 'document-symbols': break;
        case 'folder-symbols': break;
        case 'references': break;
        case 'hover': break;
        case 'completions': break;
        case 'diagnostic': break;
        case 'definition': break;
        case 'implementations': break;
        case "signature": break;
        case 'quit': process.exit()
        default : console.log(`Unknown action "${actionArgs._[0]}"`)
    }
}