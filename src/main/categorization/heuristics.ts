/**
 * Baseline merchant heuristics.
 *
 * The floor beneath history and the model. Without it a fresh import has no
 * merchant history to draw on and no model configured, so every transaction
 * lands in Uncategorizable — which is useless.
 *
 * This is deliberately NOT the product's categorization strategy. The spec
 * rejects rules-only categorization because a merchant like Target is used for
 * several purposes. These patterns cover only merchants whose category is
 * genuinely unambiguous, at a confidence low enough that the model overrides
 * them when one is configured and high enough to beat nothing.
 */

export interface Heuristic {
  readonly pattern: RegExp;
  readonly categoryId: string;
}

/** Order matters: the first match wins, so put specific patterns first. */
export const MERCHANT_HEURISTICS: readonly Heuristic[] = [
  // Food delivery and restaurants
  { pattern: /uber\s*eats|doordash|door dash|grubhub|seamless|postmates|caviar/i, categoryId: 'dining' },
  { pattern: /starbucks|dunkin|peet|blue bottle|philz|caribou coffee/i, categoryId: 'coffee' },
  { pattern: /mcdonald|chipotle|subway|taco bell|wendy|burger king|panera|shake shack|five guys|popeyes|chick[- ]?fil/i, categoryId: 'dining' },
  { pattern: /restaurant|pizzeria|pizza|sushi|kitchen|grill|cafe|bistro|tavern|brewing|brewery/i, categoryId: 'dining' },

  // Groceries
  { pattern: /trader joe|whole foods|safeway|kroger|publix|wegmans|aldi|sprouts|h[- ]?e[- ]?b|albertsons|food lion|giant eagle|stop (&|and) shop/i, categoryId: 'groceries' },
  { pattern: /grocery|supermarket|market basket/i, categoryId: 'groceries' },

  // Transport
  { pattern: /uber(?!\s*eats)|lyft|taxi|curb\b/i, categoryId: 'rideshare' },
  { pattern: /shell|chevron|exxon|mobil|bp\b|texaco|sunoco|arco|valero|circle k|wawa|speedway/i, categoryId: 'fuel' },
  { pattern: /mta\b|metro|transit|amtrak|caltrain|bart\b|septa|njt\b|subway station/i, categoryId: 'transit' },
  { pattern: /parking|spothero|parkmobile|toll|e[- ]?zpass|fastrak/i, categoryId: 'transport' },

  // Subscriptions and software
  { pattern: /netflix|hulu|disney\+|disney plus|hbo|max\.com|paramount\+|peacock|apple tv|youtube premium/i, categoryId: 'streaming' },
  { pattern: /spotify|apple music|pandora|tidal|audible/i, categoryId: 'streaming' },
  { pattern: /icloud|dropbox|google storage|google one|adobe|microsoft 365|office 365|notion|figma|github|openai|anthropic|slack|zoom\.us|1password|backblaze/i, categoryId: 'software' },

  // Utilities and telecom
  { pattern: /verizon|at&t|t[- ]?mobile|sprint|comcast|xfinity|spectrum|cox communications|centurylink|google fi|mint mobile/i, categoryId: 'utilities' },
  { pattern: /electric|energy|con ?ed|pg&e|duke energy|national grid|water (dept|department|utility)|gas company|waste management/i, categoryId: 'utilities' },

  // Health
  { pattern: /cvs|walgreens|rite aid|pharmacy|duane reade/i, categoryId: 'pharmacy' },
  { pattern: /planet fitness|equinox|gym|crossfit|peloton|classpass|orangetheory|soulcycle/i, categoryId: 'fitness' },
  { pattern: /dental|dentist|medical|clinic|hospital|physician|optometr|urgent care/i, categoryId: 'health' },

  // Travel
  { pattern: /airlines?|delta air|united air|southwest|jetblue|alaska air|american air|spirit air|frontier air/i, categoryId: 'travel' },
  { pattern: /marriott|hilton|hyatt|airbnb|vrbo|booking\.com|expedia|hotels\.com|priceline/i, categoryId: 'travel' },

  // Housing
  { pattern: /\brent\b|property management|apartments|landlord|mortgage|hoa\b/i, categoryId: 'rent' },
  { pattern: /home depot|lowe'?s|ikea|wayfair|ace hardware|true value/i, categoryId: 'home' },

  // Entertainment and shopping
  { pattern: /amc\b|regal cinema|cinemark|movie|theatre|theater|ticketmaster|stubhub|eventbrite/i, categoryId: 'entertainment' },
  { pattern: /steam games|steampowered|playstation|xbox|nintendo|epic games|twitch/i, categoryId: 'entertainment' },
  { pattern: /best buy|newegg|micro center|apple store/i, categoryId: 'electronics' },
  { pattern: /nike|adidas|lululemon|uniqlo|zara|h&m|gap\b|old navy|nordstrom|macy'?s/i, categoryId: 'clothing' },

  // Financial
  { pattern: /venmo|cash app|zelle|paypal transfer|wise\b/i, categoryId: 'financial' },
  { pattern: /interest charge|late fee|annual fee|service charge|overdraft/i, categoryId: 'financial' },

  // Genuinely unknowable — represent honestly rather than guess (Constitution IX)
  { pattern: /atm withdrawal|cash withdrawal|atm fee/i, categoryId: 'uncategorizable' },
];

/**
 * Confidence for a heuristic match.
 *
 * Below the default review threshold on purpose: a rule-based guess is a
 * starting point the user can correct, not an assertion. It also means the
 * model's answer wins whenever one is configured.
 */
export const HEURISTIC_CONFIDENCE = 0.55;

export interface HeuristicMatch {
  readonly categoryId: string;
  readonly confidence: number;
  readonly reasoning: string;
}

/** Best-effort category from the merchant name alone. Null when nothing matches. */
export function classifyByHeuristic(descriptor: string): HeuristicMatch | null {
  for (const { pattern, categoryId } of MERCHANT_HEURISTICS) {
    if (pattern.test(descriptor)) {
      return {
        categoryId,
        confidence: HEURISTIC_CONFIDENCE,
        reasoning: 'Matched a well-known merchant; confirm if this is wrong',
      };
    }
  }
  return null;
}
