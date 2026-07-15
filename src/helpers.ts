/**
 * Pure helper functions for scoring issues and building leaderboard user lists.
 *
 * These are used both on initial leaderboard load (bulk scoring via `scoreUsers`)
 * and on individual issue-update events (single-issue scoring via `scoreIssue`).
 */
import {
    JiraIssue,
    IssueFields,
    IssueSearchFilters,
    JiraIssueSearchResponse,
    JiraUser,
    LeaderboardEntry,
    IssueEventTransition,
    JQLStatus,
} from './types';
import { kvs } from '@forge/kvs';

/**
 * Filters a list of assignable project users down to only those who are
 * participating in the leaderboard.
 *
 * Participation state is stored per-user per-project in Forge KVS under the key
 * `leaderboard-participation:<projectId>:<accountId>`. A value of `false` means
 * the user has opted out; any other value (including `undefined`/missing) is
 * treated as opted in.
 *
 * @param users     - Array of Jira user objects (typically from `userSearch`).
 * @param projectId - The Jira project ID used to namespace the KVS keys.
 * @returns         A filtered array containing only opted-in users.
 */
export const refineUsers = async (users: JiraUser[], projectId: string): Promise<JiraUser[]> => {
    const result = [];

    for (const user of users) {
        const key = `leaderboard-participation:${projectId}:${user.accountId}`;
        const participate = await kvs.get(key);

        // Include the user unless they have explicitly opted out (value === false)
        if (participate !== false) {
            result.push(user);
        }
    }

    return result;
};

/**
 * Computes the point value for a single Jira issue.
 *
 * The base score is `storyPoints + 1`, so that issues with no story-point
 * estimate (i.e. `null` or `0`) still award at least 1 point rather than 0.
 *
 * The optional `scoringConfig` parameter is reserved for future custom scoring
 * strategies; currently only the default (no config) path is implemented.
 *
 * @param issue         - A Jira issue object whose `fields` contain the SP value.
 * @param SPKey         - The dynamic custom-field key for "Story point estimate"
 *                        (resolved via `getStoryPointsKey`).
 * @param scoringConfig - Reserved for future custom scoring logic (unused).
 * @returns             The computed point value, or `undefined` if a custom config
 *                      is passed (not yet implemented).
 */
export const SCORING_CONFIG_KEY = 'leaderboard-scoring-config';

export type ScoringConfig = {
    priorityMultipliers: Record<string, number>;
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
    priorityMultipliers: {
        Highest: 2.0,
        High: 1.5,
        Medium: 1.0,
        Low: 0.75,
        Lowest: 0.5,
    },
};

export const scoreIssue = (
    issue: JiraIssue,
    SPKey: string | undefined,
    scoringConfig?: ScoringConfig,
): number => {
    const storyPoints: number = SPKey ? ((issue.fields[SPKey] as number) ?? 0) : 0;
    const base = storyPoints + 1;
    const priority: string = issue.fields?.priority?.name ?? 'Medium';
    const multipliers =
        scoringConfig?.priorityMultipliers ?? DEFAULT_SCORING_CONFIG.priorityMultipliers;
    const multiplier = multipliers[priority] ?? 1.0;
    return Math.max(1, Math.ceil(base * multiplier));
};

/**
 * Resolves the dynamic Jira custom-field key for "Story point estimate".
 *
 * Jira stores story points as a custom field whose key (e.g. `"customfield_10016"`)
 * differs per instance. The `issueSearch` API returns a `names` map of
 * `{ fieldKey: humanReadableName }` when called with `expand=names`. This function
 * finds the key whose value is `"Story point estimate"`.
 * @param fieldNames - The `names` map from a `JiraIssueSearchResponse`.
 * @returns          The field key string (e.g. `"customfield_10016"`), or
 *                   `undefined` if no matching field is found.
 */
export const getStoryPointsKey = (fieldNames: Record<string, string>): string | undefined => {
    return Object.keys(fieldNames).find((key) => fieldNames[key] === 'Story point estimate');
};

export const getSavedFilterKey = (
    projectId: string,
    accountId: string,
    filterId: string,
): string => {
    return `saved-filter:${projectId}:${accountId}:${filterId}`;
};

// create a unique participation key for different projects
export const getParticipationKey = (projectId: string, accountId: string) => {
    return `leaderboard-participation:${projectId}:${accountId}`;
};

/**
 * Builds the full leaderboard by scoring all issues in an issue search response
 * against a list of participating users.
 *
 * For each issue:
 *  - "Done" issues add story-point score (or 1 if no SP field exists) to the
 *    assignee's total points, and increment their completed-issue count.
 *  - "In Progress" issues increment the assignee's in-progress count only.
 *  - Issues assigned to users not in `userList` are skipped.
 *
 * TODO: Figure out if there's a better way of doing this.
 *
 * @param userList            - The refined list of participating users (from `refineUsers`).
 * @param issueSearchResponse - The full response from `issueSearch`, including the
 *                              `names` field map needed to resolve the SP key.
 * @returns                   An array of `UserScore` tuples, one per user, with
 *                            accumulated points, done count, and in-progress count.
 */
export const scoreUsers = (
    userList: JiraUser[],
    issueSearchResponse: JiraIssueSearchResponse,
    scoringConfig?: ScoringConfig,
): LeaderboardEntry[] => {
    // Initialise every user with zero points, zero done, zero in-progress
    const scores: LeaderboardEntry[] = userList.map((user) => {
        return {
            accountId: user.accountId,
            points: 0,
            issuesCompleted: 0,
            issuesInProgress: 0,
        };
    });

    if (issueSearchResponse.issues.length != 0) {
        // Resolve the story-points field key once for the entire response
        const SPKey = getStoryPointsKey(issueSearchResponse.names);

        for (const issue of issueSearchResponse.issues) {
            const fields = issue.fields as IssueFields;
            const assignee = fields.assignee?.accountId;

            if (!assignee) {
                continue;
            }

            // Find the score entry for this issue's assignee; skip unassigned or non-participant issues
            const userIndex = scores.findIndex((entry) => entry.accountId === assignee);

            if (userIndex === -1) {
                continue;
            }

            const statusName = fields.status?.name;

            if (statusName === 'Done') {
                scores[userIndex].points += scoreIssue(issue, SPKey, scoringConfig);
                scores[userIndex].issuesCompleted += 1;
            } else if (statusName === 'In Progress') {
                // Increment in-progress count (index 3) — no points awarded yet
                scores[userIndex].issuesInProgress += 1;
            }
        }
    }
    return scores;
};

export const createJQLQuery = (
    projectName: string,
    status: JQLStatus,
    filters?: IssueSearchFilters,
    assignee?: string,
): string => {
    const filtersList: string[] = [
        `project = ${projectName} AND status = "${status}" AND assignee != EMPTY`,
    ];

    if (!filters) {
        return filtersList[0];
    }

    if (filters.sprint) {
        filtersList.push(`sprint = "${filters.sprint}"`);
    }

    if (status === JQLStatus.Done && filters.startDate) {
        filtersList.push(`resolved >= "${filters.startDate}"`);
    }

    if (status === JQLStatus.Done && filters.endDate) {
        filtersList.push(`resolved <= "${filters.endDate}"`);
    }

    if (filters.issueTypes && filters.issueTypes.length > 0) {
        const workTypes = filters.issueTypes.join(', ');
        filtersList.push(`issuetype in (${workTypes})`);
    }

    if (filters.priorities && filters.priorities.length > 0) {
        const priorities = filters.priorities.join(', ');
        filtersList.push(`priority in (${priorities})`);
    }

    if (assignee) {
        filtersList.push(`assignee = "${assignee}"`);
    }

    const jqlQuery: string = filtersList.join(' AND ');

    return jqlQuery;
};

export const getTransitionLabel = (
    fromStatus: string | null,
    toStatus: string | null,
): IssueEventTransition => {
    if (toStatus === 'Done' && fromStatus === 'In Progress') {
        return 'doneFromProgress';
    } else if (toStatus === 'Done') {
        return 'doneFromOther';
    } else if (fromStatus === 'Done' && toStatus === 'In Progress') {
        return 'progressFromDone';
    } else if (fromStatus === 'Done') {
        return 'otherFromDone';
    } else if (toStatus === 'In Progress') {
        return 'progressFromOther';
    } else if (fromStatus === 'In Progress') {
        return 'otherFromProgress';
    } else {
        return 'none';
    }
};
