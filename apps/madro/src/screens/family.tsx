import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { errorText } from '@/lib/errors';
import { fetchPersons, type FamilyMember } from '@/lib/meal-plan';
import { supabase } from '@/lib/supabase';
import { ALLERGENS, DISLIKES, WEEKDAYS, WEEKDAYS_SHORT } from '@/planner/texts';
import { useHousehold } from '@/providers/household';
import { useSession } from '@/providers/session';

type Editable = Pick<FamilyMember, 'birth_year' | 'allergies' | 'dislikes' | 'away_days'>;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** "Hvem er I?": hvem der spiser med, deres allergier, hvad de ikke kan lide, og samvær. */
export function Family() {
  const { household } = useHousehold();
  const { session } = useSession();
  const [persons, setPersons] = useState<FamilyMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [childName, setChildName] = useState('');
  const [childYear, setChildYear] = useState('');
  const [adding, setAdding] = useState(false);
  const canEditAll = household?.role === 'owner' || household?.role === 'adult';

  const load = useCallback(() => {
    if (!household) return;
    fetchPersons(household.id)
      .then(setPersons)
      .catch((e) => setError(errorText(e)));
  }, [household]);

  useFocusEffect(load);

  // Gemmer med det samme og ruller tilbage, hvis det ikke lykkes.
  async function update(person: FamilyMember, changes: Partial<Editable>) {
    const before = persons;
    setPersons(persons.map((p) => (p.id === person.id ? { ...p, ...changes } : p)));
    setError(null);
    const { error } = await supabase.from('persons').update(changes).eq('id', person.id);
    if (error) {
      setPersons(before);
      setError(errorText(error));
    }
  }

  async function addChild() {
    if (!household) return;
    setAdding(true);
    setError(null);
    const year = Number(childYear);
    const { error } = await supabase.from('persons').insert({
      household_id: household.id,
      display_name: childName.trim(),
      birth_year: Number.isInteger(year) && year > 1900 ? year : null,
    });
    setAdding(false);
    if (error) {
      setError(errorText(error));
      return;
    }
    setChildName('');
    setChildYear('');
    load();
  }

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        Madro bruger det her, når ugens plan laves. Ingen ret med noget, en person ved bordet ikke tåler, og
        hurtige retter på de dage, I har travlt.
      </ThemedText>

      {persons.map((person) => (
        <PersonCard
          key={person.id}
          person={person}
          editable={canEditAll || person.user_id === session?.user.id}
          onChange={(changes) => update(person, changes)}
        />
      ))}

      {canEditAll && (
        <ThemedView type="card" style={styles.card}>
          <ThemedText type="head">Tilføj et barn</ThemedText>
          <ThemedText type="sub" themeColor="textSecondary">
            Børn har ingen konto. I styrer deres hensyn herfra.
          </ThemedText>
          <TextField label="Navn" value={childName} onChangeText={setChildName} />
          <TextField
            label="Fødselsår"
            value={childYear}
            onChangeText={setChildYear}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="Fx 2021"
          />
          <Button title="Tilføj" variant="secondary" onPress={addChild} loading={adding} disabled={!childName.trim()} />
        </ThemedView>
      )}

      {error && (
        <ThemedText themeColor="bad" accessibilityRole="alert">
          {error}
        </ThemedText>
      )}

      <ThemedText type="foot" themeColor="textSecondary">
        Allergenerne i retterne er udledt af ingredienslisten. Tjek altid opskriften, før I laver maden.
      </ThemedText>
    </Screen>
  );
}

function PersonCard({
  person,
  editable,
  onChange,
}: {
  person: FamilyMember;
  editable: boolean;
  onChange: (changes: Partial<Editable>) => void;
}) {
  const [year, setYear] = useState(person.birth_year ? String(person.birth_year) : '');

  function saveYear() {
    const value = Number(year);
    const next = year.trim() === '' ? null : Number.isInteger(value) && value > 1900 ? value : person.birth_year;
    if (next !== person.birth_year) onChange({ birth_year: next });
  }

  return (
    <ThemedView type="card" style={styles.card}>
      <ThemedText type="title">{person.display_name}</ThemedText>

      <TextField
        label="Fødselsår"
        value={year}
        onChangeText={setYear}
        onBlur={saveYear}
        onSubmitEditing={saveYear}
        keyboardType="number-pad"
        maxLength={4}
        editable={editable}
      />

      <Section title="Allergier">
        {ALLERGENS.map(([code, label]) => (
          <Chip
            key={code}
            label={label}
            selected={person.allergies.includes(code)}
            disabled={!editable}
            onPress={() => onChange({ allergies: toggle(person.allergies, code) })}
          />
        ))}
      </Section>

      <Section title="Kan ikke lide">
        {DISLIKES.map((word) => (
          <Chip
            key={word}
            label={word}
            selected={person.dislikes.includes(word)}
            disabled={!editable}
            onPress={() => onChange({ dislikes: toggle(person.dislikes, word) })}
          />
        ))}
      </Section>

      <Section title="Spiser ikke med om">
        {WEEKDAYS_SHORT.map((label, i) => (
          <Chip
            key={label}
            label={label}
            accessibilityLabel={WEEKDAYS[i]}
            selected={person.away_days.includes(i + 1)}
            disabled={!editable}
            onPress={() => onChange({ away_days: toggle(person.away_days, i + 1).sort((a, b) => a - b) })}
          />
        ))}
      </Section>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="sub" themeColor="textSecondary">
        {title}
      </ThemedText>
      <ChipRow>{children}</ChipRow>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
});
