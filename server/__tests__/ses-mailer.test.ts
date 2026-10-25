import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { SesMailer, SES_CONFIGURATION_SET } from '../src/mail';

// The client's send is replaced, so nothing here reaches AWS; what is checked
// is the request each message would have made.
let sent: SendEmailCommand[];

beforeEach(() => {
  sent = [];
  jest
    .spyOn(SESv2Client.prototype, 'send')
    .mockImplementation(async (command: unknown) => {
      sent.push(command as SendEmailCommand);
      return {};
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const mailer = () =>
  new SesMailer({ from: 'support@rvanegas.co', region: 'us-west-2' });

describe('the SES configuration set', () => {
  it('is thefloor, the set thefloor-server is allowed to send through', () => {
    expect(SES_CONFIGURATION_SET).toBe('thefloor');
  });

  it('is named on every kind of message, so none falls back to the identity default', async () => {
    const m = mailer();
    await m.sendCode('a@example.com', '123456');
    await m.sendInvite('b@example.com', 'Ana', 'https://thefloor.rvanegas.co/i/x');
    await m.sendNotification('c@example.com', 'Title', 'Body', 'https://thefloor.rvanegas.co/');

    expect(sent).toHaveLength(3);
    for (const command of sent) {
      expect(command.input.ConfigurationSetName).toBe(SES_CONFIGURATION_SET);
    }
  });
});
