import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { getLocale, setLocale } from '../i18n';

describe('LanguageSwitcher', () => {
  beforeEach(() => setLocale('en'));

  it('offers every supported language', () => {
    render(<LanguageSwitcher />);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['English', 'isiZulu', 'Sesotho', 'Setswana']);
  });

  it('changes the locale when a language is chosen', async () => {
    render(
      <LocaleProvider>
        <LanguageSwitcher />
      </LocaleProvider>,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'st');
    expect(getLocale()).toBe('st');
    expect(screen.getByRole('combobox')).toHaveValue('st');
    expect(document.documentElement.lang).toBe('st');
  });

  it('has an accessible name', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('combobox', { name: 'Choose language' })).toBeInTheDocument();
  });
});
