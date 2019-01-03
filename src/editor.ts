import * as vscode from 'vscode';
import * as clip from 'clipboardy';

import { getActiveTextEditor } from './utils';

const { executeCommand } = vscode.commands;

// Possible positions when C-l is invoked consequtively
enum RecenterPosition {
  Middle,
  Top,
  Bottom,
}

export class Editor {
  private lastKill: vscode.Position; // if kill position stays the same, append to clipboard
  private justDidKill: boolean;
  private centerState: RecenterPosition;

  constructor() {
    this.justDidKill = false;
    this.lastKill = null;
    this.centerState = RecenterPosition.Middle;

    vscode.window.onDidChangeActiveTextEditor(event => {
      this.lastKill = null;
    });
    vscode.workspace.onDidChangeTextDocument(event => {
      if (!this.justDidKill) {
        this.lastKill = null;
      }
      this.justDidKill = false;
    });
    vscode.window.onDidChangeTextEditorSelection(event => {
      this.centerState = RecenterPosition.Middle;
    });
  }

  static isOnLastLine(): boolean {
    return getActiveTextEditor().selection.active.line
      === getActiveTextEditor().document.lineCount - 1;
  }

  setStatusBarMessage(text: string): vscode.Disposable {
    return vscode.window.setStatusBarMessage(text, 1000);
  }

  setStatusBarPermanentMessage(text: string): vscode.Disposable {
    return vscode.window.setStatusBarMessage(text);
  }

  getSelectionRange(): vscode.Range {
    const selection = getActiveTextEditor().selection;
    const start = selection.start;
    const end = selection.end;

    return (start.character !== end.character || start.line !== end.line)
      ? new vscode.Range(start, end)
      : null;
  }

  getSelection(): vscode.Selection {
    return getActiveTextEditor().selection;
  }

  getSelectionText(): string {
    let r = this.getSelectionRange();
    return r ? getActiveTextEditor().document.getText(r) : '';
  }

  setSelection(start: vscode.Position, end: vscode.Position): void {
    let editor = getActiveTextEditor();
    editor.selection = new vscode.Selection(start, end);
  }

  getCurrentPos(): vscode.Position {
    return getActiveTextEditor().selection.active;
  }

  // Kill to end of line
  async kill(): Promise<boolean> {
    // Ignore whatever we have selected before
    await executeCommand('emacs.exitMarkMode');

    const startPos = this.getCurrentPos();
    const isOnLastLine = Editor.isOnLastLine();

    // Move down an entire line (not just the wrapped part),
    // and to the beginning.
    await executeCommand('cursorMove',
      { to: 'down', by: 'line', select: false });
    if (!isOnLastLine) {
      await executeCommand('cursorMove', { to: 'wrappedLineStart' });
    }

    let endPos = this.getCurrentPos();
    const range = new vscode.Range(startPos, endPos);
    const txt = getActiveTextEditor().document.getText(range);

    // If there is something other than whitespace in the selection,
    // we do not cut the EOL too
    if (!isOnLastLine && !txt.match(/^\s*$/)) {
      await executeCommand('cursorMove', { to: 'left', by: 'character' });
      endPos = this.getCurrentPos();
    }

    // Select it now, cut the selection,
    // remember the position in case of multiple cuts from same spot
    this.setSelection(startPos, endPos);
    const promise = this.cut(this.lastKill !== null
      && startPos.isEqual(this.lastKill));

    promise.then(() => {
      this.justDidKill = true;
      this.lastKill = startPos;
    });

    return promise;
  }

  copy(): void {
    clip.writeSync(this.getSelectionText());
    executeCommand('emacs.exitMarkMode');
  }

  cut(appendClipboard?: boolean): Thenable<boolean> {
    if (appendClipboard) {
      clip.writeSync(clip.readSync() + this.getSelectionText());
    } else {
      clip.writeSync(this.getSelectionText());
    }
    let t = Editor.delete(this.getSelectionRange());
    executeCommand('emacs.exitMarkMode');
    return t;
  }

  yank(): Thenable<{}> {
    this.justDidKill = false;
    return Promise.all([
      executeCommand('editor.action.clipboardPasteAction'),
      executeCommand('emacs.exitMarkMode')]);
  }

  undo(): void {
    executeCommand('undo');
  }

  private getFirstBlankLine(range: vscode.Range): vscode.Range {
    let doc = getActiveTextEditor().document;

    if (range.start.line === 0) {
      return range;
    }
    range = doc.lineAt(range.start.line - 1).range;
    while (range.start.line > 0 && range.isEmpty) {
      range = doc.lineAt(range.start.line - 1).range;
    }
    if (range.isEmpty) {
      return range;
    } else {
      return doc.lineAt(range.start.line + 1).range;
    }
  }

  async deleteBlankLines() {
    let selection = this.getSelection();
    let anchor = selection.anchor;
    let doc = getActiveTextEditor().document;
    let range = doc.lineAt(selection.start.line).range;
    let nextLine: vscode.Position;

    if (range.isEmpty) {
      range = this.getFirstBlankLine(range);
      anchor = range.start;
      nextLine = range.start;
    } else {
      nextLine = range.start.translate(1, 0);
    }
    selection = new vscode.Selection(nextLine, nextLine);
    getActiveTextEditor().selection = selection;

    for (let line = selection.start.line;
      line < doc.lineCount - 1 && doc.lineAt(line).range.isEmpty;
      ++line) {

      await executeCommand('deleteRight');
    }
    getActiveTextEditor().selection = new vscode.Selection(anchor, anchor);
  }

  static delete(range: vscode.Range = null): Thenable<boolean> {
    if (range) {
      return getActiveTextEditor().edit(editBuilder => {
        editBuilder.delete(range);
      });
    }
  }

  deleteLine(): void {
    executeCommand('emacs.exitMarkMode'); // emulate Emacs
    executeCommand('editor.action.deleteLines');
  }

  scrollLineToCenterTopBottom = () => {
    const editor = getActiveTextEditor();
    const selection = editor.selection;

    switch (this.centerState) {
      case RecenterPosition.Middle:
        this.centerState = RecenterPosition.Top;
        editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
        break;
      case RecenterPosition.Top:
        this.centerState = RecenterPosition.Bottom;
        editor.revealRange(selection, vscode.TextEditorRevealType.AtTop);
        break;
      case RecenterPosition.Bottom:
        this.centerState = RecenterPosition.Middle;
        // There is no AtBottom, so instead scroll a page up (without moving cursor).
        // The current line then ends up as the last line of the window (more or less).
        executeCommand('scrollPageUp');
        break;
    }
  }

  breakLine() {
    executeCommand('lineBreakInsert');
    executeCommand('emacs.cursorHome');
    executeCommand('emacs.cursorDown');
  }
}
