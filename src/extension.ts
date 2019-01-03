import * as vscode from 'vscode';
import { Operation } from './operation';

import { getActiveTextEditor } from './utils';

const {
  registerCommand,
  executeCommand,
} = vscode.commands;

let inMarkMode: boolean = false;
let markHasMoved: boolean = false;

export function activate(context: vscode.ExtensionContext): void {
  const op = new Operation();

  const commandList: string[] = [
    'C-g',

    // Edit
    'C-k', 'C-w', 'M-w', 'C-y', 'C-x_C-o',
    'C-x_u', 'C-/', 'C-j', 'C-S_bs',

    // Navigation
    'C-l',
  ];

  const cursorMoves: string[] = [
    'cursorUp', 'cursorDown', 'cursorLeft', 'cursorRight',
    'cursorHome', 'cursorEnd',
    'cursorWordLeft', 'cursorWordRight',
    'cursorPageDown', 'cursorPageUp',
    'cursorTop', 'cursorBottom',
  ];

  commandList.forEach(commandName => {
    context.subscriptions.push(registerCommandByName(commandName, op));
  });

  cursorMoves.forEach(element => {
    context.subscriptions.push(registerCommand(
      `emacs.${element}`, () => {
        if (inMarkMode) {
          markHasMoved = true;
        }
        executeCommand(`${element}${inMarkMode ? 'Select' : ''}` );
      }),
    );
  });

  initMarkMode(context);
}

export function deactivate(): void {
}

function initMarkMode(context: vscode.ExtensionContext): void {
  context.subscriptions.push(registerCommand(
    'emacs.enterMarkMode', () => {
      if (inMarkMode && !markHasMoved) {
        inMarkMode = false;
      } else {
        initSelection();
        inMarkMode = true;
        markHasMoved = false;
      }
    }),
  );

  context.subscriptions.push(registerCommand(
    'emacs.exitMarkMode', () => {
      executeCommand('cancelSelection');
      if (inMarkMode) {
        inMarkMode = false;
      }
    }),
  );
}

function registerCommandByName(commandName: string, op: Operation): vscode.Disposable {
  return registerCommand(`emacs.${commandName}`, op.getCommand(commandName));
}

function initSelection(): void {
  const currentPosition: vscode.Position = getActiveTextEditor().selection.active;
  getActiveTextEditor().selection = new vscode.Selection(currentPosition, currentPosition);
}
