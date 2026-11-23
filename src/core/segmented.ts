/**
 * A segmented control: a `.segmented` group of joined buttons (components.css),
 * one per choice. Each button names its choice in a data attribute of the
 * control's own (`data-broker-type`, `data-auth-mode`), and the pressed button
 * (`aria-pressed`) is the choice.
 *
 * The markup is each form's own (its template); this file wires it.
 */
import { required } from './dom';

export interface SegmentedOptions<T extends string> {
    /** The attribute each button names its choice in, e.g. `data-auth-mode`. */
    attr: string;
    /** The choices. The first is the one pressed at the start. */
    choices: readonly [T, ...T[]];
    /** Runs after a click changed the choice. A choice made in code does not run it. */
    onChange?: (value: T) => void;
}

export interface Segmented<T extends string> {
    value(): T;
    /** Choose in code (a loaded record, a reset). A value that is not a choice changes nothing. */
    set(value: T): void;
    /** A disabled control cannot change its choice. */
    setDisabled(disabled: boolean): void;
}

export function createSegmented<T extends string>(group: HTMLElement, { attr, choices, onChange }: SegmentedOptions<T>): Segmented<T> {
    const buttons = new Map(choices.map(c => [c, required<HTMLButtonElement>(group, `button[${attr}="${c}"]`)] as const));
    let value: T = choices[0];

    function render(): void {
        buttons.forEach((button, choice) => button.setAttribute('aria-pressed', String(choice === value)));
    }

    buttons.forEach((button, choice) => {
        button.addEventListener('click', () => {
            if (choice === value) return;
            value = choice;
            render();
            onChange?.(value);
        });
    });

    render();
    return {
        value: () => value,
        set(next) {
            if (!buttons.has(next)) return;
            value = next;
            render();
        },
        setDisabled(disabled) {
            buttons.forEach(button => {
                button.disabled = disabled;
            });
        },
    };
}
