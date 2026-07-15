import Resolver from '@forge/resolver';
import {
    getBoardsForProject,
    getSprintsForBoard,
    getUserPermissions,
    issueSearch,
    userSearch,
} from './apiCalls';
import {
    createJQLQuery,
    refineUsers,
    scoreUsers,
    getStoryPointsKey,
    getParticipationKey,
    SCORING_CONFIG_KEY,
    DEFAULT_SCORING_CONFIG,
    ScoringConfig,
    scoreIssue,
    getTransitionLabel,
    getSavedFilterKey,
} from './helpers';
import { signRealtimeToken } from '@forge/realtime';
import { kvs, WhereConditions, MetadataField } from '@forge/kvs';
import {
    ActivityEntry,
    IssueEventTransition,
    StatsTableEntry,
    SaveFilterRequestPayload,
    LeaderboardEntry,
    IssueSearchFilters,
    JQLStatus,
    LeaderboardRequestPayload,
    TokenRequestPayload,
    CompatibilityResult,
    ParticipationRequestPayload,
    ParticipationEventPayload,
    PublishEventOptions,
    AdminCheckResult,
    SavedFilter,
} from './types';
import { JiraIssueSearchResponse } from './types';
import { v4 as uuidv4 } from 'uuid';
import { publishEvent } from '.';

const resolver = new Resolver();

resolver.define('build', async ({ payload, context }): Promise<LeaderboardEntry[]> => {
    const { filters } = payload as LeaderboardRequestPayload;
    const projectName = context.extension.project.id;

    //all users that can be assigned a project
    const usersAssignable = await userSearch(projectName);

    //removes users that have opted out
    const userList = await refineUsers(usersAssignable, projectName);

    const issuesCompletedJQLQuery = createJQLQuery(projectName, JQLStatus.Done, filters);
    const issuesInProgressJQLQuery = createJQLQuery(projectName, JQLStatus.InProgress, filters);

    const [completedIssues, inProgressIssues] = await Promise.all([
        issueSearch(issuesCompletedJQLQuery),
        issueSearch(issuesInProgressJQLQuery),
    ]);

    const mergedIssues = {
        isLast: completedIssues.isLast,
        issues: [...completedIssues.issues, ...inProgressIssues.issues],
        names: { ...completedIssues.names, ...inProgressIssues.names },
    };

    const scoringConfig = ((await kvs.get(SCORING_CONFIG_KEY)) ??
        DEFAULT_SCORING_CONFIG) as ScoringConfig;
    const scores = scoreUsers(userList, mergedIssues, scoringConfig);
    return scores;
});

resolver.define('getRecentActivity', async ({ context }): Promise<ActivityEntry[]> => {
    try {
        const projectName = context.extension.project.id;

        // note: ignore filters because we treat recent activity as independent (i.e. if filtered to the past, shouldn't show recent activity according to that window)

        const jql = `project = ${projectName} AND assignee != EMPTY ORDER BY statusCategoryChangedDate DESC`;

        //execute the issue search
        const issuesInView: JiraIssueSearchResponse = await issueSearch(jql);

        const recentActivity: ActivityEntry[] = [];

        const SPKey = getStoryPointsKey(issuesInView.names);

        for (const issue of issuesInView.issues) {
            const issueKey = issue.key;
            const assignee = issue.fields.assignee?.accountId;
            const issueType = issue.fields.issuetype?.name;
            const changelog = issue.changelog;

            if (!assignee || !issueType || !changelog || changelog.histories.length === 0) {
                continue;
            }

            const scoringConfig = ((await kvs.get(SCORING_CONFIG_KEY)) ??
                DEFAULT_SCORING_CONFIG) as ScoringConfig;

            const issueScore = scoreIssue(issue, SPKey, scoringConfig);

            let transition: IssueEventTransition = 'none';

            for (const history of changelog.histories) {
                const statusUpdateItem = history.items.find((item: any) => item.field === 'status');

                if (statusUpdateItem) {
                    transition = getTransitionLabel(
                        statusUpdateItem.fromString,
                        statusUpdateItem.toString,
                    );
                    break;
                }
            }

            recentActivity.push({
                user: assignee,
                points: issueScore,
                issueKey: issueKey,
                issueType: issueType,
                transition: transition,
            });
        }

        return recentActivity;
    } catch (err) {
        console.error('Error fetching recent activity', err);
        return [];
    }
});

resolver.define('getStatsTable', async ({ payload, context }): Promise<StatsTableEntry[]> => {
    const { filters, status } = payload as LeaderboardRequestPayload;
    const projectName = context.extension.project.id;
    const requestingUser = context.accountId;

    const requestedStatus: JQLStatus = status || JQLStatus.Done;
    const jql = createJQLQuery(projectName, requestedStatus, filters, requestingUser);

    const issuesInView: JiraIssueSearchResponse = await issueSearch(jql);
    const SPKey = getStoryPointsKey(issuesInView.names);

    const userStats: StatsTableEntry[] = [];

    for (const issue of issuesInView.issues) {
        const reporter = issue.fields.reporter?.accountId;
        const issueType = issue.fields.issuetype?.name;
        const issueSummary = issue.fields.summary;

        if (!reporter || !issueType || !issueSummary) {
            continue;
        }

        const scoringConfig = ((await kvs.get(SCORING_CONFIG_KEY)) ??
            DEFAULT_SCORING_CONFIG) as ScoringConfig;

        const issuePoints = scoreIssue(issue, SPKey, scoringConfig);

        userStats.push({
            key: issue.key,
            reporter: reporter,
            type: issueType,
            summary: issueSummary,
            points: issuePoints,
        });
    }
    return userStats;
});

//adapted from Atlassian realtime tutorial project:
//https://bitbucket.org/atlassian/forge-presentations/src/main/00.forge-app-jam/Ep3_Realtime_Notifications/src/resolver.js
//uses the signRealtimeToken function to generate an authentication token that can be used to limit access to the globalPublish events
resolver.define('getToken', async ({ payload, context }) => {
    const { channel } = payload as TokenRequestPayload;
    const projectKey = context.extension.project.key;

    if (!channel) {
        throw new Error('Channel not specified in request');
    }

    const customClaims = { projectKey: projectKey };

    return await signRealtimeToken(channel, customClaims);
});

resolver.define('getParticipationStatus', async ({ context }) => {
    const projectId = context.extension.project.id;
    const accountId = context.accountId;

    if (!accountId) {
        throw new Error('Account ID not found in request context');
    }

    const key = getParticipationKey(projectId, accountId);
    const participation = await kvs.get(key);

    // users are opted in by default
    if (participation === false) {
        return false;
    }
    return true;
});

resolver.define('setParticipationStatus', async ({ payload, context }) => {
    const projectKey = context.extension.project.key;
    const projectId = context.extension.project.id;
    const accountId = context.accountId;

    const { isParticipating } = payload as ParticipationRequestPayload;

    if (!accountId) {
        throw new Error('Account ID not found in request context');
    }

    if (typeof isParticipating !== 'boolean') {
        throw new Error('isParticipating must be a boolean in request');
    }

    const key = getParticipationKey(projectId, accountId);
    await kvs.set(key, isParticipating);

    const eventPayload: ParticipationEventPayload = {
        accountId,
        isParticipating,
    };

    const eventOptions: PublishEventOptions = {
        channel: 'issue-updated',
        projectKey: projectKey,
        payload: eventPayload,
    };

    await publishEvent(eventOptions);
});

// learnt how to get all sprints from https://community.developer.atlassian.com/t/is-it-possible-to-pull-a-list-of-sprints-in-a-project-via-the-rest-api/53336
resolver.define('getSprintNames', async ({ context }): Promise<string[]> => {
    const projectKey = context.extension.project.key;

    const projectBoards = await getBoardsForProject(projectKey);

    const sprintNames = new Set<string>();

    for (const board of projectBoards) {
        const boardSprints = await getSprintsForBoard(board.id);

        boardSprints.forEach((sprint) => {
            sprintNames.add(sprint.name);
        });
    }

    return [...sprintNames];
});

resolver.define('getProjectUsersWithParticipation', async ({ context }) => {
    const projectId = context.extension.project.id;
    const users = await userSearch(projectId);

    const result = [];
    for (const user of users) {
        const key = getParticipationKey(projectId, user.accountId);
        const participation = await kvs.get(key);
        result.push({
            accountId: user.accountId,
            displayName: (user as any).displayName ?? user.accountId,
            isParticipating: participation !== false,
        });
    }
    return result;
});

resolver.define('setUserParticipationAsAdmin', async (request) => {
    const projectId = request.context.extension.project.id;
    const projectKey = request.context.extension.project.key;
    const { accountId, isParticipating } = (request as any).payload ?? {};

    if (!accountId || typeof isParticipating !== 'boolean') {
        throw new Error('Invalid payload: accountId and isParticipating are required');
    }

    const key = getParticipationKey(projectId, accountId);
    await kvs.set(key, isParticipating);

    const eventPayload: ParticipationEventPayload = {
        accountId,
        isParticipating,
    };

    const eventOptions: PublishEventOptions = {
        channel: 'issue-updated',
        projectKey: projectKey,
        payload: eventPayload,
    };

    return await publishEvent(eventOptions);
});

resolver.define('getScoringConfig', async () => {
    const config = await kvs.get(SCORING_CONFIG_KEY);
    return config ?? DEFAULT_SCORING_CONFIG;
});

resolver.define('setScoringConfig', async (request) => {
    const config = (request as any).payload?.config;
    if (!config || !config.priorityMultipliers) {
        throw new Error('Invalid scoring config payload');
    }
    await kvs.set(SCORING_CONFIG_KEY, config);
    return { success: true };
});

// Checks whether this project has a story-points field and a sprint field.
// Works for any board type, or even projects without a board.
// Returns { isCompatible: true } when both fields are present, or
// { isCompatible: false, reason: 'no_story_points' | 'no_sprint_field' } otherwise.
resolver.define('checkBoardCompatibility', async ({ context }): Promise<CompatibilityResult> => {
    const projectId = context.extension.project.id;
    const jql = `project = ${projectId}`;

    const { issues, names } = await issueSearch(jql);

    // If the project has no issues yet we can't read the names map, so allow it
    if (!issues || issues.length === 0) {
        return { isCompatible: true };
    }

    const SPKey = getStoryPointsKey(names);
    if (!SPKey) {
        return { isCompatible: false, reason: 'no_story_points' };
    }

    const hasSprintField = Object.values(names).includes('Sprint');
    if (!hasSprintField) {
        return { isCompatible: false, reason: 'no_sprint_field' };
    }

    return { isCompatible: true };
});

resolver.define('checkIsProjectAdmin', async (): Promise<AdminCheckResult> => {
    const permissionsResponse = await getUserPermissions();

    if (permissionsResponse.permissions?.ADMINISTER?.havePermission) {
        return { isAdmin: true };
    }

    return { isAdmin: false };
});

resolver.define('getSavedFilters', async ({ context }) => {
    try {
        const accountId = context.accountId;
        const projectId = context.extension.project.id;

        const filterKeyPrefix = `saved-filter:${projectId}:${accountId}:`;

        const kvsRes = await kvs
            .query({ metadataFields: [MetadataField.UPDATED_AT] })
            .where('key', WhereConditions.beginsWith(filterKeyPrefix))
            .limit(10)
            .getMany();

        const savedFilters = kvsRes.results.map((res) => res.value) as SavedFilter[];
        return { success: true, savedFilters: savedFilters };
    } catch (err) {
        return { success: false, savedFilters: [] };
    }
});

resolver.define('saveFilter', async ({ payload, context }) => {
    try {
        const { filters, filterName } = payload as SaveFilterRequestPayload;

        if (!filters || !filterName) {
            return { success: false };
        }

        const accountId = context.accountId;
        const projectId = context.extension.project.id;
        const filterId = uuidv4();

        const filterKey = getSavedFilterKey(projectId, accountId, filterId);

        const savedFilter = await kvs.set(
            filterKey,
            { filter: filters, filterName: filterName, filterId: filterId },
            { keyPolicy: 'OVERRIDE', returnValue: 'LATEST' },
        );

        if (!savedFilter) {
            return { success: false };
        }
        return { success: true, savedFilter: savedFilter.value };
    } catch (err) {
        return { success: false };
    }
});

resolver.define('deleteSavedFilter', async ({ payload, context }) => {
    try {
        const pl = payload as any;

        if (!pl.filterId) {
            return { success: false };
        }

        const accountId = context.accountId;
        const projectId = context.extension.project.id;
        const filterId = pl.filterId;

        const filterKey = getSavedFilterKey(projectId, accountId, filterId);

        await kvs.delete(filterKey);

        return { success: true };
    } catch (err) {
        return { success: false };
    }
});

export const handler = resolver.getDefinitions();
