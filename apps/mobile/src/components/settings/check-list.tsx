import { Check } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

import { useTheme } from "@/theme";
import { SettingsGroup } from "./settings-group";
import { SettingsRow } from "./settings-row";

export interface CheckListOption<T extends string> {
  id: T;
  label: string;
  sub?: string;
}

interface CheckListProps<T extends string> {
  options: CheckListOption<T>[];
  value: T | null;
  onChange: (id: T) => void;
  header?: string;
  footer?: string;
}

/** Checkmark picker (single select) rendered as a grouped list. */
export function CheckList<T extends string>({
  options,
  value,
  onChange,
  header,
  footer,
}: CheckListProps<T>) {
  const { colors } = useTheme();
  return (
    <SettingsGroup header={header} footer={footer}>
      {options.map((o) => (
        <SettingsRow
          key={o.id}
          title={o.label}
          subtitle={o.sub}
          onPress={() => onChange(o.id)}
          trailing={
            value === o.id ? (
              <Check size={19} color={colors.primaryText} strokeWidth={2.6} />
            ) : (
              <View style={{ width: 19 }} />
            )
          }
        />
      ))}
    </SettingsGroup>
  );
}
