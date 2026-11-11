import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

/**
 * scripts/vite-build.mjs: the flags it takes off vite's argv and forwards as
 * env, and the exit code it reports for the vite child. The script runs on
 * import, so each case imports it afresh with node:child_process mocked and
 * process.exit stubbed (process.exit and console.error are the spies below).
 */
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
// The mock sits on both faces of the builtin: its named export, and the
// CommonJS object on `default`, which the module runner's interop reads a
// named import from when it is present. Everything else stays real.
vi.mock('node:child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:child_process') & { default: typeof import('node:child_process') }>();
    return { ...actual, spawn, default: { ...actual.default, spawn } };
});

let child: EventEmitter;
const argv = process.argv;

async function run(...args: string[]) {
    process.argv = [process.execPath, 'scripts/vite-build.mjs', ...args];
    vi.resetModules();
    await import('../../scripts/vite-build.mjs');
}

beforeEach(() => {
    child = new EventEmitter();
    spawn.mockReset();
    spawn.mockReturnValue(child);
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    process.argv = argv;
    vi.restoreAllMocks();
});

describe('vite-build -- arguments', () => {
    it("takes its own flags off vite's argv, either spelling, and hands them over as env", async () => {
        await run('--mode', 'demo', '--variant=managed-demo', '--out-filename', 'provisioned-demo.html', '--show-payload=false');
        expect(spawn).toHaveBeenCalledTimes(1);
        const [node, args, options] = spawn.mock.calls[0];
        expect(node).toBe(process.execPath);
        expect(args[0]).toMatch(/[\\/]vite[\\/]bin[\\/]vite\.js$/);
        expect(args.slice(1)).toEqual(['build', '--mode', 'demo']);
        expect(options.stdio).toBe('inherit');
        expect(options.env).toMatchObject({
            __VITE_VARIANT: 'managed-demo',
            __VITE_OUT_FILENAME: 'provisioned-demo.html',
            __VITE_SHOW_PAYLOAD: 'false',
        });
    });
});

describe('vite-build -- exit code', () => {
    it("reports vite's own code", async () => {
        await run();
        child.emit('exit', 0, null);
        expect(process.exit).toHaveBeenLastCalledWith(0);
        child.emit('exit', 2, null);
        expect(process.exit).toHaveBeenLastCalledWith(2);
        expect(console.error).not.toHaveBeenCalled();
    });

    it('fails when a signal killed vite, which Node reports as code null', async () => {
        await run();
        child.emit('exit', null, 'SIGKILL');
        expect(process.exit).toHaveBeenCalledTimes(1);
        expect(process.exit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith('vite build was killed by SIGKILL');
    });

    it('fails, saying why, when vite could not be started', async () => {
        await run();
        child.emit('error', Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }));
        expect(process.exit).toHaveBeenCalledTimes(1);
        expect(process.exit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith('vite build could not start: spawn EACCES');
    });
});
