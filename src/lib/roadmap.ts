/**
 * The 6-month roadmap template — build guide §9.2, transcribed verbatim from
 * the Figma's State Summary screen.
 *
 * Unlike everything else derived per-facility, this is a **fixed activity
 * sequence**, not something computed from the assessment data — the client's
 * brief specifies the same six-step plan per archetype regardless of which
 * state or how many facilities are in it. What varies per geography is cost
 * per cell, which needs the same unit-cost table every other investment
 * figure is blocked on (guide §9.1, §17.4) — so activities render for real,
 * cost cells render as pending.
 *
 * Note this conflicts with the assessment deck's own per-archetype
 * timelines (Ready < 6 months, Moderately ready 6–12 months, Not ready
 * Year 1+) — the Figma compresses all three into one 6-month plan. Guide
 * §17.4 flags this as an open question for the assessment team; shipped as
 * the Figma has it, since that is what was asked to be replicated.
 */

import type { Band } from './types';

export interface RoadmapMonth {
  month: 1 | 2 | 3 | 4 | 5 | 6;
  activity: string;
}

export const ROADMAP_TEMPLATE: Record<Band, RoadmapMonth[]> = {
  ready: [
    { month: 1, activity: 'Validate facilities' },
    { month: 2, activity: 'Onboarding and set-up' },
    { month: 3, activity: 'Go-live support' },
    { month: 4, activity: 'Go-live support' },
    { month: 5, activity: 'Go-live support' },
    { month: 6, activity: 'Go-live support' },
  ],
  moderately_ready: [
    { month: 1, activity: 'Confirm facility gaps' },
    { month: 2, activity: 'Infrastructure procurement' },
    { month: 3, activity: 'Infrastructure setup' },
    { month: 4, activity: 'Onboarding and set-up' },
    { month: 5, activity: 'Go-live support' },
    { month: 6, activity: 'Go-live support' },
  ],
  not_ready: [
    { month: 1, activity: 'Confirm facility gaps' },
    { month: 2, activity: 'Infrastructure procurement' },
    { month: 3, activity: 'Infrastructure setup' },
    { month: 4, activity: 'Onboarding and set-up' },
    { month: 5, activity: 'Go-live support' },
    { month: 6, activity: 'Go-live support' },
  ],
};

export const ROADMAP_MONTHS = [1, 2, 3, 4, 5, 6] as const;
