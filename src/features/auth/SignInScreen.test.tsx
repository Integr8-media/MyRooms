import '@/lib/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { signIn } from '@/lib/auth/actions';

import { SignInScreen } from './SignInScreen';

jest.mock('@/lib/auth/actions', () => ({ signIn: jest.fn() }));
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ linkError: null, clearLinkError: jest.fn() }),
}));
jest.mock('expo-router', () => ({ Link: ({ children }: { children: unknown }) => children }));

const mockedSignIn = jest.mocked(signIn);

describe('SignInScreen', () => {
  beforeEach(() => {
    mockedSignIn.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('validates before calling the server', async () => {
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByTestId('sign-in-submit'));

    expect(screen.getAllByText('Required.')).toHaveLength(2);
    expect(mockedSignIn).not.toHaveBeenCalled();
  });

  it('signs in with a normalised email and shows server errors', async () => {
    mockedSignIn.mockRejectedValueOnce({ code: 'invalid_credentials', message: 'Invalid login' });
    await render(<SignInScreen />);

    await fireEvent.changeText(screen.getByTestId('sign-in-email'), ' Owner@Example.com ');
    await fireEvent.changeText(screen.getByTestId('sign-in-password'), 'secret123');
    await fireEvent.press(screen.getByTestId('sign-in-submit'));

    expect(mockedSignIn).toHaveBeenCalledWith('owner@example.com', 'secret123');
    expect(await screen.findByText('Wrong email or password.')).toBeTruthy();
  });
});
