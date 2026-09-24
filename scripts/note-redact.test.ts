import { describe, expect, it } from 'vitest';
import { redactNote } from './note-redact';

describe('redactNote', () => {
  it('removes phone numbers and emails', () => {
    const r = redactNote(
      'Call the OIC on 0803 123 4567 or +234 805-555-1234, mail oic@example.com',
    );
    expect(r.text).not.toMatch(/\d{3}/);
    expect(r.text).toContain('[phone]');
    expect(r.text).toContain('[email]');
    expect(r.removed.phone).toBe(2);
    expect(r.removed.email).toBe(1);
  });

  it('keeps dates, counts and short numbers', () => {
    const note = 'Only 2 staff, 3 rooms; renovated 2019-2021; 24 hours power.';
    expect(redactNote(note).text).toBe(note);
  });

  it('removes names after a title or a role', () => {
    const r = redactNote(
      'Mrs. Ngozi Okafor was absent. The officer in charge, Musa Bello, said OIC: Amina needs support. Alhaji Sani donated land.',
    );
    expect(r.text).not.toMatch(/Ngozi|Okafor|Musa|Bello|Amina|Sani/);
    expect(r.text).toContain('The officer in charge, [name]');
    expect(r.removed.name).toBe(4);
  });

  it('leaves a role followed by ordinary words alone', () => {
    const note = 'The officer in charge is not around and the OIC was on leave.';
    expect(redactNote(note).text).toBe(note);
  });

  it('removes what follows a name or phone label', () => {
    expect(redactNote('Contact person: John Doe, 5 staff').text).toBe(
      'Contact person: [name], 5 staff',
    );
    expect(redactNote('Name: A. B. Yusuf; tel - 08031234567').text).toBe(
      'Name: [removed]; tel: [removed]',
    );
  });

  it('replaces the facility, its LGA and its state', () => {
    const r = redactNote('Dala Health Post in Dala LGA, Kano, has no fence.', {
      facility: 'Dala Health Post',
      lga: 'Dala',
      state: 'Kano',
    });
    expect(r.text).toBe('the facility in the LGA LGA, the state, has no fence.');
    expect(r.removed.place).toBe(3);
  });
});
