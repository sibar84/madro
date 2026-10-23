import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, TextSize, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'large' | 'title' | 'head' | 'default' | 'sub' | 'foot' | 'cap';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  large: {
    fontFamily: Fonts.display,
    fontSize: TextSize.large,
    lineHeight: 40,
    fontWeight: 700,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: TextSize.title,
    lineHeight: 28,
    fontWeight: 700,
  },
  head: {
    fontFamily: Fonts.body,
    fontSize: TextSize.head,
    lineHeight: 22,
    fontWeight: 600,
  },
  default: {
    fontFamily: Fonts.body,
    fontSize: TextSize.body,
    lineHeight: 24,
  },
  sub: {
    fontFamily: Fonts.body,
    fontSize: TextSize.sub,
    lineHeight: 20,
  },
  foot: {
    fontFamily: Fonts.body,
    fontSize: TextSize.foot,
    lineHeight: 18,
  },
  cap: {
    fontFamily: Fonts.body,
    fontSize: TextSize.cap,
    lineHeight: 16,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
