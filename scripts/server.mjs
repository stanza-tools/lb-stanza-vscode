#!/usr/bin/env zx

/**========================================================================
 *                           Setup
 *========================================================================**/

 import 'zx/globals';
 import { access, rm, watch, readFile } from 'fs/promises';
 import { constants } from 'fs';
 import parseArgs from 'minimist';

process.title = 'stnzls';

// had to change due to a weird bug occurs on the `...\example\...` folder name
$.quote = function quote(arg) {
    if (/^[a-z0-9/_.-]+$/i.test(arg) || arg === '') {
        return arg
    }
    return (
        `$'` +
        arg
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\f/g, '\\f')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
        .replace(/\v/g, '\\v')
        .replace(/\\(?=e)/g,'\\\\') // strange bug that converts to escape sequence \e
        .replace(/\0/g, '\\0') +
        `'`
    )
}

// Check if a file exists
async function exists(p) {
    try { await access(p, constants.F_OK); return true }
    catch { return false }
}

/**========================================================================
 *                           Definitions Database
 *========================================================================**/

class DefinitionsDatabase {
    constructor(mainProjPath, datPath, projFiles) {
        // has this def database been generated already which
        // would then require merging?
        this.isGenerated = false;

        this.isSerialized = false;

        // path to the main stanza.proj file that will be supplied
        // to the definitions-database command
        this.mainProjPath = mainProjPath.replace('\\', '\\\\');

        // path to the dat file that the definitions-database command
        // generates (for parsing by a language server)
        this.datPath = datPath.replace('\\', '\\\\');

        // a list of all stanza.proj files in the source folder
        this.projFiles = projFiles.map(p => p.replace('\\', '\\\\'));

        // a list of all *.stanza files that are currently being watched
        this.stzFiles = [];

        // a way to quickly abort all file watchers
        this.abortController = new AbortController();
    }
    abortAllWatchers() { this.abortController.abort() }
    clear() { this.abortAllWatchers; this.stzFiles = [] }
    async generate() {
        console.log('Generating dat file...');
        let args = [this.mainProjPath, '-o', this.datPath]
        if (this.isGenerated && await exists(this.datPath)) args.push('-merge-with', this.datPath);
        let results = await $`stanza definitions-database ${args}`;
        this.isGenerated = true;
        return results;
    }
    async traverse() {
        await Promise.all(this.projFiles.map(p => this.setupProjWatcher(p)))
    }
    async setupProjWatcher(projFile) {
        console.log(`Setting up proj file ${projFile} watcher...`);
        try {
            let watcher = watch(projFile, this.abortController.signal);
            await this.readProjFile(projFile)
            for await (let event of watcher) {
                console.log("proj file %s event occurred '%s'", stzFile, event.eventType);
                if (event.eventType == 'change') await this.readProjFile(projFile)
            }
        } catch (err) { if (err.name == 'AbortError') return }
    }
    async readProjFile(p) {
        console.log(`Reading proj file ${p}...`);
        try {
            let proj = await readFile(p);
            let definedFiles = [
                ...proj.toString().matchAll(/defined-in "([\w\/\\:\.]+\.stanza)"/g)
            ].map(v => v[1]);
            let filteredFiles = await Promise.all(
                definedFiles.filter(async function(v) { await exists(v) }))
            for (let file of filteredFiles) this.watchStzFile(path.join(path.dirname(p), file))
            await this.generate();
        } catch(err) { console.log(err); throw err }
    }
    async watchStzFile(stzFile) {
        console.log(`Watching stanza file file ${stzFile}...`);
        if (!(this.stzFiles.includes(stzFile))) {
            let watcher = watch(stzFile, this.abortController.signal)
            this.stzFiles.push(stzFile);
            for await (let event of watcher) {
                console.log("stanza file %s event occurred '%s'", stzFile, event.eventType);
                if (event.eventType == 'change') await this.generate();
            }
            
        }
    }
    async deserialize() {
        let lines = await $`stanza run ./scripts/deserialize.stanza -- ${this.datPath}`
        let results = [];
        for (let line of lines) {
            // location=%_:%_:%_\tname=%_\tkind=%_\tvisibility=
            let result = {};
            line.split('\t').map(seg => seg.split('=')).forEach(([k, v]) => result[k] = v)
            results.push(result);
        }
        return results;
    }
}

const mainProjPath = path.join(argv.workspaceDir, 'stanza.proj');
if (!(await exists(mainProjPath))) throw "No main stanza.proj file";
console.log(`Main proj file: ${mainProjPath}`);
        
const datPath = path.join(argv.workspaceDir, 'lb-stanza-code_defsdb.dat');
if (await exists(datPath)) await rm(datPath);
console.log(`Dat file: ${datPath}`);

const projFiles = await glob('**/stanza.proj', {options: {cwd: argv.workspaceDir}, gitignore: true})
console.log(`All proj files: ${projFiles}`);

let defDB = new DefinitionsDatabase(mainProjPath, datPath, projFiles);
await defDB.traverse();
// let defs = await defDB.deserialize();

/*=============== END OF Definitions Database ==============*/

/**========================================================================
 *                           Commands
 *========================================================================**/

 function documentSymbolsChoice() {}
 function folderSymbolsAction() {}
 function referencesAction() {}
 function hoverAction() {}
 function completionsAction() {}
 function daignosticAction() {}
 function definitionAction() {}
 function implementationsAction() {}
 function signatureAction() {}
 function quitAction() { process.exit() }

/**========================================================================
 *                           Command Line
 *========================================================================**/
/*

const CHOICES = {
    'document-symbols': documentSymbolsAction,
    'folder-symbols': folderSymbolsAction,
    'references': referencesAction,
    'hover': hoverAction,
    'completions': completionsAction,
    'diagnostic': daignosticAction,
    'definition': definitionAction,
    'implementations': implementationsAction,
    "signature": signatureAction,
    'quit': quitAction,
}

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
    let answer = await question('stnzls> ', { choices: Object.keys(CHOICES) })
    const actionArgs = parseArgs(tokenArgs(answer));
    console.log(actionArgs);
    CHOICES[actionArgs._[0]](actionArgs)
}
*/