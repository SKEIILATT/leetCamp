import {
  AfterViewInit,
  Component,
  ElementRef,
  forwardRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';

export type CodeLanguage = 'javascript' | 'python' | 'sql';

/**
 * Hand-built to match this app's neo-brutalist palette (`--lc-*` custom
 * properties) — deliberately NOT `@codemirror/theme-one-dark` or any other
 * off-the-shelf theme, which would fight the rest of the design system
 * (see `artifact-design` conventions this project already follows for the
 * fake `.ce-code` block in `daily-challenge.scss`).
 */
function buildTheme(): Extension {
  const editorTheme = EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--lc-ink)',
        color: 'var(--lc-white)',
        height: '100%',
        fontSize: '0.95rem',
      },
      '.cm-content': { fontFamily: 'var(--lc-font-mono)', caretColor: 'var(--lc-sky)' },
      '.cm-cursor': { borderLeftColor: 'var(--lc-sky)' },
      '.cm-gutters': {
        backgroundColor: 'var(--lc-ink)',
        color: 'rgba(255, 255, 255, 0.3)',
        border: 'none',
      },
      '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.06)' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'rgba(255, 255, 255, 0.55)' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(0, 159, 227, 0.35)',
      },
      '&.cm-editor.cm-focused': { outline: 'none' },
      '.cm-scroller': { overflow: 'auto' },
    },
    { dark: true },
  );

  const highlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: 'var(--lc-sky)', fontWeight: '700' },
    { tag: [tags.string, tags.special(tags.string)], color: 'var(--lc-mint)' },
    { tag: tags.comment, color: 'rgba(255, 255, 255, 0.4)', fontStyle: 'italic' },
    { tag: [tags.number, tags.bool, tags.null], color: 'var(--lc-mint)' },
    { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: '#ffffff' },
    { tag: tags.propertyName, color: 'var(--lc-mint)' },
    { tag: tags.operator, color: 'var(--lc-sky)' },
  ]);

  return [editorTheme, syntaxHighlighting(highlightStyle)];
}

function languageExtension(language: CodeLanguage): Extension {
  switch (language) {
    case 'javascript':
      return javascript();
    case 'python':
      return python();
    case 'sql':
      return sql();
  }
}

/**
 * CodeMirror 6 wrapper exposing a plain `ControlValueAccessor`, so it drops
 * into `ReactiveFormsModule` (`formControlName="answer"`) exactly like any
 * other input — the daily-challenge answer pane and the admin's
 * starter-code field both use it this way.
 */
@Component({
  selector: 'app-code-editor',
  template: `<div #host class="ed-host"></div>`,
  styleUrl: './code-editor.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CodeEditor), multi: true },
  ],
})
export class CodeEditor implements ControlValueAccessor, AfterViewInit, OnChanges, OnDestroy {
  @Input() language: CodeLanguage = 'javascript';
  @ViewChild('host', { static: true }) private readonly hostRef!: ElementRef<HTMLDivElement>;

  private view?: EditorView;
  private pendingValue = '';
  private disabled = false;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  private readonly languageCompartment = new Compartment();
  private readonly editableCompartment = new Compartment();

  ngAfterViewInit(): void {
    this.view = new EditorView({
      parent: this.hostRef.nativeElement,
      state: EditorState.create({
        doc: this.pendingValue,
        extensions: [
          lineNumbers(),
          history(),
          bracketMatching(),
          indentOnInput(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          buildTheme(),
          this.languageCompartment.of(languageExtension(this.language)),
          this.editableCompartment.of(EditorView.editable.of(!this.disabled)),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) this.onChange(update.state.doc.toString());
            if (update.focusChanged && !update.view.hasFocus) this.onTouched();
          }),
        ],
      }),
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['language'] && this.view) {
      this.view.dispatch({
        effects: this.languageCompartment.reconfigure(languageExtension(this.language)),
      });
    }
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  writeValue(value: string | null): void {
    this.pendingValue = value ?? '';
    if (this.view === undefined) return;
    const current = this.view.state.doc.toString();
    if (current === this.pendingValue) return;
    this.view.dispatch({ changes: { from: 0, to: current.length, insert: this.pendingValue } });
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (this.view === undefined) return;
    this.view.dispatch({ effects: this.editableCompartment.reconfigure(EditorView.editable.of(!isDisabled)) });
  }
}
