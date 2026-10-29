import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from './Button';

describe('Button', () => {
  it('renders its label and handles presses', async () => {
    const onPress = jest.fn();
    await render(<Button label="Start session" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Start session' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Start session" onPress={onPress} disabled />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });
});
