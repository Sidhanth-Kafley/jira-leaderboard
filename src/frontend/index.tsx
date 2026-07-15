import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Heading,
  Stack,
  SectionMessage,
  Toggle,
  Text,
  DynamicTable,
  User,
  useProductContext,
  Inline,
  Box,
  Lozenge,
  xcss,
  Badge,
  Link,
  AtlassianTile,
  AtlassianIcon,
  DatePicker,
  Button,
  Textfield,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Select,
  CheckboxGroup,
  Tooltip,
  Popup,
  Label,
  Form,
  useForm,
  ModalTransition,
} from '@forge/react';
import { invoke, realtime } from '@forge/bridge';
import {
  IssueSearchFilters,
  AdminCheckResult,
  CompatibilityResult,
  SavedFilter,
  GetTokenResponse,
  ActivityEntry,
  LeaderboardEntry,
  SaveFilterRequestPayload,
} from '../types';
import {
  notificationCard,
  borderCard,
  summaryBox,
  statCard,
  statsRow,
  rankBadge,
  trendBadge,
  metricBadge,
  leftPanelFilterModal,
  rightPanelFilterModal,
  visiblePanel,
  hiddenPanel,
  fixedFilterModalLayout,
  skeletonCard,
  skeletonTopBarButton,
  skeletonTopBarToggle,
  skeletonTableRow,
  skeletonHeadingLine,
  skeletonActivityArea,
  activeFilterTag,
} from './components/xcssStyles';
import { StatCard } from './components/StatCard';
import { NotificationCard } from './components/NotificationCard';
import { DateFilterPanel } from './components/DateFilterPanel';
import { PriorityFilterPanel, PriorityOption } from './components/PriorityFilterPanel';
import { IssueTypeFilterPanel } from './components/IssueTypeFilterPanel';
import { Icon } from '@forge/react';
import AdminPanel from './admin';

export type AtlassianTileType = React.ComponentProps<typeof AtlassianTile>['glyph'];

const App = () => {
  //the name of the channel the frontend subscribes to for events (this won't change)
  const channelName = 'issue-updated';

  //Atlassian app context (used for accountId for user, project id, and siteURL)
  const context = useProductContext();

  // null = still checking, object = result known
  const [boardCompatibility, setBoardCompatibility] = useState<CompatibilityResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  //notifications to display
  const [notifications, setNotifications] = useState<ActivityEntry[]>([]);

  // Current filter configuration
  const [view, setView] = useState<IssueSearchFilters>({});

  //date filter state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // opt out toggle state
  const [isParticipating, setIsParticipating] = useState(true);

  //sprint name filter state
  const [sprintNames, setSprintNames] = useState<string[]>([]);
  const [selectedSprint, setSelectedSprint] = useState<string | null>(null);

  //filter modal state
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState<
    'sprint' | 'date' | 'priority' | 'issueType' | 'savedFilters'
  >('sprint');
  const [filterError, setFilterError] = useState('');

  // Saved filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [selectedSavedFilter, setSelectedSavedFilter] = useState<any>(null);
  const [savedFiltersPopupOpen, setSavedFiltersPopupOpen] = useState<boolean>(false);
  const [showSaveFilterModal, setShowSaveFilterModal] = useState<boolean>(false);
  const { handleSubmit, register, getFieldId } = useForm();

  // admin state variables
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);

  // scoring info modal state
  const [showScoringInfo, setShowScoringInfo] = useState(false);
  const [scoringMultipliers, setScoringMultipliers] = useState<Record<string, number> | null>(null);

  //priority state
  type GlyphType = React.ComponentProps<typeof Icon>['glyph'];

  const priorityOptions: PriorityOption[] = [
    {
      label: 'Highest',
      value: 'Highest',
      icon: 'priority-highest',
      color: 'color.icon.danger',
    },
    {
      label: 'High',
      value: 'High',
      icon: 'priority-high',
      color: 'color.icon.danger',
    },
    {
      label: 'Medium',
      value: 'Medium',
      icon: 'priority-medium',
      color: 'color.icon.warning',
    },
    {
      label: 'Low',
      value: 'Low',
      icon: 'priority-low',
      color: 'color.icon.accent.blue',
    },
    {
      label: 'Lowest',
      value: 'Lowest',
      icon: 'priority-lowest',
      color: 'color.icon.accent.blue',
    },
  ];
  const [selectedPriorities, setSelectedPriorities] = useState<PriorityOption[]>([]);

  //issue type state
  //got default jira issue types from: https://community.atlassian.com/forums/App-Central-articles/Jira-Issue-Types-A-Complete-Guide-for-2026/ba-p/2928042
  const [issueTypeOptions] = useState([
    { label: 'Epic', value: 'Epic' },
    { label: 'Story', value: 'Story' },
    { label: 'Task', value: 'Task' },
    { label: 'Bug', value: 'Bug' },
    { label: 'Sub-task', value: 'Sub-task' },
  ]);
  const [selectedIssueTypes, setSelectedIssueTypes] = useState<any[]>([]);

  const buildIssueSearchFilters = (): IssueSearchFilters | null => {
    const filters: IssueSearchFilters = {};

    if (selectedSprint) {
      filters.sprint = selectedSprint;
    }

    if (selectedPriorities.length > 0) {
      const priorities = selectedPriorities.map((priority) => priority.value);

      filters.priorities = priorities;
    }

    if (startDate && endDate && startDate > endDate) {
      setFilterError('Please enter a valid date range. Start date cannot be later than end date.');
      return null;
    }

    if (startDate) {
      filters.startDate = startDate;
    }

    if (endDate) {
      filters.endDate = endDate;
    }

    if (selectedIssueTypes.length > 0) {
      const issueTypes = [];
      for (const type of selectedIssueTypes) {
        issueTypes.push(type);
      }
      filters.issueTypes = issueTypes;
    }

    setFilterError('');

    return filters;
  };

  const applyFilters = () => {
    const query = buildIssueSearchFilters();

    if (query === null) {
      return;
    }

    setView(query);
    setShowFilters(false);
  };

  const clearActiveFilter = () => {
    setFilterError('');
    setSelectedSavedFilter(null);

    if (activeFilterTab === 'sprint') {
      setSelectedSprint(null);
    }

    if (activeFilterTab === 'date') {
      setStartDate('');
      setEndDate('');
    }

    if (activeFilterTab === 'priority') {
      setSelectedPriorities([]);
    }

    if (activeFilterTab === 'issueType') {
      setSelectedIssueTypes([]);
    }
  };

  const saveFilterConfiguration = async (data: any) => {
    setShowSaveFilterModal(false);

    const payload: SaveFilterRequestPayload = {
      filters: view,
      filterName: data.filterName,
    };

    invoke('saveFilter', payload).then((res: any) => {
      if (res.savedFilter) {
        setSavedFilters((prev) => [res.savedFilter, ...prev]);
      }
    });
  };

  const getSavedFilters = () => {
    invoke('getSavedFilters').then((res: any) => {
      if (res.savedFilters && res.savedFilters.length > 0) {
        setSavedFilters(res.savedFilters);
      }
    });
  };

  const deleteSavedFilter = (filterId: string) => {
    invoke('deleteSavedFilter', { filterId }).then((res: any) => {
      setSavedFilters((prev) => prev.filter((f) => f.filterId !== filterId));
    });
  };

  const handleShowScoringInfo = () => {
    setShowScoringInfo(true);
    invoke('getScoringConfig').then((config: any) => {
      setScoringMultipliers(config.priorityMultipliers);
    });
  };

  //an ordered version of scores (note: might be redundant)
  const [ranks, setRanks] = useState<LeaderboardEntry[]>([]);

  //token for channel authorization
  const [token, setToken] = useState<string | null>(null);

  //rows of the leaderboard
  const rows: any[] = ranks.map((entry, index) => {
    const { accountId, points, issuesCompleted } = entry;

    return {
      key: `row-${index}-${entry.accountId}`,
      cells: [
        {
          key: accountId,
          content: <User accountId={accountId} />,
        },
        {
          key: `${accountId}-points`,
          content: points,
        },
        {
          key: `${accountId}-issues`,
          content: issuesCompleted,
        },
      ],
    };
  });

  //columns of the leaderboard
  const head = {
    cells: [
      {
        key: 'User',
        content: 'User',
        isSortable: false,
      },
      {
        key: 'Points',
        content: 'Points Accumulated',
        isSortable: false,
      },
      {
        key: 'Issues',
        content: 'Issues Completed',
        isSortable: false,
      },
    ],
  };

  const userRowIndex: number = ranks.findIndex((user) => user.accountId == context?.accountId);
  const userStats: LeaderboardEntry = ranks[userRowIndex];

  const onEvent = (event: any) => {
    if (event === 'SUBSCRIPTION_STARTED') {
      return;
    } else if ('isParticipating' in event) {
      if (event.isParticipating == true) {
        invoke<LeaderboardEntry[]>('build', { filters: view }).then((data) => {
          setRanks([...data].sort((a, b) => b.points - a.points));
        });
      } else {
        setRanks((ranks) => ranks.filter((rank) => rank.accountId != event.accountId));
      }
    } else if ('transition' in event) {
      const issueUpdatedEvent = event as ActivityEntry;
      setNotifications((notifications) => [issueUpdatedEvent, ...notifications]);

      setRanks((currentRanks) =>
        currentRanks
          .map((entry) => {
            if (entry.accountId !== issueUpdatedEvent.user) return entry;

            const updatedEntry = { ...entry };

            if (
              issueUpdatedEvent.transition === 'doneFromProgress' ||
              issueUpdatedEvent.transition === 'doneFromOther'
            ) {
              updatedEntry.points += issueUpdatedEvent.points;
              updatedEntry.issuesCompleted += 1;
            } else if (
              issueUpdatedEvent.transition === 'progressFromDone' ||
              issueUpdatedEvent.transition === 'otherFromDone'
            ) {
              updatedEntry.points -= issueUpdatedEvent.points;
              updatedEntry.issuesCompleted -= 1;
            }

            if (
              issueUpdatedEvent.transition === 'progressFromDone' ||
              issueUpdatedEvent.transition === 'progressFromOther'
            ) {
              updatedEntry.issuesInProgress += 1;
            } else if (
              issueUpdatedEvent.transition === 'doneFromProgress' ||
              issueUpdatedEvent.transition === 'otherFromProgress'
            ) {
              updatedEntry.issuesInProgress = Math.max(0, entry.issuesInProgress - 1);
            }

            return updatedEntry;
          })
          .sort((a, b) => b.points - a.points),
      );
    }
  };

  //adapted from Atlassian tutorial on realtime: https://bitbucket.org/atlassian/forge-presentations/src/main/00.forge-app-jam/Ep3_Realtime_Notifications/src/frontend/background-script.jsx
  //calls a resolver function in the backend that generates a token scoped to the project of this leaderboard. This prevents the frontend from receiving events from other projects
  const buildToken = async () => {
    const res = (await invoke('getToken', {
      channel: 'issue-updated',
      context: context,
    })) as GetTokenResponse;
    if (res.token) {
      setToken(res.token);
    }
  };

  //use effect to populate recent activity on page load; empty dependency array as never updated from here
  useEffect(() => {
    invoke<ActivityEntry[]>('getRecentActivity').then((activity) => {
      setNotifications(activity);
    });
  }, []);

  //effect hook to build leaderboard on render, get token and load optout status
  useEffect(() => {
    invoke<CompatibilityResult>('checkBoardCompatibility').then(async (result) => {
      if (!result.isCompatible) {
        setBoardCompatibility(result);
        return;
      }

      // Resolve participation and admin status before revealing the UI so the
      // toggle and label render with the correct values from the first paint.
      const [participation, adminResult] = await Promise.all([
        invoke<boolean>('getParticipationStatus'),
        invoke<AdminCheckResult>('checkIsProjectAdmin'),
      ]);
      setIsParticipating(participation);
      setIsAdmin(adminResult.isAdmin);

      // Reveal the UI now that toggle state is known — no flicker.
      setBoardCompatibility(result);
      // Only proceed with the rest of the setup if the board is compatible
      if (!result.isCompatible) {
        setIsLoading(false);
        return;
      }

      invoke<boolean>('getParticipationStatus').then((data) => setIsParticipating(data));
      invoke<LeaderboardEntry[]>('build', { filters: view }).then((data) => {
        setRanks([...data].sort((a, b) => b.points - a.points));
        // updateRanks(data as [any, number, number, number][]);
        setIsLoading(false);
      });

      // Remaining loads run in the background after the UI is visible.
      // invoke("build", { filters: view }).then((data) => updateRanks(data as [any, number, number, number][]));

      getSavedFilters();

      invoke<string[]>('getSprintNames').then((data) => {
        setSprintNames(data);
      });

      invoke<AdminCheckResult>('checkIsProjectAdmin').then((result) => {
        setIsAdmin(result.isAdmin);
      });
      buildToken();
    });
  }, []);

  useEffect(() => {
    setIsLoading(true);
    invoke<LeaderboardEntry[]>('build', { filters: view }).then((data) => {
      setRanks([...data].sort((a, b) => b.points - a.points));
      setIsLoading(false);
    });
  }, [view]);

  useEffect(() => {
    // The root cause: Forge realtime doesn't send events back to the publisher
    // (the admin's own subscription never fires for their own actions).
    // The realtime subscription correctly handles the case where a user opts out
    // and the admin sees it live
    // but for the admin's own toggle, we now update state immediately and only revert if the invoke fails.
    // Therefore, polling every 5 seconds to make it almost real-time.
    const interval = setInterval(() => {
      invoke<boolean>('getParticipationStatus').then((data) => setIsParticipating(data));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (token) {
      const subscriptionPromise = realtime.subscribeGlobal(channelName, onEvent, { token });

      return () => {
        subscriptionPromise.then((s) => s.unsubscribe());
      };
    }
  }, [token]);

  if (boardCompatibility === null || isLoading) {
    return (
      <Stack space="space.200">
        {/* Top bar */}
        <Inline space="space.200" spread="space-between">
          <Box xcss={skeletonTopBarButton} />
          <Box xcss={skeletonTopBarToggle} />
        </Inline>
        {/* Stat cards */}
        <Inline space="space.200" alignBlock="stretch">
          <Box xcss={skeletonCard} />
          <Box xcss={skeletonCard} />
          <Box xcss={skeletonCard} />
          <Box xcss={skeletonCard} />
        </Inline>
        {/* Table rows */}
        <Stack space="space.100">
          <Box xcss={skeletonTableRow} />
          <Box xcss={skeletonTableRow} />
          <Box xcss={skeletonTableRow} />
          <Box xcss={skeletonTableRow} />
          <Box xcss={skeletonTableRow} />
        </Stack>
        {/* Activity section */}
        <Box xcss={skeletonHeadingLine} />
        <Box xcss={skeletonActivityArea} />
      </Stack>
    );
  }

  // Board is not compatible — show a clear, actionable error
  if (!boardCompatibility.isCompatible) {
    const titleMap: Record<string, string> = {
      no_story_points: 'Story points not configured',
      no_sprint_field: 'Sprint field not configured',
    };
    const bodyMap: Record<string, string> = {
      no_story_points:
        'The leaderboard requires the "Story point estimate" field to be enabled for this project. Please ask your Jira administrator to add the story points field to the project\'s issue types.',
      no_sprint_field:
        'The leaderboard requires the "Sprint" field to be enabled for this project. Please ask your Jira administrator to add the sprint field to the project\'s issue types.',
    };
    const reason = boardCompatibility.reason ?? 'no_boards';
    return (
      <SectionMessage appearance="error" title={titleMap[reason] ?? 'Incompatible board'}>
        <Text>
          {bodyMap[reason] ??
            `This project is not compatible with the leaderboard. Reason: ${reason}`}
        </Text>
      </SectionMessage>
    );
  }

  if (showAdminPanel) {
    return <AdminPanel onBack={() => setShowAdminPanel(false)} isAdmin={isAdmin} token={token} />;
  }

  return (
    <Stack space="space.200">
      <Inline space="space.200" spread="space-between">
        <Inline space="space.200">
          {(isParticipating || isAdmin) && (
            <Button
              appearance="default"
              onClick={() => {
                setFilterError('');
                setShowFilters(true);
              }}
            >
              Filters
            </Button>
          )}
          <Button appearance="primary" onClick={() => setShowSaveFilterModal(true)}>
            Save filter
          </Button>
          <Button appearance="subtle" onClick={handleShowScoringInfo}>
            ⓘ Scoring
          </Button>
        </Inline>
        {(isAdmin || isParticipating) && (
          <Inline alignBlock="center" space="space.200">
            {isAdmin && (
              <Button appearance="default" onClick={() => setShowAdminPanel(true)}>
                Admin Panel
              </Button>
            )}
            <Inline alignBlock="center" space="space.100">
              <Text>
                {isAdmin ? 'Include my work in leaderboard' : 'Participate in leaderboard'}
              </Text>
              <Toggle
                isChecked={isParticipating}
                onChange={() => {
                  const newValue = !isParticipating;
                  setIsParticipating(newValue);
                  invoke('setParticipationStatus', { isParticipating: newValue });
                }}
              />
            </Inline>
          </Inline>
        )}
      </Inline>

      <Inline space="space.100" shouldWrap>
        {view.sprint && (
          <Inline alignBlock="center" space="space.0">
            <Box xcss={activeFilterTag}>
              <Inline alignBlock="center" space="space.025">
                <Text size="small">Sprint: {view.sprint}</Text>

                <Tooltip content="Click to remove filter">
                  <Button
                    appearance="subtle"
                    spacing="none"
                    onClick={() => {
                      setView((prev) => ({ ...prev, sprint: undefined }));
                      setSelectedSprint(null);
                      setSelectedSavedFilter(null);
                    }}
                  >
                    ✕
                  </Button>
                </Tooltip>
              </Inline>
            </Box>
          </Inline>
        )}

        {(view.startDate || view.endDate) && (
          <Inline alignBlock="center" space="space.0">
            <Box xcss={activeFilterTag}>
              <Inline alignBlock="center" space="space.025">
                <Text size="small">
                  Date: {view.startDate || '...'} to {view.endDate || '...'}
                </Text>

                <Tooltip content="Click to remove filter">
                  <Button
                    appearance="subtle"
                    spacing="none"
                    onClick={() => {
                      setView((prev) => ({
                        ...prev,
                        startDate: undefined,
                        endDate: undefined,
                      }));
                      setStartDate('');
                      setEndDate('');
                      setSelectedSavedFilter(null);
                    }}
                  >
                    ✕
                  </Button>
                </Tooltip>
              </Inline>
            </Box>
          </Inline>
        )}

        {view.priorities?.map((priority) => (
          <Inline key={priority} alignBlock="center" space="space.0">
            <Box xcss={activeFilterTag}>
              <Inline alignBlock="center" space="space.025">
                <Text size="small">Priority: {priority}</Text>

                <Tooltip content="Click to remove filter">
                  <Button
                    appearance="subtle"
                    spacing="none"
                    onClick={() => {
                      const updated = view.priorities?.filter((p) => p !== priority) || [];

                      setView((prev) => ({
                        ...prev,
                        priorities: updated.length ? updated : undefined,
                      }));

                      setSelectedPriorities((prev) => prev.filter((p) => p.value !== priority));
                      setSelectedSavedFilter(null);
                    }}
                  >
                    ✕
                  </Button>
                </Tooltip>
              </Inline>
            </Box>
          </Inline>
        ))}

        {view.issueTypes?.map((type) => (
          <Inline key={type} alignBlock="center" space="space.0">
            <Box xcss={activeFilterTag}>
              <Inline alignBlock="center" space="space.025">
                <Text size="small">Type: {type}</Text>

                <Tooltip content="Click to remove filter">
                  <Button
                    appearance="subtle"
                    spacing="none"
                    onClick={() => {
                      const updated = view.issueTypes?.filter((t) => t !== type) || [];

                      setView((prev) => ({
                        ...prev,
                        issueTypes: updated.length ? updated : undefined,
                      }));

                      setSelectedIssueTypes(updated);
                      setSelectedSavedFilter(null);
                    }}
                  >
                    ✕
                  </Button>
                </Tooltip>
              </Inline>
            </Box>
          </Inline>
        ))}
      </Inline>

      {isParticipating || isAdmin ? (
        <>
          <Box xcss={summaryBox}>
            <Inline space="space.200" rowSpace="space.200" alignBlock="stretch" shouldWrap>
              <StatCard
                title="Current Rank"
                badge={rankBadge}
                metric={userRowIndex + 1}
                view={view}
                context={context}
              />
              <StatCard
                title="Points Accumulated"
                badge={metricBadge}
                metric={userStats && userStats.points}
                view={view}
                context={context}
              />
              <StatCard
                title="Issues Completed"
                badge={metricBadge}
                metric={userStats && userStats.issuesCompleted}
                view={view}
                context={context}
              />
              <StatCard
                title="Issues In Progress"
                badge={metricBadge}
                metric={userStats && userStats.issuesInProgress}
                view={view}
                context={context}
              />
            </Inline>
          </Box>
          <DynamicTable head={head} rows={rows} highlightedRowIndex={[userRowIndex]} />
          <Heading size="medium">Recent Activity</Heading>

          <Box xcss={borderCard}>
            <Stack space="space.100">
              {(() => {
                const visibleNotifications = notifications.filter((n) =>
                  ranks.some((rank) => rank.accountId === n.user),
                );
                return visibleNotifications.length === 0 ? (
                  <Text>No notifications yet</Text>
                ) : (
                  <>
                    {visibleNotifications.map((val: ActivityEntry, index: number) => {
                      return (
                        <NotificationCard
                          key={val.issueKey}
                          index={index}
                          val={val}
                          context={context}
                        />
                      );
                    })}
                  </>
                );
              })()}
            </Stack>
          </Box>
        </>
      ) : (
        <SectionMessage title="You are not participating in the leaderboard">
          <Text>
            You have opted out of the leaderboard. Please contact admin to re-enable your
            participation.
          </Text>
        </SectionMessage>
      )}

      {showScoringInfo && (
        <Modal onClose={() => setShowScoringInfo(false)}>
          <ModalHeader>
            <ModalTitle>Scoring Formula</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Stack space="space.200">
              <Text>Each completed issue is scored using the following formula:</Text>
              <Box>
                <Text weight="bold">
                  Score = max(1, ⌈(Story Points + 1) × Priority Multiplier⌉)
                </Text>
              </Box>
              <Stack space="space.050">
                <Text>— Story Points: the estimate on the issue (treated as 0 if not set).</Text>
                <Text>— +1 ensures unestimated issues still contribute at least 1 point.</Text>
                <Text>
                  — The result is multiplied by the priority multiplier, then rounded up to the
                  nearest whole number.
                </Text>
                <Text>— The minimum score is always 1.</Text>
              </Stack>
              <Heading size="small">Current Priority Multipliers</Heading>
              {scoringMultipliers ? (
                <DynamicTable
                  head={{
                    cells: [
                      { key: 'priority', content: 'Priority' },
                      { key: 'multiplier', content: 'Multiplier' },
                      { key: 'example', content: 'Example (3 SP)' },
                    ],
                  }}
                  rows={['Highest', 'High', 'Medium', 'Low', 'Lowest'].map((p) => ({
                    key: p,
                    cells: [
                      { key: 'priority', content: p },
                      { key: 'multiplier', content: `×${scoringMultipliers[p] ?? 1.0}` },
                      {
                        key: 'example',
                        content: `${Math.max(1, Math.ceil((3 + 1) * (scoringMultipliers[p] ?? 1.0)))} pts`,
                      },
                    ],
                  }))}
                />
              ) : (
                <Text>Loading...</Text>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button appearance="primary" onClick={() => setShowScoringInfo(false)}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {showFilters && (
        <Modal onClose={() => setShowFilters(false)} width="large">
          <ModalHeader>
            <ModalTitle>Filters</ModalTitle>
          </ModalHeader>

          <ModalBody>
            <Box xcss={fixedFilterModalLayout}>
              <Inline alignBlock="stretch" space="space.0">
                <Box xcss={leftPanelFilterModal}>
                  <Stack space="space.100">
                    <Button
                      appearance={activeFilterTab === 'sprint' ? 'primary' : 'subtle'}
                      onClick={() => {
                        setActiveFilterTab('sprint');
                        setFilterError('');
                      }}
                    >
                      <Inline alignBlock="center" spread="space-between">
                        <Text>Sprint</Text>
                        {selectedSprint && <Badge>1</Badge>}
                      </Inline>
                    </Button>

                    <Button
                      appearance={activeFilterTab === 'date' ? 'primary' : 'subtle'}
                      onClick={() => {
                        setActiveFilterTab('date');
                        setFilterError('');
                      }}
                    >
                      <Inline alignBlock="center" spread="space-between">
                        <Text>Date</Text>
                        {(startDate || endDate) && <Badge>1</Badge>}
                      </Inline>
                    </Button>

                    <Button
                      appearance={activeFilterTab === 'priority' ? 'primary' : 'subtle'}
                      onClick={() => {
                        setActiveFilterTab('priority');
                        setFilterError('');
                      }}
                    >
                      <Inline alignBlock="center" spread="space-between">
                        <Text>Priority</Text>
                        {selectedPriorities.length > 0 && (
                          <Badge>{selectedPriorities.length}</Badge>
                        )}
                      </Inline>
                    </Button>

                    <Button
                      appearance={activeFilterTab === 'issueType' ? 'primary' : 'subtle'}
                      onClick={() => {
                        setActiveFilterTab('issueType');
                        setFilterError('');
                      }}
                    >
                      <Inline alignBlock="center" spread="space-between">
                        <Text>Issue Type</Text>
                        {selectedIssueTypes.length > 0 && (
                          <Badge>{selectedIssueTypes.length}</Badge>
                        )}
                      </Inline>
                    </Button>

                    <Button
                      appearance={activeFilterTab === 'savedFilters' ? 'primary' : 'subtle'}
                      onClick={() => {
                        setActiveFilterTab('savedFilters');
                        setFilterError('');
                      }}
                    >
                      <Inline alignBlock="center" spread="space-between">
                        <Text>Saved filters</Text>
                      </Inline>
                    </Button>
                  </Stack>
                </Box>

                <Box xcss={rightPanelFilterModal}>
                  <Box xcss={activeFilterTab === 'sprint' ? visiblePanel : hiddenPanel}>
                    <Stack space="space.150">
                      <Text>Search sprint</Text>
                      <Select
                        options={sprintNames.map((s) => ({ label: s, value: s }))}
                        value={
                          selectedSprint ? { label: selectedSprint, value: selectedSprint } : null
                        }
                        onChange={(option) => {
                          setSelectedSavedFilter(null);
                          setSelectedSprint(option.value);
                          setFilterError('');
                        }}
                        placeholder="Select a sprint"
                        isClearable
                      />
                    </Stack>
                  </Box>

                  <Box xcss={activeFilterTab === 'date' ? visiblePanel : hiddenPanel}>
                    <Stack space="space.150">
                      {filterError && (
                        <SectionMessage appearance="error">
                          <Text>{filterError}</Text>
                        </SectionMessage>
                      )}

                      <DateFilterPanel
                        startDate={startDate}
                        endDate={endDate}
                        onStartDateChange={(value) => {
                          setSelectedSavedFilter(null);
                          setStartDate(value);
                          setFilterError('');
                        }}
                        onEndDateChange={(value) => {
                          setSelectedSavedFilter(null);
                          setEndDate(value);
                          setFilterError('');
                        }}
                      />
                    </Stack>
                  </Box>

                  <Box xcss={activeFilterTab === 'priority' ? visiblePanel : hiddenPanel}>
                    <PriorityFilterPanel
                      priorityOptions={priorityOptions}
                      selectedPriorities={selectedPriorities}
                      onPriorityChange={(option) => {
                        setSelectedSavedFilter(null);
                        setSelectedPriorities(option);
                        setFilterError('');
                      }}
                    />
                  </Box>

                  <Box xcss={activeFilterTab === 'issueType' ? visiblePanel : hiddenPanel}>
                    <IssueTypeFilterPanel
                      issueTypeOptions={issueTypeOptions}
                      selectedIssueTypes={selectedIssueTypes}
                      onIssueTypeChange={(values) => {
                        setSelectedSavedFilter(null);
                        setSelectedIssueTypes(values || []);
                        setFilterError('');
                      }}
                    />
                  </Box>
                  <Box xcss={activeFilterTab === 'savedFilters' ? visiblePanel : hiddenPanel}>
                    <Stack space="space.150">
                      <Text>Saved filters</Text>
                      <Select
                        options={savedFilters.map((f) => ({ label: f.filterName, value: f }))}
                        value={selectedSavedFilter}
                        onChange={(option) => {
                          setSelectedSavedFilter(option);
                          if (!option) {
                            return;
                          }

                          const filters: IssueSearchFilters = option.value.filter;

                          setSelectedSprint(
                            filters.sprint
                              ? (sprintNames.find((s) => s === filters.sprint) ?? null)
                              : null,
                          );
                          setSelectedPriorities(
                            filters.priorities
                              ? priorityOptions.filter((p) => filters.priorities!.includes(p.value))
                              : [],
                          );
                          setSelectedIssueTypes(filters.issueTypes ?? []);
                          setStartDate(filters.startDate ?? '');
                          setEndDate(filters.endDate ?? '');
                        }}
                        placeholder="Select a saved filter"
                        isClearable
                      />
                    </Stack>
                  </Box>
                </Box>
              </Inline>
            </Box>
          </ModalBody>

          <ModalFooter>
            <Inline space="space.200">
              <Button appearance="default" onClick={clearActiveFilter}>
                Clear
              </Button>

              <Button appearance="default" onClick={() => setShowFilters(false)}>
                Cancel
              </Button>

              <Button appearance="primary" onClick={applyFilters}>
                Apply
              </Button>
            </Inline>
          </ModalFooter>
        </Modal>
      )}
      <ModalTransition>
        {showSaveFilterModal && (
          <Modal width="small" onClose={() => setShowSaveFilterModal(false)}>
            <Form onSubmit={handleSubmit(saveFilterConfiguration)}>
              <ModalHeader>
                <ModalTitle>Save filter</ModalTitle>
              </ModalHeader>
              <ModalBody>
                <Label labelFor={getFieldId('filterName')}>Filter name</Label>
                <Textfield
                  {...register('filterName', { required: true })}
                  appearance="standard"
                  placeholder="Name your filter"
                />
              </ModalBody>
              <ModalFooter>
                <Button appearance="subtle" onClick={() => setShowSaveFilterModal(false)}>
                  Cancel
                </Button>
                <Button appearance="primary" type="submit">
                  Save
                </Button>
              </ModalFooter>
            </Form>
          </Modal>
        )}
      </ModalTransition>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
