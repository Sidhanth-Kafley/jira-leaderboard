import React from 'react';
import { Stack, Text, DatePicker } from '@forge/react';

type DateFilterPanelProps = {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
};

export const DateFilterPanel = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateFilterPanelProps) => {
  return (
    <Stack space="space.150">
      <Text>Start date</Text>
      <DatePicker
        value={startDate}
        onChange={(value) => onStartDateChange(value || '')}
        placeholder="Select start date"
      />

      <Text>End date</Text>
      <DatePicker
        value={endDate}
        onChange={(value) => onEndDateChange(value || '')}
        placeholder="Select end date"
      />
    </Stack>
  );
};
