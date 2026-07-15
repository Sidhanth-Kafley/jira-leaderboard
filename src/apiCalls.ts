/**
 * Jira REST API call wrappers used by the backend trigger handler.
 *
 * All requests are made with `api.asApp()` so they run under the app's
 * OAuth credentials rather than on behalf of a specific user.
 */
import api, { route } from '@forge/api';
import { JiraIssueSearchResponse, JiraUser, JiraBoard, JiraSprint } from './types';

/**
 * Searches Jira issues using a JQL query string.
 *
 * Called in two contexts:
 *  - On initial leaderboard load, to fetch all resolved issues for the project
 *    and build the initial user scores.
 *  - From the trigger handler (`run` in index.ts), to fetch full details for a
 *    single issue (e.g. `issueKey=PROJ-123`) so the story-points field can be read.
 *
 * The `expand=names` parameter is included so the response contains the human-readable
 * field name map, which is needed to resolve the dynamic story-points custom field key
 * via `getStoryPointsKey`.
 *
 * @param jqlQuery - A URL-encoded JQL query string (e.g. `"project=ABC AND status=Done"`).
 * @returns        The full Jira search response including issues and field name mappings.
 * @throws         Re-throws any network or non-2xx errors for the caller to handle.
 */
export const issueSearch = async (jqlQuery: string): Promise<JiraIssueSearchResponse> => {
    try {
        const res = await api
            .asApp()
            .requestJira(
                route`/rest/api/3/search/jql?jql=${jqlQuery}&expand=names,changelog&fields=${'*all'}`,
            );

        if (!res.ok) {
            throw new Error(`Jira Issue Search failed with status: ${res.status}`);
        }

        const issueSearchResponse = (await res.json()) as JiraIssueSearchResponse;

        return issueSearchResponse;
    } catch (err) {
        console.error(`Error fetching issues with JQL: ${jqlQuery}`, err);
        throw err;
    }
};

/**
 * Fetches all users who can be assigned issues in a given Jira project.
 *
 * Used on leaderboard load to determine which users should appear as
 * contestants — only assignable project members are listed.
 *
 * @param projectName - The Jira project key (e.g. `"PROJ"`).
 * @returns           An array of assignable Jira users for the project.
 * @throws            Re-throws any network or non-2xx errors for the caller to handle.
 */
export const userSearch = async (projectName: string): Promise<JiraUser[]> => {
    try {
        const res = await api
            .asApp()
            .requestJira(route`/rest/api/3/user/assignable/search?project=${projectName}`);

        if (!res.ok) {
            throw new Error(`Jira User Search failed with status: ${res.status}`);
        }

        const users = (await res.json()) as JiraUser[];

        return users;
    } catch (err) {
        console.error(`Error fetching users with projectName: ${projectName}`, err);
        throw err;
    }
};

export const getBoardsForProject = async (projectKey: string): Promise<JiraBoard[]> => {
    try {
        const projectBoards: JiraBoard[] = [];
        let startingIndex: number = 0;

        //get all boards for this project
        while (true) {
            const boardResponse = await api
                .asApp()
                .requestJira(
                    route`/rest/agile/1.0/board?projectKeyOrId=${projectKey}&startAt=${startingIndex}&maxResults=50`,
                );

            if (!boardResponse.ok) {
                break;
            }

            const boardData = await boardResponse.json();

            if (boardData.values && boardData.values.length > 0) {
                const additionalBoards = boardData.values as JiraBoard[];
                projectBoards.push(...additionalBoards);

                startingIndex += additionalBoards.length;
            }

            if (boardData.isLast || !boardData.values || boardData.values.length === 0) {
                break;
            }
        }

        return projectBoards;
    } catch (err) {
        console.error(`Error fetching boards for project: ${projectKey}`, err);
        return [];
    }
};

export const getSprintsForBoard = async (boardId: string): Promise<JiraSprint[]> => {
    try {
        const boardSprints: JiraSprint[] = [];
        let startingIndex: number = 0;
        let moreSprints: boolean = true;

        while (moreSprints) {
            const sprintResponse = await api
                .asApp()
                .requestJira(
                    route`/rest/agile/1.0/board/${boardId}/sprint?startAt=${startingIndex}&maxResults=50`,
                );

            if (!sprintResponse.ok) {
                break;
            }

            const sprintData = await sprintResponse.json();

            if (sprintData.values && sprintData.values.length > 0) {
                const additionalSprints = sprintData.values as JiraSprint[];
                boardSprints.push(...additionalSprints);

                startingIndex += additionalSprints.length;
            }

            if (sprintData.isLast || !sprintData.values || sprintData.values.length === 0) {
                break;
            }
        }

        return boardSprints;
    } catch (err) {
        console.error(`Error fetching sprints for board: ${boardId}`, err);
        return [];
    }
};

export const getUserPermissions = async (): Promise<Record<any, any>> => {
    const response = await api
        .asUser()
        .requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`);

    const data = await response.json();

    return data;
};
