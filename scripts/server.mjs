#!/usr/bin/env zx

/**========================================================================
 *                           Setup
 *========================================================================**/

 import 'zx/globals';
 import { access, rm, watch, readFile } from 'fs/promises';
 import { constants } from 'fs';
 import parseArgs from 'minimist';
import { stripVTControlCharacters } from 'util';

process.title = 'stnzls';

$.verbose = false;

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

/**
 * Checks if the file exists on the system
 *@param {string} p - The file path
 *@return Boolean
 */
async function exists(p) {
    try { await access(p, constants.F_OK); return true }
    catch { return false }
}

/**========================================================================
 *                           Definitions Database
 *========================================================================**/

/**
 * Class instances handle the shell calls to the stanza compiler and script */
class DefinitionsDatabase {
    /**
     * @param {string} mainProjPath the path to the main `stanza.proj` file
     * @param {string} datPath the path to the main `*.dat` file
     * @param {Array.<string>} projFiles A list of all proj files within the heirarchy
     */
    constructor(mainProjPath, datPath, projFiles) {
        /**
         * @member {boolean} isGenerated has the def database been generated already? */
        this.isGenerated = false;

        /**
         * @member {boolean} isSerialized has the def database been serialized already? */
        this.isSerialized = false;

        /**
         * @member {string} mainProjPath path to the main stanza.proj file that will be supplied
         * to the definitions-database command */
        this.mainProjPath = mainProjPath.replace('\\', '\\\\');

        /**
         * @member {string} datPath path to the dat file that the definitions-database command
        // generates (for parsing by a language server) */
        this.datPath = datPath.replace('\\', '\\\\');

        /**
         * @member {Array.<string>} projFiles a list of all stanza.proj files in the source
         * folder */
        this.projFiles = projFiles.map(p => p.replace('\\', '\\\\'));

        /**
         * @member {Array.<string>} stzFiles a list of all *.stanza files that are currently
         * being watched */
        this.stzFiles = [];

        /**
         * @member {AbortController} abortController a way to quickly abort all file watchers */
        this.abortController = new AbortController();

        /**
         * @member {Array.<Object.<string, string|number>>} defs the final resulting list of defs */
         this.defs = [];
    }
    abortAllWatchers() { this.abortController.abort() }
    clear() { this.abortAllWatchers; this.stzFiles = [] }
    /**
     * Walks through all the proj files and sets up proj and stanza watchers
     */
    async traverse() {
        return Promise.all(this.projFiles.map(p => this.setupProjWatcher(p)))
    }
    /**
     * Takes a given `projFile` and sets up a watcher
     * @param {string} projFile the path to the proj file that needs a watcher
     */
    async setupProjWatcher(projFile) {
        // console.log(`Setting up proj file ${projFile} watcher...`);
        try {
            let watcher = watch(projFile, this.abortController.signal);
            await this.readProjFile(projFile)
            (async function() {
                for await (let event of watcher) {
                    console.log("proj file %s event occurred '%s'", stzFile, event.eventType);
                    if (event.eventType == 'change') await this.readProjFile(projFile)
                }
            })()
        } catch (err) { if (err.name == 'AbortError') return }
        // console.log(`Finished setting up proj file ${projFile} watcher!`);
        return
    }
    /**
     * 
     * @param {string} p the proj file that needs to be parsed for new stanza files to watch
     */
    async readProjFile(p) {
        // console.log(`Reading proj file ${p}...`);
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
    /**
     * Adds a watcher to a stanza file
     * @param {string} stzFile the path to the stanza file that needs a watcher
     */
    async watchStzFile(stzFile) {
        // console.log(`Watching stanza file file ${stzFile}...`);
        if (!(this.stzFiles.includes(stzFile))) {
            let watcher = watch(stzFile, this.abortController.signal)
            this.stzFiles.push(stzFile);
            for await (let event of watcher) {
                console.log("stanza file %s event occurred '%s'", stzFile, event.eventType);
                if (event.eventType == 'change') await this.generate();
            }
            
        }
    }
    /**
     * Runs the stanza `definitions-database` command, sets up the dat file and then `deserialize`
     */
    async generate() {
        // console.log('Generating dat file...');
        let args = [this.mainProjPath, '-o', this.datPath]
        if (this.isGenerated && await exists(this.datPath)) args.push('-merge-with', this.datPath);
        await $`stanza definitions-database ${args}`;
        this.isGenerated = true; this.isSerialized = false;
        return await this.deserialize();
    }
    /**
     * Run the `deserialize.stanza` script and convert the results into an array of objects
     */
    async deserialize() {
        // console.log('Deserializing dat file...');
        let {stdout} = await $`stanza run ./scripts/deserialize.stanza -- ${this.datPath}`;
        for (let line of stdout.split('\n')) {
            let result = {};
            line.split('\t').map(seg => seg.split('=')).forEach(([k, v]) => result[k] = v)
            this.defs.push(result);
        }
        this.isSerialized = true;
        return;
    }
}

/*=============== END OF Definitions Database ==============*/

/**========================================================================
 *                           Commands
 *========================================================================**/

class Action {
    static documentSymbols(db, args) {
        let file = args._[0];
        db.defs.filter(d => d.file != undefined).filter(d =>
            path.basename(d.file) == path.basename(file) && path.dirname(d.file) == path.dirname(file)
        ).forEach(d =>
            console.log(`${d.file}:${d.line}:${d.col} ${d.name}`)
        )
    }
    static folderSymbols(folder) {}
    static references(sym) {}
    static hover(sym) {}
    static completions(search) {}
    static diagnostic(proj) {}
    static definition(sym) {}
    static implementations(sym) {}
    static signature(sym) {}
    static quit() { process.exit() }
}


/**========================================================================
 *                           Command Line
 *========================================================================**/


const CHOICES = {
    'document-symbols': Action.documentSymbols,
    'folder-symbols': Action.folderSymbols,
    'references': Action.references,
    'hover': Action.hover,
    'completions': Action.completions,
    'diagnostic': Action.diagnostic,
    'definition': Action.definition,
    'implementations': Action.implementations,
    "signature": Action.signature,
    'quit': Action.quit,
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

const mainProjPath = path.join(argv.workspaceDir, 'stanza.proj');
if (!(await exists(mainProjPath))) throw "No main stanza.proj file";
// console.log(`Main proj file: ${mainProjPath}`);
        
const datPath = path.join(argv.workspaceDir, 'lb-stanza-code_defsdb.dat');
if (await exists(datPath)) await rm(datPath);
// console.log(`Dat file: ${datPath}`);

const projFiles = await glob('**/stanza.proj', {options: {cwd: argv.workspaceDir}, gitignore: true})
// console.log(`All proj files: ${projFiles}`);

class StanzaLangServer {
    constructor(mpp, dp, pf) {
        this.command = '';
        this.args = {};
        this.db = new DefinitionsDatabase(mpp, dp, pf);
        this.running = true;
    }
    parse(str) {
        this.args = parseArgs(tokenArgs(str));
        this.command = this.args._.shift();
    }
    choose() { 
        // console.log(`Choosing ${this.command}...`);
        if (!CHOICES[this.command]) { console.log(`Unknown action: ${this.command}`) }
        else { CHOICES[this.command](this.db, this.args) }
    }
    async *run() {
        await this.db.traverse();
        while (this.running) {
            this.parse(await question('stnzls> ', { choices: Object.keys(CHOICES) }));
            yield { done: false, value: null }
        }
    }
}

const stnzls = new StanzaLangServer(mainProjPath, datPath, projFiles);
for await (let _ of stnzls.run()) { stnzls.choose() }