# lb-stanza-vscode

A VS Code extension for LB Stanza. Currently just a translation of the old Atom extension.

## Features

An extension that gives you general language tooling for Stanza programs.

> Warning: Nothing currently works besides syntax highlighting and basic indentation.

## Requirements

You will need to have LB Stanza in your `$PATH` for the additional features to work *(in development)*

## Extension Settings

This extension contributes the following settings:

* `lb-stanza-vscode.enable-syntax-checker`: enable/disable the syntax checker
* `lb-stanza-vscode.windows.path`: Windows `stanza.exe` path
* `lb-stanza-vscode.macos.path`: MacOS `stanza.exe` path
* `lb-stanza-vscode.linux.path`: Linux `stanza` path

Warning,

## Known Issues

Only supports syntax highlighting and auto-indentation for now.

## Release Notes

### 0.4.1

* Add image
* Fix for `lostanza` modifier

### 0.4.0

* Moved many regexes to expanded for readability
* Condensed and moved names to improve folding
* Added separate tuple rule to improve syntax detection
* Updated many rules to account for leading spaces (not sure why...)
* Separated import rule
* Refactored and fixed new object rule
* Updated support roles and types
* Added return types
* Complete refactor of types
* Changed some highlighting tags for readability

### 0.3.0

Add support for `.proj` files (environment variable highlighting and the extra builtin functions described [here](https://github.com/StanzaOrg/lbstanza/blob/master/docs/build-system.md))

### 0.2.0

Add liberal wordPattern and an experimental outdent rule (VS Code can't actually figure out tabbed indentation)

### 0.1.0

Import from [language-stanza](https://github.com/stanza-tools/language-stanza)