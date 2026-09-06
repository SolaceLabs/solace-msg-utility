/**
 * Assembles the `window.solace` global the application talks to.
 *
 * Because this provides the real SDK shape, the production `solace-client`,
 * `semp-client` and `solace-publisher` all run unmodified in the demo — there
 * are no `*-mock` siblings for them any more. That is the point: the demo
 * exercises the shipping code paths, so it cannot drift from them.
 *
 * Mock-only.
 */
import * as enums from './enums';
import { createSession, type MockSession } from './session';
import { createMessage, createDurableQueueDestination, createTopicDestination } from './message';

/** Live sessions, so the control panel can drop one mid-demo. */
const sessions: MockSession[] = [];

export function buildSolaceSdk(): Record<string, any> {
    /**
     * Property-bag constructors. The app does `new solace.SessionProperties()`
     * then assigns fields, so a plain constructor returning `this` is enough.
     */
    function PropertyBag(this: any) { return this; }

    return {
        ...enums,

        SolclientFactoryProperties: PropertyBag,
        SessionProperties: PropertyBag,
        QueueBrowserProperties: PropertyBag,
        MessageConsumerProperties: PropertyBag,

        /** `new solace.QueueDescriptor({ name, type })` — keeps its fields. */
        QueueDescriptor: function (this: any, opts: { name: string; type: string }) {
            this.name = opts?.name;
            this.type = opts?.type;
            return this;
        },

        SolclientFactory: {
            init: () => { /* nothing to configure in the emulator */ },
            createSession: (props: any) => {
                const session = createSession(props);
                sessions.push(session);
                return session;
            },
            createMessage: () => createMessage(),
            createDurableQueueDestination,
            createTopicDestination,
        },
    };
}

/** Drop every live session — the panel's "drop session now" lever. */
export function dropAllSessions(): void {
    for (const session of sessions) session._mockDrop?.();
}
