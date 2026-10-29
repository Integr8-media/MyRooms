import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { isLanguage, isRTL } from '@/lib/i18n';

import { cn } from './cn';
import { Text } from './Text';

/** A tappable row: title, optional subtitle, optional trailing content and chevron. */
export function ListRow({
  title,
  subtitle,
  trailing,
  onPress,
  testID,
}: {
  title: string;
  subtitle?: string | null;
  trailing?: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const { i18n } = useTranslation();
  const rtl = isLanguage(i18n.language) && isRTL(i18n.language);
  const content = (
    <View className="min-h-12 flex-row items-center gap-3 py-2">
      <View className="flex-1 gap-0.5">
        <Text className="font-medium">{title}</Text>
        {subtitle ? <Text variant="muted">{subtitle}</Text> : null}
      </View>
      {trailing}
      {onPress ? (
        // The chevron points to the reading direction's end.
        <Text variant="muted" className="text-lg" importantForAccessibility="no">
          {rtl ? '‹' : '›'}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      testID={testID}
      className={cn('rounded-lg active:opacity-70')}
    >
      {content}
    </Pressable>
  );
}
