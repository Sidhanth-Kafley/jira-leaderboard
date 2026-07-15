import { Stack, Text, CheckboxGroup } from '@forge/react';

type IssueTypeFilterPanelProps = {
  issueTypeOptions: { label: string; value: string }[];
  selectedIssueTypes: string[];
  onIssueTypeChange: (option: string[]) => void;
};

export const IssueTypeFilterPanel = ({
  issueTypeOptions,
  selectedIssueTypes,
  onIssueTypeChange,
}: IssueTypeFilterPanelProps) => {
  return (
    <Stack space="space.150">
      <Text>Select issue type</Text>
      <CheckboxGroup
        name="issue-type"
        options={issueTypeOptions}
        value={selectedIssueTypes}
        onChange={(values) => onIssueTypeChange(values as string[])}
      />
    </Stack>
  );
};
