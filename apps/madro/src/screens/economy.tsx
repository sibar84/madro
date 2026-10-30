import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip, ChipRow } from '@/components/chip';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { kroner, periodFor, shortDate, spending } from '@/economy/budget';
import {
  confirmLine,
  deleteReceipt,
  fetchReceipts,
  readReceipt,
  RECEIPT_CATEGORIES,
  receiptError,
  saveHouseholdSettings,
  scanReceipt,
  type Receipt,
  type ReceiptLine,
} from '@/lib/economy';
import { errorText } from '@/lib/errors';
import { today } from '@/lib/meal-plan';
import { useHousehold } from '@/providers/household';

/** En kvittering, der har stået som "læses" så længe, er gået i stå. */
const STALE_MS = 2 * 60_000;

async function functionError(e: unknown): Promise<string> {
  const response = (e as { context?: Response }).context;
  const body = response?.json ? await response.json().catch(() => null) : null;
  return body?.error ? receiptError(body.error) : errorText(e);
}

/** Madbudget, kvitteringer og indbakken med linjer, Madro er i tvivl om. */
export function Economy() {
  const { household, refresh } = useHousehold();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Tidspunktet listen sidst blev hentet. Bruges til at se, om en læsning er gået i stå.
  const [loadedAt, setLoadedAt] = useState(0);
  const canEdit = household?.role === 'owner' || household?.role === 'adult';

  const load = useCallback(() => {
    if (!household) return;
    fetchReceipts(household.id)
      .then((list) => {
        setReceipts(list);
        setLoadedAt(Date.now());
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [household]);

  useFocusEffect(load);

  const period = periodFor(today(), household?.payday ?? 1);
  const lines = receipts.flatMap((r) =>
    r.status === 'done'
      ? r.receipt_lines.map((l) => ({ ...l, purchased_on: r.purchased_on ?? r.created_at.slice(0, 10) }))
      : [],
  );
  const spent = spending(lines, period);
  const inbox = receipts.flatMap((r) =>
    r.receipt_lines.filter((l) => !l.certain && !l.confirmed_at).map((l) => ({ line: l, receipt: r })),
  );

  async function onScan(source: 'camera' | 'library') {
    if (!household) return;
    setError(null);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true };
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Madro har ikke lov til at bruge kameraet. Slå det til under Indstillinger på telefonen.');
        return;
      }
    }
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;
    setScanning(true);
    try {
      await scanReceipt(household.id, { base64: asset.base64, mimeType: asset.mimeType });
    } catch (e) {
      setError(await functionError(e));
    } finally {
      setScanning(false);
      load();
    }
  }

  async function onRetry(receipt: Receipt) {
    setError(null);
    setReceipts(receipts.map((r) => (r.id === receipt.id ? { ...r, status: 'reading', created_at: new Date().toISOString() } : r)));
    try {
      await readReceipt(receipt.id);
    } catch (e) {
      setError(await functionError(e));
    } finally {
      load();
    }
  }

  async function onDelete(receipt: Receipt) {
    setReceipts(receipts.filter((r) => r.id !== receipt.id));
    await deleteReceipt(receipt.id).catch((e) => setError(errorText(e)));
    load();
  }

  async function onConfirm(line: ReceiptLine, category: string) {
    setReceipts(
      receipts.map((r) => ({
        ...r,
        receipt_lines: r.receipt_lines.map((l) =>
          l.id === line.id ? { ...l, category, confirmed_at: new Date().toISOString() } : l,
        ),
      })),
    );
    await confirmLine(line.id, category).catch((e) => {
      setError(errorText(e));
      load();
    });
  }

  return (
    <Screen tabs>
      <ThemedText type="large">Økonomi</ThemedText>

      {household && (editing || (household.food_budget === null && canEdit)) ? (
        <BudgetForm
          budget={household.food_budget}
          payday={household.payday}
          onCancel={household.food_budget === null ? undefined : () => setEditing(false)}
          onSave={async (food_budget, payday) => {
            await saveHouseholdSettings(household.id, { dinner_time: household.dinner_time, food_budget, payday });
            await refresh();
            setEditing(false);
          }}
        />
      ) : (
        <BudgetCard
          budget={household?.food_budget ?? null}
          spent={spent.total}
          weeks={spent.weeks}
          period={period}
          onEdit={canEdit ? () => setEditing(true) : undefined}
        />
      )}

      <View style={styles.section}>
        <ThemedText type="head">Kvitteringer</ThemedText>
        <ThemedText themeColor="textSecondary">
          Tag et billede af kvitteringen. Madro læser varerne og lægger dem i madbudgettet.
        </ThemedText>
        <View style={styles.actions}>
          {Platform.OS !== 'web' && (
            <Button title="Scan kvittering" onPress={() => onScan('camera')} loading={scanning} style={styles.action} />
          )}
          <Button
            title={Platform.OS === 'web' ? 'Vælg billede af kvittering' : 'Vælg billede'}
            variant={Platform.OS === 'web' ? 'primary' : 'secondary'}
            onPress={() => onScan('library')}
            loading={scanning && Platform.OS === 'web'}
            disabled={scanning}
            style={styles.action}
          />
        </View>
        {scanning && (
          <ThemedText type="sub" themeColor="textSecondary" accessibilityLiveRegion="polite">
            Madro læser kvitteringen …
          </ThemedText>
        )}
      </View>

      {error && (
        <ThemedText themeColor="bad" accessibilityRole="alert">
          {error}
        </ThemedText>
      )}

      {inbox.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="head">Tjek {inbox.length === 1 ? 'en linje' : `${inbox.length} linjer`}</ThemedText>
          <ThemedText themeColor="textSecondary">
            Madro er i tvivl om, hvad det her er. Vælg en kategori, så husker budgettet det rigtigt.
          </ThemedText>
          {inbox.map(({ line, receipt }) => (
            <InboxLine key={line.id} line={line} receipt={receipt} onConfirm={(c) => onConfirm(line, c)} />
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator accessibilityLabel="Henter kvitteringerne" />
      ) : (
        receipts.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="cap" themeColor="textSecondary">
              Seneste kvitteringer
            </ThemedText>
            {receipts.slice(0, 20).map((receipt) => (
              <ReceiptRow key={receipt.id} receipt={receipt} now={loadedAt} onRetry={() => onRetry(receipt)} onDelete={() => onDelete(receipt)} />
            ))}
          </View>
        )
      )}
    </Screen>
  );
}

function BudgetCard({
  budget,
  spent,
  weeks,
  period,
  onEdit,
}: {
  budget: number | null;
  spent: number;
  weeks: { weekStart: string; amount: number }[];
  period: { start: string; end: string };
  onEdit?: () => void;
}) {
  const theme = useTheme();
  const left = budget === null ? null : budget - spent;
  const max = Math.max(1, ...weeks.map((w) => w.amount));

  return (
    <ThemedView type="card" style={styles.card}>
      <ThemedText type="cap" themeColor="textSecondary">
        Madbudget · {shortDate(period.start)} til {shortDate(period.end)}
      </ThemedText>
      <ThemedText type="title">
        {budget === null ? `${kroner(spent)} brugt` : `${kroner(spent)} af ${kroner(budget)}`}
      </ThemedText>
      {left !== null && (
        <ThemedText themeColor={left < 0 ? 'bad' : 'textSecondary'}>
          {left < 0 ? `${kroner(-left)} over budgettet` : `${kroner(left)} tilbage`}
        </ThemedText>
      )}
      {budget !== null && (
        <View
          style={[styles.bar, { backgroundColor: theme.line }]}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: budget, now: Math.min(spent, budget) }}>
          <View
            style={[
              styles.fill,
              { width: `${Math.min(100, (spent / budget) * 100)}%`, backgroundColor: left !== null && left < 0 ? theme.bad : theme.text },
            ]}
          />
        </View>
      )}

      <View style={styles.weeks}>
        {weeks.map((w) => (
          <View key={w.weekStart} style={styles.week} accessibilityLabel={`Ugen fra ${shortDate(w.weekStart)}: ${kroner(w.amount)}`}>
            <ThemedText type="foot" themeColor="textSecondary" style={styles.weekLabel}>
              Uge fra {shortDate(w.weekStart)}
            </ThemedText>
            <View style={[styles.weekBar, { backgroundColor: theme.line }]}>
              <View style={[styles.fill, { width: `${(Math.max(0, w.amount) / max) * 100}%`, backgroundColor: theme.textSecondary }]} />
            </View>
            <ThemedText type="foot" style={styles.weekAmount}>
              {kroner(w.amount)}
            </ThemedText>
          </View>
        ))}
      </View>

      {onEdit && <Button title={budget === null ? 'Sæt et budget' : 'Ret budget'} variant="secondary" onPress={onEdit} />}
    </ThemedView>
  );
}

function BudgetForm({
  budget,
  payday,
  onSave,
  onCancel,
}: {
  budget: number | null;
  payday: number;
  onSave: (budget: number | null, payday: number) => Promise<void>;
  onCancel?: () => void;
}) {
  const [amount, setAmount] = useState(budget ? String(budget) : '');
  const [day, setDay] = useState(String(payday));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(amount.replace(/\D/g, ''));
  const dayValue = Number(day);
  const valid = value > 0 && Number.isInteger(dayValue) && dayValue >= 1 && dayValue <= 31;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(value, dayValue);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView type="card" style={styles.card}>
      <ThemedText type="title">Madbudget</ThemedText>
      <ThemedText themeColor="textSecondary">
        Hvor meget vil I bruge på mad fra lønningsdag til lønningsdag? Det, der ikke er mad, tæller ikke med.
      </ThemedText>
      <TextField label="Kroner pr. måned" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="Fx 4500" />
      <TextField label="Lønningsdag" value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} placeholder="Fx 25" />
      <ChipRow>
        {[1, 15, 25, 31].map((d) => (
          <Chip key={d} label={d === 31 ? 'Sidste dag' : `Den ${d}.`} selected={dayValue === d} onPress={() => setDay(String(d))} />
        ))}
      </ChipRow>
      <View style={styles.actions}>
        <Button title="Gem budget" onPress={save} loading={saving} disabled={!valid} style={styles.action} />
        {onCancel && <Button title="Fortryd" variant="secondary" onPress={onCancel} style={styles.action} />}
      </View>
      {error && (
        <ThemedText themeColor="bad" accessibilityRole="alert">
          {error}
        </ThemedText>
      )}
    </ThemedView>
  );
}

function InboxLine({ line, receipt, onConfirm }: { line: ReceiptLine; receipt: Receipt; onConfirm: (category: string) => void }) {
  return (
    <ThemedView type="card" style={styles.card}>
      <ThemedText type="head">{`„${line.text}“`}</ThemedText>
      <ThemedText type="sub" themeColor="textSecondary">
        {[receipt.store, receipt.purchased_on && shortDate(receipt.purchased_on), kroner(line.amount)].filter(Boolean).join(' · ')}
      </ThemedText>
      <ChipRow>
        {RECEIPT_CATEGORIES.map(([code, label]) => (
          <Chip key={code} label={label} selected={line.category === code} onPress={() => onConfirm(code)} />
        ))}
      </ChipRow>
    </ThemedView>
  );
}

function ReceiptRow({
  receipt,
  now,
  onRetry,
  onDelete,
}: {
  receipt: Receipt;
  now: number;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const stale = receipt.status === 'reading' && now - Date.parse(receipt.created_at) > STALE_MS;
  const title = receipt.store || (receipt.status === 'done' ? 'Kvittering' : 'Ny kvittering');
  const status =
    receipt.status === 'failed'
      ? receiptError(receipt.error)
      : receipt.status === 'reading'
        ? stale
          ? 'Kvitteringen blev ikke læst færdig.'
          : 'Læses …'
        : [receipt.purchased_on && shortDate(receipt.purchased_on), `${receipt.receipt_lines.length} varer`].filter(Boolean).join(' · ');

  return (
    <ThemedView type="card" style={styles.row}>
      <View style={styles.rowMain}>
        <View style={styles.grow}>
          <ThemedText>{title}</ThemedText>
          <ThemedText type="foot" themeColor={receipt.status === 'failed' || stale ? 'bad' : 'textSecondary'}>
            {status}
          </ThemedText>
        </View>
        {receipt.total !== null && <ThemedText type="head">{kroner(receipt.total)}</ThemedText>}
      </View>
      {(receipt.status === 'failed' || stale) && (
        <View style={styles.actions}>
          <Button title="Prøv igen" variant="secondary" onPress={onRetry} style={styles.action} />
          <Button title="Slet" variant="secondary" onPress={onDelete} style={styles.action} />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  action: {
    flexGrow: 1,
  },
  bar: {
    height: 8,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  weeks: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  week: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  weekLabel: {
    width: 120,
  },
  weekBar: {
    flex: 1,
    height: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  weekAmount: {
    width: 72,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  row: {
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  grow: {
    flex: 1,
  },
});
