"""Bygger startkataloget af retter ud fra retteliste.csv.

Skriver to filer, som altid skal følges ad:
- startkatalog.json, som regelmotorens test bruger
- en migration, der lægger de samme retter ind i databasen

Kør fra repoets rod: python3 supabase/catalog/build.py
"""

import csv
import json
import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MIGRATION = ROOT.parent / 'migrations' / '20261023190100_startkatalog.sql'

# Faste id'er, så en ret beholder sit id, når kataloget bygges igen.
NAMESPACE = uuid.UUID('6f1c2b8e-4d4a-4c55-9a51-0d1f3c7e9b10')

ALL_YEAR = list(range(1, 13))
SPRING_SUMMER = [3, 4, 5, 6, 7, 8]
AUTUMN_WINTER = [9, 10, 11, 12, 1, 2]
CHRISTMAS = [11, 12, 1, 2]

# Rækkefølgen bestemmer rettens hovedprotein, som bruges til afveksling.
PROTEINS = [
    ('kylling', r'kylling|høns|chicken'),
    ('okse', r'okse'),
    ('lam', r'\blam\b'),
    ('svin', r'svin|mørbrad|kotelet|flæsk|spareribs|skinke|bacon|pølse|medister|chorizo'),
    ('hakket', r'hakket|kødbolle|kødboller|\bkød\b'),
    ('laks', r'laks'),
    ('fisk', r'fisk|tun\b|tunbøf|kuller'),
    ('skaldyr', r'reje'),
    ('and', r'^and\b|andebryst'),
    ('aeg', r'^æg|\bæg\b'),
]

# Bevidst forsigtig: hellere ét allergen for meget end ét for lidt.
ALLERGENS = [
    ('jordnoedder', r'peanut'),
    ('noedder', r'nødder|cashew|mandel|valnød'),
    ('skaldyr', r'reje'),
    ('fisk', r'fisk|laks|\btun|kuller'),
    ('aeg', r'\bæg|mayo|remoulade|tunmousse|carbonara|tartar|pandekage|deller|kødbolle|boller|farsbrød|fiskefars|tærte|mørdej|rasp|paner|nugget|pops|bites|fiskefing'),
    ('maelk', r'fløde|ost\b|ost,|oste|parmesan|bechamel|smør|yoghurt|tzatziki|mælk|creme|cheddar|feta|mozzarella|rondelé|kartoffelmos|pandekage|tartelet|tærte|deller|kødbolle|boller i karry|brun sovs|sovs'),
    ('gluten', r'pasta|spaghetti|lasagne|nudle|brød|bolle|pizza|tortilla|wrap|rasp|\bmel\b|mel/|pandekage|tartelet|mørdej|tærte|suppehorn|tortellini|orzo|bulgur|pita|paner|nugget|pops|fiskefing|fish and chips|burger|sandwich|ramen|soja|teriyaki|gochujang|deller|kødbolle|boller|farsbrød|karry|schnitzel|chow mein|chicken bites|katsu'),
    ('soja', r'soja|edamame|teriyaki|gochujang|tofu'),
    ('sesam', r'sesam'),
    ('sennep', r'sennep|dijon|remoulade|tartar'),
    ('selleri', r'selleri|bouillon'),
]


def months(season: str) -> list[int]:
    s = season.lower()
    if s.startswith('hele året'):
        return ALL_YEAR
    if s.startswith('jul'):
        return CHRISTMAS
    if s.startswith('forår'):
        return SPRING_SUMMER
    if s.startswith('efterår'):
        return AUTUMN_WINTER
    raise ValueError(f'Ukendt sæson: {season}')


def effort(text: str) -> str:
    return {'Hurtig': 'hurtig', 'Mellem': 'mellem', 'Lang/weekend': 'lang'}[text]


def split(text: str) -> list[str]:
    return [part.strip() for part in text.split(',') if part.strip()]


def tags(text: str, rules) -> list[str]:
    return [name for name, pattern in rules if re.search(pattern, text)]


def build() -> list[dict]:
    dishes = []
    with open(ROOT / 'retteliste.csv', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            name = row['Ret'].strip()
            protein = row['Hovedprotein'].strip()
            ingredients = split(row['Nøgleingredienser (til tilbudsmatch)'])
            text = ' '.join([name, protein, *ingredients]).lower()
            kid = row['Børnevenlig (1 og 5 år)']
            dishes.append({
                'id': str(uuid.uuid5(NAMESPACE, name.lower())),
                'name': name,
                'main_protein': protein,
                'protein_tags': tags(f'{protein} {name}'.lower(), PROTEINS) or ['andet'],
                'vegetables': row['Grøntsag/vitaminkilde'].strip(),
                'ingredients': ingredients,
                'allergens': tags(text, ALLERGENS),
                'kid_friendly': 'ja' if kid.startswith('Ja') else 'delvist',
                'kid_favorite': 'favorit' in kid,
                'double_portion': row['Dobbeltportion'].startswith('Ja'),
                'effort': effort(row['Tidsforbrug']),
                'months': months(row['Sæson']),
                'recipe_url': row['Opskriftslink'].strip() or None,
                'note': row['Noter'].strip(),
            })
    ids = [d['id'] for d in dishes]
    assert len(ids) == len(set(ids)), 'To retter har samme navn'
    return dishes


def sql_text(value: str | None) -> str:
    return 'null' if value is None else "'" + value.replace("'", "''") + "'"


def sql_array(values: list, cast: str) -> str:
    inner = ', '.join(sql_text(str(v)) for v in values)
    return f'array[{inner}]::{cast}' if values else f"'{{}}'::{cast}"


def write(dishes: list[dict]) -> None:
    (ROOT / 'startkatalog.json').write_text(
        json.dumps(dishes, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    rows = []
    for d in dishes:
        rows.append('  (' + ', '.join([
            sql_text(d['id']) + '::uuid',
            sql_text(d['name']),
            sql_text(d['main_protein']),
            sql_array(d['protein_tags'], 'text[]'),
            sql_text(d['vegetables']),
            sql_array(d['ingredients'], 'text[]'),
            sql_array(d['allergens'], 'public.allergen[]'),
            sql_text(d['kid_friendly']) + '::public.kid_friendly',
            'true' if d['kid_favorite'] else 'false',
            'true' if d['double_portion'] else 'false',
            sql_text(d['effort']) + '::public.dish_effort',
            sql_array(d['months'], 'smallint[]'),
            sql_text(d['recipe_url']),
            sql_text(d['note']),
        ]) + ')')

    MIGRATION.write_text(
        '-- Startkataloget: retter alle husstande kan vælge imellem.\n'
        '-- Genereret af supabase/catalog/build.py ud fra retteliste.csv. Ret ikke i hånden.\n\n'
        'insert into public.dishes (id, name, main_protein, protein_tags, vegetables, ingredients,\n'
        '  allergens, kid_friendly, kid_favorite, double_portion, effort, months, recipe_url, note)\n'
        'values\n' + ',\n'.join(rows) + ';\n',
        encoding='utf-8')


if __name__ == '__main__':
    result = build()
    write(result)
    print(f'{len(result)} retter skrevet')
