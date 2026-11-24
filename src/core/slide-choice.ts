/**
 * A slide choice: a choice between two named answers as a slide switch with
 * an answer on either side (`.slide-choice`, components.css). The switch's
 * tick box holds the choice: off is the first answer, on is the second. Each
 * answer's text names it in `data-choice`, and the text of the current answer
 * is `active`.
 *
 * The markup is each form's own (its template); this file wires it.
 */
import { required } from './dom';

export interface SlideChoiceOptions<T extends string> {
    /** The two answers: the switch off, then on. */
    choices: readonly [T, T];
    /** Runs after the user moved the switch. A choice made in code does not run it. */
    onChange?: (value: T) => void;
}

export interface SlideChoice<T extends string> {
    value(): T;
    /** Choose in code (a loaded record, a reset). A value that is not a choice changes nothing. */
    set(value: T): void;
    /** A disabled control cannot change its choice. */
    setDisabled(disabled: boolean): void;
    /**
     * Run `handler` after the user moved the switch, as the `onChange` option
     * does: for a host that creates its controls in one place and wires their
     * events in another.
     */
    onChange(handler: (value: T) => void): void;
}

export function createSlideChoice<T extends string>(group: HTMLElement, { choices, onChange }: SlideChoiceOptions<T>): SlideChoice<T> {
    const input = required<HTMLInputElement>(group, 'input[type="checkbox"]');
    const [off, on] = choices;
    const offText = required<HTMLElement>(group, `[data-choice="${off}"]`);
    const onText = required<HTMLElement>(group, `[data-choice="${on}"]`);
    const handlers = onChange ? [onChange] : [];
    const value = (): T => (input.checked ? on : off);

    function render(): void {
        offText.classList.toggle('active', !input.checked);
        onText.classList.toggle('active', input.checked);
    }

    input.addEventListener('change', () => {
        render();
        handlers.forEach(handler => handler(value()));
    });

    render();
    return {
        value,
        set(next) {
            if (next !== off && next !== on) return;
            input.checked = next === on;
            render();
        },
        setDisabled(disabled) {
            input.disabled = disabled;
        },
        onChange(handler) {
            handlers.push(handler);
        },
    };
}
