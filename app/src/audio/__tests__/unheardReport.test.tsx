import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import { recordEvent as recordEventMocked } from '../diagnostics';
import { readHearing, unheardSpeakers, type Hearing } from '../unheard';
import { UNHEARD_REPORT_MS, useUnheardReport } from '../useUnheardReport';

jest.mock('../diagnostics', () => ({ recordEvent: jest.fn() }));
const recordEvent = recordEventMocked as jest.Mock;

const ME = 'acct_me';
const THEM = 'acct_them';
const NOW = 1_700_000_000_000;

/** Both of us in the room, nobody holding the floor. */
const open = (): ChannelState =>
  reduce(
    createChannel({ id: 'sess_1', initiator: ME, invitees: [THEM], now: NOW }),
    { type: 'ENTER', userId: THEM },
    NOW
  );

const claimed = (): ChannelState =>
  reduce(open(), { type: 'CLAIM_FLOOR', userId: ME }, NOW);

const hearing = (publishing: string[], heard: string[]): Hearing => ({
  publishing,
  heard,
});

describe('reading who is publishing and who is heard', () => {
  const participant = (identity: string, subscribed: boolean[]) => ({
    identity,
    audioTrackPublications: new Map(
      subscribed.map((isSubscribed, i) => [`TR_${i}`, { isSubscribed }])
    ),
  });

  it('counts a speaker heard on any of their tracks, and skips the silent', () => {
    const room = {
      remoteParticipants: new Map([
        ['b', participant('b', [false, true])],
        ['a', participant('a', [false])],
        ['c', participant('c', [])],
      ]),
    };
    expect(readHearing(room)).toEqual(hearing(['a', 'b'], ['b']));
    expect(readHearing(null)).toEqual(hearing([], []));
  });
});

describe('who should be heard and is not', () => {
  it('is somebody in the room, publishing, not withheld and not subscribed', () => {
    expect(unheardSpeakers(open(), ME, hearing([THEM], []))).toEqual([THEM]);
    expect(unheardSpeakers(open(), ME, hearing([THEM], [THEM]))).toEqual([]);
  });

  it('is never somebody the room is withholding', () => {
    // I hold the floor, so they are meant to be unheard.
    expect(unheardSpeakers(claimed(), ME, hearing([THEM], []))).toEqual([]);
  });

  it('is nobody the channel does not have in the room', () => {
    // The shared track's participant, and anybody the room still lists after
    // the channel let them go.
    expect(
      unheardSpeakers(open(), ME, hearing(['media:sess_1', 'acct_gone'], []))
    ).toEqual([]);
  });

  it('is nobody while you are not in the room yourself', () => {
    const left = reduce(open(), { type: 'STEP_OUT', userId: ME }, NOW);
    expect(unheardSpeakers(left, ME, hearing([THEM], []))).toEqual([]);
    expect(unheardSpeakers(null, ME, hearing([THEM], []))).toEqual([]);
  });
});

describe('reporting a speaker this device cannot hear', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    recordEvent.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  type Props = { channel: ChannelState | null; connected: boolean; hearing: Hearing };

  function mount(props: Props) {
    const report = jest.fn();
    function Probe(p: Props) {
      useUnheardReport(p.channel, ME, p.connected, p.hearing, report);
      return null;
    }
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Probe {...props} />);
    });
    return {
      report,
      update(next: Props) {
        act(() => tree.update(<Probe {...next} />));
      },
      advance(ms: number) {
        act(() => {
          jest.advanceTimersByTime(ms);
        });
      },
      unmount: () => act(() => tree.unmount()),
    };
  }

  it('waits out the ordinary gaps, then says so once', () => {
    const view = mount({ channel: open(), connected: true, hearing: hearing([THEM], []) });
    view.advance(UNHEARD_REPORT_MS - 1);
    expect(view.report).not.toHaveBeenCalled();
    view.advance(1);
    expect(view.report).toHaveBeenCalledWith('sess_1', THEM, UNHEARD_REPORT_MS);
    view.advance(UNHEARD_REPORT_MS * 3);
    expect(view.report).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('says nothing about a subscription that arrives in time', () => {
    const view = mount({ channel: open(), connected: true, hearing: hearing([THEM], []) });
    view.advance(UNHEARD_REPORT_MS / 2);
    view.update({ channel: open(), connected: true, hearing: hearing([THEM], [THEM]) });
    view.advance(UNHEARD_REPORT_MS * 2);
    expect(view.report).not.toHaveBeenCalled();
    view.unmount();
  });

  it('logs when an episode it reported ends, and reports the next afresh', () => {
    const view = mount({ channel: open(), connected: true, hearing: hearing([THEM], []) });
    view.advance(UNHEARD_REPORT_MS);
    view.update({ channel: open(), connected: true, hearing: hearing([THEM], [THEM]) });
    expect(recordEvent).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^heard again ${THEM} after \\d+ms$`))
    );
    view.update({ channel: open(), connected: true, hearing: hearing([THEM], []) });
    view.advance(UNHEARD_REPORT_MS);
    expect(view.report).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('says nothing while the room is reconnecting', () => {
    const view = mount({ channel: open(), connected: false, hearing: hearing([THEM], []) });
    view.advance(UNHEARD_REPORT_MS * 2);
    expect(view.report).not.toHaveBeenCalled();
    view.unmount();
  });

  it('drops a pending report when the floor is claimed', () => {
    const view = mount({ channel: open(), connected: true, hearing: hearing([THEM], []) });
    view.advance(UNHEARD_REPORT_MS / 2);
    view.update({ channel: claimed(), connected: true, hearing: hearing([THEM], []) });
    view.advance(UNHEARD_REPORT_MS * 2);
    expect(view.report).not.toHaveBeenCalled();
    view.unmount();
  });

  it('sends nothing after going away', () => {
    const view = mount({ channel: open(), connected: true, hearing: hearing([THEM], []) });
    view.unmount();
    view.advance(UNHEARD_REPORT_MS * 2);
    expect(view.report).not.toHaveBeenCalled();
  });
});
