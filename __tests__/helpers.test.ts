import { kvs } from '@forge/kvs';
import {
    refineUsers,
    scoreIssue,
    getStoryPointsKey,
    getSavedFilterKey,
    getParticipationKey,
    scoreUsers,
    createJQLQuery,
    getTransitionLabel,
    ScoringConfig,
} from '../src/helpers';
import { JiraIssue, JiraIssueSearchResponse, JiraUser, JQLStatus } from '../src/types';

jest.mock('@forge/kvs', () => ({
    kvs: { get: jest.fn() },
}));

const mockKvsGet = kvs.get as jest.Mock;

beforeEach(() => {
    mockKvsGet.mockReset();
});

const SP_KEY = 'customfield_10016';

const makeIssue = (fields: {
    assigneeId?: string | null;
    status?: string;
    priority?: string;
    storyPoints?: number;
}): JiraIssue => ({
    id: '1',
    key: 'TEST-1',
    fields: {
        assignee: fields.assigneeId ? { accountId: fields.assigneeId } : { accountId: 'user1' },
        status: { name: fields.status ?? 'Done' },
        priority: { name: fields.priority ?? 'Medium' },
        [SP_KEY]: fields.storyPoints ?? 0,
    },
});

const makeUser = (accountId: string): JiraUser => ({
    accountId,
    displayName: accountId,
});

const makeSearchResponse = (issues: JiraIssue[]): JiraIssueSearchResponse => ({
    isLast: true,
    issues,
    names: { [SP_KEY]: 'Story point estimate' },
});

describe('getStoryPointsKey', () => {
    it('returns the key with a value of Story point estimate', () => {
        expect(
            getStoryPointsKey({
                customfield_10016: 'Story point estimate',
                customfield_999: 'Other',
            }),
        ).toBe('customfield_10016');
    });

    it('returns undefined when no matching field exists', () => {
        expect(getStoryPointsKey({ customfield_999: 'Other' })).toBeUndefined();
    });

    it('returns undefined for an empty names dictionary', () => {
        expect(getStoryPointsKey({})).toBeUndefined();
    });
});

describe('getSavedFilterKey', () => {
    it('builds the correct KVS key', () => {
        expect(getSavedFilterKey('proj1', 'user1', 'filter1')).toBe(
            'saved-filter:proj1:user1:filter1',
        );
    });
});

describe('getParticipationKey', () => {
    it('builds the correct KVS key', () => {
        expect(getParticipationKey('proj1', 'user1')).toBe('leaderboard-participation:proj1:user1');
    });
});

describe('refineUsers', () => {
    it('includes users who have not opted out', async () => {
        mockKvsGet.mockResolvedValue(undefined);
        const users = [makeUser('user1'), makeUser('user2')];
        const result = await refineUsers(users, 'proj1');
        expect(result).toEqual(users);
    });

    it('excludes users who have opted out ', async () => {
        mockKvsGet.mockResolvedValueOnce(false).mockResolvedValueOnce(undefined);
        const users = [makeUser('user1'), makeUser('user2')];
        const result = await refineUsers(users, 'proj1');
        expect(result).toEqual([makeUser('user2')]);
    });

    it('returns an empty array when all users have opted out', async () => {
        mockKvsGet.mockResolvedValue(false);
        const users = [makeUser('user1'), makeUser('user2')];
        const result = await refineUsers(users, 'proj1');
        expect(result).toEqual([]);
    });

    it('returns an empty array when given no users', async () => {
        const result = await refineUsers([], 'proj1');
        expect(result).toEqual([]);
    });
});

describe('scoreIssue', () => {
    it('returns 1 when SPKey is undefined', () => {
        const issue = makeIssue({ storyPoints: 0, priority: 'Medium' });
        expect(scoreIssue(issue, undefined)).toBe(1);
    });

    it('scores correctly with story points and medium priority', () => {
        const issue = makeIssue({ storyPoints: 5, priority: 'Medium' });
        expect(scoreIssue(issue, SP_KEY)).toBe(6);
    });

    it('applies high priority multiplier (1.5)', () => {
        const issue = makeIssue({ storyPoints: 3, priority: 'High' });
        expect(scoreIssue(issue, SP_KEY)).toBe(6);
    });

    it('applies highest priority multiplier (2.0)', () => {
        const issue = makeIssue({ storyPoints: 3, priority: 'Highest' });
        expect(scoreIssue(issue, SP_KEY)).toBe(8);
    });

    it('applies low priority multiplier (0.75) with minimum of 1', () => {
        const issue = makeIssue({ storyPoints: 0, priority: 'Low' });
        expect(scoreIssue(issue, SP_KEY)).toBe(1);
    });

    it('returns at least 1 even when score calculation is 0', () => {
        const issue = makeIssue({ storyPoints: 0, priority: 'Lowest' });
        expect(scoreIssue(issue, SP_KEY)).toBeGreaterThanOrEqual(1);
    });

    it('uses medium multiplier for unknown priority', () => {
        const issue = makeIssue({ storyPoints: 4, priority: 'Unknown' });
        expect(scoreIssue(issue, SP_KEY)).toBe(5);
    });

    it('uses a custom scoring config with correct result', () => {
        const customConfig: ScoringConfig = {
            priorityMultipliers: { Medium: 3.0 },
        };
        const issue = makeIssue({ storyPoints: 2, priority: 'Medium' });
        expect(scoreIssue(issue, SP_KEY, customConfig)).toBe(9);
    });
});

describe('scoreUsers', () => {
    it('initialises all users with score of 0', () => {
        const users = [makeUser('user1'), makeUser('user2')];
        const result = scoreUsers(users, makeSearchResponse([]));
        expect(result).toEqual([
            {
                accountId: 'user1',
                points: 0,
                issuesCompleted: 0,
                issuesInProgress: 0,
            },
            {
                accountId: 'user2',
                points: 0,
                issuesCompleted: 0,
                issuesInProgress: 0,
            },
        ]);
    });

    it('adds points and increments issuesCompleted for Done issues', () => {
        const users = [makeUser('user1')];
        const issue = makeIssue({
            assigneeId: 'user1',
            status: 'Done',
            storyPoints: 5,
            priority: 'Medium',
        });
        const result = scoreUsers(users, makeSearchResponse([issue]));
        expect(result[0].points).toBe(6);
        expect(result[0].issuesCompleted).toBe(1);
        expect(result[0].issuesInProgress).toBe(0);
    });

    it('increments issuesInProgress for In Progress issues', () => {
        const users = [makeUser('user1')];
        const issue = makeIssue({
            assigneeId: 'user1',
            status: 'In Progress',
            storyPoints: 5,
        });
        const result = scoreUsers(users, makeSearchResponse([issue]));
        expect(result[0].points).toBe(0);
        expect(result[0].issuesCompleted).toBe(0);
        expect(result[0].issuesInProgress).toBe(1);
    });

    it('skips issues assigned to users not in the user list', () => {
        const users = [makeUser('user1')];
        const issue = makeIssue({
            assigneeId: 'user2',
            status: 'Done',
            storyPoints: 5,
        });
        const result = scoreUsers(users, makeSearchResponse([issue]));
        expect(result[0].points).toBe(0);
    });

    it('skips unassigned issues', () => {
        const users = [makeUser('user1')];
        const issue: JiraIssue = {
            id: '1',
            key: 'TEST-1',
            fields: { assignee: null, status: { name: 'Done' }, [SP_KEY]: 5 },
        };
        const result = scoreUsers(users, makeSearchResponse([issue]));
        expect(result[0].points).toBe(0);
    });

    it('adds scores from multiple issues for the same user', () => {
        const users = [makeUser('user1')];
        const issue1 = makeIssue({
            assigneeId: 'user1',
            status: 'Done',
            storyPoints: 2,
            priority: 'Medium',
        });
        const issue2 = makeIssue({
            assigneeId: 'user1',
            status: 'Done',
            storyPoints: 4,
            priority: 'Medium',
        });
        const result = scoreUsers(users, makeSearchResponse([issue1, issue2]));
        expect(result[0].points).toBe(8);
        expect(result[0].issuesCompleted).toBe(2);
    });

    it('scores two users separately', () => {
        const users = [makeUser('user1'), makeUser('user2')];
        const issue1 = makeIssue({
            assigneeId: 'user1',
            status: 'Done',
            storyPoints: 3,
            priority: 'Medium',
        });
        const issue2 = makeIssue({
            assigneeId: 'user2',
            status: 'In Progress',
        });
        const result = scoreUsers(users, makeSearchResponse([issue1, issue2]));
        expect(result.find((e) => e.accountId === 'user1')?.points).toBe(4);
        expect(result.find((e) => e.accountId === 'user2')?.issuesInProgress).toBe(1);
    });
});

describe('createJQLQuery', () => {
    it('returns base query when no filters provided', () => {
        expect(createJQLQuery('TEST', JQLStatus.Done)).toBe(
            `project = TEST AND status = "Done" AND assignee != EMPTY`,
        );
    });

    it('appends sprint filter when provided', () => {
        const jql = createJQLQuery('TEST', JQLStatus.Done, {
            sprint: 'Sprint 1',
        });
        expect(jql).toContain(`sprint = "Sprint 1"`);
    });

    it('appends startDate filter for Done status', () => {
        const jql = createJQLQuery('TEST', JQLStatus.Done, {
            startDate: '2024-01-01',
        });
        expect(jql).toContain(`resolved >= "2024-01-01"`);
    });

    it('appends endDate filter for Done status', () => {
        const jql = createJQLQuery('TEST', JQLStatus.Done, {
            endDate: '2024-12-31',
        });
        expect(jql).toContain(`resolved <= "2024-12-31"`);
    });

    it('does not append date filters for In Progress status', () => {
        const jql = createJQLQuery('TEST', JQLStatus.InProgress, {
            startDate: '2024-01-01',
            endDate: '2024-12-31',
        });
        expect(jql).not.toContain('resolved');
    });

    it('adds issue type filter when provided', () => {
        const jql = createJQLQuery('TEST', JQLStatus.Done, {
            issueTypes: ['Story', 'Bug'],
        });
        expect(jql).toContain('issuetype in (Story, Bug)');
    });

    it('does not append issueType filter when array is empty', () => {
        const jql = createJQLQuery('TEST', JQLStatus.Done, { issueTypes: [] });
        expect(jql).not.toContain('issuetype');
    });

    it('adds priority filter when provided', () => {
        const jql = createJQLQuery('TEST', JQLStatus.Done, {
            priorities: ['High', 'Medium'],
        });
        expect(jql).toContain('priority in (High, Medium)');
    });

    it('adds assignee filter when provided', () => {
        const jql = createJQLQuery('TEST', JQLStatus.Done, {}, 'user123');
        expect(jql).toContain(`assignee = "user123"`);
    });

    it('combines multiple filters correctly', () => {
        const jql = createJQLQuery('TEST', JQLStatus.Done, {
            sprint: 'Sprint 1',
            startDate: '2024-01-01',
            issueTypes: ['Story'],
        });
        expect(jql).toContain(`sprint = "Sprint 1"`);
        expect(jql).toContain(`resolved >= "2024-01-01"`);
        expect(jql).toContain('issuetype in (Story)');
    });
});

describe('getTransitionLabel', () => {
    it("returns 'doneFromProgress' when moving from In Progress to Done", () => {
        expect(getTransitionLabel('In Progress', 'Done')).toBe('doneFromProgress');
    });

    it("returns 'doneFromOther' when moving to Done from any other status", () => {
        expect(getTransitionLabel('To Do', 'Done')).toBe('doneFromOther');
    });

    it("returns 'progressFromDone' when moving from Done to In Progress", () => {
        expect(getTransitionLabel('Done', 'In Progress')).toBe('progressFromDone');
    });

    it("returns 'otherFromDone' when moving from Done to any other status", () => {
        expect(getTransitionLabel('Done', 'To Do')).toBe('otherFromDone');
    });

    it("returns 'progressFromOther' when moving to In Progress from a not Done status", () => {
        expect(getTransitionLabel('To Do', 'In Progress')).toBe('progressFromOther');
    });

    it("returns 'otherFromProgress' when moving from In Progress to a not Done status", () => {
        expect(getTransitionLabel('In Progress', 'To Do')).toBe('otherFromProgress');
    });

    it("returns 'none' for unrecognised transitions", () => {
        expect(getTransitionLabel('To Do', 'In Review')).toBe('none');
    });

    it("returns 'none' for null statuses", () => {
        expect(getTransitionLabel(null, null)).toBe('none');
    });
});
