const handlers: Record<string, Function> = {};

import '../src/resolver';
import { kvs } from '@forge/kvs';
import { signRealtimeToken } from '@forge/realtime';
import {
    issueSearch,
    userSearch,
    getBoardsForProject,
    getSprintsForBoard,
    getUserPermissions,
} from '../src/apiCalls';
import { publishEvent } from '../src/index';

jest.mock('@forge/resolver', () => ({
    __esModule: true,
    default: class {
        define(name: string, fn: Function) {
            handlers[name] = fn;
        }
        getDefinitions() {
            return jest.fn();
        }
    },
}));

jest.mock('@forge/kvs', () => ({
    kvs: {
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        query: jest.fn(),
    },
    WhereConditions: { beginsWith: jest.fn((v) => v) },
    MetadataField: { UPDATED_AT: 'updatedAt' },
}));

jest.mock('@forge/realtime', () => ({
    signRealtimeToken: jest.fn(),
    publishGlobal: jest.fn(),
}));

jest.mock('../src/apiCalls', () => ({
    issueSearch: jest.fn(),
    userSearch: jest.fn(),
    getBoardsForProject: jest.fn(),
    getSprintsForBoard: jest.fn(),
    getUserPermissions: jest.fn(),
}));

jest.mock('../src/index', () => ({
    publishEvent: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('mock-uuid') }));

const mockKvsGet = kvs.get as jest.Mock;
const mockKvsSet = kvs.set as jest.Mock;
const mockKvsDelete = kvs.delete as jest.Mock;
const mockKvsQuery = kvs.query as jest.Mock;
const mockSignRealtimeToken = signRealtimeToken as jest.Mock;
const mockIssueSearch = issueSearch as jest.Mock;
const mockUserSearch = userSearch as jest.Mock;
const mockGetBoardsForProject = getBoardsForProject as jest.Mock;
const mockGetSprintsForBoard = getSprintsForBoard as jest.Mock;
const mockGetUserPermissions = getUserPermissions as jest.Mock;
const mockPublishEvent = publishEvent as jest.Mock;

const makeContext = (additionalContext: Record<string, any> = {}) => ({
    accountId: 'user1',
    extension: { project: { id: 'proj1', key: 'TEST' } },
    ...additionalContext,
});

const makeIssueSearchResponse = (additionalFields: Record<string, any> = {}) => ({
    isLast: true,
    issues: [],
    names: { customfield_10016: 'Story point estimate' },
    ...additionalFields,
});

const makeDoneIssue = (accountId = 'user1') => ({
    id: '1',
    key: 'TEST-1',
    fields: {
        assignee: { accountId },
        status: { name: 'Done' },
        priority: { name: 'Medium' },
        issuetype: { name: 'Story' },
        reporter: { accountId: 'reporter1' },
        summary: 'Test issue',
        customfield_10016: 3,
    },
    changelog: {
        histories: [
            {
                items: [
                    {
                        field: 'status',
                        fromString: 'In Progress',
                        toString: 'Done',
                    },
                ],
            },
        ],
    },
});

const mockQueryChain = (results: any[]) => {
    const mockGetMany = jest.fn().mockResolvedValue({ results });
    const chain = { getMany: mockGetMany };
    const withLimit = { limit: jest.fn().mockReturnValue(chain) };
    const withWhere = { where: jest.fn().mockReturnValue(withLimit) };
    mockKvsQuery.mockReturnValue(withWhere);
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('build', () => {
    it('returns scored leaderboard entries', async () => {
        mockUserSearch.mockResolvedValue([{ accountId: 'user1', displayName: 'User 1' }]);
        mockKvsGet.mockResolvedValue(null);
        mockIssueSearch.mockResolvedValue(makeIssueSearchResponse({ issues: [makeDoneIssue()] }));

        const result = await handlers['build']({
            payload: {},
            context: makeContext(),
        });

        expect(result).toHaveLength(1);
        expect(result[0].accountId).toBe('user1');
        expect(result[0].points).toBeGreaterThan(0);
    });

    it('returns empty leaderboard when no users', async () => {
        mockUserSearch.mockResolvedValue([]);
        mockKvsGet.mockResolvedValue(null);
        mockIssueSearch.mockResolvedValue(makeIssueSearchResponse());

        const result = await handlers['build']({
            payload: {},
            context: makeContext(),
        });

        expect(result).toEqual([]);
    });
});

describe('getRecentActivity', () => {
    it('returns activity entries with correct transition labels', async () => {
        mockIssueSearch.mockResolvedValue(makeIssueSearchResponse({ issues: [makeDoneIssue()] }));

        const result = await handlers['getRecentActivity']({
            context: makeContext(),
        });

        expect(result).toHaveLength(1);
        expect(result[0].user).toBe('user1');
        expect(result[0].transition).toBe('doneFromProgress');
        expect(result[0].issueType).toBe('Story');
    });

    it('skips issues missing required fields', async () => {
        const issueWithoutAssignee = {
            ...makeDoneIssue(),
            fields: { ...makeDoneIssue().fields, assignee: null },
        };
        mockIssueSearch.mockResolvedValue(
            makeIssueSearchResponse({ issues: [issueWithoutAssignee] }),
        );

        const result = await handlers['getRecentActivity']({
            context: makeContext(),
        });

        expect(result).toHaveLength(0);
    });

    it('returns empty array on error', async () => {
        mockIssueSearch.mockRejectedValue(new Error('API error'));

        const result = await handlers['getRecentActivity']({
            context: makeContext(),
        });

        expect(result).toEqual([]);
    });
});

describe('getStatsTable', () => {
    it('returns stats entries for the requesting user', async () => {
        mockIssueSearch.mockResolvedValue(makeIssueSearchResponse({ issues: [makeDoneIssue()] }));

        const result = await handlers['getStatsTable']({
            payload: {},
            context: makeContext(),
        });

        expect(result).toHaveLength(1);
        expect(result[0].key).toBe('TEST-1');
        expect(result[0].type).toBe('Story');
        expect(result[0].points).toBeGreaterThan(0);
    });

    it('skips issues missing reporter, issuetype, or summary fields', async () => {
        const incompleteIssue = {
            ...makeDoneIssue(),
            fields: { ...makeDoneIssue().fields, reporter: null },
        };
        mockIssueSearch.mockResolvedValue(makeIssueSearchResponse({ issues: [incompleteIssue] }));

        const result = await handlers['getStatsTable']({
            payload: {},
            context: makeContext(),
        });

        expect(result).toHaveLength(0);
    });
});

describe('getToken', () => {
    it('returns token result when channel is provided', async () => {
        mockSignRealtimeToken.mockResolvedValue({ token: 'tok', errors: [] });

        const result = await handlers['getToken']({
            payload: { channel: 'issue-updated' },
            context: makeContext(),
        });

        expect(result).toEqual({ token: 'tok', errors: [] });
        expect(mockSignRealtimeToken).toHaveBeenCalledWith('issue-updated', {
            projectKey: 'TEST',
        });
    });

    it('throws error when channel is not provided', async () => {
        await expect(handlers['getToken']({ payload: {}, context: makeContext() })).rejects.toThrow(
            'Channel not specified in request',
        );
    });
});

describe('getParticipationStatus', () => {
    it('returns true when user has not opted out', async () => {
        mockKvsGet.mockResolvedValue(null);

        const result = await handlers['getParticipationStatus']({
            context: makeContext(),
        });

        expect(result).toBe(true);
    });

    it('returns false when user has opted out', async () => {
        mockKvsGet.mockResolvedValue(false);

        const result = await handlers['getParticipationStatus']({
            context: makeContext(),
        });

        expect(result).toBe(false);
    });

    it('throws error when accountId is missing', async () => {
        await expect(
            handlers['getParticipationStatus']({
                context: makeContext({ accountId: undefined }),
            }),
        ).rejects.toThrow('Account ID not found in request context');
    });
});

describe('setParticipationStatus', () => {
    it('saves participation status and publishes event', async () => {
        mockKvsSet.mockResolvedValue(undefined);

        await handlers['setParticipationStatus']({
            payload: { isParticipating: false },
            context: makeContext(),
        });

        expect(mockKvsSet).toHaveBeenCalledWith('leaderboard-participation:proj1:user1', false);
        expect(mockPublishEvent).toHaveBeenCalled();
    });

    it('throws error when accountId is missing', async () => {
        await expect(
            handlers['setParticipationStatus']({
                payload: { isParticipating: true },
                context: makeContext({ accountId: undefined }),
            }),
        ).rejects.toThrow('Account ID not found in request context');
    });

    it('throws error when isParticipating is not a boolean', async () => {
        await expect(
            handlers['setParticipationStatus']({
                payload: { isParticipating: 'yes' },
                context: makeContext(),
            }),
        ).rejects.toThrow('isParticipating must be a boolean');
    });
});

describe('getSprintNames', () => {
    it('returns unique sprint names for all boards', async () => {
        mockGetBoardsForProject.mockResolvedValue([{ id: '1' }, { id: '2' }]);
        mockGetSprintsForBoard
            .mockResolvedValueOnce([{ name: 'Sprint 1' }, { name: 'Sprint 2' }])
            .mockResolvedValueOnce([{ name: 'Sprint 2' }, { name: 'Sprint 3' }]);

        const result = await handlers['getSprintNames']({
            context: makeContext(),
        });

        expect(result).toEqual(['Sprint 1', 'Sprint 2', 'Sprint 3']);
    });

    it('returns empty array when project has no boards', async () => {
        mockGetBoardsForProject.mockResolvedValue([]);

        const result = await handlers['getSprintNames']({
            context: makeContext(),
        });

        expect(result).toEqual([]);
    });
});

describe('getProjectUsersWithParticipation', () => {
    it('returns users with their participation status', async () => {
        mockUserSearch.mockResolvedValue([
            { accountId: 'user1', displayName: 'User 1' },
            { accountId: 'user2', displayName: 'User 2' },
        ]);
        mockKvsGet.mockResolvedValueOnce(null).mockResolvedValueOnce(false);

        const result = await handlers['getProjectUsersWithParticipation']({
            context: makeContext(),
        });

        expect(result).toHaveLength(2);
        expect(result.find((u: any) => u.accountId === 'user1').isParticipating).toBe(true);
        expect(result.find((u: any) => u.accountId === 'user2').isParticipating).toBe(false);
    });
});

describe('setUserParticipationAsAdmin', () => {
    it('sets participation status and returns result', async () => {
        mockKvsSet.mockResolvedValue(undefined);
        mockPublishEvent.mockResolvedValue({ success: true });

        const result = await handlers['setUserParticipationAsAdmin']({
            payload: { accountId: 'user2', isParticipating: false },
            context: makeContext(),
        });

        expect(mockKvsSet).toHaveBeenCalledWith('leaderboard-participation:proj1:user2', false);
        expect(result).toEqual({ success: true });
    });

    it('throws error on invalid payload', async () => {
        await expect(
            handlers['setUserParticipationAsAdmin']({
                payload: { accountId: 'user2' },
                context: makeContext(),
            }),
        ).rejects.toThrow('Invalid payload');
    });
});

describe('getScoringConfig', () => {
    it('returns saved scoring config', async () => {
        const savedConfig = { priorityMultipliers: { Medium: 5 } };
        mockKvsGet.mockResolvedValue(savedConfig);

        const result = await handlers['getScoringConfig']({});

        expect(result).toEqual(savedConfig);
    });

    it('returns default scoring config when no custom config saved', async () => {
        mockKvsGet.mockResolvedValue(null);

        const result = await handlers['getScoringConfig']({});

        expect(result).toHaveProperty('priorityMultipliers');
        expect(result.priorityMultipliers).toHaveProperty('Medium');
    });
});

describe('setScoringConfig', () => {
    it('saves valid scoring config', async () => {
        mockKvsSet.mockResolvedValue(undefined);
        const config = { priorityMultipliers: { Medium: 2.0 } };

        const result = await handlers['setScoringConfig']({
            payload: { config },
        });

        expect(mockKvsSet).toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });

    it('throws error on invalid config', async () => {
        await expect(handlers['setScoringConfig']({ payload: {} })).rejects.toThrow(
            'Invalid scoring config payload',
        );
    });
});

describe('checkBoardCompatibility', () => {
    it('returns compatible when both story points and sprint fields exist', async () => {
        mockIssueSearch.mockResolvedValue(
            makeIssueSearchResponse({
                issues: [makeDoneIssue()],
                names: {
                    customfield_10016: 'Story point estimate',
                    customfield_10020: 'Sprint',
                },
            }),
        );

        const result = await handlers['checkBoardCompatibility']({
            context: makeContext(),
        });

        expect(result).toEqual({ isCompatible: true });
    });

    it('returns incompatible when story point key field missing', async () => {
        mockIssueSearch.mockResolvedValue(
            makeIssueSearchResponse({
                issues: [makeDoneIssue()],
                names: { customfield_10020: 'Sprint' },
            }),
        );

        const result = await handlers['checkBoardCompatibility']({
            context: makeContext(),
        });

        expect(result).toEqual({
            isCompatible: false,
            reason: 'no_story_points',
        });
    });

    it('returns incompatible when sprint field missing', async () => {
        mockIssueSearch.mockResolvedValue(
            makeIssueSearchResponse({
                issues: [makeDoneIssue()],
                names: { customfield_10016: 'Story point estimate' },
            }),
        );

        const result = await handlers['checkBoardCompatibility']({
            context: makeContext(),
        });

        expect(result).toEqual({
            isCompatible: false,
            reason: 'no_sprint_field',
        });
    });

    it('returns compatible when project does not have any issues', async () => {
        mockIssueSearch.mockResolvedValue(makeIssueSearchResponse({ issues: [] }));

        const result = await handlers['checkBoardCompatibility']({
            context: makeContext(),
        });

        expect(result).toEqual({ isCompatible: true });
    });
});

describe('checkIsProjectAdmin', () => {
    it('returns isAdmin true for admin users', async () => {
        mockGetUserPermissions.mockResolvedValue({
            permissions: { ADMINISTER: { havePermission: true } },
        });

        const result = await handlers['checkIsProjectAdmin']({});

        expect(result).toEqual({ isAdmin: true });
    });

    it('returns isAdmin false for non-admin users', async () => {
        mockGetUserPermissions.mockResolvedValue({
            permissions: { ADMINISTER: { havePermission: false } },
        });

        const result = await handlers['checkIsProjectAdmin']({});

        expect(result).toEqual({ isAdmin: false });
    });
});

describe('getSavedFilters', () => {
    it('returns saved filters on success', async () => {
        const filter = { filterName: 'My Filter', filter: {}, filterId: 'abc' };
        mockQueryChain([{ value: filter }]);

        const result = await handlers['getSavedFilters']({
            context: makeContext(),
        });

        expect(result.success).toBe(true);
        expect(result.savedFilters).toHaveLength(1);
        expect(result.savedFilters[0]).toEqual(filter);
    });

    it('returns empty list on error', async () => {
        mockKvsQuery.mockImplementation(() => {
            throw new Error('KVS error');
        });

        const result = await handlers['getSavedFilters']({
            context: makeContext(),
        });

        expect(result).toEqual({ success: false, savedFilters: [] });
    });
});

describe('saveFilter', () => {
    it('saves a filter and returns it', async () => {
        const savedValue = {
            filter: {},
            filterName: 'Sprint Filter',
            filterId: 'mock-uuid',
        };
        mockKvsSet.mockResolvedValue({ value: savedValue });

        const result = await handlers['saveFilter']({
            payload: { filters: {}, filterName: 'Sprint Filter' },
            context: makeContext(),
        });

        expect(result.success).toBe(true);
        expect(result.savedFilter).toEqual(savedValue);
    });

    it('returns success: false when filters or filterName missing', async () => {
        const result = await handlers['saveFilter']({
            payload: { filterName: 'Sprint Filter' },
            context: makeContext(),
        });

        expect(result).toEqual({ success: false });
    });

    it('returns success: false when kvs.set returns nothing', async () => {
        mockKvsSet.mockResolvedValue(null);

        const result = await handlers['saveFilter']({
            payload: { filters: {}, filterName: 'Sprint Filter' },
            context: makeContext(),
        });

        expect(result).toEqual({ success: false });
    });
});

describe('deleteSavedFilter', () => {
    it('deletes a filter and returns success', async () => {
        mockKvsDelete.mockResolvedValue(undefined);

        const result = await handlers['deleteSavedFilter']({
            payload: { filterId: 'abc' },
            context: makeContext(),
        });

        expect(result).toEqual({ success: true });
        expect(mockKvsDelete).toHaveBeenCalled();
    });

    it('returns success: false when filterId is missing', async () => {
        const result = await handlers['deleteSavedFilter']({
            payload: {},
            context: makeContext(),
        });

        expect(result).toEqual({ success: false });
    });
});
