import React, { useEffect, useState } from 'react';
import {
  Button,
  Heading,
  Stack,
  SectionMessage,
  Text,
  Inline,
  Box,
  Textfield,
  xcss,
  DynamicTable,
  User,
  Toggle,
} from '@forge/react';
import { invoke, realtime } from '@forge/bridge';

interface AdminPanelProps {
  onBack: () => void;
  isAdmin: boolean;
  token: string | null;
}

interface ScoringConfig {
  priorityMultipliers: Record<string, number>;
}

interface ProjectUser {
  accountId: string;
  displayName: string;
  isParticipating: boolean;
}

const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'] as const;

const sectionCard = xcss({
  backgroundColor: 'elevation.surface',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'radius.large',
  padding: 'space.300',
});

const multiplierRow = xcss({
  width: '100%',
});

const labelBox = xcss({
  width: '100px',
});

const inputBox = xcss({
  width: '120px',
});

export default function AdminPanel({ onBack, isAdmin, token }: AdminPanelProps): JSX.Element {
  const [multipliers, setMultipliers] = useState<Record<string, string>>({
    Highest: '2.0',
    High: '1.5',
    Medium: '1.0',
    Low: '0.75',
    Lowest: '0.5',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [users, setUsers] = useState<ProjectUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [togglingUser, setTogglingUser] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    invoke<ScoringConfig>('getScoringConfig')
      .then((config) => {
        const asStrings: Record<string, string> = {};
        for (const [k, v] of Object.entries(config.priorityMultipliers)) {
          asStrings[k] = String(v);
        }
        setMultipliers(asStrings);
      })
      .finally(() => setLoading(false));

    invoke<ProjectUser[]>('getProjectUsersWithParticipation')
      .then((data) => setUsers(data))
      .finally(() => setUsersLoading(false));
  }, [isAdmin]);

  useEffect(() => {
    if (!token) return;
    const subscriptionPromise = realtime.subscribeGlobal(
      'issue-updated',
      (event: any) => {
        if (event && 'isParticipating' in event && event.accountId) {
          setUsers((prev) =>
            prev.map((u) =>
              u.accountId === event.accountId
                ? { ...u, isParticipating: event.isParticipating }
                : u,
            ),
          );
        }
      },
      { token },
    );
    return () => {
      subscriptionPromise.then((s) => s.unsubscribe());
    };
  }, [token]);

  if (!isAdmin) {
    return (
      <SectionMessage title="Access Denied" appearance="error">
        <Text>This page is only accessible to Project Admins.</Text>
      </SectionMessage>
    );
  }

  const handleToggleUser = (accountId: string, currentValue: boolean) => {
    // apply immediately so the admin sees the change without waiting for realtime echo
    setUsers((prev) =>
      prev.map((u) => (u.accountId === accountId ? { ...u, isParticipating: !currentValue } : u)),
    );
    setTogglingUser(accountId);
    invoke('setUserParticipationAsAdmin', { accountId, isParticipating: !currentValue })
      .catch(() => {
        // revert on failure
        setUsers((prev) =>
          prev.map((u) =>
            u.accountId === accountId ? { ...u, isParticipating: currentValue } : u,
          ),
        );
      })
      .finally(() => setTogglingUser(null));
  };

  const handleSave = () => {
    for (const priority of PRIORITIES) {
      const num = parseFloat(multipliers[priority] ?? '');
      if (isNaN(num) || num < 0) {
        setValidationError(`Invalid multiplier for "${priority}": must be a non-negative number.`);
        return;
      }
    }
    setValidationError(null);
    setSaveStatus(null);
    setSaving(true);

    const numericMultipliers: Record<string, number> = {};
    for (const priority of PRIORITIES) {
      numericMultipliers[priority] = parseFloat(multipliers[priority]);
    }

    invoke('setScoringConfig', { config: { priorityMultipliers: numericMultipliers } })
      .then(() => setSaveStatus('success'))
      .catch(() => setSaveStatus('error'))
      .finally(() => setSaving(false));
  };

  return (
    <Stack space="space.300">
      <Inline space="space.150" alignBlock="center">
        <Button appearance="subtle" onClick={onBack}>
          ← Back
        </Button>
        <Heading size="large">Admin Panel</Heading>
      </Inline>

      <Box xcss={sectionCard}>
        <Stack space="space.200">
          <Heading size="medium">Scoring Configuration</Heading>
          <Text>
            Set a point multiplier per issue priority. A completed issue scores (Story Points + 1) ×
            Multiplier.
          </Text>

          {loading ? (
            <Text>Loading configuration...</Text>
          ) : (
            <Stack space="space.100">
              {PRIORITIES.map((priority) => (
                <Box key={priority} xcss={multiplierRow}>
                  <Inline space="space.150" alignBlock="center">
                    <Box xcss={labelBox}>
                      <Text weight="bold">{priority}</Text>
                    </Box>
                    <Box xcss={inputBox}>
                      <Textfield
                        value={multipliers[priority] ?? '1.0'}
                        onChange={(e: any) => {
                          const val = e.target.value;
                          setMultipliers((prev) => ({ ...prev, [priority]: val }));
                          setSaveStatus(null);
                        }}
                      />
                    </Box>
                    <Text>×</Text>
                  </Inline>
                </Box>
              ))}
            </Stack>
          )}

          {validationError && (
            <SectionMessage appearance="error" title="Validation Error">
              <Text>{validationError}</Text>
            </SectionMessage>
          )}

          {saveStatus === 'success' && (
            <SectionMessage appearance="success" title="Saved">
              <Text>
                Scoring configuration updated. New scores apply on the next leaderboard load.
              </Text>
            </SectionMessage>
          )}

          {saveStatus === 'error' && (
            <SectionMessage appearance="error" title="Save Failed">
              <Text>Could not save configuration. Please try again.</Text>
            </SectionMessage>
          )}

          <Button appearance="primary" onClick={handleSave} isDisabled={loading || saving}>
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </Stack>
      </Box>
      <Box xcss={sectionCard}>
        <Stack space="space.200">
          <Heading size="medium">User Participation</Heading>
          <Text>Toggle participation status for individual users in this project.</Text>

          {usersLoading ? (
            <Text>Loading users...</Text>
          ) : (
            <DynamicTable
              head={{
                cells: [
                  { key: 'user', content: 'User', isSortable: false },
                  { key: 'participating', content: 'Participating', isSortable: false },
                ],
              }}
              rows={users.map((u) => ({
                key: u.accountId,
                cells: [
                  {
                    key: 'user',
                    content: <User accountId={u.accountId} />,
                  },
                  {
                    key: 'participating',
                    content: (
                      <Toggle
                        isChecked={u.isParticipating}
                        isDisabled={togglingUser === u.accountId}
                        onChange={() => handleToggleUser(u.accountId, u.isParticipating)}
                      />
                    ),
                  },
                ],
              }))}
              rowsPerPage={10}
              defaultPage={1}
            />
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
