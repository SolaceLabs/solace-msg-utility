import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from '../../src/core/event-bus';

describe('EventBus', () => {
    it('creates an event bus with on, off, emit methods', () => {
        const bus = createEventBus();
        expect(bus.on).toBeDefined();
        expect(bus.off).toBeDefined();
        expect(bus.emit).toBeDefined();
    });

    it('calls handler when event is emitted', () => {
        const bus = createEventBus();
        const handler = vi.fn();
        bus.on('client:disconnected', handler);
        bus.emit('client:disconnected');
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('passes payload to handler', () => {
        const bus = createEventBus();
        const handler = vi.fn();
        bus.on('app:state-change', handler);
        bus.emit('app:state-change', { key: 'isConnected', value: true });
        expect(handler).toHaveBeenCalledWith({ key: 'isConnected', value: true });
    });

    it('supports multiple handlers on same event', () => {
        const bus = createEventBus();
        const h1 = vi.fn();
        const h2 = vi.fn();
        bus.on('client:disconnected', h1);
        bus.on('client:disconnected', h2);
        bus.emit('client:disconnected');
        expect(h1).toHaveBeenCalledTimes(1);
        expect(h2).toHaveBeenCalledTimes(1);
    });

    it('does not call handler after off()', () => {
        const bus = createEventBus();
        const handler = vi.fn();
        bus.on('client:disconnected', handler);
        bus.off('client:disconnected', handler);
        bus.emit('client:disconnected');
        expect(handler).not.toHaveBeenCalled();
    });

    it('off() for non-existent event does not throw and does not affect other events', () => {
        const bus = createEventBus();
        const handler = vi.fn();
        const otherHandler = vi.fn();
        bus.on('client:connected', otherHandler);
        expect(() => bus.off('client:disconnected', handler)).not.toThrow();
        bus.emit('client:connected', { session: {} as any });
        expect(otherHandler).toHaveBeenCalledTimes(1);
    });

    it('emit for event with no listeners does not throw and does not invoke other-event handlers', () => {
        const bus = createEventBus();
        const otherHandler = vi.fn();
        bus.on('client:connected', otherHandler);
        expect(() => bus.emit('client:disconnected')).not.toThrow();
        expect(otherHandler).not.toHaveBeenCalled();
    });

    it('prevents duplicate handlers via Set', () => {
        const bus = createEventBus();
        const handler = vi.fn();
        bus.on('client:disconnected', handler);
        bus.on('client:disconnected', handler);
        bus.emit('client:disconnected');
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('catches and logs errors in handlers without breaking other handlers', () => {
        const bus = createEventBus();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const badHandler = vi.fn(() => { throw new Error('test error'); });
        const goodHandler = vi.fn();

        bus.on('client:disconnected', badHandler);
        bus.on('client:disconnected', goodHandler);
        bus.emit('client:disconnected');

        expect(badHandler).toHaveBeenCalled();
        expect(goodHandler).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('[EventBus] Error in handler for "client:disconnected":'),
            expect.any(Error)
        );
    });

    it('cleans up empty listener Set on off()', () => {
        const bus = createEventBus();
        const handler = vi.fn();
        bus.on('client:disconnected', handler);
        bus.off('client:disconnected', handler);
        // Emitting should do nothing — the Set was cleaned up
        bus.emit('client:disconnected');
        expect(handler).not.toHaveBeenCalled();
    });

    it('handles void events with no args', () => {
        const bus = createEventBus();
        const handler = vi.fn();
        bus.on('jszip:loaded', handler);
        bus.emit('jszip:loaded');
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('handles events with complex payloads', () => {
        const bus = createEventBus();
        const handler = vi.fn();
        const session = { id: 'test-session' };
        bus.on('client:connected', handler);
        bus.emit('client:connected', { session });
        expect(handler).toHaveBeenCalledWith({ session });
    });

    describe('hold() / release() buffering', () => {
        it('buffers emits between hold() and release(), delivers on release()', () => {
            const bus = createEventBus();
            const handler = vi.fn();
            bus.hold();
            bus.emit('config:max-messages-changed', { value: 500 });
            // Handler subscribes AFTER emit while held — this is the install-phase scenario.
            bus.on('config:max-messages-changed', handler);
            expect(handler).not.toHaveBeenCalled();
            bus.release();
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith({ value: 500 });
        });

        it('preserves FIFO order across multiple buffered emits', () => {
            const bus = createEventBus();
            const values: number[] = [];
            bus.hold();
            bus.emit('config:max-messages-changed', { value: 1 });
            bus.emit('config:max-messages-changed', { value: 2 });
            bus.emit('config:max-messages-changed', { value: 3 });
            bus.on('config:max-messages-changed', ({ value }) => values.push(value));
            bus.release();
            expect(values).toEqual([1, 2, 3]);
        });

        it('delivers synchronously after release() (no re-buffering)', () => {
            const bus = createEventBus();
            const handler = vi.fn();
            bus.on('config:max-messages-changed', handler);
            bus.hold();
            bus.release();
            bus.emit('config:max-messages-changed', { value: 42 });
            expect(handler).toHaveBeenCalledWith({ value: 42 });
        });

        it('nested emits from a drained handler deliver immediately', () => {
            const bus = createEventBus();
            const order: string[] = [];
            bus.on('config:max-messages-changed', () => {
                order.push('outer');
                // Nested emit during drain — held=false at this point, delivered sync.
                bus.emit('app:message-delete', { id: 'nested' });
            });
            bus.on('app:message-delete', ({ id }) => order.push(`inner:${id}`));
            bus.hold();
            bus.emit('config:max-messages-changed', { value: 1 });
            bus.release();
            expect(order).toEqual(['outer', 'inner:nested']);
        });
    });

    describe('dispatch snapshot — listeners registered during dispatch do not fire in the same emit', () => {
        it('listeners added during dispatch do NOT fire in the same emit', () => {
            // Regression for the VPN-switch bug: the connections module registered
            // onFail on `client:disconnected` from inside a `client:disconnected`
            // handler. With naive Set.forEach, onFail would fire in the same emit
            // and tear down its sibling onSuccess before the reconnect completed.
            const bus = createEventBus();
            const calls: string[] = [];

            const original = () => {
                calls.push('original');
                bus.on('client:disconnected', () => calls.push('newcomer'));
            };
            bus.on('client:disconnected', original);

            bus.emit('client:disconnected');
            // Only the handler present at dispatch time should have fired.
            expect(calls).toEqual(['original']);

            // The newcomer fires on the NEXT emit.
            bus.emit('client:disconnected');
            expect(calls).toEqual(['original', 'original', 'newcomer']);
        });

        it('unsubscribes from OTHER handlers during dispatch do not cancel already-pending deliveries', () => {
            // Second half of snapshot semantics: a handler that was in the Set when
            // emit started still runs even if an earlier handler unsubscribes it.
            const bus = createEventBus();
            const calls: string[] = [];

            const second = () => calls.push('second');
            const first = () => {
                calls.push('first');
                bus.off('client:disconnected', second);
            };
            bus.on('client:disconnected', first);
            bus.on('client:disconnected', second);

            bus.emit('client:disconnected');
            expect(calls).toEqual(['first', 'second']);

            // Next emit, `second` is really gone.
            bus.emit('client:disconnected');
            expect(calls).toEqual(['first', 'second', 'first']);
        });
    });
});
