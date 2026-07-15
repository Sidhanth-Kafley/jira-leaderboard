import React from 'react';
import { Stack, Text, Button, Inline, Icon, Lozenge } from '@forge/react';

type GlyphType = React.ComponentProps<typeof Icon>['glyph'];
type IconColorType = React.ComponentProps<typeof Icon>['color'];

export type PriorityOption = {
  label: string;
  value: string;
  icon: GlyphType;
  color?: IconColorType;
};

type PriorityFilterPanelProps = {
  priorityOptions: PriorityOption[];
  selectedPriorities: PriorityOption[];
  onPriorityChange: (options: PriorityOption[]) => void;
};

const getLozengeAppearance = (value: string) => {
  switch (value) {
    case 'Highest':
    case 'High':
      return 'removed';
    case 'Medium':
      return 'inprogress';
    case 'Low':
    case 'Lowest':
      return 'success';
    default:
      return 'default';
  }
};

export const PriorityFilterPanel = ({
  priorityOptions,
  selectedPriorities,
  onPriorityChange,
}: PriorityFilterPanelProps) => {
  const togglePriority = (option: PriorityOption) => {
    const isSelected = selectedPriorities.some((item) => item.value === option.value);

    if (isSelected) {
      onPriorityChange(selectedPriorities.filter((item) => item.value !== option.value));
    } else {
      onPriorityChange([...selectedPriorities, option]);
    }
  };

  return (
    <Stack space="space.150">
      <Text>Select priority</Text>

      {priorityOptions.map((option) => {
        const isSelected = selectedPriorities.some((item) => item.value === option.value);

        return (
          <Button
            key={option.value}
            appearance="subtle"
            isSelected={isSelected}
            onClick={() => togglePriority(option)}
          >
            <Inline alignBlock="center" space="space.150">
              <Icon glyph={option.icon} label={option.label} color={option.color} />
              <Lozenge appearance={getLozengeAppearance(option.value)}>{option.label}</Lozenge>
            </Inline>
          </Button>
        );
      })}
    </Stack>
  );
};
