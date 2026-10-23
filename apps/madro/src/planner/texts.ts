import type { Person, ReasonCode } from '@/planner/engine';

export const ALLERGENS = [
  ['jordnoedder', 'Jordnødder'],
  ['noedder', 'Nødder'],
  ['maelk', 'Mælk'],
  ['aeg', 'Æg'],
  ['gluten', 'Gluten'],
  ['fisk', 'Fisk'],
  ['skaldyr', 'Skaldyr'],
  ['soja', 'Soja'],
  ['sesam', 'Sesam'],
  ['selleri', 'Selleri'],
  ['sennep', 'Sennep'],
  ['sulfit', 'Sulfit'],
  ['lupin', 'Lupin'],
  ['bloeddyr', 'Bløddyr'],
] as const;

/** Det man oftest ikke kan lide. Ordene matcher rettens proteiner og ingredienser. */
export const DISLIKES = ['laks', 'fisk', 'skaldyr', 'svin', 'okse', 'lam', 'chili', 'champignon', 'oliven'] as const;

export const WEEKDAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'] as const;
export const WEEKDAYS_SHORT = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'] as const;

export function names(people: Person[]): string {
  const list = people.map((p) => p.display_name);
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} og ${list[list.length - 1]}`;
}

/** Begrundelsen som en kort sætning. eaters er dem, der spiser med den dag. */
export function reasonText(code: ReasonCode, eaters: Person[]): string {
  switch (code) {
    case 'travl_dag':
      return 'Hurtig ret, fordi I har travlt';
    case 'hensyn':
      return `Tager hensyn til ${names(eaters.filter((p) => p.allergies.length > 0 || p.dislikes.length > 0))}`;
    case 'weekend_tid':
      return 'Der er tid til en længere ret';
    case 'boernefavorit':
      return 'Børnenes favorit';
    case 'boernevenlig':
      return 'Børnevenlig';
    case 'saeson':
      return 'Passer til årstiden';
    case 'ny_protein':
      return 'Afveksling fra i går';
    case 'ingen_hjemme':
      return 'Ingen spiser hjemme';
    case 'ingen_ret':
      return 'Ingen ret passer til alle hensyn';
  }
}
