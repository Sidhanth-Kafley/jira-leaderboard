import {
  Stack,
  Text,
  Inline,
  Box,
  Pressable,
  Heading,
  xcss,
  Button,
  DynamicTable,
  Spinner,
  Lozenge,
  User,
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Link,
  AtlassianTile,
} from '@forge/react';
import { statCard, statCardClickable } from './xcssStyles';
import { metricBadge } from './xcssStyles';
import { invoke } from '@forge/bridge';
import { useState } from 'react';
import {
  IssueSearchFilters,
  JQLStatus,
  LeaderboardRequestPayload,
  StatsTableEntry,
} from '../../types';
import { getGlyph } from '../utils/helpers';
import { AtlassianTileType } from '..';
import { FullContext } from '@forge/bridge';

interface StatCardProps {
  title: string;
  badge: typeof metricBadge;
  metric: number | null;
  view: IssueSearchFilters;
  context: FullContext | undefined;
}

export const StatCard = ({ title, badge, metric, view, context }: StatCardProps) => {
  const filter: IssueSearchFilters = view;
  const [showModal, setShowModal] = useState<boolean>(false);
  const [issues, setIssues] = useState<StatsTableEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  //when pressable element is clicked (wraps the badge)... call the resolver function to get table rows
  const handleClick = () => {
    const status = title === 'Issues In Progress' ? JQLStatus.InProgress : JQLStatus.Done;

    const payload: LeaderboardRequestPayload = {
      filters: filter,
      status: status,
    };

    invoke<StatsTableEntry[]>('getStatsTable', payload).then((data) => {
      setIssues(data.sort((a, b) => b.points - a.points));
      setIsLoading(false);
    });
    setShowModal(true);
  };

  //define table rows and head
  const rows: any[] = issues.map((issue, index) => ({
    key: `row-${index}-${issue.key}`,
    cells: [
      {
        key: `${issue.key}-reporter`,
        content: <User accountId={issue.reporter} />,
      },

      {
        key: `${issue.key}-key`,
        content: <Link href={`${context?.siteUrl}/browse/${issue.key}`}>{issue.key}</Link>,
      },

      {
        key: `${issue.key}-type`,
        content: (
          <AtlassianTile
            size="small"
            glyph={getGlyph(issue.type) as AtlassianTileType}
          ></AtlassianTile>
        ),
      },

      {
        key: `${issue.key}-summary`,
        content: issue.summary,
      },

      {
        key: `${issue.key}-points`,
        content: issue.points,
      },
    ],
  }));

  const head = {
    cells: [
      {
        key: 'Issue Reporter',
        content: 'Reporter',
        isSortable: false,
      },
      {
        key: 'Issue Key',
        content: 'Jira Link',
        isSortable: false,
      },
      {
        key: 'Work Type',
        content: 'Type',
        isSortable: false,
      },
      {
        key: 'Summary',
        content: 'Issue Summary',
        isSortable: false,
      },
      {
        key: 'Points',
        content: 'Issue Points',
        isSortable: false,
      },
    ],
  };

  const isClickable = !!(
    metric &&
    metric > 0 &&
    ['Issues In Progress', 'Issues Completed'].includes(title)
  );

  const cardContent = (
    <Inline alignBlock="center" spread="space-between">
      <Stack space="space.050">
        <Text weight="bold">{title}</Text>
      </Stack>
      <Box xcss={badge}>
        <Text weight="bold" color="color.text.inverse">
          {metric ?? '—'}
        </Text>
      </Box>
    </Inline>
  );

  return (
    <>
      {showModal && (
        <Modal onClose={() => setShowModal(false)} width="large">
          <ModalHeader>
            <ModalTitle>{title}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            {isLoading && <Spinner></Spinner>}
            {!isLoading && <DynamicTable head={head} rows={rows}></DynamicTable>}
          </ModalBody>
          <ModalFooter>
            <Inline space="space.200">
              <Button appearance="default" onClick={() => setShowModal(false)}>
                Close
              </Button>
            </Inline>
          </ModalFooter>
        </Modal>
      )}
      {isClickable ? (
        <Pressable xcss={statCardClickable} onClick={() => handleClick()}>
          {cardContent}
        </Pressable>
      ) : (
        <Box xcss={statCard}>{cardContent}</Box>
      )}
    </>
  );
};
