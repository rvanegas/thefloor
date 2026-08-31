/**
 * Confirmations and error reports, in a browser.
 *
 * The reported bug was that *Sign out* and *Leave channel* did nothing at all
 * in Chrome on iOS, and the cause was one line of somebody else's library:
 * `react-native-web` exports `Alert` as `static alert() {}`. Not a warning,
 * not a partial implementation — a no-op, so a confirmation never asked and
 * the handler behind it never ran. Every error report in the app was silent
 * for the same reason.
 *
 * What is tested here is the mapping onto what a browser has, which is the
 * half that can be wrong. The patching itself is one assignment.
 */

jest.mock('react-native', () => ({ Alert: { alert: () => {} } }));

import { showAlert, type AlertIo } from '../alerts.web';

function spy() {
  const told: string[] = [];
  const asked: string[] = [];
  let answer = true;
  const io: AlertIo = {
    tell: (text) => told.push(text),
    ask: (text) => {
      asked.push(text);
      return answer;
    },
  };
  return { io, told, asked, say: (value: boolean) => (answer = value) };
}

describe('an alert with nothing to decide', () => {
  it('is told, and its handler runs on the way out', () => {
    // The informational half: `Alert.alert('Could not start channel', why)`.
    // Dismissing it is the only answer there is, so the handler follows it.
    const { io, told, asked } = spy();
    const pressed = jest.fn();
    showAlert(io, 'Could not start channel', 'The server said no', [
      { text: 'OK', onPress: pressed },
    ]);
    expect(told).toEqual(['Could not start channel\n\nThe server said no']);
    expect(asked).toEqual([]);
    expect(pressed).toHaveBeenCalled();
  });

  it('takes no buttons as the single OK it is', () => {
    const { io, told } = spy();
    showAlert(io, 'Could not open link', 'https://example.test');
    expect(told).toEqual(['Could not open link\n\nhttps://example.test']);
  });
});

describe('an alert with one choice against a cancel', () => {
  it('asks, and runs the choice when it is accepted', () => {
    const { io, asked, say } = spy();
    const left = jest.fn();
    const stayed = jest.fn();
    say(true);
    showAlert(io, 'Leave channel?', 'You can be invited back.', [
      { text: 'Cancel', style: 'cancel', onPress: stayed },
      { text: 'Leave', style: 'destructive', onPress: left },
    ]);
    expect(asked).toEqual(['Leave channel?\n\nYou can be invited back.']);
    expect(left).toHaveBeenCalled();
    expect(stayed).not.toHaveBeenCalled();
  });

  it('takes the cancel when it is refused', () => {
    const { io, say } = spy();
    const left = jest.fn();
    const stayed = jest.fn();
    say(false);
    showAlert(io, 'Leave channel?', undefined, [
      { text: 'Cancel', style: 'cancel', onPress: stayed },
      { text: 'Leave', style: 'destructive', onPress: left },
    ]);
    expect(left).not.toHaveBeenCalled();
    expect(stayed).toHaveBeenCalled();
  });

  it('finds the cancel by its style rather than its position', () => {
    // The callers disagree about where it goes, and RN's convention is the
    // style. Reading position would have inverted this one.
    const { io, say } = spy();
    const destructive = jest.fn();
    say(true);
    showAlert(io, 'Sign out?', undefined, [
      { text: 'Sign out', style: 'destructive', onPress: destructive },
      { text: 'Stay', style: 'cancel' },
    ]);
    expect(destructive).toHaveBeenCalled();
  });
});

describe('an alert with several choices', () => {
  it('offers them one at a time, in order, and stops at the first taken', () => {
    // No browser equivalent, and one caller: the transcript's export format.
    const { io, asked } = spy();
    const txt = jest.fn();
    const vtt = jest.fn();
    let answers = [false, true];
    const io2: AlertIo = { tell: io.tell, ask: (t) => (asked.push(t), answers.shift() ?? false) };
    showAlert(io2, 'Export transcript', 'Which format?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Text', onPress: txt },
      { text: 'Subtitles', onPress: vtt },
    ]);
    expect(asked).toEqual([
      'Export transcript\n\nWhich format?\n\nText?',
      'Export transcript\n\nWhich format?\n\nSubtitles?',
    ]);
    expect(txt).not.toHaveBeenCalled();
    expect(vtt).toHaveBeenCalled();
  });

  it('takes the cancel when every one is refused', () => {
    const { io, say } = spy();
    const cancelled = jest.fn();
    const chosen = jest.fn();
    say(false);
    showAlert(io, 'Export transcript', 'Which format?', [
      { text: 'Cancel', style: 'cancel', onPress: cancelled },
      { text: 'Text', onPress: chosen },
      { text: 'Data', onPress: chosen },
    ]);
    expect(chosen).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalled();
  });
});
