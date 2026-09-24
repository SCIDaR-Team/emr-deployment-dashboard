/**
 * Take personal details out of an assessor's note before it leaves the machine.
 *
 * The notes are about facilities, but some name people — the officer in
 * charge, "Mr …", a phone number. What goes out is the note with those
 * replaced by a marker, and with the facility's own name, LGA and state
 * replaced too, so the text on its way to the model cannot be tied back to a
 * facility or a person. Deliberately heavy-handed: a capitalised word wrongly
 * removed costs the model a little context; a name wrongly kept is the thing
 * this exists to prevent.
 */

export interface RedactContext {
  facility?: string | null;
  lga?: string | null;
  state?: string | null;
}

export interface Redacted {
  text: string;
  /** How many details were replaced, by kind — for the review summary. */
  removed: Record<'phone' | 'email' | 'name' | 'place', number>;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A person's name as written in the notes: one to three capitalised words. */
const NAME = String.raw`[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,2}`;

const TITLES = [
  'Mr',
  'Mrs',
  'Miss',
  'Ms',
  'Dr',
  'Prof',
  'Pharm',
  'Nurse',
  'Matron',
  'Alhaji',
  'Alh',
  'Hajiya',
  'Hajia',
  'Mallam',
  'Malam',
  'Chief',
  'Engr',
  'Rev',
  'Pastor',
  'Barr',
  'Comrade',
  'Hon',
];

/** Words that introduce a person: "OIC: Musa Ali", "the officer in charge, Mrs …". */
const ROLE = String.raw`(?:officer[\s-]*in[\s-]*charge|\bOIC\b|in[\s-]?charge|head of (?:the )?facility|facility head|matron|CHEW|contact person|focal person|name of (?:the )?(?:respondent|OIC|officer)|respondent|interviewee)`;

export function redactNote(note: string, ctx: RedactContext = {}): Redacted {
  const removed: Redacted['removed'] = { phone: 0, email: 0, name: 0, place: 0 };
  let text = note;
  /** Replace every match; `by` returning null keeps that match as it was. */
  const sub = (
    re: RegExp,
    kind: keyof Redacted['removed'],
    by: string | ((...m: string[]) => string | null),
  ) => {
    text = text.replace(re, (...m: string[]) => {
      const out = typeof by === 'string' ? by : by(...m);
      if (out === null) return m[0]!;
      removed[kind] += 1;
      return out;
    });
  };

  sub(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, 'email', '[email]');
  // Nigerian mobiles — 0803 123 4567, +234 803 123 4567, 2348031234567 — and
  // any other run of ten or more digits, spaces and dashes allowed between
  // groups. Dates and counts ("2024-2025", "12 staff") are shorter and stay.
  sub(/(?:\+?234[\s-]?|\b0)[789][01](?:[\s-]?\d){8}\b/g, 'phone', '[phone]');
  sub(/\+?\d(?:[\s-]?\d){9,}/g, 'phone', '[phone]');

  // "Mr Musa Ali", "Dr. Ngozi", "Alhaji Bello".
  sub(new RegExp(String.raw`\b(?:${TITLES.join('|')})\.?\s+${NAME}`, 'g'), 'name', '[name]');
  // "OIC: Musa Ali", "the officer in charge (Ngozi Obi)", "in-charge is Amina".
  sub(
    new RegExp(
      String.raw`(${ROLE})(\s*(?:\(OIC\))?\s*(?:[:,(–—-]|\bis\b|\bnamed\b|\bcalled\b|\bby\b)?\s*)(${NAME})`,
      'gi',
    ),
    'name',
    // The role is matched in any case, the name only when capitalised: "the
    // OIC is not around" says something about staffing and names no one.
    (_m, role, gap, name) => (/^[A-Z]/.test(name!) ? `${role}${gap}[name]` : null),
  );
  // "Name: …", "Contact: …", "Phone: …" — the rest of the line is personal.
  sub(
    /\b(name|contact|phone|tel|telephone|mobile|signature)\s*[:=-]\s*[^\n,;]+/gi,
    'name',
    (m) => `${m.split(/[:=-]/)[0]!.trim()}: [removed]`,
  );

  // The facility itself and where it is: replaced, so the note cannot be tied
  // back to it. Longest first, so "Dala Health Post" goes before "Dala".
  const places: [string, string][] = [];
  if (ctx.facility) places.push([ctx.facility, 'the facility']);
  if (ctx.lga) places.push([ctx.lga, 'the LGA']);
  if (ctx.state) places.push([ctx.state, 'the state']);
  for (const [place, by] of places.sort((a, b) => b[0].length - a[0].length)) {
    if (place.trim().length < 3) continue;
    sub(new RegExp(String.raw`\b${escape(place.trim())}\b`, 'gi'), 'place', by);
  }

  return { text, removed };
}
