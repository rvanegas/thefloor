import { ApiError } from '../../api/http';
import { en, es } from '../../i18n';
import { inviteRefusalMessage } from '../inviteRefusal';

/**
 * A refused invite link, said in the reader's language — the one sentence
 * that used to reach a screen in whatever language the server spoke.
 */
describe('a refused invite link', () => {
  const refused = (code?: string) =>
    new ApiError('This invite link cannot be opened.', 400, code);

  it('is said from the catalogue when the server names the refusal', () => {
    expect(inviteRefusalMessage(refused('self'), en.provider)).toBe(
      'This is your own invite link.'
    );
    expect(inviteRefusalMessage(refused('self'), es.provider)).toBe(
      'Este es tu propio enlace de invitación.'
    );
    expect(inviteRefusalMessage(refused('too_many'), es.provider)).toContain(
      'Hoy ya has seguido'
    );
  });

  /**
   * The English catalogue is the server's sentence word for word, so a reader
   * in English sees no difference between an old server and a new one.
   */
  it('says in English exactly what the server says', () => {
    expect(inviteRefusalMessage(refused('unknown'), en.provider)).toBe(
      'This invite link cannot be opened.'
    );
  });

  it('falls back to the server’s sentence for a code it does not know', () => {
    expect(inviteRefusalMessage(refused('something_new'), es.provider)).toBe(
      'This invite link cannot be opened.'
    );
  });

  it('falls back to the server’s sentence from a server that sends no code', () => {
    expect(inviteRefusalMessage(refused(), es.provider)).toBe(
      'This invite link cannot be opened.'
    );
  });

  it('says its own sentence when the server was never reached', () => {
    expect(inviteRefusalMessage(new Error('boom'), es.provider)).toBe(
      'No se ha podido aceptar la invitación.'
    );
  });
});
