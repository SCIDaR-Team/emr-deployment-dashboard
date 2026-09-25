/**
 * "Page guide": what each module page is for, what is on it and what each
 * part does. Written, not generated: it describes the page's structure, never
 * its figures, so it stays true as the data changes — but it does need
 * updating when a page gains, loses or renames a section.
 *
 * Opened from the button in the page header (`PageGuideButton`).
 */

export interface PageGuide {
  /** What the page is for, in a sentence or two. */
  intro: string;
  /** The page's parts, top to bottom: what each shows or does. */
  parts: { name: string; text: string }[];
  /** How to move around it, and where to go next. */
  tips: string[];
}

export type PageGuideId = 'coverage' | 'assessment' | 'investment';

/** Said on every page, after its own tips. */
const COMMON_TIPS = [
  'Explain, under a chart, has AI describe what that chart shows and what stands out, from the figures on screen. Check it before quoting it.',
  'Ask the data, at the top right (or press /), answers questions about any of the dashboard’s figures and links to where they are shown.',
];

export const PAGE_GUIDES: Record<PageGuideId, PageGuide> = {
  coverage: {
    intro:
      'How ready each of Nigeria’s 36 states and the FCT is to adopt an EMR, at state level — its State Maturity, from the state-level assessment. Start with the whole country, then open one state.',
    parts: [
      {
        name: 'State filter',
        text: 'Pick a state to see it on its own. Reset goes back to all of them.',
      },
      {
        name: 'Map',
        text: 'Each state is shaded by its maturity band: Mature, Moderately mature, Not mature, or Not assessed. Click a state to open it. The tools beside the map zoom, go full screen, find a place, change the map layers and save the map as an image.',
      },
      {
        name: 'Maturity band',
        text: 'Nationally, how many states are in each band and their share of the states classified; states not yet assessed are counted apart. For one state, its band.',
      },
      {
        name: 'Technical Infrastructure',
        text: 'Electricity access and internet subscriptions per head, from national sources, then subscriptions by type (mobile, fixed broadband, enterprise wi-fi) and by operator.',
      },
      {
        name: 'Workforce Capacity',
        text: 'Health workforce figures, where the source has them.',
      },
      {
        name: 'Leadership & Governance',
        text: 'Four commitments — a governance structure, a data governance policy, a digital health strategy and financial commitment for EMR — answered Yes, Partial or No. Nationally, how many states gave each answer, one square per state.',
      },
      {
        name: 'States',
        text: 'With all states in view: every state and its band, least mature first. Pick one to open it.',
      },
    ],
    tips: [
      'This page is about states as a whole. For the facilities assessed inside them, go to Assessed States; for what fixing them costs, the Investment Plan.',
    ],
  },

  assessment: {
    intro:
      'The primary health care facilities assessed in the 12 states visited: how ready each is to deploy an EMR, the gaps it has, and what closing them costs. Go down from all 12 states to one state, one LGA and one facility.',
    parts: [
      {
        name: 'Filters',
        text: 'State and LGA choose where you are. Setting (rural or urban), Functionality, Funding (BHCPF or not), Domain, Gap area and Readiness narrow the facilities counted everywhere on the page. Search finds a state, LGA or facility by name. Reset clears them.',
      },
      {
        name: 'Map',
        text: 'With all states in view, the 12 states visited are shaded by their maturity band; the others are hatched, as no facilities were surveyed there. Inside a state or an LGA, every facility is a mark coloured and shaped by its readiness, with the LGAs outlined. Hover over an area for its gaps and cost; click a state, LGA or facility to go down a level.',
      },
      {
        name: 'Assessed facilities',
        text: 'How many facilities are in view, split into Ready, Moderately ready and Not ready to deploy an EMR. With a gap area picked, Gap areas in scope takes its place, as the assessment gives no readiness for a gap area.',
      },
      {
        name: 'Gap severity by domain',
        text: 'For each of the four domains, the facilities split by their worst gap in it: No gap, Minor, Moderate or Major.',
      },
      {
        name: 'Gaps and interventions',
        text: 'The headline — gaps to close, interventions to close them, facilities with a gap, and cost — then the interventions by urgency: Major and Moderate before deployment, Minor before or during, Long-term after. Below, each domain’s gap areas, costliest first; open one to see its gaps and the interventions each calls for, with unit prices.',
      },
      {
        name: 'What assessors noted',
        text: 'Where it is shown: themes raised in the notes assessors wrote at each visit, and how many facilities raised each.',
      },
      {
        name: 'States, LGAs or Facilities',
        text: 'The level below where you are, highest investment need first. Pick one to go down.',
      },
      {
        name: 'One facility',
        text: 'Its readiness, its gaps with the interventions and costs for each, what the assessor noted, its details, and the mobile network measured near it.',
      },
    ],
    tips: [
      'The arrow before the page title, or the place names above the map, take you back up a level.',
      'With a state open, State brief — where one is available — gives a one-page summary to save as PDF or Word.',
    ],
  },

  investment: {
    intro:
      'What it costs to close the gaps the assessment found in the 12 states visited, where that money goes, and what a given amount of funding would achieve. Use the State filter to cost one state or all 12; the tabs under the header jump to each section.',
    parts: [
      {
        name: 'Total investment',
        text: 'The whole plan’s cost for the states in view.',
      },
      {
        name: 'Where the money goes',
        text: 'The plan’s cost by the readiness of the facilities it is spent on — Ready, Moderately ready and Not ready — then split by category, facility group, functionality, zone or state.',
      },
      {
        name: 'Costed interventions',
        text: 'Every action the assessment prescribes: the facilities that need it, the quantity, the unit cost and the total. Group by phase, urgency or domain, or list by cost.',
      },
      {
        name: 'Scenarios',
        text: 'Choose the power and connectivity fixes to fund and a target — a budget, a number of facilities or a share Ready — and see how many facilities it makes Ready and what it spends. Money goes to the facilities cheapest to make Ready first. Single shows one scenario, Compare up to four side by side, and By state runs one in each state. Describe, where offered, sets a scenario from a sentence.',
      },
      {
        name: 'Rollout waves',
        text: 'Which states go first, and why: the states in each wave, with their facilities and cost.',
      },
    ],
    tips: [
      'Totals leave out actions the source does not price. Lines at ₦0 are work recorded with no facility-level cost.',
    ],
  },
};

/** A written guide as the drawer lays it out: an intro, then sections of
 *  named entries (a definition list) or unnamed ones (bullets). */
export interface GuideContent {
  intro: string;
  sections: { heading: string; entries: { name?: string; text: string }[] }[];
}

export function pageGuideContent(guide: PageGuide): GuideContent {
  return {
    intro: guide.intro,
    sections: [
      { heading: 'On this page', entries: guide.parts },
      { heading: 'Getting around', entries: [...guide.tips, ...COMMON_TIPS].map((text) => ({ text })) },
    ],
  };
}

/**
 * "How it works" on the Scenarios section: the builder's rules, which the
 * figures follow from. Kept to what `lib/scenarios.ts` does — update it with
 * the engine.
 */
export const SCENARIO_GUIDE: GuideContent = {
  intro:
    'Scenarios answers one question: if you fund some of the power and connectivity fixes, how many more facilities become Ready to deploy an EMR, and what does it cost? Every figure is worked out here, from each facility’s own assessment — none is estimated by AI.',
  sections: [
    {
      heading: 'Why these six fixes',
      entries: [
        {
          name: 'What makes a facility Ready',
          text: 'A facility is Ready once it has no Major or Moderate Technical Infrastructure gap left. In this assessment those gaps are all in power and facility connectivity, and six fixes close them: full solar system, solar top-up, router, FibreX, network extension and satellite.',
        },
        {
          name: 'What the builder leaves out',
          text: 'The rest of the plan — devices, backup power repair, wiring, furniture, grid connections, and the gaps in other domains — still has to be paid for, but none of it changes a facility’s readiness, so it is not in the builder. Whole plan shows where the scenario’s money sits within the full plan.',
        },
      ],
    },
    {
      heading: 'How the money is spent',
      entries: [
        {
          name: 'What one facility costs',
          text: 'Each facility not yet Ready needs one or more of the six fixes. Its cost to make Ready is the price of those fixes, in the quantities it needs.',
        },
        {
          name: 'All or nothing',
          text: 'A facility becomes Ready only when every fix it needs is funded. If it needs a fix you have not chosen, none of its fixes are bought — no money goes on a router at a facility that would still have no power.',
        },
        {
          name: 'Cheapest first',
          text: 'Money goes to the facilities cheapest to make Ready first. That makes as many facilities Ready as a budget allows, and reaches a number of facilities for as little as possible. Between facilities that cost the same, Moderately ready ones go before Not ready.',
        },
        {
          name: 'Where a budget stops',
          text: 'At the first facility it cannot pay for in full, so a little money can be left over.',
        },
      ],
    },
    {
      heading: 'Setting it up',
      entries: [
        {
          name: 'Fixes to fund',
          text: 'Tick the fixes to pay for; each tile shows the fix’s unit price. A chosen tile shows how many facilities it goes to. An unchosen one shows how many more facilities adding it would make Ready — at your budget, or at all under a facilities or share target.',
        },
        {
          name: 'Target',
          text: 'Budget spends up to an amount, or with no limit. Facilities makes that many more facilities Ready. Share reaches a percentage of all facilities Ready, counting those Ready already. If the chosen fixes cannot reach the target, the result says how many fall short.',
        },
        {
          name: 'States',
          text: 'The State filter at the top of the page limits everything; a scenario can also be limited to some states.',
        },
        {
          name: 'Describe',
          text: 'Type a scenario in a sentence: AI sets the builder up from it, then describes the result. Undo puts the section back as it was.',
        },
      ],
    },
    {
      heading: 'Reading the result',
      entries: [
        {
          name: 'Ready before + Unlocked = Total Ready',
          text: 'Facilities Ready today, the ones this scenario makes Ready, and the total, with its share of all facilities in view.',
        },
        {
          name: 'Spend and per facility',
          text: 'What the scenario spends, and that spend divided by the facilities it unlocks.',
        },
        {
          name: 'The curve',
          text: 'Facilities made Ready as spending grows, for the chosen fixes. Where it flattens, each further facility costs more.',
        },
        {
          name: 'Before and after',
          text: 'The facilities in view split by readiness, before the scenario and after it.',
        },
        {
          name: 'Queue, By state, Whole plan',
          text: 'The queue lists every facility not yet Ready, grouped by the fixes it needs, cheapest first, with what one facility in each group costs and where the target is met. By state shows where the facilities unlocked are. Whole plan shows where the money sits in the full plan.',
        },
      ],
    },
    {
      heading: 'Three views',
      entries: [
        { name: 'Single', text: 'One scenario in full.' },
        {
          name: 'Compare',
          text: 'Up to four scenarios side by side, each with its own fixes, states and target. Add to compare copies the Single scenario in.',
        },
        {
          name: 'By state',
          text: 'The same scenario run in each state on its own, ranked. A budget is applied in full to each state, not shared between them.',
        },
      ],
    },
    {
      heading: 'Also',
      entries: [
        { text: 'The scenario is kept in the page’s link, so it can be shared or bookmarked.' },
        { text: 'Explain, under the section, describes the view on screen.' },
      ],
    },
  ],
};
